import type { Platform } from "./trip.js";
import type { CreatePinInput } from "./pin.js";

/**
 * ExtractionRequest — sent from the job worker to the AI extraction service.
 */
export interface ExtractionRequest {
  jobId: string;
  url: string;
  platform: Platform;
  transcript: string;
  /** Full transcript split into timed segments (from Whisper or YouTube CC) */
  segments?: TranscriptSegment[];
}

export interface TranscriptSegment {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  text: string;
}

/**
 * ExtractionResult — returned by the AI location extractor.
 * Maps directly to pins that will be saved on the Trip document.
 */
export interface ExtractionResult {
  locations: ExtractedLocation[];
  /** Model used for extraction, for debugging */
  model: string;
  /** Total tokens consumed */
  tokensUsed: number;
  /** ISO timestamp of when extraction ran */
  extractedAt: string;
}

export interface ExtractedLocation {
  /**
   * The raw place name as the AI understood it from the transcript.
   * May differ from the canonical Google Places name.
   */
  rawName: string;
  /** Direct quote from the transcript that surfaced this location */
  contextQuote: string;
  /** Approximate video timestamp in seconds */
  timestampHint?: number;
  /** Confidence 0–1 — drives the "Did we miss anything?" feature */
  confidence: number;
  /** Approximate order of appearance in the video */
  order: number;
}

/**
 * GeocodingResult — output of the geocoding step.
 * Each ExtractedLocation is matched to a GeocodedLocation.
 */
export interface GeocodedLocation extends ExtractedLocation {
  /** The canonical name from Google Places */
  placeName: string;
  placeId: string;
  lat: number;
  lng: number;
  address: string;
  countryCode: string;
  city?: string;
  /** True if geocoding found a confident match */
  geocoded: boolean;
}

/**
 * Converts a GeocodedLocation into a CreatePinInput for trip creation.
 */
export function geocodedLocationToPin(loc: GeocodedLocation): CreatePinInput {
  return {
    placeName: loc.placeName,
    placeId: loc.placeId,
    lat: loc.lat,
    lng: loc.lng,
    address: loc.address,
    countryCode: loc.countryCode,
    // exactOptionalPropertyTypes: omit optional props when undefined
    ...(loc.city !== undefined && { city: loc.city }),
    ...(loc.contextQuote !== undefined && { contextQuote: loc.contextQuote }),
    ...(loc.timestampHint !== undefined && { timestampHint: loc.timestampHint }),
    ...(loc.confidence !== undefined && { confidence: loc.confidence }),
    tags: [],
  };
}

/**
 * VideoMetadata — fetched before transcription.
 */
export interface VideoMetadata {
  url: string;
  platform: Platform;
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  durationSeconds: number;
  channelName?: string;
  publishedAt?: string;
  /** True if closed captions / subtitles are available (skip Whisper) */
  hasCaptions: boolean;
}

/**
 * The full pipeline payload passed through the job worker.
 * Each step enriches this object before passing it to the next.
 */
export interface JobPipelineContext {
  jobId: string;
  url: string;
  platform: Platform;
  userId: string | null;
  metadata?: VideoMetadata;
  transcript?: string;
  segments?: TranscriptSegment[];
  extractionResult?: ExtractionResult;
  geocodedLocations?: GeocodedLocation[];
}
