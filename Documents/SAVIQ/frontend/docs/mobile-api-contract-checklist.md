# SAVIQ Mobile API Contract Validation Checklist (Phase M1)

Purpose: provide a repo-grounded checklist of backend contracts that mobile parity work depends on.

## Usage status legend
- **used**: actively called by current mobile app code
- **partially used**: endpoint family exists in backend/web, but mobile only uses subset or only indirect fields
- **not yet used**: available in backend/web but no mobile call path yet

---

## 1) Auth / profile / session contracts

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Session bootstrap | `GET /api/auth/me` | used | Bearer token | `user_id`, `email`, `name`, `auth_provider` | 401 should clear token and force unauth flow; loading gate at app bootstrap | Validate token-expiry handling on web/native storage paths |
| Email auth | `POST /api/auth/login`, `POST /api/auth/register` | used | `{email,password}` / `{email,password,name}` | `user`, `session_token` | Show inline auth errors; block protected routes until resolved | Validate field-level error mapping for invalid credentials / duplicate email |
| Social auth | `POST /api/auth/google`, `POST /api/auth/apple/login` | used | `{id_token}` / Apple credential payload | `user`, `session_token` | OAuth callback timing + retry path must not leave app in loading state | Validate callback/deep-link auth flow on device and web |
| Logout | `POST /api/auth/logout` | used | none | `message` | Always clear local token even if network fails | Validate guest-mode logout behavior separately |
| Account delete | `DELETE /api/auth/account` | not yet used (mobile) | `{confirmation}` | `message` | destructive action; strong confirmation UX needed | Web supports this; mobile parity pending |
| Profiles | `GET/POST/PUT/DELETE /api/profiles` | partially used | profile CRUD payloads | `profile_id`, `name`, `is_default` | empty profile list must not break route loading | Mobile currently reads/switches; no full profile CRUD UI yet |

---

## 2) Expenses CRUD + stats summary

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Expenses list/detail | `GET /api/expenses`, `GET /api/expenses/{expense_id}` | used (list); detail not direct | query: `profile_id` (optional) and filters | list of `expense_id`, `type`, `amount`, `category_id`, `payment_method_id`, `date`, `description`, `notes`, `receipt_image` | empty list is normal; keep non-blocking empty-state | Validate date/filter parity before advanced mobile filters are added |
| Create/update/delete expense | `POST/PUT/DELETE /api/expenses...` | used | expense payload includes transfer/recurring/receipt fields | persisted expense object + success semantics | optimistic UX not required now; ensure refresh after mutation | Validate transfer-specific fields (`to_payment_method_id`) and recurring fields |
| Summary stats | `GET /api/stats/summary` | used | query: `profile_id`, `period` | `total`, `count`, `average`, `by_category[]` | if empty period: totals should be zero, not error | Mobile uses this for summary bars; validate period options week/month/year |
| Weekly summary | `GET /api/stats/weekly-summary` | used | query: `profile_id` optional | `notification_title`, `notification_body`, `this_week_total`, `change_str`, etc. | if no prior data, fallback copy is expected | Validate notification copy fields for automation UI |

---

## 3) Budgets CRUD + progress

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Budget CRUD | `GET/POST/PUT/DELETE /api/budgets` | partially used (GET/POST/DELETE; limited PUT usage in UI) | `{profile_id, category_id?, amount, period}` | budget records with `budget_id`, `amount`, `period`, `category_id` | empty budgets should render setup CTA | Validate behavior when creating duplicate profile/category budget (upsert semantics) |
| Budget progress | `GET /api/budgets/progress?profile_id=...` | used | required `profile_id` | `total_budget`, `budgets[]`, each with `spent`, `remaining`, `percentage`, `is_over_budget` | missing `total_budget` is valid state | Core dependency for Stats/Budget mobile tab; validate rounding and negative remaining values |

---

## 4) Savings goals CRUD + projections

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Goals CRUD | `GET/POST/GET by id/PUT/DELETE /api/savings-goals` | partially used (GET list) | `{profile_id,title,target_amount,current_amount,deadline,category,status}` | goal fields + `progress_percentage`, `monthly_savings_recommendation`, `projected_completion` | empty list expected for first-time users | Required for upcoming Goals route parity; projection fields are key web parity dependency |

---

## 5) Dashboard metrics

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Dashboard metrics bundle | `GET /api/dashboard/metrics?profile_id=...` | not yet used | required `profile_id` | `savings_score`, `spend_velocity`, `financial_health_score`, `budget_confidence`, `top_category_summary`, `projected_savings_summary` | 400 if `profile_id` missing; show shell fallback | Critical contract for future Dashboard widgets after route shell is introduced |

