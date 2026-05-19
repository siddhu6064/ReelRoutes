# Mobile Parity Phase M1 — Baseline Audit and Execution Checklist

Date: 2026-05-08  
Scope: Audit/planning only (no feature implementation)

## 1) Mobile architecture audit

### App type and routing model
- **Type:** Hybrid, but primarily **Expo Router** file-based routing with a tab shell.
- Entry/root composition:
  - `app/_layout.tsx` wraps app with `SafeAreaProvider`, `ThemeProvider`, `AuthProvider`, and auth/deep-link/notification routing guards.
  - Auth-route gating is done via `deriveAuthRouteAction(...)` and router redirects to either `/` (auth) or `/(tabs)` (app).
- Tab navigator:
  - `app/(tabs)/_layout.tsx` defines tabs: `index`, `transactions`, `stats`, `budgets`, `goals`, `more`.
  - Hidden routes inside tabs group: `add`, `accounts` (navigated programmatically).

### Navigation tree (current)
- `/` → `app/index.tsx` (login/auth entry)
- `/(tabs)` → `app/(tabs)/index.tsx` (dashboard/home)
- `/(tabs)/transactions` → transactions screen
- `/(tabs)/stats` → analytics screen
- `/(tabs)/budgets` → budgets screen
- `/(tabs)/goals` → goals screen
- `/(tabs)/more` → settings/more actions
- hidden programmatic:
  - `/(tabs)/add` → add transaction flow
  - `/(tabs)/accounts` → account/payment methods view

### Auth flow
- `AuthContext` is the orchestrator for:
  - session restore (`session_token`) and current-user fetch (`/auth/me`)
  - Google/Apple sign-in handlers
  - guest mode bootstrap + guest local data seeds
  - global 401 interceptor fallback to logout/session-clear
- `app/_layout.tsx` also handles:
  - OAuth callback handling on web
  - deep links and notification tap routing
  - delayed deep-link replay after auth.

### Shared state architecture
- Global state via **Zustand**: `src/store/appStore.ts`
- `AuthContext` coordinates auth/session + store hydration.
- Store responsibility split:
  - profile state (`profiles`, `activeProfile`, `fetchProfiles`, `setActiveProfile`)
  - domain data (`categories`, `paymentMethods`, `expenses`, `summary`)
  - AI chat per-profile session state
  - guest-mode dual data path via `guestStorage`.

### API/service architecture
- Axios singleton in `src/services/api.ts`.
- Request auth token injection via SecureStore/AsyncStorage abstraction.
- 401 interceptor removes token.
- Feature endpoints currently wired in mobile service layer:
  - budgets, settings, export, AI chat (and core routes via direct `api.get/post` calls in store/screens).
- Notification/deep-link helper services and route-state helper utilities exist.

### Reusable UI/system components
- Base UI: `NeumorphicUI` cards/buttons/theming.
- Reusable domain widgets exist for dashboard intelligence:
  - smart metrics cards
  - smart insights widget
  - forecast widget
  - weekly digest widget
  - subscription detection widget
  - AI insights chat modal
- Profile switch integration exists via `ProfileToggle` (profile_type-aware icons already in place).

### Existing profile-switch integration
- `activeProfile` controls profile-scoped fetches across dashboard + transactions/budgets/goals flows.
- Dashboard fetch orchestration guards stale responses and resets some intelligence payloads on profile change.
- Guest + authenticated profile collections both supported.

---

## 2) Web vs mobile parity matrix

Legend:
- **F** = Fully implemented on mobile
- **P** = Partially implemented
- **M** = Missing on mobile
- **BR** = Backend-ready but no mobile UI
- **WO** = Web-only implementation

