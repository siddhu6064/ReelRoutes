import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

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

export interface ChatStreamParams {
  tripId: string;
  message: string;
  history: ChatMessage[];
  userId?: string;
  onToken: (token: string) => void;
  onDone: (fullReply: string) => void;
  onError: (msg: string) => void;
}

/**
 * Stream a chat reply from the SSE endpoint.
 *
 * Calls onToken for every token as it arrives so the UI can render
 * progressively. Calls onDone with the accumulated full reply when
 * the stream ends. Returns an AbortController so the caller can
 * cancel in-flight requests (e.g. on component unmount).
 */
export function streamChat(params: ChatStreamParams): AbortController {
  const { tripId, message, history, userId, onToken, onDone, onError } = params;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/trips/${tripId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, user_id: userId ?? null }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onError("Sorry, something went wrong. Please try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines are separated by \n\n
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? ""; // keep incomplete trailing chunk

        for (const line of lines) {
          const dataLine = line.startsWith("data: ") ? line.slice(6).trim() : null;
          if (!dataLine) continue;
          if (dataLine === "[DONE]") {
            onDone(accumulated);
            return;
          }
          try {
            const parsed = JSON.parse(dataLine) as { token?: string; error?: string };
            if (parsed.error) {
              onError(parsed.error);
              return;
            }
            if (parsed.token) {
              accumulated += parsed.token;
              onToken(parsed.token);
            }
          } catch {
            // Malformed SSE chunk — skip
          }
        }
      }

      // Stream ended without [DONE] — still resolve with what we have
      if (accumulated) onDone(accumulated);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return; // cancelled — ignore
      onError("Connection lost. Please try again.");
    }
  })();

  return controller;
}

/** Legacy non-streaming hook kept for backward compat / tests */
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
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
  });
}

