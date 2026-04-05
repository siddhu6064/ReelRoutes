import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ── Core fetch ────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

// ── Types (local, matches backend shape) ──────────────────────

export interface Pin {
  id: string;
  order: number;
  placeName: string;
  placeId?: string;
  lat: number;
  lng: number;
  address?: string;
  countryCode?: string;
  city?: string;
  cityGroup?: string;
  contextQuote?: string;
  timestampHint?: number;
  videoDeepLink?: string;
  confidence: number;
  manuallyAdded: boolean;
  notes?: string;
  tags: string[];
  // Week 2 — Places enrichment
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
  openingHoursText?: string[];
  website?: string;
  phoneNumber?: string;
}

export interface Trip {
  id: string;
  userId: string | null;
  title: string;
  sourceUrl: string;
  platform: string;
  thumbnailUrl?: string;
  videoDuration?: number;
  videoCreator?: string;
  videoChannel?: string;
  pinCount: number;
  pins: Pin[];
  itinerary: ItineraryDay[];
  collaborators: TripCollaborator[];
  shareToken?: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItineraryDay {
  dayNumber: number;
  label: string | null;
  pinIds: string[];
  notes: string | null;
}

export interface TripCollaborator {
  id: string;
  name: string;
  role: "editor" | "viewer";
  status: "pending" | "active";
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  currentStep?: string;
  progressMessage?: string;
  error?: string;
  errorCode?: string;
  completedAt?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Process ───────────────────────────────────────────────────

export function useProcessVideo() {
  return useMutation({
    mutationFn: ({ url, userId }: { url: string; userId?: string }) =>
      apiFetch<{ jobId: string; status: string; deduplicated: boolean }>("/api/process", {
        method: "POST",
        body: JSON.stringify({ url, user_id: userId ?? null }),
      }),
  });
}

// ── Jobs ──────────────────────────────────────────────────────

export function useJobStatus(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiFetch<JobStatus>(`/api/jobs/${jobId}`),
    enabled: !!jobId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 3000;
    },
  });
}

// ── Trips ─────────────────────────────────────────────────────

export function useTrip(tripId: string | null, userId?: string) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () =>
      apiFetch<Trip>(`/api/trips/${tripId}${userId ? `?user_id=${userId}` : ""}`),
    enabled: !!tripId,
  });
}

export function useUserTrips(userId: string | null) {
  return useQuery({
    queryKey: ["trips", userId],
    queryFn: () =>
      apiFetch<{ items: Trip[]; total: number }>(`/api/trips?user_id=${userId}`),
    enabled: !!userId,
  });
}

export function useSharedTrip(shareToken: string | null) {
  return useQuery({
    queryKey: ["shared-trip", shareToken],
    queryFn: () => apiFetch<Trip>(`/api/trips/share/${shareToken}`),
    enabled: !!shareToken,
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Trip> & { user_id?: string }) =>
      apiFetch<Trip>("/api/trips", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_, vars) => {
      if (vars.user_id) qc.invalidateQueries({ queryKey: ["trips", vars.user_id] });
    },
  });
}

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, ...body }: { tripId: string; user_id: string; title?: string }) =>
      apiFetch<Trip>(`/api/trips/${tripId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(["trip", data.id], data);
      qc.invalidateQueries({ queryKey: ["trips", data.userId] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) =>
      fetch(`${API_BASE}/api/trips/${tripId}?user_id=${userId}`, { method: "DELETE" }),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ["trips", userId] });
    },
  });
}

export function useShareTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) =>
      apiFetch<{ shareToken: string; isShared: boolean }>(
        `/api/trips/${tripId}/share?user_id=${userId}`,
        { method: "POST" }
      ),
    onSuccess: (_d, { tripId }) => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
  });
}

// ── Pins ──────────────────────────────────────────────────────

export function useAddPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, ...body }: { tripId: string } & Record<string, unknown>) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
  });
}

export function useUpdatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      pinId,
      ...body
    }: {
      tripId: string;
      pinId: string;
    } & Record<string, unknown>) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins/${pinId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
  });
}

export function useDeletePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      pinId,
      userId,
    }: {
      tripId: string;
      pinId: string;
      userId: string;
    }) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins/${pinId}?user_id=${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
  });
}

export function useReorderPins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      ...body
    }: {
      tripId: string;
      user_id: string;
      pin_ids: string[];
    }) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins/reorder`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
  });
}

// ── Chat ──────────────────────────────────────────────────────

export function useChat() {
  return useMutation({
    mutationFn: ({
      tripId,
      message,
      history,
      userId,
    }: {
      tripId: string;
      message: string;
      history: ChatMessage[];
      userId?: string;
    }) =>
      apiFetch<{ reply: string; suggestionChips: string[] }>(`/api/trips/${tripId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, history, user_id: userId ?? null }),
      }),
  });
}