| Feature Area | Web Status | Mobile Status | Classification | Notes / Gaps |
|---|---|---|---|---|
| Auth/session handling | Complete email/OAuth/session | Google/Apple/session restore/401 handling present | F | Mobile auth + guest mode are implemented; keep parity checks around callback and token expiry edge cases. |
| Profile switching | Implemented | Implemented with `activeProfile` + toggle | F | profile_type-aware icon mapping already active. |
| Dashboard core cards (net/income/spend/MoM/top goal) | Complete | Implemented in dashboard screen + cards | F | Verify visual parity details only (not architecture). |
| Smart metrics section | Complete | Implemented (`/dashboard/metrics` mapping) | F | Loading/error states exist; continue parity QA for data formatting parity. |
| Smart insights | Complete | Implemented (`/insights/overview` widget) | F | Needs parity validation for edge-state copy and ordering only. |
| Forecast widget | Complete | Implemented (`/forecast`) | F | Check payload edge handling parity with web. |
| Weekly digest | Complete | Implemented (`/weekly-digest/latest`) | F | Dismiss/interaction parity should be validated in M2. |
| Subscriptions detection | Complete | Implemented (`/subscriptions/summary`) | F | State handling exists; ensure copy + thresholds parity. |
| Savings goals | Complete CRUD | Implemented route + logic + projection helpers | F | Verify all modal/form parity scenarios. |
| Transactions list/create/edit/delete | Complete | Implemented with retry helpers and add route | F | Validate advanced filters/search parity depth vs web. |
| Analytics | Complete | Implemented stats tab + state sanitizer helpers | P | Verify full chart/segment parity with web endpoints and controls. |
| Budgets | Complete | Implemented budgets tab + progress calls | F | Period/category interactions need parity check. |
| Exports (CSV/PDF/JSON UX) | Implemented UI and download flows | API helpers exist | BR | Mobile export UI/download/share UX likely incomplete vs web. |
| AI chat insights | Complete | Implemented modal + per-profile sessions | F | Check exact prompt suggestions + retry UX parity. |
| Settings/account flows | Complete settings page | More tab exists; account/settings surface present | P | Need explicit parity check for all settings subsections and destructive flows. |
| Onboarding | Basic login/entry | Login + guest path | P | If web has additional onboarding hints, mobile parity unclear. |
| Notifications/reminders | Partial web support | Notification routing service + deep links present | P | Scheduling/preference UI parity may be incomplete. |
| Loading/error/empty states | Complete | Broad helper-state coverage in utils tests | F | High coverage for deterministic UI-state helpers. |
| Environment/config handling | Web env template exists | EXPO_PUBLIC backend + oauth vars in use | P | Mobile env template/documented setup can be tightened for operator clarity. |
| Test coverage (integration/e2e) | Playwright + node tests | Heavy state/helper tests, limited device UI e2e | P | Mobile full UI e2e intentionally limited; needs runtime validation pass. |
| Accounts/payment methods dedicated UX | Present in web settings flows | Hidden route exists (`/(tabs)/accounts`) | P | Validate discoverability and full CRUD parity path from More tab. |

### Bottom-line parity readout
- **Strongly implemented:** profile switching, dashboard intelligence stack, goals, budgets, core transactions, AI chat state.
- **Partial parity risk areas:** analytics depth, settings/account breadth, exports UX, notifications/reminders UX/preferences, onboarding nuances.
- **Likely backend-ready/mobile-gap areas:** export experience and some settings/reminders surfaces.

---

## 3) Prioritized mobile parity execution checklist (implementation planning)

Checklist style: phased, actionable, dependency-aware.  
Priority order: backend-ready/high-impact → critical flows → dashboard parity → AI parity → polish/testing/perf.

## Phase M1 — Contract & Baseline Lock (audit-close)
- Note: phase checkbox rows below are the original execution plan baseline; deterministic closure status is tracked in the factual progress sections later in this document.
- [ ] Freeze mobile parity baseline doc and acceptance criteria in repo docs.
- [ ] Confirm endpoint contract map for all mobile-tab features against current backend routes.
- [ ] Add API contract assertions for profile-scoped endpoints used by dashboard/widgets.
- [ ] Verify profile_type is present for seeded + user-created profiles in test fixtures.
- [ ] Add one smoke test assertion per critical feature for `activeProfile` propagation.
- [ ] Document explicit non-goals (no org/team ACL) in mobile parity tracker.

## Phase M2 — Critical Flow Parity (high impact)
- [ ] Transactions: parity-check filter behavior (type/category/payment/date/search).
- [ ] Transactions: verify edit/delete optimistic consistency with web behavior.
- [ ] Transactions: validate retry/offline UX copy and recovery path parity.
- [ ] Budgets: parity-check create/edit/delete/category budget semantics.
- [ ] Budgets: confirm total budget + category budget progression parity.
- [ ] Goals: verify projection/milestone labels and edge states match web rules.
- [ ] Goals: validate profile change reload behavior and stale-request guards.
- [ ] Accounts: ensure payment method CRUD is discoverable from mobile nav.

## Phase M3 — Dashboard Intelligence Parity
- [ ] Net balance card: align formatting/totals with web calculation rules.
- [ ] Income/spend cards: align empty-state thresholds and copy.
- [ ] MoM card: verify direction/flat/none semantics against web.
- [ ] Top goal card: align selection priority logic and messaging.
- [ ] Smart metrics: align card order, helper text, and score formatting.
- [ ] Smart insights widget: align ordering/severity mapping + fallback copy.
- [ ] Forecast widget: align risk labels, confidence mapping, and empty/error states.
- [ ] Weekly digest widget: align summary parsing and dismiss semantics.
- [ ] Subscription widget: align candidate thresholds and total labels.

