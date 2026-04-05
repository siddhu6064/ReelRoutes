import type { Pin } from "./pin.js";

// ── Platform enum ─────────────────────────────────────────────
export const PLATFORMS = [
  "youtube",
  "instagram",
  "tiktok",
  "facebook",
  "twitter",
  "unknown",
] as const;

export type Platform = (typeof PLATFORMS)[number];

// ── Trip ──────────────────────────────────────────────────────
/**
 * Trip — the primary user-facing document.
 * Created from a completed Job; pins are embedded.
 */
export interface Trip {
  id: string;
  /** Null for guest-mode trips (not yet saved to an account) */
  userId: string | null;
  title: string;
  /** The original video / content URL that was imported */
  sourceUrl: string;
  platform: Platform;
  thumbnailUrl?: string;
  /** Video duration in seconds (if available) */
  videoDuration?: number;
  /** The Job that produced this trip — kept for provenance */
  jobId?: string;

  pins: Pin[];

  /** Read-only share token — populated when user shares */
  shareToken?: string;
  /** True once shareToken has been generated */
  isShared: boolean;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateTripInput {
  userId: string | null;
  title: string;
  sourceUrl: string;
  platform: Platform;
  thumbnailUrl?: string;
  videoDuration?: number;
  jobId?: string;
  pins?: Pin[];
}

export interface UpdateTripInput {
  title?: string;
  thumbnailUrl?: string;
}

export interface TripListItem extends Omit<Trip, "pins"> {
  /** Summarised pin count instead of full pin array for list views */
  pinCount: number;
}

export interface TripListResponse {
  items: TripListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}
