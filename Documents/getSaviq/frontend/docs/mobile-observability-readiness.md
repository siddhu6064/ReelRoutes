# Mobile Observability Readiness (Analytics + Crash Tracking Parity)

Date: 2026-04-22  
Scope: release-readiness review for mobile analytics events parity and crash/error tracking parity.

---

## 1) What was inspected

### Code-level inspection targets
- Mobile screens/routes: Dashboard, Transactions, Budgets, Goals, Analytics, More, auth shell.
- Cross-cutting code: API client/interceptors, app bootstrap/layout, auth bootstrap.
- Dependency/config surface: `package.json`, `app.json` plugins.

### Search patterns used
- `analytics`, `track`, `logEvent`, `amplitude`, `mixpanel`, `segment`, `posthog`
- `sentry`, `bugsnag`, `captureException`, `crash`, `fatal`, `reportError`, `telemetry`

---

## 2) Existing instrumentation found

## A. Product analytics events
**Status: Minimal / effectively absent for event telemetry parity**

Findings:
- No mobile analytics SDK wiring found (no Amplitude/Mixpanel/Segment/PostHog/Firebase Analytics packages or initialization).
- No shared `trackEvent(...)` helper found in mobile code paths.
- No explicit event logging calls for the critical primary flows listed below.

## B. Crash/error tracking
**Status: Minimal / effectively absent for crash parity**

Findings:
- No crash SDK found (no Sentry/Bugsnag/Crashlytics integration or Expo plugin wiring).
- Existing error handling is mostly local (`try/catch`, alerts, `console.log/error`) and API 401 token cleanup.
- No centralized mobile exception capture hook for unhandled route/runtime errors.

## C. Existing reliability-adjacent behavior (not observability parity)
- API response interceptor clears auth token on 401.
- Localized loading/error state handling per-screen.

---

## 3) Flow parity matrix (mobile vs observability expectation)

| Flow | Event parity found? | Crash/error parity found? | Notes |
|---|---:|---:|---|
| Dashboard entry / refresh | ❌ | ⚠️ Partial local handling | No event emit; local UI-state guards only. |
| Transactions create/edit/delete | ❌ | ⚠️ Partial local handling | No structured event or exception sink. |
| Budgets create/edit/delete | ❌ | ⚠️ Partial local handling | Alerts and local catches only. |
| Goals create/edit/delete | ❌ | ⚠️ Partial local handling | Alerts + per-screen catches only. |
| AI chat open / submit / retry | ❌ | ⚠️ Partial local handling | Local failure UI exists, but no telemetry sink. |
| Weekly Digest / Subscription interactions | ❌ | ⚠️ N/A-minimal | Mostly passive widgets; no interaction telemetry found. |
| Profile switching | ❌ | ⚠️ Partial local handling | No emitted profile-switch event found. |
| Export flow | ❌ | ⚠️ Partial local handling | No export start/success/failure event found. |
| Auth / guest entry | ❌ | ⚠️ Partial local handling | Auth code paths exist, but no analytics events. |

Legend:
- ✅ present parity
- ⚠️ partial/local only
- ❌ missing parity

---

## 4) Changes made in this pass

No runtime analytics/crash SDK implementation was added in this pass.

Reasoning:
- There is no pre-existing mobile observability architecture/hook to extend safely with tiny patch scope.
- Adding a new telemetry/crash vendor stack now would be a substantial operational/security rollout, not a closeout-safe surgical change.

---

## 5) Residual limitations

- Release metrics will have weak attribution for user behavior and funnel drop-off on mobile.
- Crash triage will rely on manual reproduction/logs instead of centralized issue aggregation.
- Beta quality signal will be materially weaker than web if web has structured observability.

---

## 6) Recommendation (release-readiness from observability standpoint)

**Overall observability readiness: Partial / below desired parity.**

Recommended minimum before broad beta:
1. Add a lightweight mobile analytics wrapper (single `trackEvent` interface) and instrument critical flow milestones.
2. Add one crash/error sink (Sentry or equivalent) with environment tagging and release version metadata.
3. Add baseline event taxonomy and owner mapping (event name, trigger, properties, PII rules).

If schedule-constrained:
- Proceed with limited beta only, but mark observability as a **known operational risk** and gate wider rollout on step (1) + (2).
