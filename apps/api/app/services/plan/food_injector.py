"""
Food Injector Service  (Phase 3 — production implementation)
=============================================================
Injects meal stops (breakfast, lunch, dinner) into each DayPlan using
Google Places Nearby Search.

Key improvements over the Phase 1 stub
---------------------------------------
1. Anchor strategy — uses the TRUE geographic midpoint between consecutive
   activity stops, not just a single stop's position.

2. Deduplication — if two meal anchors resolve to the same coordinates
   (e.g. a day with only one activity stop), only one search is performed
   and the result is shared.

3. Places API correctness — initial search uses `rankby=distance` with NO
   radius param (Google rejects rankby + radius together). Expansion
   retries switch to explicit radius with no rankby.

4. Fallback radius expansion — if tight search returns fewer than
   MIN_OPTIONS results, retries with an expanded radius up to MAX_RADIUS_M.

5. `known_for` enrichment — editorial_summary or place type is used to
   populate known_for on each RestaurantOption for the curation UI.

6. Graceful degradation — a single meal slot failure does not abort the
   entire day. Failed slots are logged and omitted.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

import httpx

from app.schemas.plan import ActivityStop, DayPlan, FoodStop, RestaurantOption
from app.services.plan.haversine import haversine_km

logger = logging.getLogger(__name__)

PLACES_API_URL = "https://maps.googleapis.com/maps/api/place"

MAX_FOOD_OPTIONS = 3
MIN_OPTIONS = 1
INITIAL_RADIUS_M = 800
MAX_RADIUS_M = 3000
RADIUS_EXPANSION_FACTOR = 2
MAX_RETRIES = 2

MAX_CONCURRENT_DAYS = 3
MAX_CONCURRENT_MEALS = 3
TIMEOUT_S = 10.0

MealSlot = Literal["breakfast", "lunch", "dinner"]

MEAL_KEYWORDS: Dict[str, str] = {
    "breakfast": "breakfast brunch cafe",
    "lunch":     "lunch bistro casual dining",
    "dinner":    "dinner restaurant fine dining",
}

MEAL_TYPES: Dict[str, str] = {
    "breakfast": "cafe",
    "lunch":     "restaurant",
    "dinner":    "restaurant",
}


@dataclass
class MealAnchor:
    meal: MealSlot
    lat: float
    lng: float
    anchor_key: str


class FoodInjectorService:
    """
    Injects meal stops into a list of DayPlan objects.

    Meal placement:
        Breakfast  -> before first activity stop
        Lunch      -> between morning and afternoon stops (geographic midpoint)
        Dinner     -> after the last activity stop
    """

    def __init__(
        self,
        api_key: str,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._api_key = api_key
        self._http = http_client or httpx.AsyncClient(timeout=TIMEOUT_S)

    async def inject(self, days: List[DayPlan], destination: str) -> List[DayPlan]:
        day_semaphore = asyncio.Semaphore(MAX_CONCURRENT_DAYS)
        results = await asyncio.gather(
            *[self._inject_day(day, day_semaphore) for day in days],
            return_exceptions=True,
        )
        enriched: List[DayPlan] = []
        for day, result in zip(days, results):
            if isinstance(result, DayPlan):
                enriched.append(result)
            else:
                logger.error("Food injection failed for day %d: %s", day.day, result)
                enriched.append(day)
        return enriched

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Day-level injection
    # ------------------------------------------------------------------

    async def _inject_day(self, day: DayPlan, day_semaphore: asyncio.Semaphore) -> DayPlan:
        async with day_semaphore:
            activity_stops = [s for s in day.stops if isinstance(s, ActivityStop)]
            if not activity_stops:
                return day

            anchors = self._build_meal_anchors(activity_stops)
            unique_anchors = self._deduplicate_anchors(anchors)

            meal_semaphore = asyncio.Semaphore(MAX_CONCURRENT_MEALS)
            fetch_tasks = {
                anchor.anchor_key: self._fetch_with_fallback(
                    anchor.lat, anchor.lng, anchor.meal, meal_semaphore
                )
                for anchor in unique_anchors
            }

            fetch_results = await asyncio.gather(*fetch_tasks.values(), return_exceptions=True)
            food_by_key: Dict[str, FoodStop] = {}
            for key, result in zip(fetch_tasks.keys(), fetch_results):
                if isinstance(result, FoodStop):
                    food_by_key[key] = result
                else:
                    logger.warning("Day %d food fetch failed for key '%s': %s", day.day, key, result)

            food_stops: Dict[MealSlot, FoodStop] = {}
            for anchor in anchors:
                if anchor.anchor_key in food_by_key and anchor.meal not in food_stops:
                    raw = food_by_key[anchor.anchor_key]
                    food_stops[anchor.meal] = FoodStop(meal=anchor.meal, options=raw.options)

            return DayPlan(day=day.day, stops=self._interleave(activity_stops, food_stops))

    # ------------------------------------------------------------------
    # Anchor building
    # ------------------------------------------------------------------

    def _build_meal_anchors(self, stops: List[ActivityStop]) -> List[MealAnchor]:
        n = len(stops)
        anchors: List[MealAnchor] = []

        # Breakfast: first stop
        b_lat, b_lng = stops[0].lat, stops[0].lng
        anchors.append(MealAnchor(
            meal="breakfast", lat=b_lat, lng=b_lng,
            anchor_key=self._coord_key(b_lat, b_lng),
        ))

        # Lunch: true geographic midpoint between morning/afternoon split
        split = max(1, n // 2)
        if split < n:
            l_lat = (stops[split - 1].lat + stops[split].lat) / 2
            l_lng = (stops[split - 1].lng + stops[split].lng) / 2
        else:
            l_lat, l_lng = stops[split - 1].lat, stops[split - 1].lng
        anchors.append(MealAnchor(
            meal="lunch", lat=l_lat, lng=l_lng,
            anchor_key=self._coord_key(l_lat, l_lng),
        ))

        # Dinner: last stop
        d_lat, d_lng = stops[-1].lat, stops[-1].lng
        anchors.append(MealAnchor(
            meal="dinner", lat=d_lat, lng=d_lng,
            anchor_key=self._coord_key(d_lat, d_lng),
        ))

        return anchors

    def _deduplicate_anchors(self, anchors: List[MealAnchor]) -> List[MealAnchor]:
        seen: set[str] = set()
        unique: List[MealAnchor] = []
        for anchor in anchors:
            if anchor.anchor_key not in seen:
                seen.add(anchor.anchor_key)
                unique.append(anchor)
        return unique

    @staticmethod
    def _coord_key(lat: float, lng: float) -> str:
        """Round to ~100m precision for deduplication."""
        return f"{round(lat, 3)},{round(lng, 3)}"

    # ------------------------------------------------------------------
    # Places API fetching with radius fallback
    # ------------------------------------------------------------------

    async def _fetch_with_fallback(
        self, lat: float, lng: float, meal: MealSlot, semaphore: asyncio.Semaphore
    ) -> FoodStop:
        radius = INITIAL_RADIUS_M
        last_options: List[RestaurantOption] = []

        for attempt in range(MAX_RETRIES + 1):
            options = await self._search_nearby(lat, lng, meal, radius, semaphore)
            if len(options) >= MIN_OPTIONS:
                return FoodStop(meal=meal, options=options[:MAX_FOOD_OPTIONS])
            last_options = options
            if attempt < MAX_RETRIES:
                radius = min(radius * RADIUS_EXPANSION_FACTOR, MAX_RADIUS_M)
                logger.info(
                    "Expanding food search to %dm for %s at (%.4f, %.4f)",
                    radius, meal, lat, lng,
                )

        logger.warning(
            "Only %d result(s) for %s at (%.4f, %.4f) after expansion",
            len(last_options), meal, lat, lng,
        )
        return FoodStop(meal=meal, options=last_options[:MAX_FOOD_OPTIONS])

    async def _search_nearby(
        self, lat: float, lng: float, meal: MealSlot, radius: int,
        semaphore: asyncio.Semaphore,
    ) -> List[RestaurantOption]:
        """
        Google Places Nearby Search.
        Initial (tight) search: rankby=distance, no radius param.
        Expanded search: explicit radius, no rankby.
        These are mutually exclusive in the Places API.
        """
        async with semaphore:
            if radius == INITIAL_RADIUS_M:
                params = {
                    "location": f"{lat},{lng}",
                    "rankby": "distance",
                    "type": MEAL_TYPES[meal],
                    "keyword": MEAL_KEYWORDS[meal],
                    "key": self._api_key,
                }
            else:
                params = {
                    "location": f"{lat},{lng}",
                    "radius": radius,
                    "type": MEAL_TYPES[meal],
                    "keyword": MEAL_KEYWORDS[meal],
                    "key": self._api_key,
                }
            try:
                response = await self._http.get(
                    f"{PLACES_API_URL}/nearbysearch/json", params=params
                )
                response.raise_for_status()
                data = response.json()
            except Exception as exc:
                raise RuntimeError(
                    f"Places nearby search failed for {meal} at ({lat},{lng})"
                ) from exc

        candidates = data.get("results", [])
        return [self._to_restaurant_option(c) for c in candidates[:MAX_FOOD_OPTIONS]]

    # ------------------------------------------------------------------
    # Result mapping
    # ------------------------------------------------------------------

    def _to_restaurant_option(self, result: dict) -> RestaurantOption:
        location = result.get("geometry", {}).get("location", {})
        photos = result.get("photos", [])
        photo_url: Optional[str] = None
        if photos:
            ref = photos[0].get("photo_reference")
            if ref:
                photo_url = (
                    f"{PLACES_API_URL}/photo"
                    f"?maxwidth=400&photo_reference={ref}&key={self._api_key}"
                )

        # known_for: prefer editorial_summary, fall back to first place type
        known_for = (
            result.get("editorial_summary", {}).get("overview")
            or result.get("types", ["restaurant"])[0].replace("_", " ").title()
        )

        return RestaurantOption(
            name=result.get("name", ""),
            address=result.get("vicinity", ""),
            lat=float(location.get("lat", 0.0)),
            lng=float(location.get("lng", 0.0)),
            place_id=result.get("place_id"),
            rating=result.get("rating"),
            price_level=result.get("price_level"),
            photo_url=photo_url,
            known_for=known_for,
        )

    # ------------------------------------------------------------------
    # Interleaving
    # ------------------------------------------------------------------

    def _interleave(
        self,
        activity_stops: List[ActivityStop],
        food_stops: Dict[MealSlot, FoodStop],
    ) -> list:
        """
        Final stop order for a day:
            [breakfast] [morning stops] [lunch] [afternoon stops] [dinner]
        Split point = n // 2, minimum 1.
        """
        n = len(activity_stops)
        split = max(1, n // 2)
        result: list = []
        if "breakfast" in food_stops:
            result.append(food_stops["breakfast"])
        result.extend(activity_stops[:split])
        if "lunch" in food_stops:
            result.append(food_stops["lunch"])
        result.extend(activity_stops[split:])
        if "dinner" in food_stops:
            result.append(food_stops["dinner"])
        return result
