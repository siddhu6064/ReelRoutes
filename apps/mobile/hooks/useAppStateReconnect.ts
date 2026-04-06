/**
 * hooks/useAppStateReconnect.ts
 *
 * Triggers a callback when the app returns to the foreground from background.
 * Used to reconnect WebSocket job progress streams and refresh stale data
 * after the app resumes (e.g. user switches back from YouTube after sharing).
 *
 * Usage:
 *   useAppStateReconnect(() => {
 *     queryClient.invalidateQueries({ queryKey: ['job', jobId] });
 *   });
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useAppStateReconnect(onForeground: () => void): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      // Fired when app moves from background/inactive → active
      if ((prev === "background" || prev === "inactive") && nextState === "active") {
        onForeground();
      }
    });

    return () => sub.remove();
  }, [onForeground]);
}
