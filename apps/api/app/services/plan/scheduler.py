"""
Proximity Scheduler  (Phase 2 — production implementation)
===========================================================
Distributes geocoded activity places across N days using a two-stage algorithm:

Stage 1 — Geographic clustering
    Assigns places to day-buckets based on spatial proximity rather than
    round-robin order.  Buckets are seeded with the "farthest-first" method
    (maximally spread seed points), then each place is assigned to its
    nearest seed.  This ensures each day's stops are spatially coherent
    rather than scattered across the destination.

    After clustering, buckets are ordered by proximity to the trip origin
    so Day 1 stays near the starting point and the trip progresses outward.

Stage 2 — Nearest-neighbour sort within each day
    Within each bucket, stops are sorted greedily starting from the
    carry-over position (last stop of the previous day, or the trip
    origin on Day 1).  This minimises backtracking within a day.

Cross-day carry-over
    The last stop of Day N becomes the starting position for Day N+1,
    so the overall route flows continuously without jumping back to the
    origin each morning.
"""

from __future__ import annotations

import logging

from app.schemas.plan import ActivityStop, DayPlan
from app.services.plan.haversine import centroid, haversine_km
from app.services.plan.origin_geocoder import OriginGeocoderService
from app.services.plan.plan_geocoder import GeocodedPlace

logger = logging.getLogger(__name__)


