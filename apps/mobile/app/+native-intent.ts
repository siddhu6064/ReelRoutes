/**
 * apps/mobile/app/+native-intent.ts
 *
 * Expo Router native intent handler — called before any navigation when
 * the app opens via a deep link or share intent.
 *
 * expo-share-intent signals an incoming share with a special deep link:
 *   dataType=<type>&data=<encoded>   — direct share data
 *   shareIntent=1                    — share extension wake-up
 *   expo-share-intent hostname       — legacy format
 *   reelroutes://import?url=<url>    — our own custom URL scheme
 *
 * All of these redirect straight to the import tab so the user lands
 * on the URL field with the video URL already populated.
 */
export function redirectSystemPath({
  path,
  initial: _initial,
}: {
  path: string;
  initial?: boolean;
}): string {
  try {
    const url = new URL(path, "reelroutes://");

    // expo-share-intent deep link formats
    const isShareIntent =
      url.hostname === "expo-share-intent" ||
      url.searchParams.has("dataType") ||
      url.searchParams.has("shareIntent") ||
      path.includes("shareIntent");

    if (isShareIntent) {
      return "/(tabs)/new-trip";
    }

    // Our own URL scheme: reelroutes://import?url=<video-url>
    if (url.pathname === "/import" && url.searchParams.has("url")) {
      return `/(tabs)/new-trip?url=${encodeURIComponent(url.searchParams.get("url") ?? "")}`;
    }
  } catch {
    // Not a parseable URL — fall through to default routing
  }

  return path;
}
