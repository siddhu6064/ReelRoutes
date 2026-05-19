# Weekly Digest Maintenance Notes (Phase 6)

## Reused existing services/data
The weekly digest is intentionally built from existing backend data/services rather than introducing a separate analytics pipeline:

- Transaction data from the existing expenses collection (`db.expenses`).
- Existing digest summary/breakdown/signals/comparisons/highlights logic in `weekly_digest_service.py`.
- Existing deterministic logic style already used across forecast/insights/subscriptions surfaces.

## Deterministic by design
Weekly digest narrative and recommendations are computed deterministically from already available financial data in the current request flow.

- No external AI/LLM dependencies.
- No non-deterministic generation.
- Same input week/profile produces stable output payload shape.

## Persisted payload reuse
The generated digest payload is persisted in `weekly_digests` and reused by both:

- Weekly digest card flow (`GET /api/weekly-digest` generation + persistence).
- Latest digest banner flow (`GET /api/weekly-digest/latest` reads newest persisted payload).

This keeps banner/card surfaces aligned without introducing a separate notification system or duplicate business logic.

## Why this reduces maintenance cost
- Avoids duplicating spend/savings/category logic across digest, forecast, insights, and subscriptions.
- Keeps one digest payload contract reused by multiple UI surfaces.
- Uses minimal persistence flags (`banner_dismissed_at`) instead of maintaining inbox/history management.

## Explicit non-goals in Phase 6
- No scheduler/cron or background materialization jobs.
- No email/push delivery.
- No notification center/inbox UI.
- No external AI service integration for digest prose.
