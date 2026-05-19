# Mobile Offline Transaction Retry Check (Phase M2 Week 4)

Date: 2026-04-20  
Scope: `app/(tabs)/add.tsx` create/edit transaction save flow and store expense request path.

## Reviewed code paths

- Add/Edit screen submit flow in `frontend/app/(tabs)/add.tsx` (`handleSave`).
- Expense create/edit request path in `frontend/src/store/appStore.ts` (`createExpense`, `updateExpense`).

## Current behavior findings (before fix)

### Offline create/edit and transient server failure

- Save failures bubbled from store to screen (`throw error` in `createExpense`/`updateExpense`).
- Add screen showed a generic message (`Failed to save transaction`) for all failures.
- No explicit retry CTA from the failure dialog.

### Form state and navigation behavior

- On failure, `router.back()` was not called because navigation only happened after successful save.
- Form values remained in component state because failure path did not reset inputs.

### Duplicate submit safety

- Header save button was disabled while `isLoading` was true.
- `handleSave` did not have an early return guard for re-entrant calls; adding one makes the guard explicit and safer.

## Gap assessment

There was a checklist gap: failure handling lacked actionable retry guidance and status-aware messaging, and duplicate-submit prevention relied only on UI disable state.

## Targeted fix applied

- Added explicit submit guard (`if (isLoading) return`) and shared `canSubmitTransaction(...)` validation.
- Added retry-aware error handling:
  - retry button for offline/no-response and retryable server failures (`429`, `5xx`),
  - status-aware copy for `400/401/403/404/5xx`,
  - keep user on form with entered values intact.
- No architectural sync queue was introduced (intentionally out of scope).

## Resulting behavior

- Offline create/edit: user sees actionable error copy and can tap **Retry** without losing form data.
- Transient server failure: user sees retry path for retryable failures.
- Non-retryable failures: user sees clear message and remains on form.
- Duplicate submits: guarded by both disabled save button and function-level guard.

## Validation note

Added focused utility tests for retry behavior:

- `frontend/src/utils/transactionRetryState.test.mjs`
  - submit guard behavior,
  - retryable error classification,
  - status-based error messaging.