class ProximityScheduler:
    """
    Two-stage geographic scheduler.
    See module docstring for algorithm details.
    """

    async def schedule(
        self,
        places: list[GeocodedPlace],
        days: int,
        starting_point: str,
        api_key: str,
    ) -> list[DayPlan]:
        """
        Main entry point. Returns a list of DayPlan objects, one per day,
        with activity stops ordered for minimal travel within each day.

        Parameters
        ----------
        places          Geocoded activity places to distribute.
        days            Requested number of days.
        starting_point  Free-text origin string (e.g. "Austin, TX").
        api_key         Google Maps API key for geocoding the starting point.
        """
        if not places:
            logger.warning("No places to schedule — returning empty day plans")
            return [DayPlan(day=d + 1) for d in range(days)]

        # ── Resolve real origin coordinates ───────────────────────────────
        origin = await self._resolve_origin(starting_point, places, api_key)

        # ── Stage 1: Geographic clustering ───────────────────────────────
        buckets = self._geographic_cluster(places, days, origin)

        # ── Order buckets so Day 1 is nearest to origin ──────────────────
        buckets = self._order_buckets_by_proximity(buckets, origin)

        # ── Stage 2: Nearest-neighbour with cross-day carry-over ─────────
        day_plans = self._sort_buckets_with_carryover(buckets, origin)

        logger.info(
            "Scheduled %d places across %d days (origin: %.4f, %.4f)",
            len(places),
            len(day_plans),
            origin[0],
            origin[1],
        )
        return day_plans

    # ------------------------------------------------------------------
    # Stage 1 — Geographic clustering
    # ------------------------------------------------------------------

    def _geographic_cluster(
        self,
        places: list[GeocodedPlace],
        days: int,
        origin: tuple[float, float],
    ) -> list[list[GeocodedPlace]]:
        """
        Assign places to `days` buckets using farthest-first seeding
        followed by nearest-seed assignment.

        Edge cases
        ----------
        - days == 1: all places in one bucket.
        - days >= len(places): one place per bucket, remaining buckets empty.
        """
        if days == 1:
            return [list(places)]

        if len(places) <= days:
            buckets: list[list[GeocodedPlace]] = [[p] for p in places]
            buckets += [[] for _ in range(days - len(places))]
            return buckets

        seeds = self._farthest_first_seeds(places, days, origin)
        buckets = [[] for _ in range(days)]

        for place in places:
            nearest_seed_idx = min(
                range(days),
                key=lambda i: haversine_km(
                    place.lat, place.lng, seeds[i][0], seeds[i][1]
                ),
            )
            buckets[nearest_seed_idx].append(place)

        return self._rebalance_buckets(buckets)

    def _farthest_first_seeds(
        self,
        places: list[GeocodedPlace],
        k: int,
        origin: tuple[float, float],
    ) -> list[tuple[float, float]]:
        """
        Pick k seed coordinates using the farthest-first heuristic.

        Seed 0 = place nearest to the trip origin (anchor for Day 1).
        Each subsequent seed = place farthest from all existing seeds.
        This spreads seeds maximally across the destination so each day
        covers a distinct geographic area.
        """
        coords = [(p.lat, p.lng) for p in places]

        # Seed 0: nearest to origin
        first_idx = min(
            range(len(coords)),
            key=lambda i: haversine_km(origin[0], origin[1], coords[i][0], coords[i][1]),
        )
        seeds: list[tuple[float, float]] = [coords[first_idx]]
        remaining = set(range(len(coords))) - {first_idx}

        while len(seeds) < k and remaining:
            farthest_idx = max(
                remaining,
                key=lambda i: min(
                    haversine_km(coords[i][0], coords[i][1], s[0], s[1])
                    for s in seeds
                ),
            )
            seeds.append(coords[farthest_idx])
            remaining.discard(farthest_idx)

        return seeds

    def _rebalance_buckets(
        self, buckets: list[list[GeocodedPlace]]
    ) -> list[list[GeocodedPlace]]:
        """
        Ensure no bucket is empty by pulling the last place from the
        largest bucket into each empty one.  Prevents zero-activity days.
        """
        max_iterations = len(buckets) * 2
        for _ in range(max_iterations):
            empty_indices = [i for i, b in enumerate(buckets) if not b]
            if not empty_indices:
                break
            largest_idx = max(range(len(buckets)), key=lambda i: len(buckets[i]))
            if len(buckets[largest_idx]) <= 1:
                break
            buckets[empty_indices[0]].append(buckets[largest_idx].pop())

        return buckets

    # ------------------------------------------------------------------
    # Bucket ordering
    # ------------------------------------------------------------------

    def _order_buckets_by_proximity(
        self,
        buckets: list[list[GeocodedPlace]],
        origin: tuple[float, float],
    ) -> list[list[GeocodedPlace]]:
        """
        Sort buckets so Day 1 centroid is nearest to the trip origin.
        Empty buckets are pushed to the end.
        """
        def bucket_distance(bucket: list[GeocodedPlace]) -> float:
            if not bucket:
                return float("inf")
            c = centroid([(p.lat, p.lng) for p in bucket])
            return haversine_km(origin[0], origin[1], c[0], c[1])

        return sorted(buckets, key=bucket_distance)

    # ------------------------------------------------------------------
    # Stage 2 — Nearest-neighbour with carry-over
    # ------------------------------------------------------------------

    def _sort_buckets_with_carryover(
        self,
        buckets: list[list[GeocodedPlace]],
        origin: tuple[float, float],
    ) -> list[DayPlan]:
        """
        Sort each bucket by nearest-neighbour, carrying the last stop's
        position forward as the start of the next day.
        """
        cur_lat, cur_lng = origin
        day_plans: list[DayPlan] = []

        for day_idx, bucket in enumerate(buckets):
            if not bucket:
                day_plans.append(DayPlan(day=day_idx + 1))
                continue

            ordered, cur_lat, cur_lng = self._nearest_neighbour_sort(
                bucket, cur_lat, cur_lng
            )
            stops = self._to_activity_stops(ordered)
            day_plans.append(DayPlan(day=day_idx + 1, stops=stops))

        return day_plans

    def _nearest_neighbour_sort(
        self,
        places: list[GeocodedPlace],
        start_lat: float,
        start_lng: float,
    ) -> tuple[list[GeocodedPlace], float, float]:
        """
        Greedy nearest-neighbour ordering starting from (start_lat, start_lng).
        Returns (ordered_places, final_lat, final_lng) for carry-over.
        """
        remaining = list(places)
        ordered: list[GeocodedPlace] = []
        cur_lat, cur_lng = start_lat, start_lng

        while remaining:
            nearest_place = min(
                remaining,
                key=lambda p: haversine_km(cur_lat, cur_lng, p.lat, p.lng),
            )
            ordered.append(nearest_place)
            cur_lat, cur_lng = nearest_place.lat, nearest_place.lng
            remaining.remove(nearest_place)

        return ordered, cur_lat, cur_lng

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _resolve_origin(
        self,
        starting_point: str,
        places: list[GeocodedPlace],
        api_key: str,
    ) -> tuple[float, float]:
        """
        Geocode the starting_point string to real coordinates.
        Falls back to the centroid of all places on failure.
        """
        geocoder = OriginGeocoderService(api_key=api_key)
        try:
            result = await geocoder.resolve(starting_point)
        finally:
            await geocoder.aclose()

        if result is not None:
            return result

        logger.warning(
            "Could not geocode starting point '%s' — using centroid fallback",
            starting_point,
        )
        return centroid([(p.lat, p.lng) for p in places])

    def _to_activity_stops(
        self, places: list[GeocodedPlace]
    ) -> list[ActivityStop]:
        """Convert ordered GeocodedPlace list → ActivityStop list with distances."""
        stops: list[ActivityStop] = []
        prev_lat: float | None = None
        prev_lng: float | None = None

        for place in places:
            dist: float | None = None
            if prev_lat is not None and prev_lng is not None:
                dist = round(
                    haversine_km(prev_lat, prev_lng, place.lat, place.lng), 2
                )
            stops.append(
                ActivityStop(
                    name=place.name,
                    address=place.address,
                    lat=place.lat,
                    lng=place.lng,
                    place_id=place.place_id,
                    famous_for=place.famous_for,
                    best_time=place.best_time,
                    local_tip=place.local_tip,
                    photo_url=place.photo_url,
                    distance_from_prev_km=dist,
                )
            )
            prev_lat, prev_lng = place.lat, place.lng

        return stops
