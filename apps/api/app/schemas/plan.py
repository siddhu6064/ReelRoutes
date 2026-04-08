"""
Schemas for the Plan from Scratch feature.
Request/response models for POST /trips/plan and POST /trips/plan/confirm.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class TravelMode(str, Enum):
    driving = "driving"
    walking = "walking"
    transit = "transit"
    cycling = "cycling"


class TripPreference(str, Enum):
    food = "food"
    history = "history"
    nature = "nature"
    art = "art"
    adventure = "adventure"
    shopping = "shopping"
    nightlife = "nightlife"


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

class PlanRequest(BaseModel):
    starting_point: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Origin location, e.g. 'Austin, TX' or 'London, UK'",
        examples=["Austin, TX"],
    )
    destination: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Primary destination for the trip",
        examples=["New Orleans, LA"],
    )
    days: int = Field(
        ...,
        ge=1,
        le=14,
        description="Number of days for the itinerary",
        examples=[4],
    )
    preferences: List[TripPreference] = Field(
        default_factory=list,
        max_length=7,
        description="User interest categories to guide AI recommendations",
        examples=[["food", "history"]],
    )
    travel_mode: TravelMode = Field(
        default=TravelMode.driving,
        description="Primary mode of transport between stops",
    )

    @field_validator("preferences")
    @classmethod
    def deduplicate_preferences(cls, v: List[TripPreference]) -> List[TripPreference]:
        seen = set()
        return [p for p in v if not (p in seen or seen.add(p))]


# ---------------------------------------------------------------------------
# Draft itinerary response
# ---------------------------------------------------------------------------

class ActivityStop(BaseModel):
    """A sightseeing / activity location returned in the draft."""
    type: Literal["activity"] = "activity"
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    place_id: Optional[str] = None          # Google Places ID
    famous_for: str = ""                    # e.g. "Jazz music, Creole cuisine"
    best_time: Optional[str] = None         # e.g. "Evening"
    local_tip: Optional[str] = None         # e.g. "Go on a weeknight"
    photo_url: Optional[str] = None
    distance_from_prev_km: Optional[float] = None
    # Phase 3 enrichment fields (from Places Details API)
    opening_hours: Optional[str] = None     # e.g. "Mon–Fri: 9 AM–5 PM | Sat: 10 AM–4 PM"
    website: Optional[str] = None
    phone: Optional[str] = None
    price_level: Optional[int] = None       # 0–4 (Google Places scale)
    rating: Optional[float] = None


class RestaurantOption(BaseModel):
    """One restaurant choice inside a food slot."""
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    place_id: Optional[str] = None
    known_for: Optional[str] = None         # e.g. "Beignets and café au lait"
    photo_url: Optional[str] = None
    price_level: Optional[int] = None       # 0–4 (Google Places scale)
    rating: Optional[float] = None


class FoodStop(BaseModel):
    """A meal slot with up to 3 selectable restaurant options."""
    type: Literal["food"] = "food"
    meal: Literal["breakfast", "lunch", "dinner"]
    options: List[RestaurantOption] = Field(default_factory=list, max_length=3)


class DayPlan(BaseModel):
    """All stops (activity + food) for a single day."""
    day: int = Field(..., ge=1)
    stops: List[ActivityStop | FoodStop] = Field(default_factory=list)


class DraftItinerary(BaseModel):
    """Full draft returned by POST /trips/plan — not yet persisted."""
    draft: Literal[True] = True
    starting_point: str
    destination: str
    days: int
    travel_mode: TravelMode
    days_plan: List[DayPlan] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Confirm request  (POST /trips/plan/confirm)
# ---------------------------------------------------------------------------

class ConfirmActivityStop(BaseModel):
    """Curated activity stop sent back by the client."""
    name: str
    lat: float
    lng: float
    place_id: Optional[str] = None
    address: Optional[str] = None
    famous_for: Optional[str] = None
    best_time: Optional[str] = None
    local_tip: Optional[str] = None
    photo_url: Optional[str] = None


class ConfirmFoodStop(BaseModel):
    """Single chosen restaurant for a meal slot."""
    name: str
    lat: float
    lng: float
    place_id: Optional[str] = None
    address: Optional[str] = None
    known_for: Optional[str] = None
    meal: Literal["breakfast", "lunch", "dinner"]


class ConfirmDayPlan(BaseModel):
    day: int = Field(..., ge=1)
    activity_stops: List[ConfirmActivityStop] = Field(default_factory=list)
    food_stops: List[ConfirmFoodStop] = Field(default_factory=list)


class PlanConfirmRequest(BaseModel):
    starting_point: str = Field(..., min_length=2, max_length=200)
    destination: str = Field(..., min_length=2, max_length=200)
    days: int = Field(..., ge=1, le=14)
    travel_mode: TravelMode = TravelMode.driving
    preferences: List[TripPreference] = Field(default_factory=list)
    days_plan: List[ConfirmDayPlan] = Field(default_factory=list)

    @field_validator("days_plan")
    @classmethod
    def must_have_at_least_one_stop(
        cls, v: List[ConfirmDayPlan]
    ) -> List[ConfirmDayPlan]:
        total_stops = sum(
            len(day.activity_stops) + len(day.food_stops) for day in v
        )
        if total_stops == 0:
            raise ValueError(
                "Confirmed itinerary must contain at least one stop"
            )
        return v

    @field_validator("days_plan")
    @classmethod
    def day_numbers_must_be_unique_and_positive(
        cls, v: List[ConfirmDayPlan]
    ) -> List[ConfirmDayPlan]:
        day_nums = [d.day for d in v]
        if len(day_nums) != len(set(day_nums)):
            raise ValueError("Duplicate day numbers in days_plan")
        if any(d < 1 for d in day_nums):
            raise ValueError("Day numbers must be >= 1")
        return v


class PlanConfirmResponse(BaseModel):
    trip_id: str
    message: str = "Trip saved successfully"
    pin_count: int = 0
    day_count: int = 0
