"""W16 — Email Reservation Import."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Body, Query
from pydantic import BaseModel

from app.middleware.error_handler import NotFoundError
from app.models.documents import ReservationDocument, ReservationType
from app.services.reservation_service import parse_reservation_email
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["reservations"])


class ImportBody(BaseModel):
    email_text: str


@router.post("/trips/{trip_id}/import-reservation")
async def import_reservation(
    trip_id: str,
    user_id: str = Query(...),
    body: ImportBody = Body(...),
) -> dict:
    """Parse a forwarded confirmation email and attach it as a reservation."""
    trip = await TripService.get(trip_id, user_id=user_id)
    parsed = await parse_reservation_email(body.email_text)

    reservation = ReservationDocument(
        id=str(uuid.uuid4()),
        reservation_type=ReservationType(parsed["type"]),
        title=parsed["title"],
        confirmation_number=parsed.get("confirmation_number"),
        check_in=parsed.get("check_in"),
        check_out=parsed.get("check_out"),
        flight_number=parsed.get("flight_number"),
        notes=parsed.get("notes"),
        raw_email_snippet=body.email_text[:200],
        created_at=datetime.now(UTC),
    )

    trip.reservations.append(reservation)
    trip.updated_at = datetime.now(UTC)
    await trip.save()

    return {
        "ok": True,
        "data": {
            "reservation_id": reservation.id,
            "type": reservation.reservation_type,
            "title": reservation.title,
            "confirmation_number": reservation.confirmation_number,
            "check_in": reservation.check_in.isoformat() if reservation.check_in else None,
            "check_out": reservation.check_out.isoformat() if reservation.check_out else None,
            "flight_number": reservation.flight_number,
        },
    }


@router.get("/trips/{trip_id}/reservations")
async def list_reservations(
    trip_id: str,
    user_id: str = Query(...),
) -> dict:
    """List all reservations on a trip, sorted by check_in date."""
    trip = await TripService.get(trip_id, user_id=user_id)

    sorted_res = sorted(
        trip.reservations,
        key=lambda r: r.check_in or datetime.min,
    )

    return {
        "ok": True,
        "data": {
            "reservations": [
                {
                    "id": r.id,
                    "type": r.reservation_type,
                    "title": r.title,
                    "confirmation_number": r.confirmation_number,
                    "check_in": r.check_in.isoformat() if r.check_in else None,
                    "check_out": r.check_out.isoformat() if r.check_out else None,
                    "flight_number": r.flight_number,
                    "notes": r.notes,
                    "created_at": r.created_at.isoformat(),
                }
                for r in sorted_res
            ]
        },
    }


@router.delete("/trips/{trip_id}/reservations/{reservation_id}")
async def delete_reservation(
    trip_id: str,
    reservation_id: str,
    user_id: str = Query(...),
) -> dict:
    """Remove a reservation from the trip."""
    trip = await TripService.get(trip_id, user_id=user_id)

    before = len(trip.reservations)
    trip.reservations = [r for r in trip.reservations if r.id != reservation_id]
    if len(trip.reservations) == before:
        raise NotFoundError("Reservation", reservation_id)

    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return {"ok": True, "data": None}
