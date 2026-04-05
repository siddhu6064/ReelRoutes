import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GuestJob {
  jobId: string;
  url: string;
  tripId: string | null;
}

interface AppState {
  // Auth
  userId: string | null;
  setUserId: (id: string | null) => void;

  // Guest mode — single in-progress import without account
  guestJob: GuestJob | null;
  setGuestJob: (job: GuestJob | null) => void;

  // Active trip for map/chat view
  activeTripId: string | null;
  setActiveTripId: (id: string | null) => void;

  // Chat panel
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;

  // "Add to existing trip" dialog
  addToExistingOpen: boolean;
  pendingJobId: string | null;
  openAddToExisting: (jobId: string) => void;
  closeAddToExisting: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      userId: null,
      setUserId: (id) => set({ userId: id }),

      guestJob: null,
      setGuestJob: (job) => set({ guestJob: job }),

      activeTripId: null,
      setActiveTripId: (id) => set({ activeTripId: id }),

      chatOpen: false,
      setChatOpen: (open) => set({ chatOpen: open }),

      addToExistingOpen: false,
      pendingJobId: null,
      openAddToExisting: (jobId) => set({ addToExistingOpen: true, pendingJobId: jobId }),
      closeAddToExisting: () => set({ addToExistingOpen: false, pendingJobId: null }),
    }),
    {
      name: "reelroutes-app",
      partialize: (state) => ({
        guestJob: state.guestJob,
        activeTripId: state.activeTripId,
      }),
    },
  ),
);
