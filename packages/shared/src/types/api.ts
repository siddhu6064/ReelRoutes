/**
 * Standard JSON envelope for all ReelRoutes API responses.
 * Success and error responses use consistent shapes.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Field-level validation errors — present on 422 responses */
    fields?: Record<string, string[]>;
    /** Internal request ID for log tracing */
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Standard paginated list response.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

/**
 * Common query params for paginated list endpoints.
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Health check response shape — matches GET /health.
 */
export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  version: string;
  environment: string;
  services: {
    mongodb: ServiceStatus;
    redis: ServiceStatus;
  };
  timestamp: string;
}

export interface ServiceStatus {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}
