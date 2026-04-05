/**
 * apps/mobile/app/+native-intent.ts
 *
 * Expo Router's native intent handler.
 * Called before any navigation when the app is opened via a deep link —
 * including URLs sent from the iOS Share Extension via expo-share-intent.
 *
 * When a user taps "ReelRoutes" in the iOS share sheet from YouTube,
 * Instagram, TikTok, Facebook, or X:
 *   1. The native Share Extension captures the URL
 *   2. expo-share-intent passes it to the app via a deep link
 *   3. This file intercepts the link and redirects to the new-trip tab
 *   4. new-trip.tsx reads the intent via useShareIntentContext()
 *      and auto-populates the URL input
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial?: boolean;
}): string {
  try {
    // expo-share-intent signals an incoming share via a special hostname
    const url = new URL(path);
    if (
      url.hostname === "expo-share-intent" ||
      path.includes("dataType=") ||      // share intent deep link params
      path.includes("shareIntent")
    ) {
      // Send user directly to the import tab
      return "/(tabs)/new-trip";
    }
  } catch {
    // Not a URL — fall through to default routing
  }

  return path;
}
