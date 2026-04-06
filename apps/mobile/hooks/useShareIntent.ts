/**
 * hooks/useShareIntent.ts
 *
 * Centralised share intent hook — wraps expo-share-intent's
 * useShareIntentContext() with:
 *  - URL extraction from any share format (web URL, plain text with URL, etc.)
 *  - Platform detection (YouTube / Instagram / TikTok / Facebook / X)
 *  - Source app name for the "Shared from Instagram" banner
 *  - Clean reset after import starts
 *
 * Usage in any screen:
 *   const { incomingUrl, sourceName, clearIntent } = useShareIntent();
 */
import { useShareIntentContext } from "expo-share-intent";

export const SUPPORTED_PLATFORMS = [
  { label: "YouTube", pattern: /youtube\.com|youtu\.be/i },
  { label: "Instagram", pattern: /instagram\.com/i },
  { label: "TikTok", pattern: /tiktok\.com/i },
  { label: "Facebook", pattern: /facebook\.com|fb\.watch/i },
  { label: "X", pattern: /twitter\.com|x\.com/i },
] as const;

export type PlatformLabel = (typeof SUPPORTED_PLATFORMS)[number]["label"];

export function detectPlatform(url: string): PlatformLabel | null {
  return SUPPORTED_PLATFORMS.find((p) => p.pattern.test(url))?.label ?? null;
}

/** Extract the first https URL from a string (handles plain-text shares). */
function extractUrl(raw: string): string | null {
  const match = raw.match(/https?:\/\/[^\s"'<>]+/);
  return match ? match[0].trim() : null;
}

interface ShareIntentResult {
  /** The clean URL extracted from the share, or null if nothing shared. */
  incomingUrl: string | null;
  /** Human-readable source app name, e.g. "Instagram" or "YouTube". */
  sourceName: string | null;
  /** Detected platform for the incoming URL. */
  platform: PlatformLabel | null;
  /** Whether a share intent is waiting to be handled. */
  hasIntent: boolean;
  /** Call this after you've started processing to dismiss the intent. */
  clearIntent: () => void;
}

export function useShareIntent(): ShareIntentResult {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  if (!hasShareIntent || !shareIntent) {
    return {
      incomingUrl: null,
      sourceName: null,
      platform: null,
      hasIntent: false,
      clearIntent: resetShareIntent,
    };
  }

  // expo-share-intent surfaces the URL in webUrl for URL-type shares,
  // and in text for plain-text shares (some apps share as text).
  const raw = shareIntent.webUrl ?? shareIntent.text ?? "";
  const incomingUrl = extractUrl(raw);
  const platform = incomingUrl ? detectPlatform(incomingUrl) : null;

  // Build a friendly source name from the meta title or fall back to
  // the detected platform name.
  const sourceName =
    (shareIntent.meta as { title?: string } | undefined)?.title ?? platform ?? "another app";

  return {
    incomingUrl,
    sourceName,
    platform,
    hasIntent: true,
    clearIntent: resetShareIntent,
  };
}