export function useUnvisitPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, pinId, userId }: { tripId: string; pinId: string; userId?: string }) =>
      apiFetch<{ pinId: string; unvisited: boolean }>(
        `/api/trips/${tripId}/pins/${pinId}/visit${userId ? `?user_id=${userId}` : ""}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
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
      apiFetch<WrappedStats>(`/api/trips/${tripId}/wrapped${userId ? `?user_id=${userId}` : ""}`),
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
    mutationFn: ({ tripId, userId }: { tripId: string; userId?: string }) =>
      apiFetch<SuggestSpotsData>(
        `/api/trips/${tripId}/suggest-spots${userId ? `?user_id=${userId}` : ""}`,
        { method: "POST" },
      ),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["trip", vars.tripId] }),
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
      apiFetch<{ budget: number; currency: string }>(`/api/trips/${tripId}/budget`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId ?? null,
          budget,
          currency: currency ?? "USD",
        }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses", vars.tripId] });
      qc.invalidateQueries({ queryKey: ["expense-summary", vars.tripId] });
    },
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

export function useExplore(
  filters: ExploreFilters,
): UseQueryResult<{ trips: TripCard[]; page: number }> {
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

export function useTrending(): UseQueryResult<{ trips: TripCard[] }> {
  return useQuery({
    queryKey: ["explore", "trending"],
    queryFn: () => apiFetch<{ trips: TripCard[] }>("/api/explore/trending"),
  });
}

export function useIncrementView(): UseMutationResult<null, Error, string> {
  return useMutation({
    mutationFn: (tripId: string) => apiFetch<null>(`/api/trips/${tripId}/view`, { method: "POST" }),
  });
}

export function useDuplicateTrip(): UseMutationResult<
  { trip_id: string; title: string },
  Error,
  { tripId: string; userId: string }
> {
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

export function useSetVisibility(): UseMutationResult<
  { is_public: boolean },
  Error,
  { tripId: string; userId: string; isPublic: boolean }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tripId,
      userId,
      isPublic,
    }: {
      tripId: string;
      userId: string;
      isPublic: boolean;
    }) =>
      apiFetch<{ is_public: boolean }>(
        `/api/trips/${tripId}/visibility?user_id=${userId}&is_public=${String(isPublic)}`,
        { method: "PATCH" },
      ),
    onSuccess: (_data, { tripId }) => {
      void qc.invalidateQueries({ queryKey: ["trip", tripId] });
    },
  });
}

// ── W14: Collaboration ───────────────────────────────────────────────────────

export function useCollaborators(
  tripId: string,
  userId: string,
): UseQueryResult<CollaboratorsResponse> {
  return useQuery({
    queryKey: ["collaborators", tripId],
    queryFn: () =>
      apiFetch<CollaboratorsResponse>(`/api/trips/${tripId}/collaborators?user_id=${userId}`),
  });
}

export function useCreateInvite(): UseMutationResult<
  InviteResponse,
  Error,
  { tripId: string; userId: string; role: "editor" | "viewer" }
> {
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

export function useRemoveCollaborator(): UseMutationResult<
  null,
  Error,
  { tripId: string; userId: string; collabId: string }
> {
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
    onSuccess: (_data, { tripId }) => {
      void qc.invalidateQueries({ queryKey: ["collaborators", tripId] });
    },
  });
}

// ── W15: Undo ────────────────────────────────────────────────────────────────

export function useUndoHistory(
  tripId: string,
  userId: string,
): UseQueryResult<{ snapshots: HistorySnapshot[]; max_history: number }> {
  return useQuery({
    queryKey: ["history", tripId],
    queryFn: () =>
      apiFetch<{ snapshots: HistorySnapshot[]; max_history: number }>(
        `/api/trips/${tripId}/history?user_id=${userId}`,
      ),
  });
}

export function useUndoTrip(): UseMutationResult<
  { restored_at: string; pin_count: number } | { message: string; pin_count: number },
  Error,
  { tripId: string; userId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, userId }: { tripId: string; userId: string }) =>
      apiFetch<{ restored_at: string; pin_count: number } | { message: string; pin_count: number }>(
        `/api/trips/${tripId}/undo?user_id=${userId}`,
        { method: "POST" },
      ),
    onSuccess: (_data, { tripId }) => {
      void qc.invalidateQueries({ queryKey: ["trip", tripId] });
      void qc.invalidateQueries({ queryKey: ["history", tripId] });
    },
  });
}

// ── W16: Reservations ────────────────────────────────────────────────────────

export function useReservations(
  tripId: string,
  userId: string,
): UseQueryResult<{ reservations: Reservation[] }> {
  return useQuery({
    queryKey: ["reservations", tripId],
    queryFn: () =>
      apiFetch<{ reservations: Reservation[] }>(
        `/api/trips/${tripId}/reservations?user_id=${userId}`,
      ),
  });
}

export function useImportReservation(): UseMutationResult<
  Reservation,
  Error,
  { tripId: string; userId: string; emailText: string }
> {
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
    onSuccess: (_data, { tripId }) => {
      void qc.invalidateQueries({ queryKey: ["reservations", tripId] });
    },
  });
}

export function useDeleteReservation(): UseMutationResult<
  null,
  Error,
  { tripId: string; userId: string; reservationId: string }
> {
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
    onSuccess: (_data, { tripId }) => {
      void qc.invalidateQueries({ queryKey: ["reservations", tripId] });
    },
  });
}

// ── Vector Search ─────────────────────────────────────────────────────────────

export interface SimilarTrip {
  id: string;
  title: string;
  platform: string;
  pin_count: number;
  view_count: number;
  video_creator: string | null;
  video_channel: string | null;
  created_at: string;
  similarity_score: number;
}

export function useSimilarTrips(
  tripId: string,
  enabled = true,
): UseQueryResult<{ trips: SimilarTrip[]; source_trip_id: string }> {
  return useQuery({
    queryKey: ["similar", tripId],
    queryFn: () =>
      apiFetch<{ trips: SimilarTrip[]; source_trip_id: string }>(
        `/api/trips/${tripId}/similar`,
      ),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — similarity doesn't change often
  });
}

export function useSemanticSearch(
  query: string,
  enabled = true,
): UseQueryResult<{ trips: SimilarTrip[]; query: string; semantic: boolean }> {
  return useQuery({
    queryKey: ["semantic-search", query],
    queryFn: () =>
      apiFetch<{ trips: SimilarTrip[]; query: string; semantic: boolean }>(
        `/api/explore/semantic?q=${encodeURIComponent(query)}`,
      ),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}