## Phase M4 — AI Parity Slice
- [ ] AI chat modal: parity-check suggestion set and disabled-state logic.
- [ ] AI chat retry flow: match web retry messaging and failover behavior.
- [ ] AI session persistence: verify restart restore + interrupted-send semantics.
- [ ] AI per-profile isolation: add regression checks for cross-profile session leakage.
- [ ] AI telemetry hooks: align event payload shape with web where applicable.

## Phase M5 — Settings, Account, and Utility Parity
- [ ] Settings: map web sections to mobile equivalents and identify missing controls.
- [ ] Account deletion/logout/session handling parity validation.
- [ ] Currency/theme settings parity checks (if backend-backed options differ).
- [ ] Notification preference surfaces (if backend-ready) parity plan.
- [ ] Deep-link handling for add/stats routes parity with web route intents.

## Phase M6 — Exports & Shareability
- [ ] Define mobile export UX path (share sheet/download/storage abstraction).
- [ ] Implement/validate CSV export consume/share flow.
- [ ] Implement/validate JSON export consume/share flow.
- [ ] Evaluate PDF parity target and mobile viability constraints.
- [ ] Add error handling parity for export failures/timeouts.

## Phase M7 — Onboarding/Activation Parity
- [ ] Verify first-run empty states across tabs (no profile/no data scenarios).
- [ ] Guest-to-authenticated migration behavior parity checks.
- [ ] OAuth callback and post-auth redirect parity checks on web-mobile bridge.
- [ ] Add activation checklists for first transaction, first budget, first goal.

## Phase M8 — Validation & Hardening
- [ ] Expand mobile state-helper tests for parity-sensitive regressions.
- [ ] Add focused integration tests for profile-scoped dashboard requests.
- [ ] Add smoke coverage for hidden routes (`add`, `accounts`) navigation.
- [ ] Run manual device validation matrix (iOS/Android) for notifications/deep links.
- [ ] Performance pass on dashboard load sequencing and parallel fetch strategy.
- [ ] Error-observability pass: ensure actionable logs for failed widget fetches.

## Workstream separation

### Mobile-only work
- Screen-level UX parity, hidden-route discoverability, export/share UX, tab-specific loading/empty/error behavior, AI modal UX parity.

### Shared/backend work
- Endpoint contract assertions, response-shape guarantees, export endpoint usage constraints, optional telemetry payload alignment.

### Parity validation/testing work
- Regression tests for profile-scoped requests, helper-state coverage growth, smoke checks for critical tabs, device runtime validation matrix.

## High-level dependencies/blockers
- Export UX parity depends on final mobile file/share handling decisions.
- Notification/reminder parity depends on product decisions for preferences UI and scheduling ownership.
- Some parity items depend on agreed canonical copy/formatting source between web and mobile.


## Transactions parity close-out (completed slice)

- ✅ Type filter chips implemented (`all`, `expense`, `income`, `transfer`).
- ✅ Filtered-empty state is explicit and separate from month-empty state.
- ✅ Clear-filters recovery action implemented (`testID="tx-clear-filters"`).
- ✅ Edit/delete detail-modal parity verification implemented (with stable action selectors).
- ✅ Profile-switch detail reset implemented to prevent stale modal state.
- ✅ Export/share intent preparation implemented for handoff to export UX.
- ✅ Focused helper/unit coverage added for each above behavior (`transactionFlowState.test.mjs`).

## Next implementation-ready mobile parity area

**Chosen next area: Dashboard intelligence parity (Smart Metrics + related intelligence widgets).**

Why this is next in order:
- Transactions critical-flow hardening is now complete for this slice.
- In the checklist, dashboard intelligence parity is the next high-impact, backend-ready area with strong user visibility.
- Existing mobile dashboard already calls backend contracts (`/dashboard/metrics`, `/insights/overview`, `/forecast`, `/weekly-digest/latest`, `/subscriptions/summary`), so parity work can remain frontend-focused and incremental.

## First implementation slice (prepared, not implemented yet)

1. **Smart Metrics card-state parity pass (first slice)**
   - Align card loading/error/empty/success state mapping with web semantics for the Smart Metrics section only.
   - Keep payload contracts unchanged; use current mapping/util pipeline.

2. **Top Category Summary rendering consistency check**
   - Ensure top-category summary text/value formatting and fallback copy mirror web behavior for missing/partial data.

3. **Focused validation for this first slice**
   - `node --test frontend/src/utils/smartMetricsCards.test.mjs`
   - `node --test frontend/src/utils/smartMetricsSectionState.test.mjs`
   - (only if shared/web code touched) `npm --prefix web run build`


