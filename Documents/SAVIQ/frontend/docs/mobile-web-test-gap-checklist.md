# Mobile + Web Test Coverage Reality Check (Repo-Grounded)

Date: 2026-04-22

## Bottom-line answer
- **Do we have all mobile test cases?** **No.** Mobile currently has strong helper/state unit coverage, but lacks meaningful automated component/integration/e2e coverage for core user flows in `frontend/app/*`.
- **Do we have all web test cases?** **No.** Web has strong helper/state coverage and substantial Playwright e2e coverage, but still has clear gaps in route-level/component-level coverage for some surfaces (notably goals and some settings/auth permutations).
- **Highest-priority missing tests before broader rollout:** mobile screen-level integration (transactions/budgets/goals/dashboard + auth/profile/lifecycle), mobile deep-link/notification/restart automation where feasible, and web route-level coverage for under-tested surfaces (especially goals/auth permutations).

---

## Scope + method used
This audit used the actual SAVIQ structure:
- Backend: `backend/`
- Mobile: `frontend/`
- Web: `web/`
- Cross-app tests: `tests/`

Patterns searched:
- `*.test.*`
- `*.spec.*`
- Playwright config/spec usage
- test-framework markers in repo scripts and test files

---

## 1) Inventory of existing tests (by platform + level)

## Mobile (`frontend/`)

### Helper/unit tests (present)
All visible mobile automated tests are utility/state-level tests under `frontend/src/utils/*.test.mjs`:
- AI chat state/persistence sanitization: `aiChatSessionState.test.mjs`
- Dashboard intelligence state mapping: `aiIntelligenceState.test.mjs`
- Analytics screen state sanitization: `analyticsScreenState.test.mjs`
- Budget form + screen state helpers: `budgetFormState.test.mjs`, `budgetsScreenState.test.mjs`
- Goals form/projection/milestones/screen state: `goalsFormState.test.mjs`, `goalsProjectionState.test.mjs`, `goalsMilestones.test.mjs`, `goalsScreenState.test.mjs`
- Smart metrics cards + section state: `smartMetricsCards.test.mjs`, `smartMetricsSectionState.test.mjs`
- Transaction create/edit/filter/retry state helpers: `transactionFlowState.test.mjs`, `transactionRetryState.test.mjs`

### Component tests (missing)
- No React Native component test suite found (no RTL/Jest screen/component test files in `frontend/`).

### Integration tests (missing)
- No mobile integration harness found that mounts `frontend/app/(tabs)` screens and asserts end-to-end screen behavior.

### E2E tests (missing)
- No mobile Detox/Appium/Maestro-style e2e suite found.

### Manual/device-only evidence (present)
Mobile docs explicitly call out runtime/device-only checks remaining for:
- deep links + notifications,
- restart/restore and lifecycle behavior,
- real-device visual/performance/theme verification.

## Web (`web/` + `tests/e2e`)

### Helper/unit tests (present)
Web helper/state/presentation tests exist under `web/src/lib/*.test.mjs`, including:
- AI chat state (`aiInsightsChatState.test.mjs`)
- Forecast state/presentation
- Goals validation/presentation/feedback
- Smart metrics section/presentation/dashboard state
- Weekly digest banner/card/presentation/dashboard state + banner analytics
- Subscriptions presentation/card state

### Component tests (limited/missing explicit suite)
- No dedicated React Testing Library/Vitest/Jest component test suite found for `web/src/components/*` or `web/src/pages/*`.

### Integration/E2E tests (present)
- Playwright is configured (`playwright.config.ts`) and a large e2e suite exists at `tests/e2e/smoke.spec.ts`.
- Despite filename `smoke`, it contains extensive dashboard/transactions/analytics/budgets/subscriptions/weekly-digest/smart-metrics/AI-chat scenarios and profile-switch stability checks.

### Manual-only areas
- Fewer explicit manual-only constraints than mobile, but browser/device matrix breadth is still outside the single Playwright project (`chromium`) currently configured.

## Backend tests (only parity-relevant mention)
Parity-adjacent backend tests exist in `tests/backend/` for AI insights/chat, dashboard metrics, weekly digest, subscriptions summary, savings goals, and forecast APIs/services. These support API confidence but **do not replace mobile/web UI coverage**.

---

## 2) Coverage by feature area (helper vs UI vs integration/e2e vs manual)

