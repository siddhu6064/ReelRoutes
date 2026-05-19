# Mobile Navigation Regression Check (Phase M1)

Scope of this pass:
1) auth guard + session timeout handling after tab/route restructure,
2) deep-link + push-notification route validity after route changes.

## Code paths inspected

- Auth guard + route gating:
  - `frontend/app/_layout.tsx`
  - `frontend/src/contexts/AuthContext.tsx`
  - `frontend/src/services/api.ts`
- Deep-link + notifications:
  - `frontend/app/_layout.tsx`
  - `frontend/src/services/notificationService.ts`
- Current tab route map:
  - `frontend/app/(tabs)/_layout.tsx`

---

## Part A — Auth guard + session timeout findings

### Protected route gating (result: pass)

`app/_layout.tsx` gates all routes under `(tabs)` based on `isAuthenticated`:
- authenticated users outside tabs are redirected into `/(tabs)`,
- unauthenticated users inside tabs are redirected to `/` login route.

Because new routes (`transactions`, `budgets`, `goals`) are inside `(tabs)`, they inherit protection without extra per-route guard logic.

### Session timeout / invalid session (result: regression found + fixed)

Regression risk observed in code:
- `services/api.ts` removed token on 401,
- but auth state could remain authenticated in-memory,
- allowing users to remain in protected tab shell until next manual auth refresh.

Minimal fix applied:
- Added a response interceptor in `AuthContext` that handles 401 by clearing session/guest keys and resetting auth state via store logout path.

This keeps session-timeout behavior safe for the restructured routes.

### Guest mode behavior (result: pass)

Guest mode remains explicitly handled in `checkAuth` and sets authenticated state with local guest data loading; route gating still works because guest users are intentionally marked authenticated.

---

## Part B — Deep-link + push-notification findings

### /(tabs)/add targets (result: pass)

Both deep-link and notification handlers in `app/_layout.tsx` still route to `/(tabs)/add` and this route still exists in tabs layout.

### Notification navigation map (result: pass)

`notificationService.extractNavigationFromNotification` currently returns:
- `/(tabs)/add?...` for quick add,
- `/(tabs)/stats` for weekly summary.

Both destinations are valid after route restructure.

### Transactions/home assumptions (result: pass)

No stale references to `/(tabs)/index` as transactions route were found in deep-link/notification handlers.
Current routing assumptions are consistent with:
- `index` = dashboard shell,
- `transactions` = standalone transactions route.

---

## Enumerated protected tab routes (current)

Within `(tabs)` shell:
- `index` (Dashboard)
- `transactions`
- `stats`
- `budgets`
- `goals`
- `more`
- `accounts` (hidden from tab bar, routable)
- `add` (hidden from tab bar, routable)

All are covered by the same auth guard in root layout.

---

## Follow-up runtime verification checklist (device)

- [ ] While unauthenticated, direct navigation to any `/(tabs)/...` route redirects to `/`.
- [ ] After successful auth, app lands in tab shell and routes are accessible.
- [ ] After forced token invalidation (or simulated 401), user is returned to unauthenticated flow.
- [ ] Guest mode still enters protected shell and can navigate tabs.
- [ ] Quick-add notification/deeplink continues routing to `/(tabs)/add`.
- [ ] Weekly summary notification route still opens `/(tabs)/stats`.

