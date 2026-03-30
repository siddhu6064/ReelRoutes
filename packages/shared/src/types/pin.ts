/**
 * Pin — a single location stop extracted from (or manually added to) a trip.
 * Pins are embedded inside Trip documents (not a separate collection).
 */
export interface Pin {
  /** Stable client-side ID — UUID generated at extraction time */
  id: string;
  /** Display order within the trip (0-indexed) */
  order: number;

  // ── Place identity ────────────────────────────────────────
  placeName: string;
  /** Google Places placeId — used for rich detail lookups */
  placeId?: string;
  lat: number;
  lng: number;
  address?: string;
  /** Country code, e.g. "US", "JP" */
  countryCode?: string;
  /** City / locality */
  city?: string;

  // ── Extraction provenance ─────────────────────────────────
  /**
   * The verbatim quote from the video transcript that led to
   * this pin being created. Used for AI explainability.
   */
  contextQuote?: string;
  /**
   * Approximate video timestamp (seconds) where this place
   * was mentioned or shown.
   */
  timestampHint?: number;
  /**
   * AI confidence 0–1. Values < 0.5 surface the
   * "Did we miss anything?" suggestion UI.
   */
  confidence: number;
  /** True if the user added this pin manually (not from AI) */
  manuallyAdded: boolean;

  // ── User-editable fields ──────────────────────────────────
  notes?: string;
  /** Free-form tags the user applies, e.g. ["must-visit", "food"] */
  tags: string[];

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreatePinInput {
  placeName: string;
  placeId?: string;
  lat: number;
  lng: number;
  address?: string;
  countryCode?: string;
  city?: string;
  contextQuote?: string;
  timestampHint?: number;
  confidence?: number;
  notes?: string;
  tags?: string[];
}

export interface UpdatePinInput {
  placeName?: string;
  notes?: string;
  tags?: string[];
  order?: number;
}

export interface ReorderPinsInput {
  /** Ordered list of pin IDs reflecting the new desired order */
  pinIds: string[];
}
