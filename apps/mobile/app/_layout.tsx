/**
 * apps/mobile/app/_layout.tsx
 *
 * Root layout — wraps the entire app in:
 *   ClerkProvider  → auth session via secure storage
 *   QueryClientProvider → data fetching
 *   GestureHandlerRootView → react-native-gesture-handler
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import Constants from "expo-constants";
import { ShareIntentProvider } from "expo-share-intent";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// Keep splash visible until fonts/auth are loaded
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

// Secure token cache for Clerk
const tokenCache = {
  async getToken(key: string) {
    try { return await SecureStore.getItemAsync(key); }
    catch { return null; }
  },
  async saveToken(key: string, value: string) {
    try { await SecureStore.setItemAsync(key, value); }
    catch { /* ignore */ }
  },
};

const CLERK_PUBLISHABLE_KEY =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.['clerkPublishableKey'] ??
  process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'] ??
  "";

function RootLayoutNav() {
  const { isLoaded } = useAuth();
  usePushNotifications();

  useEffect(() => {
    if (isLoaded) SplashScreen.hideAsync();
  }, [isLoaded]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="trip/[tripId]" options={{ presentation: "card" }} />
      <Stack.Screen name="processing/[jobId]" options={{ presentation: "card" }} />
      <Stack.Screen name="share/[shareToken]" options={{ presentation: "modal" }} />
      <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <GestureHandlerRootView style={styles.root}>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <RootLayoutNav />
          </QueryClientProvider>
        </ClerkProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f0f0d" },
});
