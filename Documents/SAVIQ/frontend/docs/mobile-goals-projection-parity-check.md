# Mobile Goals Projection Parity Check (Phase M3)

Date: 2026-04-21  
Scope: projection text behavior and fallbacks used in mobile Goals card experience.

## Sources inspected

- Web projection logic: `web/src/lib/goalsPresentation.js` (`getProjectedCompletionText`).
- Mobile projection logic: `frontend/src/utils/goalsProjectionState.js` (`getProjectedCompletionSummary`, `getGoalDeadlineStatus`).

## Parity conclusions

### Projection formula parity (aligned)

Mobile now matches web projection formula intent for the core projected-completion string:

1. if no `projected_completion` -> `Projection unavailable`
2. if `basis === already_completed` -> `Projected completion: Completed`
3. if `projected_completion_date` exists (or mobile-compatible `projected_date`) -> `Projected completion: <date>`
4. else if `months_remaining` number -> `Projected completion: ~X.X months`
5. else fallback -> `Projection unavailable`

This behavior is implemented in `getProjectedCompletionSummary(...)`.

### Completed goal behavior (aligned)

- Completed goals still resolve to completed projection copy through `basis: already_completed`.
- Mobile keeps additional UI safety for status-based completion in separate card rendering logic.

### Missing/unknown projection behavior (aligned)

- Mobile uses the same `Projection unavailable` fallback semantics.

### Deadline-related messaging (intentional mobile-safe additive)

- Web projection helper does not include explicit deadline warning text.
- Mobile adds a separate non-formula helper (`getGoalDeadlineStatus`) that can show `Past deadline` for active unfinished goals.
- This is additive and does not alter the projection formula output itself.

## Validation notes

- Added utility tests for projection parity and deadline helper:
  - `frontend/src/utils/goalsProjectionState.test.mjs`
- Tests cover projected date, completed, missing fallback, months fallback, and past-deadline status helper.
