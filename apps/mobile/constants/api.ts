/**
 * constants/api.ts
 * Single source of truth for the API base URL across all mobile components.
 * Set EXPO_PUBLIC_API_URL in your EAS environment variables.
 */
export const API_BASE =
  (process.env["EXPO_PUBLIC_API_URL"] as string | undefined) ?? "http://localhost:8000";
