/**
 * apps/mobile/api/client.ts
 *
 * Mobile API client — mirrors the web client but uses React Query
 * patterns suited for React Native (no SSR concerns).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";

const API_BASE =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.["apiUrl"] ??
  process.env["EXPO_PUBLIC_API_URL"] ??
  "https://api.reelroutes.app";

// ── Core fetch ─────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

// ── Types ──────────────────────────────────────────────────────

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
  category?: string;
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
  completedAt?: string;
}

// ── Process ────────────────────────────────────────────────────

export function useProcessVideo() {
  return useMutation({
    mutationFn: ({ url, userId }: { url: string; userId?: string }) =>
      apiFetch<{ jobId: string; status: string; deduplicated: boolean }>("/api/process", {
        method: "POST",
        body: JSON.stringify({ url, user_id: userId ?? null }),
      }),
  });
}

// ── Jobs ───────────────────────────────────────────────────────

export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiFetch<JobStatus>(`/api/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "completed" || s === "failed" ? false : 3000;
    },
  });
}

// ── Trips ──────────────────────────────────────────────────────

export function useUserTrips(userId: string | null) {
  return useQuery({
    queryKey: ["trips", userId],
    queryFn: () => apiFetch<{ items: Trip[]; total: number }>(`/api/users/me/trips`),
    enabled: !!userId,
  });
}

export function useTrip(tripId: string | null) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => apiFetch<Trip>(`/api/trips/${tripId}`),
    enabled: !!tripId,
  });
}

// ── Trip mutations ────────────────────────────────────────────

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, ...body }: { tripId: string; user_id: string; title?: string }) =>
      apiFetch<Trip>(`/api/trips/${tripId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (data: Trip) => qc.setQueryData(["trip", data.id], data),
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) =>
      apiFetch<void>(`/api/trips/${tripId}?user_id=${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });
}

export function useAddPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, ...body }: { tripId: string } & Record<string, unknown>) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data: Trip) => qc.setQueryData(["trip", data.id], data),
  });
}

export function useReorderPins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, ...body }: { tripId: string; user_id: string; pin_ids: string[] }) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins/reorder`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data: Trip) => qc.setQueryData(["trip", data.id], data),
  });
}

export function useUpdatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      pinId,
      userId,
      ...body
    }: { tripId: string; pinId: string; userId: string } & Record<string, unknown>) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins/${pinId}`, {
        method: "PUT",
        body: JSON.stringify({ user_id: userId, ...body }),
      }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
  });
}

// ── Chat ───────────────────────────────────────────────────────

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
      history: { role: string; content: string }[];
      userId?: string;
    }) =>
      apiFetch<{ reply: string; suggestionChips: string[] }>(`/api/trips/${tripId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, history, user_id: userId ?? null }),
      }),
  });
}

// ── Phase 2 mutations ─────────────────────────────────────────

export interface OptimiseResult {
  originalDistanceKm: number;
  optimisedDistanceKm: number;
  savingPercent: number;
  pins: Pin[];
}

export function useOptimiseRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, user_id }: { tripId: string; user_id: string }) =>
      apiFetch<OptimiseResult>(`/api/trips/${tripId}/optimise-route`, {
        method: "POST",
        body: JSON.stringify({ user_id }),
      }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

export function useGenerateItinerary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      user_id,
      trip_length_days,
    }: {
      tripId: string;
      user_id: string;
      trip_length_days: number;
    }) =>
      apiFetch<{ tripLengthDays: number; days: ItineraryDay[] }>(`/api/trips/${tripId}/itinerary`, {
        method: "POST",
        body: JSON.stringify({ user_id, trip_length_days }),
      }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

// ─── Phase 4 additions ───────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export interface TripCard {
  id: string;
  title: string;
  platform: string | null;
  pin_count: number;
  view_count: number;
  share_count: number;
  video_creator: string | null;
  video_channel: string | null;
  created_at: string;
}

export interface ExploreFilters {
  destination?: string;
  platform?: string;
  page?: number;
  limit?: number;
}

export interface Collaborator {
  id: string;
  clerk_id: string | null;
  name: string;
  role: "editor" | "viewer";
  joined_at: string | null;
}

export interface CollaboratorsResponse {
  owner: string | null;
  collaborators: Collaborator[];
  pending_count: number;
}

export interface InviteResponse {
  invite_token: string;
  invite_url: string;
  role: "editor" | "viewer";
  collab_id: string;
}

export interface Reservation {
  id: string;
  type: "flight" | "hotel" | "activity" | "car_rental" | "other";
  title: string;
  confirmation_number: string | null;
  check_in: string | null;
  check_out: string | null;
  flight_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface HistorySnapshot {
  snapshot_at: string;
  index: number;
}

// ── W13: Explore ─────────────────────────────────────────────────────────────

export function useExplore(filters: ExploreFilters) {
  const params = new URLSearchParams();
  if (filters.destination !== undefined) params.set("destination", filters.destination);
  if (filters.platform !== undefined) params.set("platform", filters.platform);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));

  return useQuery({
    queryKey: ["explore", filters],
    queryFn: () =>
      apiFetch<{ trips: TripCard[]; page: number }>(`/api/explore?${params.toString()}`),
  });
}

export function useTrending() {
  return useQuery({
    queryKey: ["explore", "trending"],
    queryFn: () => apiFetch<{ trips: TripCard[] }>("/api/explore/trending"),
  });
}

export function useIncrementView() {
  return useMutation({
    mutationFn: (tripId: string) => apiFetch<null>(`/api/trips/${tripId}/view`, { method: "POST" }),
  });
}

export function useDuplicateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) =>
      apiFetch<{ trip_id: string; title: string }>(
        `/api/trips/${tripId}/duplicate?user_id=${userId}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

// ── W14: Collaboration ───────────────────────────────────────────────────────

export function useCollaborators(tripId: string, userId: string) {
  return useQuery({
    queryKey: ["collaborators", tripId],
    queryFn: () =>
      apiFetch<CollaboratorsResponse>(`/api/trips/${tripId}/collaborators?user_id=${userId}`),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      role,
    }: {
      tripId: string;
      userId: string;
      role: "editor" | "viewer";
    }) =>
      apiFetch<InviteResponse>(`/api/trips/${tripId}/invite?user_id=${userId}`, {
        method: "POST",
        body: JSON.stringify({ role }),
      }),
  });
}

export function useRemoveCollaborator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      collabId,
    }: {
      tripId: string;
      userId: string;
      collabId: string;
    }) =>
      apiFetch<null>(`/api/trips/${tripId}/collaborators/${collabId}?user_id=${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["collaborators", vars.tripId] });
    },
  });
}

// ── W15: Undo ────────────────────────────────────────────────────────────────

export function useUndoHistory(tripId: string, userId: string) {
  return useQuery({
    queryKey: ["history", tripId],
    queryFn: () =>
      apiFetch<{ snapshots: HistorySnapshot[]; max_history: number }>(
        `/api/trips/${tripId}/history?user_id=${userId}`,
      ),
  });
}

export function useUndoTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) =>
      apiFetch<{ restored_at: string; pin_count: number } | { message: string; pin_count: number }>(
        `/api/trips/${tripId}/undo?user_id=${userId}`,
        { method: "POST" },
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["trip", vars.tripId] });
      void qc.invalidateQueries({ queryKey: ["history", vars.tripId] });
    },
  });
}

// ── W16: Reservations ────────────────────────────────────────────────────────

export function useReservations(tripId: string, userId: string) {
  return useQuery({
    queryKey: ["reservations", tripId],
    queryFn: () =>
      apiFetch<{ reservations: Reservation[] }>(
        `/api/trips/${tripId}/reservations?user_id=${userId}`,
      ),
  });
}

export function useImportReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      emailText,
    }: {
      tripId: string;
      userId: string;
      emailText: string;
    }) =>
      apiFetch<Reservation>(`/api/trips/${tripId}/import-reservation?user_id=${userId}`, {
        method: "POST",
        body: JSON.stringify({ email_text: emailText }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["reservations", vars.tripId] });
    },
  });
}

export function useDeleteReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      reservationId,
    }: {
      tripId: string;
      userId: string;
      reservationId: string;
    }) =>
      apiFetch<null>(`/api/trips/${tripId}/reservations/${reservationId}?user_id=${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["reservations", vars.tripId] });
    },
  });
}
