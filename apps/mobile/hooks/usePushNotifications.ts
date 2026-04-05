// @ts-nocheck — expo-notifications added at EAS build time
/**
 * apps/mobile/hooks/usePushNotifications.ts
 *
 * Fix 3 — Registers the device's Expo push token with the API
 * so the server can send "Your trip is ready!" notifications.
 *
 * Call this hook once from the root layout after the user is signed in.
 * On first call: requests permission → gets token → registers with API.
 * On subsequent calls: no-op (token cached in SecureStore).
 *
 * Also sets up a notification tap handler that navigates to the
 * relevant trip when the user taps a "trip ready" notification.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";

const PUSH_TOKEN_KEY = "expo_push_token";
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://api.reelroutes.app";

export function usePushNotifications() {
  const { userId, getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications(userId, getToken);
    return setupNotificationHandlers(router);
  }, [userId]);
}

async function registerForPushNotifications(
  userId: string,
  getToken: () => Promise<string | null>,
) {
  // Avoid re-registering on every launch — check cached token first
  try {
    const cached = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (cached) return; // already registered
  } catch {
    // SecureStore unavailable — proceed with registration
  }

  // Dynamically import expo-notifications (requires custom build)
  let Notifications: typeof import("expo-notifications") | null = null;
  try {
    Notifications = await import("expo-notifications");
  } catch {
    // expo-notifications not installed or running in Expo Go
    return;
  }

  // Configure how notifications appear when the app is in the foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return; // user declined — respect the choice
  }

  // Android requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trips", {
      name: "Trip Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D85A30",
    });
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  });
  const token = tokenData.data;

  // Register with our API
  try {
    const authToken = await getToken();
    await fetch(`${API_BASE}/api/users/me/push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ token }),
    });

    // Cache the token so we don't re-register every launch
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  } catch {
    // Non-fatal — user just won't get push notifications until next launch
  }
}

function setupNotificationHandlers(router: ReturnType<typeof import("expo-router").useRouter>) {
  let Notifications: typeof import("expo-notifications") | null = null;

  import("expo-notifications")
    .then((mod) => {
      Notifications = mod;

      // Handle tap on a notification when app is backgrounded or killed
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.screen === "trip" && data?.tripId) {
          router.push(`/trip/${data.tripId}`);
        } else if (data?.screen === "new-trip") {
          router.push("/(tabs)/new-trip");
        }
      });

      return () => sub.remove();
    })
    .catch(() => {
      // expo-notifications not available
    });

  return () => {}; // cleanup handled inside the promise
}
