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
  category?: string;
  // Week 2 — Places enrichment
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
  openingHoursText?: string[];
  website?: string;
  phoneNumber?: string;
  // Phase 3 W9 — Visit tracking
  visitedAt?: string;
  diaryEntry?: string;
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
    queryFn: () => apiFetch<Trip>(`/api/trips/${tripId}${userId ? `?user_id=${userId}` : ""}`),
    enabled: !!tripId,
  });
}

export function useUserTrips(userId: string | null) {
  return useQuery({
    queryKey: ["trips", userId],
    queryFn: () => apiFetch<{ items: Trip[]; total: number }>(`/api/trips?user_id=${userId}`),
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
        { method: "POST" },
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
    mutationFn: ({ tripId, pinId, userId }: { tripId: string; pinId: string; userId: string }) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins/${pinId}?user_id=${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
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

// ── Phase 2 — Route + Itinerary + Category ────────────────────

export interface OptimiseResult {
  originalDistanceKm: number;
  optimisedDistanceKm: number;
  savingPercent: number;
  pins: Pin[];
}

export function useOptimiseRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      user_id,
      start_lat,
      start_lng,
    }: {
      tripId: string;
      user_id: string;
      start_lat?: number;
      start_lng?: number;
    }) =>
      apiFetch<OptimiseResult>(`/api/trips/${tripId}/optimise-route`, {
        method: "POST",
        body: JSON.stringify({ user_id, start_lat, start_lng }),
      }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
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
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

// ── Phase 3 W9 — Pin Visit ────────────────────────────────────

export interface VisitPinData {
  pinId: string;
  visitedAt: string;
  diaryEntry: string | null;
}

export function useVisitPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      pinId,
      userId,
      diaryEntry,
    }: {
      tripId: string;
      pinId: string;
      userId?: string;
      diaryEntry?: string;
    }) =>
      apiFetch<VisitPinData>(`/api/trips/${tripId}/pins/${pinId}/visit`, {
        method: "PATCH",
        body: JSON.stringify({
          user_id: userId ?? null,
          ...(diaryEntry !== undefined ? { diary_entry: diaryEntry } : {}),
        }),
      }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

export function useUnvisitPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      pinId,
      userId,
    }: {
      tripId: string;
      pinId: string;
      userId?: string;
    }) =>
      apiFetch<{ pinId: string; unvisited: boolean }>(
        `/api/trips/${tripId}/pins/${pinId}/visit${userId ? `?user_id=${userId}` : ""}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

// ── Phase 3 W10 — Trip Wrapped ────────────────────────────────

export interface CategoryCount {
  category: string;
  count: number;
}

export interface WrappedStats {
  tripId: string;
  title: string;
  totalPins: number;
  visitedPins: number;
  visitRate: number;
  diaryCount: number;
  distanceKm: number;
  daysActive: number;
  topCategories: CategoryCount[];
  firstVisit: string | null;
  lastVisit: string | null;
  createdAt: string | null;
}

export function useWrapped(tripId: string | null, userId?: string) {
  return useQuery({
    queryKey: ["wrapped", tripId],
    queryFn: () =>
      apiFetch<WrappedStats>(
        `/api/trips/${tripId}/wrapped${userId ? `?user_id=${userId}` : ""}`,
      ),
    enabled: !!tripId,
    staleTime: 60_000,
  });
}

// ── Phase 3 W11 — AI Spot Suggestions ────────────────────────

export interface SpotSuggestion {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  reason: string;
}

export interface SuggestSpotsData {
  tripId: string;
  suggestions: SpotSuggestion[];
}

export function useSuggestSpots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
    }: {
      tripId: string;
      userId?: string;
    }) =>
      apiFetch<SuggestSpotsData>(
        `/api/trips/${tripId}/suggest-spots${userId ? `?user_id=${userId}` : ""}`,
        { method: "POST" },
      ),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

export function useAddSuggestedPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      spot,
      userId,
    }: {
      tripId: string;
      spot: SpotSuggestion;
      userId?: string;
    }) =>
      apiFetch<Trip>(`/api/trips/${tripId}/pins`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId ?? null,
          place_name: spot.name,
          address: spot.address,
          lat: spot.lat,
          lng: spot.lng,
          notes: spot.reason,
        }),
      }),
    onSuccess: (data) => qc.setQueryData(["trip", data.id], data),
  });
}

// ── Phase 3 W12 — Budget / Expenses ──────────────────────────

export const EXPENSE_CATEGORIES = [
  "accommodation",
  "food",
  "transport",
  "activities",
  "shopping",
  "other",
] as const;

export const EXPENSE_CATEGORY_ICONS: Record<string, string> = {
  accommodation: "🏨",
  food: "🍜",
  transport: "🚗",
  activities: "🎭",
  shopping: "🛍️",
  other: "📎",
};

export type ExpenseCategory =
  | "accommodation"
  | "food"
  | "transport"
  | "activities"
  | "shopping"
  | "other";

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paidByName: string;
  notes: string | null;
  pinId: string | null;
  date: string;
}

export interface ExpenseListData {
  expenses: Expense[];
  budget: number | null;
  currency: string;
}

export interface ExpenseSummaryData {
  totalSpent: number;
  currency: string;
  budget: number | null;
  remaining: number | null;
  budgetUsedPercent: number | null;
  expenseCount: number;
  byCategory: Record<string, number>;
}

export function useExpenses(tripId: string | null, userId?: string) {
  return useQuery({
    queryKey: ["expenses", tripId],
    queryFn: () =>
      apiFetch<ExpenseListData>(
        `/api/trips/${tripId}/expenses${userId ? `?user_id=${userId}` : ""}`,
      ),
    enabled: !!tripId,
  });
}

export function useExpenseSummary(tripId: string | null, userId?: string) {
  return useQuery({
    queryKey: ["expense-summary", tripId],
    queryFn: () =>
      apiFetch<ExpenseSummaryData>(
        `/api/trips/${tripId}/expenses/summary${userId ? `?user_id=${userId}` : ""}`,
      ),
    enabled: !!tripId,
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      title,
      amount,
      category,
      notes,
    }: {
      tripId: string;
      userId?: string;
      title: string;
      amount: number;
      category: ExpenseCategory;
      notes?: string;
    }) =>
      apiFetch<Expense>(`/api/trips/${tripId}/expenses`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId ?? null,
          title,
          amount,
          category,
          paid_by_name: "Me",
          ...(notes ? { notes } : {}),
        }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses", vars.tripId] });
      qc.invalidateQueries({ queryKey: ["expense-summary", vars.tripId] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      expenseId,
      userId,
    }: {
      tripId: string;
      expenseId: string;
      userId?: string;
    }) =>
      apiFetch<{ deleted: boolean }>(
        `/api/trips/${tripId}/expenses/${expenseId}${userId ? `?user_id=${userId}` : ""}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses", vars.tripId] });
      qc.invalidateQueries({ queryKey: ["expense-summary", vars.tripId] });
    },
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      budget,
      currency,
    }: {
      tripId: string;
      userId?: string;
      budget: number;
      currency?: string;
    }) =>
      apiFetch<{ budget: number; currency: string }>(
        `/api/trips/${tripId}/budget`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: userId ?? null,
            budget,
            currency: currency ?? "USD",
          }),
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses", vars.tripId] });
      qc.invalidateQueries({ queryKey: ["expense-summary", vars.tripId] });
    },
  });
}