## Dashboard Intelligence parity completion notes (factual updates)

- ✅ Smart Metrics section-state wiring and fallback normalization are complete.
- ✅ Smart Metrics profile-switch stale-state prevention is complete.
- ✅ Smart Metrics refresh/re-entry loading stability is complete.
- ✅ Smart Insights, Forecast, Weekly Digest, and Subscription Detection refresh/re-entry loading stability are complete.
- ✅ Intelligence widget empty-state copy consistency is complete.
- ✅ Dashboard no-active-profile empty-state copy consistency is complete.
- ✅ Profile-switch stale/error/coexistence prevention is complete for Smart Metrics, Smart Insights, Forecast, Top Goal, dashboard top-level error, and AI chat modal carryover.

## AI parity (M4) completion notes (factual updates)

- ✅ AI chat modal deterministic disabled-state guards are complete (trimmed profileId requirement, loading gate, and prompt length bounds 3–300).
- ✅ Retry-state determinism is complete (failed-only retry affordance, retry-context preservation, and normalized pendingMessageId guard for retry paths).
- ✅ Session hydration and interruption semantics are complete (persisted profile-key normalization, normalized-key collision guard, and pending→failed interruption on modal close/restart-safe flows).
- ✅ Suggestion-chip disabled-state gating is complete.
- ⚠️ AI telemetry hook parity remains pending because mobile currently has no committed telemetry sink in this execution track; no payload-shape alignment changes were introduced in M4 runtime slices.

## M5 deep-link parity progress notes (factual updates)

- ✅ Notification route-state parsing now normalizes `screen` values (trim + lowercase) for deterministic route mapping.
- ✅ Malformed payload shapes now fail safely (`null`) for non-object/array notification payloads.
- ✅ Add-route amount query handling is deterministic: trimmed numeric values are accepted and encoded; blank/invalid values fall back to plain `/(tabs)/add`.
- ✅ Duplicate-notification suppression is implemented using last-handled notification id checks.
- ✅ Handled-notification id advancement now occurs only after successful route derivation to avoid stale suppression after non-routable payloads.
- ⏳ Hydration/profile-switch safety for notification-driven navigation remains a separate runtime validation boundary (device lifecycle dependent).

## M6 exports/shareability parity progress notes (factual updates)

- ✅ Export intent preparation now validates profile/month/year inputs and normalizes profile-id whitespace.
- ✅ Export intent generation is scoped to live transactions summary runtime context (profile/month/year), preventing out-of-scope stale intent derivation.
- ✅ Export filenames are sanitized deterministically for web download and native share paths.
- ✅ Export start gating is deterministic (blocks duplicate starts and blank-profile starts).
- ✅ Export modal stale-state cleanup is deterministic on active-profile switch (modal closes and exporting flag resets).
- ✅ Export error-state copy is deterministic by failure class (network/no-response vs server vs other failure).
- ✅ Export action affordances now reflect terminal state deterministically (disabled when loading or no profile).
- ⏳ PDF parity target and final mobile file/share UX constraints remain open product/runtime decisions.

## M7 onboarding/activation parity progress notes (factual updates)

- ✅ Deterministic first-run empty-state helpers are in place across key tabs (transactions/budgets/goals/dashboard intelligence surfaces).
- ✅ No-active-profile guard semantics are implemented for parity-sensitive flows in current helper/runtime scope.
- ⏳ Guest-to-authenticated migration parity remains an explicit runtime validation boundary.
- ⏳ OAuth callback/post-auth redirect parity on web-mobile bridge remains an explicit runtime validation boundary.

## M8 validation/hardening progress notes (factual updates)

- ✅ Parity-sensitive helper/state coverage has been expanded in deterministic utility suites (AI chat session/modal, notification route state, transaction flow/export intent, and export/share helpers).
- ✅ Stale-state/profile-switch guard helpers are in place for key parity surfaces (dashboard intelligence, transactions detail/export intent, notifications, export modal).
- ⏳ Device/runtime validation matrix items remain open (real iOS/Android deep-link/notification lifecycle, process-kill restart behavior, and performance/observability runtime checks).

## Deterministic parity close status (factual snapshot)

- ✅ Deterministic helper/runtime parity slices are closed for M4 (AI), M5 (deep-link routing helpers), and M6 (exports/shareability helper/UI state scope).
- ✅ Checklist now explicitly tracks deterministic close notes for M7 and M8 where remaining work is lifecycle/device/manual validation rather than helper-state logic.
- ⏳ Remaining unresolved parity work is boundary-only: lifecycle/device/manual runtime validation, PDF export product decisions, guest→auth migration bridge checks, and OAuth post-auth redirect bridge checks.
