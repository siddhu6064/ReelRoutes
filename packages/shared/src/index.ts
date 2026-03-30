// ── Core domain types ─────────────────────────────────────────
export type { User, CreateUserInput, UpdateUserInput } from "./types/user.js";

export type {
  Pin,
  CreatePinInput,
  UpdatePinInput,
  ReorderPinsInput,
} from "./types/pin.js";

export type {
  Trip,
  TripListItem,
  TripListResponse,
  CreateTripInput,
  UpdateTripInput,
} from "./types/trip.js";
export { PLATFORMS } from "./types/trip.js";
export type { Platform } from "./types/trip.js";

export type {
  Job,
  JobStatus,
  JobStep,
  JobErrorCode,
  CreateJobInput,
  JobStatusResponse,
  JobCompletePayload,
} from "./types/job.js";
export { JOB_STATUSES, JOB_STEPS, JOB_STEP_MESSAGES, JOB_ERROR_CODES } from "./types/job.js";

// ── Extraction pipeline contracts ─────────────────────────────
export type {
  ExtractionRequest,
  ExtractionResult,
  ExtractedLocation,
  GeocodedLocation,
  VideoMetadata,
  TranscriptSegment,
  JobPipelineContext,
} from "./types/extraction.js";
export { geocodedLocationToPin } from "./types/extraction.js";

// ── API envelope ──────────────────────────────────────────────
export type {
  ApiSuccess,
  ApiError,
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  HealthResponse,
  ServiceStatus,
} from "./types/api.js";
