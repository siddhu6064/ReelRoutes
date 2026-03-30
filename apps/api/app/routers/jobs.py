"""
app/routers/jobs.py

GET  /api/jobs/:job_id        — polling fallback for mobile clients
WS   /ws/jobs/:job_id         — real-time status push via WebSocket

The WebSocket sends a JSON status message every second until the job
reaches a terminal state (completed or failed), then closes.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.documents import JobStatus
from app.services.job_service import JobService

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
ws_router = APIRouter(prefix="/ws", tags=["websocket"])

POLL_INTERVAL_SECONDS = 1.0
TERMINAL_STATES = {JobStatus.COMPLETED, JobStatus.FAILED}


def _job_payload(job) -> dict:
    return {
        "jobId": str(job.id),
        "status": job.status,
        "progress": job.progress,
        "currentStep": job.current_step,
        "progressMessage": job.progress_message,
        "error": job.error,
        "errorCode": job.error_code,
        "completedAt": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/{job_id}", summary="Poll job status")
async def get_job(job_id: str) -> dict:
    """
    REST polling endpoint — used by mobile clients and as a WebSocket fallback.
    Returns current job state including progress 0-100 and step message.
    """
    job = await JobService.get(job_id)
    return {"ok": True, "data": _job_payload(job)}


@ws_router.websocket("/jobs/{job_id}")
async def job_status_websocket(websocket: WebSocket, job_id: str) -> None:
    """
    WebSocket endpoint for real-time job progress.

    Client connects, receives status updates every second until the job
    reaches a terminal state, at which point the server closes the connection.

    Message format: JSON matching JobStatusResponse from @reelroutes/shared
    """
    await websocket.accept()
    try:
        while True:
            try:
                job = await JobService.get(job_id)
            except Exception as exc:
                await websocket.send_text(json.dumps({
                    "ok": False,
                    "error": {"code": "JOB_NOT_FOUND", "message": str(exc)},
                }))
                break

            payload = _job_payload(job)
            await websocket.send_text(json.dumps({"ok": True, "data": payload}))

            if job.status in TERMINAL_STATES:
                # Job finished — send final update and close
                break

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
