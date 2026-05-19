# Mobile Beta Readiness Checklist (Final Package)

Date: 2026-04-22  
Use this checklist for final handoff and go/no-go beta decisioning.

---

## 1) Install / build sanity checks
- [ ] iOS debug build installs and opens successfully.
- [ ] Android debug build installs and opens successfully.
- [ ] Release-like build profile boots without startup crash.
- [ ] Environment variables/config are resolved correctly.

## 2) Auth / guest mode checks
- [ ] Sign in (email/password or configured provider) succeeds.
- [ ] Sign out returns to expected entry state.
- [ ] Invalid auth/session expiry handling routes correctly.
- [ ] Guest/unauthenticated entry behavior matches expected product rules.

## 3) Route / screen smoke checks
- [ ] Dashboard opens and refreshes cleanly.
- [ ] Transactions, Budgets, Goals, Analytics, More routes open without blank/error state.
- [ ] Tab switching does not leak stale layout or state.

## 4) Dashboard + widget checks
- [ ] Smart insights/forecast/weekly digest/subscription widgets render valid loading/empty/error/success states.
- [ ] Dashboard refresh updates cards without stale flash/regression.

## 5) Budgets / goals checks
- [ ] Create/edit/delete budget works with profile context.
- [ ] Create/edit/delete goal works with validation and status chips.
- [ ] Empty and populated states are readable and stable.

## 6) Transactions checks
- [ ] Create/edit/delete transaction path works end-to-end.
- [ ] Pull-to-refresh updates list without duplicate loader artifacts.
- [ ] Daily/calendar/monthly/summary/description subviews remain responsive.
- [ ] Swipe actions are reliable and accidental taps are low.

## 7) Analytics checks
- [ ] Overview/category/payment/monthly sections load correctly.
- [ ] Chart taps/tooltips are responsive and legible.
- [ ] Empty/error handling is clear and non-blocking.

## 8) AI chat checks
- [ ] Chat modal open/close responsiveness feels acceptable.
- [ ] Submit/retry paths work and pending/failure transitions are deterministic.
- [ ] Profile-scoped session restore behaves correctly after app restart.

## 9) Notifications / deep-link checks
- [ ] Notification tap routes to expected screen paths.
- [ ] Deep link to add flow works from cold/warm start.
- [ ] Invalid deep links fail safely.

## 10) Profile-switch + restart-restore checks
- [ ] Profile switch does not leak prior profile dashboard/chat state.
- [ ] Process kill + reopen restores expected state without broken pending UI.

## 11) iOS device checks
- [ ] Keyboard behavior and modal layout stable on small/large iPhones.
- [ ] Safe-area handling is correct across notch and non-notch devices.
- [ ] Notification permission and behavior validated.

## 12) Android device checks
- [ ] Back button behavior is correct in modal and root flows.
- [ ] Keyboard overlap and touch targets are acceptable across OEM variants.
- [ ] Notification/deep-link flows validated on at least one recent Android version.

## 13) Dark mode checks
- [ ] Primary flows (Dashboard, Budgets, Goals, Transactions, Analytics, AI chat) pass readability/contrast checks.
- [ ] Borders/surfaces/chips/badges remain visually consistent.

## 14) Performance/load-state checks
- [ ] Initial load vs pull-to-refresh transitions feel coherent.
- [ ] No obvious duplicate fetch loops or redundant loading placeholders.
- [ ] Heavy list/chart screens remain interactive under realistic data volume.

## 15) Release blockers vs non-blockers

### Blockers (must-fix)
- [ ] Crash on launch/auth/main navigation.
- [ ] Data corruption or cross-profile data leak.
- [ ] Broken create/edit/delete in transactions/budgets/goals.
- [ ] AI chat stuck in unrecoverable pending state.
- [ ] Notification/deep-link misrouting that blocks core tasks.

### Non-blockers (can defer with ticket)
- [ ] Minor spacing/typography polish nits.
- [ ] Small animation/perceived latency improvements without functional breakage.
- [ ] Optional observability enrichments beyond minimum launch baseline.

---

## Sign-off
- QA Lead: ____________________  Date: __________
- Mobile Engineer: _____________ Date: __________
- Product Owner: _______________ Date: __________
