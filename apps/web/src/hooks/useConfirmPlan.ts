import type {
import { useMutation } from '@tanstack/react-query'

  CuratedDay,
  PlanConfirmRequest,
  PlanConfirmResponse,
  TravelMode,
  TripPreference,
} from '../types/scratchPlan'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function postConfirmPlan(
  req: PlanConfirmRequest
): Promise<PlanConfirmResponse> {
  const res = await fetch(`${API_BASE}/trips/plan/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `Confirm request failed (${res.status})`)
  }
  return res.json()
}

/**
 * Mutation hook for POST /trips/plan/confirm
 * Sends the curated draft and receives the saved trip ID.
 */
export function useConfirmPlan() {
  return useMutation<PlanConfirmResponse, Error, PlanConfirmRequest>({
    mutationFn: postConfirmPlan,
    retry: false,
  })
}

/**
 * Build a PlanConfirmRequest from Zustand curated state.
 * Called by CurationScreen when the user clicks "Save Trip".
 */
export function buildConfirmRequest(params: {
  startingPoint: string
  destination: string
  days: number
  travelMode: TravelMode
  preferences: TripPreference[]
  curatedDays: CuratedDay[]
}): PlanConfirmRequest {
  return {
    starting_point: params.startingPoint,
    destination: params.destination,
    days: params.days,
    travel_mode: params.travelMode,
    preferences: params.preferences,
    days_plan: params.curatedDays.map((d) => ({
      day: d.day,
      activity_stops: d.activityStops.map((s) => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        place_id: s.place_id,
        address: s.address,
        famous_for: s.famous_for,
        best_time: s.best_time,
        local_tip: s.local_tip,
        photo_url: s.photo_url,
      })),
      food_stops: d.foodChoices
        .filter((fc) => fc.chosen !== null)
        .map((fc) => ({
          name: fc.chosen!.name,
          lat: fc.chosen!.lat,
          lng: fc.chosen!.lng,
          place_id: fc.chosen!.place_id,
          address: fc.chosen!.address,
          known_for: fc.chosen!.known_for,
          meal: fc.meal,
        })),
    })),
  }
}
