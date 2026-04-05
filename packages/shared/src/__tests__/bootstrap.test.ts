/**
 * Bootstrap Validation Test — Phase 1, Week 1
 *
 * This file exists to prove three things before any real code is written:
 *   1. The shared package types compile without errors
 *   2. All exported contracts are importable and structurally correct
 *   3. The Vitest test runner executes successfully in this monorepo setup
 *
 * If this file fails, the build is broken at the foundation.
 * Fix it before writing any application code.
 */

import { describe, it, expect } from "vitest";

import {
  PLATFORMS,
  JOB_STATUSES,
  JOB_STEPS,
  JOB_STEP_MESSAGES,
  JOB_ERROR_CODES,
  geocodedLocationToPin,
  type User,
  type Pin,
  type Trip,
  type Job,
  type Platform,
  type JobStatus,
  type CreateUserInput,
  type CreatePinInput,
  type CreateTripInput,
  type CreateJobInput,
  type ExtractionRequest,
  type ExtractionResult,
  type GeocodedLocation,
  type JobPipelineContext,
  type ApiResponse,
  type HealthResponse,
} from "../index.js";

// ── Helpers ────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_001",
    clerkId: "clerk_abc123",
    email: "tester@reelroutes.io",
    name: "Test User",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePin(overrides: Partial<Pin> = {}): Pin {
  return {
    id: "pin_001",
    order: 0,
    placeName: "Shibuya Crossing",
    lat: 35.6595,
    lng: 139.7004,
    confidence: 0.95,
    manuallyAdded: false,
    tags: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_001",
    userId: "user_001",
    title: "Tokyo Travel Guide",
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
    platform: "youtube",
    pins: [makePin()],
    isShared: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_001",
    userId: "user_001",
    url: "https://www.youtube.com/watch?v=abc123",
    platform: "youtube",
    status: "queued",
    progress: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("@reelroutes/shared — Bootstrap Validation", () => {
  // ── Enum/const exports ──────────────────────────────────────

  describe("PLATFORMS constant", () => {
    it("exports an array of supported platform strings", () => {
      expect(PLATFORMS).toBeInstanceOf(Array);
      expect(PLATFORMS.length).toBeGreaterThan(0);
    });

    it("includes all expected platforms", () => {
      const expected = ["youtube", "instagram", "tiktok", "facebook", "twitter", "unknown"];
      expected.forEach((p) => {
        expect(PLATFORMS).toContain(p);
      });
    });
  });

  describe("JOB_STATUSES constant", () => {
    it("exports all four job lifecycle statuses", () => {
      expect(JOB_STATUSES).toContain("queued");
      expect(JOB_STATUSES).toContain("processing");
      expect(JOB_STATUSES).toContain("completed");
      expect(JOB_STATUSES).toContain("failed");
      expect(JOB_STATUSES).toHaveLength(4);
    });
  });

  describe("JOB_STEPS constant", () => {
    it("exports exactly 5 processing steps", () => {
      expect(JOB_STEPS).toHaveLength(5);
    });

    it("has a progress message for every step", () => {
      JOB_STEPS.forEach((step) => {
        expect(JOB_STEP_MESSAGES[step]).toBeDefined();
        expect(typeof JOB_STEP_MESSAGES[step]).toBe("string");
        expect(JOB_STEP_MESSAGES[step].length).toBeGreaterThan(0);
      });
    });
  });

  describe("JOB_ERROR_CODES constant", () => {
    it("includes UNKNOWN_ERROR as a fallback code", () => {
      expect(JOB_ERROR_CODES).toContain("UNKNOWN_ERROR");
    });

    it("covers common failure modes", () => {
      expect(JOB_ERROR_CODES).toContain("VIDEO_UNAVAILABLE");
      expect(JOB_ERROR_CODES).toContain("TRANSCRIPT_FAILED");
      expect(JOB_ERROR_CODES).toContain("NO_LOCATIONS_FOUND");
    });
  });

  // ── Type shape validation (runtime) ────────────────────────

  describe("User shape", () => {
    it("constructs a valid User object with required fields", () => {
      const user = makeUser();
      expect(user.id).toBe("user_001");
      expect(user.clerkId).toBe("clerk_abc123");
      expect(user.email).toMatch(/@/);
      expect(user.name).toBeDefined();
      expect(user.createdAt).toMatch(/^\d{4}-/);
    });

    it("accepts optional OAuth fields", () => {
      const user = makeUser({ googleId: "g_123", appleId: "a_456" });
      expect(user.googleId).toBe("g_123");
      expect(user.appleId).toBe("a_456");
    });

    it("accepts null for userId on guest trips", () => {
      const trip = makeTrip({ userId: null });
      expect(trip.userId).toBeNull();
    });
  });

  describe("Pin shape", () => {
    it("constructs a valid Pin with required fields", () => {
      const pin = makePin();
      expect(typeof pin.lat).toBe("number");
      expect(typeof pin.lng).toBe("number");
      expect(pin.confidence).toBeGreaterThanOrEqual(0);
      expect(pin.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(pin.tags)).toBe(true);
    });

    it("defaults manuallyAdded to false for AI pins", () => {
      const pin = makePin();
      expect(pin.manuallyAdded).toBe(false);
    });

    it("supports manually added pins", () => {
      const pin = makePin({ manuallyAdded: true, contextQuote: undefined });
      expect(pin.manuallyAdded).toBe(true);
    });

    it("confidence of 0.4 indicates low-confidence (triggers suggestion UI)", () => {
      const pin = makePin({ confidence: 0.4 });
      expect(pin.confidence).toBeLessThan(0.5);
    });
  });

  describe("Trip shape", () => {
    it("constructs a valid Trip with embedded pins array", () => {
      const trip = makeTrip();
      expect(Array.isArray(trip.pins)).toBe(true);
      expect(trip.pins[0]?.placeName).toBe("Shibuya Crossing");
    });

    it("isShared defaults to false", () => {
      const trip = makeTrip();
      expect(trip.isShared).toBe(false);
    });

    it("platform must be a valid PLATFORMS value", () => {
      const trip = makeTrip();
      expect(PLATFORMS).toContain(trip.platform);
    });
  });

  describe("Job shape", () => {
    it("constructs a valid Job", () => {
      const job = makeJob();
      expect(JOB_STATUSES).toContain(job.status);
      expect(job.progress).toBeGreaterThanOrEqual(0);
      expect(job.progress).toBeLessThanOrEqual(100);
    });

    it("accepts null userId for guest imports", () => {
      const job = makeJob({ userId: null });
      expect(job.userId).toBeNull();
    });

    it("tracks the full job lifecycle", () => {
      const queued = makeJob({ status: "queued", progress: 0 });
      const processing = makeJob({ status: "processing", progress: 40 });
      const completed = makeJob({
        status: "completed",
        progress: 100,
        completedAt: "2025-01-01T00:01:00.000Z",
      });
      const failed = makeJob({
        status: "failed",
        error: "Transcript failed",
        errorCode: "TRANSCRIPT_FAILED",
      });

      expect(queued.status).toBe("queued");
      expect(processing.progress).toBe(40);
      expect(completed.completedAt).toBeDefined();
      expect(failed.errorCode).toBe("TRANSCRIPT_FAILED");
    });
  });

  // ── geocodedLocationToPin helper ─────────────────────────────

  describe("geocodedLocationToPin()", () => {
    it("maps a GeocodedLocation to a valid CreatePinInput", () => {
      const loc: GeocodedLocation = {
        rawName: "Shibuya",
        contextQuote: "We went to Shibuya crossing",
        timestampHint: 42,
        confidence: 0.97,
        order: 0,
        placeName: "Shibuya Crossing",
        placeId: "ChIJ123",
        lat: 35.6595,
        lng: 139.7004,
        address: "Shibuya, Tokyo, Japan",
        countryCode: "JP",
        city: "Tokyo",
        geocoded: true,
      };

      const pin = geocodedLocationToPin(loc);

      expect(pin.placeName).toBe("Shibuya Crossing");
      expect(pin.placeId).toBe("ChIJ123");
      expect(pin.lat).toBe(35.6595);
      expect(pin.lng).toBe(139.7004);
      expect(pin.contextQuote).toBe("We went to Shibuya crossing");
      expect(pin.confidence).toBe(0.97);
      expect(Array.isArray(pin.tags)).toBe(true);
    });
  });

  // ── API response envelope ────────────────────────────────────

  describe("ApiResponse envelope", () => {
    it("success response has ok: true and data", () => {
      const res: ApiResponse<User> = {
        ok: true,
        data: makeUser(),
      };
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.email).toMatch(/@/);
      }
    });

    it("error response has ok: false and error object", () => {
      const res: ApiResponse<User> = {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "User not found",
          requestId: "req_xyz",
        },
      };
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("NOT_FOUND");
      }
    });
  });

  // ── Package smoke test ───────────────────────────────────────

  describe("Package integrity", () => {
    it("all named exports are defined (not undefined)", () => {
      // This catches broken re-exports in index.ts
      const exports = {
        PLATFORMS,
        JOB_STATUSES,
        JOB_STEPS,
        JOB_STEP_MESSAGES,
        JOB_ERROR_CODES,
        geocodedLocationToPin,
      };
      Object.entries(exports).forEach(([name, value]) => {
        expect(value, `${name} should not be undefined`).toBeDefined();
      });
    });
  });
});
