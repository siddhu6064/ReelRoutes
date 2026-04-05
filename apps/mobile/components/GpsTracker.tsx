/**
 * W18 — Background GPS tracker.
 * Uses expo-location significant-change accuracy (battery-friendly).
 *
 * Install: pnpm --filter mobile add expo-location
 * Permissions needed in app.json:
 *   ios.infoPlist.NSLocationWhenInUseUsageDescription
 *   ios.infoPlist.NSLocationAlwaysUsageDescription
 *   android.permissions: ["ACCESS_BACKGROUND_LOCATION", "ACCESS_FINE_LOCATION"]
 */
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Platform, Vibration } from "react-native";

const POLL_INTERVAL_MS = 15_000; // 15 s polling fallback on Android
const API_BASE = process.env["EXPO_PUBLIC_API_URL"] ?? "https://api.reelroutes.app";

interface Props {
  tripId: string;
  userId: string;
  /** Called when one or more pins are auto-visited */
  onAutoVisit?: (pinIds: string[]) => void;
  /** Called when a breadcrumb is recorded */
  onLocationUpdate?: (lat: number, lng: number) => void;
}

export function useGpsTracker({ tripId, userId, onAutoVisit, onLocationUpdate }: Props): {
  isTracking: boolean;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [isTracking, setIsTracking] = useState(false);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function postLocation(lat: number, lng: number, accuracy?: number) {
    try {
      const params = new URLSearchParams({ user_id: userId });
      const body: Record<string, unknown> = { lat, lng };
      if (accuracy !== undefined) body["accuracy_meters"] = accuracy;

      const res = await fetch(`${API_BASE}/api/trips/${tripId}/location?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data: { auto_visited_pins: string[] };
      };
      const autoVisited = json.data?.auto_visited_pins ?? [];
      if (autoVisited.length > 0) {
        Vibration.vibrate(80);
        onAutoVisit?.(autoVisited);
      }
      onLocationUpdate?.(lat, lng);
    } catch {
      // Silent fail — offline or server error
    }
  }

  async function start() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    setIsTracking(true);

    if (Platform.OS === "ios") {
      // iOS: significant-change updates (battery-friendly, ~500m threshold)
      subRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 100, // only fire when moved 100m+
          timeInterval: 30_000,
        },
        (loc) => {
          void postLocation(
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.accuracy ?? undefined,
          );
        },
      );
    } else {
      // Android: poll every 15s (background location needs foreground service)
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      void postLocation(loc.coords.latitude, loc.coords.longitude);

      pollRef.current = setInterval(async () => {
        const l = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        void postLocation(l.coords.latitude, l.coords.longitude, l.coords.accuracy ?? undefined);
      }, POLL_INTERVAL_MS);
    }
  }

  function stop() {
    subRef.current?.remove();
    subRef.current = null;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsTracking(false);
  }

  // Clean up on unmount
  useEffect(() => () => stop(), []);

  return { isTracking, start, stop };
}
