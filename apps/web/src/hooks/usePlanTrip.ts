import { useMutation } from '@tanstack/react-query'

import type { DraftItinerary, PlanRequest } from '../types/scratchPlan'

const API_BASE = (import.meta as Record<string, unknown> & { env?: Record<string, string> }).env?.VITE_API_URL ?? 'http://localhost:8000'

async function postPlanTrip(req: PlanRequest): Promise<DraftItinerary> {
  const res = await fetch(`${API_BASE}/trips/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string }
    throw new Error(err.detail ?? `Plan request failed (${res.status})`)
  }
  return res.json() as Promise<DraftItinerary>
}

export function usePlanTrip(): ReturnType<typeof useMutation<DraftItinerary, Error, PlanRequest>> {
  return useMutation<DraftItinerary, Error, PlanRequest>({
    mutationFn: postPlanTrip,
    retry: false,
  })
}