---

## 6) Forecast

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Spend forecast | `GET /api/forecast?profile_id=...&recent_days=...` | not yet used | required `profile_id`; `recent_days` (7–90) | forecast payload including confidence/risk fields (used by web forecast card) | invalid window should surface validation error | Needed for dashboard parity depth; validate risk/confidence field contract before UI build |

---

## 7) Weekly digest

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Weekly digest latest/state | `GET /api/weekly-digest/latest`, `POST /api/weekly-digest/latest/dismiss` | not yet used | `profile_id` query | `digest`, `latest`, `dismissed` | missing digest is normal (`digest: null`) | Needed for dashboard digest modules; preserve “dismiss latest” semantics |
| Weekly digest generation | `GET /api/weekly-digest` | not yet used | `profile_id`; optional `week_start`, `week_end` | digest payload + `state` (`empty`/`success`) | invalid date window returns 400 | Validate week-window normalization behavior before UI integration |

---

## 8) Subscriptions

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Recurring/subscription summary | `GET /api/subscriptions/summary?profile_id=...` | not yet used | required `profile_id`; optional `lookback_days` | recurring summary payload consumed by web subscriptions card | empty/low-history accounts may return sparse summary | Needed for dashboard subscription parity work |

---

## 9) Analytics

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Analytics summary | `GET /api/analytics/summary` | not yet used directly (mobile uses `/stats/summary`) | `profile_id`, date/window params | totals + MoM fields | empty periods should still return numeric zeros | Mobile analytics depth work should validate whether to reuse stats endpoints or migrate to analytics endpoints |
| Category/payment/monthly trend | `GET /api/analytics/category-breakdown`, `/payment-method-breakdown`, `/monthly-trend` | not yet used | profile/window params | `items[]` lists used by web charts | chart UIs should handle empty arrays | Required for richer chart parity beyond current Stats tab |

---

## 10) AI insights / chat

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| Insights feed | `GET /api/insights` | used | optional `profile_id` | `stats` (`this_week_total`, `this_month_total`, etc.), `insights[]` (`icon`,`text`,`type`) | mobile already falls back to local tip on failure | Validate icon/type compatibility with mobile renderer |
| Deterministic insights | `GET /api/insights/overview`, `/recommendations`, `/v2` | not yet used | profile/window params | structured insight lists used by web surfaces | on backend fallback, ensure stable schema | Candidate for future dashboard/analytics parity |
| AI chat insights | `POST /api/ai/chat-insights` | not yet used | `{profile_id, question, recent_days}` | `context`, `prompt_template`, `recommendation`, `generated_at` | rate-limited + 500 fallback path required | Needed for AI chat parity work; validate rate-limit UX handling |

---

## 11) Export

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| CSV export | `GET /api/export/csv` | used | `profile_id`; optional `start_date`, `end_date` | CSV payload text/blob | invalid date range => 400; should show non-crashing error | Mobile currently exports without mandatory date window; route-level export parity may add date-range checks |
| JSON export | `GET /api/export/json` | used | same query params as CSV | `expenses[]`, `summary`, `category_breakdown`, `period` | empty data should still return valid object | Validate `period.start/end` handling when filters absent |

---

## 12) Receipt scan

| Contract | Endpoint(s) | Mobile usage | Expected request | Key response fields mobile depends on | Error/loading/empty notes | Validation / parity notes |
|---|---|---|---|---|---|---|
| AI receipt parsing | `POST /api/scan-receipt` | used | `{image: base64DataUrl}` | parsed fields currently consumed by mobile: `amount`, `merchant`, `date`, `time` | failures are intentionally non-blocking; user can continue manual entry | Validate date/time parsing edge-cases and partial extraction quality |

---

## Contract validation execution checklist (for upcoming parity tasks)

- [ ] Verify auth/profile/session contracts for both web and native token stores.
- [ ] Verify expense+stats contracts with empty datasets and with transfer/recurring records.
- [ ] Verify budget progress math and over-budget flags against mobile Budget tab.
- [ ] Validate savings goals projection fields before mobile goals screen implementation.
- [ ] Validate dashboard/forecast/weekly-digest/subscriptions payload shapes with real profile IDs.
- [ ] Validate analytics endpoint payloads before chart parity build.
- [ ] Validate AI insights/chat rate-limit and fallback UX behaviors.
- [ ] Validate export date-window error handling and large payload behavior.
- [ ] Validate receipt-scan contract with partial OCR extraction and malformed image input.
