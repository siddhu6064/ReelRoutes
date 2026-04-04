/**
 * apps/mobile/stores/appStore.ts
 *
 * Zustand store for mobile app state.
 * Tracks active trip, guest job, and UI state.
 */
import { create } from "zustand";

interface GuestJob {
  jobId: string;
  url: string;
  tripId: string | null;
}

interface AppState {
  activeTripId: string | null;
  guestJob: GuestJob | null;
  chatOpen: boolean;

  setActiveTripId: (id: string | null) => void;
  setGuestJob: (job: GuestJob | null) => void;
  setChatOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTripId: null,
  guestJob: null,
  chatOpen: false,

  setActiveTripId: (id) => set({ activeTripId: id }),
  setGuestJob: (job) => set({ guestJob: job }),
  setChatOpen: (open) => set({ chatOpen: open }),
}));