| Feature area | Mobile status | Web status | Evidence-backed read |
|---|---|---|---|
| Auth / guest mode | **Helper-only / no UI tests** | **E2E present** | Web e2e includes register/login/navigation sanity; mobile has no auth screen-level automation. |
| Dashboard | **Helper-only** | **Strong helper + strong e2e** | Mobile has `dashboardScreenState`/`aiIntelligenceState` helpers; web has many dashboard card/state e2e scenarios. |
| Transactions | **Helper-only** | **Strong e2e** | Mobile covers flow/retry helpers only; web e2e covers create/edit/delete/filter and empty-state behavior. |
| Budgets | **Helper-only** | **Helper + e2e happy path** | Mobile has budget helpers only; web e2e includes budget create/progress flow plus helper coverage. |
| Goals | **Helper-only** | **Helper-heavy, weak route-level e2e** | Mobile has form/projection/screen-state helpers; web has goals lib tests but no obvious direct goals route e2e in current suite. |
| Smart metrics | **Helper-only** | **Strong helper + strong e2e** | Mobile card/section helper coverage only; web has dense helper + e2e behavior matrix. |
| Analytics | **Helper-only** | **E2E present** | Mobile analytics helper tests only; web e2e validates analytics success + failure states. |
| Weekly digest | **Helper mapping via intelligence helpers** | **Strong helper + e2e** | Mobile covered via intelligence state tests; web has dedicated weekly digest lib + e2e coverage. |
| Subscriptions | **Helper mapping via intelligence helpers** | **Strong helper + e2e** | Mobile helper-level only; web has lib + dashboard e2e scenarios. |
| AI chat | **Helper-only** | **Helper + e2e modal flows** | Mobile tests persistence/sanitize helpers; web tests reducer/session helpers and modal e2e submit/fail/retry behavior. |
| Notifications / deep links | **Manual/device-only called out in docs** | N/A | Mobile docs explicitly mark notification/deep-link/runtime lifecycle checks as device-dependent. |
| Profile switching | **Helper-only guards** | **Strong e2e for dashboard widgets** | Mobile has stale/request guard helpers; web e2e includes many profile switch determinism checks. |
| Restart / persistence behavior | **Helper-only + manual runtime docs** | **Some helper/e2e for chat state reset** | Mobile restart semantics documented and helper-tested but not device-automated end-to-end. |
| Dark mode/theme runtime | **Docs + runtime code; no visual automation found** | **Theme provider exists; no visual regression suite found** | Neither platform shows screenshot/snapshot visual test automation in repo. |

---

## 3) Precise missing-test checklist (source of truth)

Legend:
- Existing coverage explicitly separates helper/unit from UI/integration/e2e.
- Priority: blocker / high / medium / low.

| Surface / feature | Platform | Existing coverage | Missing coverage | Recommended level | Priority |
|---|---|---|---|---|---|
| Auth bootstrap + guest/sign-in route guards | Mobile | Minimal helper/state only | Real screen-level auth/guest flows and redirect guards | Integration + E2E | **blocker** |
| Transactions CRUD modal + list refresh behavior | Mobile | Helper flow/retry tests | Real screen interaction tests (create/edit/delete/filter/empty/error) | Integration + E2E | **blocker** |
| Budgets create/edit/total/category UX | Mobile | Form + screen-state helpers | Component/screen tests for modal wiring, save failure, reload state | Integration | **high** |
| Goals create/edit/progress/deadline UX | Mobile | Form/projection/screen-state helpers | Screen behavior tests for form + list + status transitions | Integration | **high** |
| Dashboard widget coexistence + profile-switch UX | Mobile | Helper guards/intelligence mapping | Screen-level dashboard multi-widget behavior + profile switch stability | Integration | **high** |
| AI chat modal full UX + persistence at app level | Mobile | Helper sanitization/state transitions | UI test for open/send/fail/retry/close/reopen + persisted restore | Integration + device/manual gate | **high** |
| Deep-link + notification routing (cold/warm/app-opened-by-notification) | Mobile | Documented manual checks | Executable automation where possible + mandatory device checklist for the rest | E2E + manual/device-only | **high** |
| Restart/restore (process kill) across profile contexts | Mobile | Helper persistence sanitation + docs | True kill/reopen runtime validation automation (or strict release gate manual) | Device automation/manual | **high** |
| Theme/dark-mode visual contrast regressions | Mobile | Theme runtime code + manual docs | Snapshot/visual checks across key screens/cards | Component visual + manual device | medium |
| Goals route behavioral confidence | Web | Goals lib helper tests | Route-level goals page journeys (CRUD, validation + backend error handling) | E2E | **high** |
| Auth edge permutations (session expiry, redirect race, logout/login bounce) | Web | Basic login/register sanity e2e | Broader auth lifecycle matrix | E2E | medium |
| Settings route depth (beyond delete-account failure) | Web | Some settings e2e paths | More settings interaction/error-path coverage | E2E | medium |
| Component-level rendering contracts for pages/components | Web | Rich lib tests + e2e; no explicit component suite | Optional targeted component tests to shorten feedback loop | Component | low |
| Cross-browser matrix confidence | Web | Chromium-only Playwright project | Firefox/WebKit coverage for critical journeys | E2E | medium |

---

## 4) Implemented surfaces vs current automated coverage

### Mobile implemented surfaces reviewed
- `frontend/app/(tabs)`: dashboard (`index.tsx`), transactions, stats, budgets, goals, more, add, accounts, tab layout.
- `frontend/app/_layout.tsx`: auth gating, deep-link handling, notification response routing, pending deep-link behavior.
- `frontend/src/contexts/ThemeContext.tsx`: runtime theme token provider.

Coverage reality:
- Automated tests target `frontend/src/utils/*` helper logic.
- No comparable automation found that mounts these actual route screens/components.
- Therefore parity confidence remains helper-centric, not full UX-centric.

### Web implemented surfaces reviewed
- `web/src/App.jsx` routes: `/`, `/transactions`, `/analytics`, `/settings`, `/budgets`, `/goals`, `/export`, `/login`.
- `web/src/pages/*` and dashboard components.

Coverage reality:
- Helper/state coverage in `web/src/lib/*.test.mjs` is strong.
- Integration/e2e via Playwright is extensive, especially dashboard + smart metrics + subscriptions + weekly digest + AI chat modal + key transactions flows.
- Remaining gap is uneven route-depth (not all pages/edge permutations covered equally).

---

## Final rollout guidance
- **Mobile is not fully covered** for broader rollout until screen-level integration plus lifecycle/device-critical validations are automated or elevated to strict manual gates.
- **Web is closer but not complete**: dashboard-heavy and transaction flows are strong; goals/auth/settings edge depth and browser-matrix breadth remain the highest-value additions.
