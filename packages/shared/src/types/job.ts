import type { Platform } from "./trip.js";
import type { CreatePinInput } from "./pin.js";

// ── Status enum ───────────────────────────────────────────────
export const JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

// ── Progress steps ────────────────────────────────────────────
/**
 * The five visible processing steps shown in the UI progress bar.
 * Each maps to a progress range: 0-20, 20-40, 40-60, 60-80, 80-100.
 */
export const JOB_STEPS = [
  "fetching_video",
  "transcribing",
  "extracting_locations",
  "geocoding",
  "finalizing",
] as const;

export type JobStep = (typeof JOB_STEPS)[number];

export const JOB_STEP_MESSAGES: Record<JobStep, string> = {
  fetching_video: "Fetching video metadata…",
  transcribing: "Transcribing audio…",
  extracting_locations: "Identifying locations with AI…",
  geocoding: "Geocoding place names…",
  finalizing: "Building your trip…",
};

// ── Job document ──────────────────────────────────────────────
export interface Job {
  id: string;
  /** Null for unauthenticated (guest) imports */
  userId: string | null;
  url: string;
  platform: Platform;

  status: JobStatus;
  /** 0–100 integer progress value */
  progress: number;
  currentStep?: JobStep;
  progressMessage?: string;

  /** Raw transcript text — stored for debugging / re-extraction */
  transcript?: string;
  /** Raw location strings before geocoding */
  rawLocations?: string[];

  error?: string;
  errorCode?: JobErrorCode;

  createdAt: string; // ISO 8601
  startedAt?: string; // ISO 8601
  completedAt?: string; // ISO 8601
}

// ── Error codes ───────────────────────────────────────────────
export const JOB_ERROR_CODES = [
  "UNSUPPORTED_PLATFORM",
  "VIDEO_UNAVAILABLE",
  "PRIVATE_VIDEO",
  "TRANSCRIPT_FAILED",
  "NO_LOCATIONS_FOUND",
  "GEOCODING_FAILED",
  "RATE_LIMITED",
  "UNKNOWN_ERROR",
] as const;

export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

// ── API shapes ────────────────────────────────────────────────
export interface CreateJobInput {
  url: string;
  userId?: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  progress: number;
  currentStep?: JobStep;
  progressMessage?: string;
  /** Only present when status === "completed" */
  tripId?: string;
  error?: string;
  errorCode?: JobErrorCode;
}

export interface JobCompletePayload {
  tripId: string;
  pinCount: number;
}
