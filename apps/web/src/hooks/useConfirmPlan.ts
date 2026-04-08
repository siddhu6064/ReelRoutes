import { useMutation } from '@tanstack/react-query'

import type {
  ConfirmActivityStop,
  ConfirmDayPlan,
  ConfirmFoodStop,
  CuratedDay,
  PlanConfirmRequest,
  PlanConfirmResponse,
  TravelMode,
  TripPreference,
} from '../types/scratchPlan'

const API_BASE = (import.meta as Record<string, unknown> & { env?: Record<string, string> }).env?.VITE_API_URL ?? 'http://localhost:8000'

async function postConfirmPlan(req: PlanConfirmRequest): Promise<PlanConfirmResponse> {
  const res = await fetch(`${API_BASE}/trips/plan/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string }
    throw new Error(err.detail ?? `Confirm request failed (${res.status})`)
  }
  return res.json() as Promise<PlanConfirmResponse>
}

export function useConfirmPlan(): ReturnType<typeof useMutation<PlanConfirmResponse, Error, PlanConfirmRequest>> {
  return useMutation<PlanConfirmResponse, Error, PlanConfirmRequest>({
    mutationFn: postConfirmPlan,
    retry: false,
  })
}

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
    days_plan: params.curatedDays.map((d): ConfirmDayPlan => ({
      day: d.day,
      activity_stops: d.activityStops.map((s): ConfirmActivityStop => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        ...(s.place_id !== undefined && { place_id: s.place_id }),
        ...(s.address !== undefined && { address: s.address }),
        ...(s.famous_for !== undefined && { famous_for: s.famous_for }),
        ...(s.best_time !== undefined && { best_time: s.best_time }),
        ...(s.local_tip !== undefined && { local_tip: s.local_tip }),
        ...(s.photo_url !== undefined && { photo_url: s.photo_url }),
      })),
      food_stops: d.foodChoices
        .filter((fc) => fc.chosen !== null)
        .map((fc): ConfirmFoodStop => ({
          name: fc.chosen!.name,
          lat: fc.chosen!.lat,
          lng: fc.chosen!.lng,
          ...(fc.chosen!.place_id !== undefined && { place_id: fc.chosen!.place_id }),
          ...(fc.chosen!.address !== undefined && { address: fc.chosen!.address }),
          ...(fc.chosen!.known_for !== undefined && { known_for: fc.chosen!.known_for }),
          meal: fc.meal,
        })),
    })),
  }
}
