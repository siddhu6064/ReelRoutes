# SAVIQ Runtime Readiness Audit (Backend/Data-Flow/Connectivity)

Date: 2026-04-22
Scope: backend runtime readiness, persistence flow, web/mobile connectivity wiring.

## 1) Backend runtime readiness

### Boot path and startup requirements
- FastAPI app boots with a lifespan hook that **must run `create_indexes()`** before serving requests.
- If `create_indexes()` fails (typically DB unreachable / auth error), startup fails and app does not become healthy.
- Readiness endpoint (`/readyz`) depends on Mongo ping success and non-empty `MONGO_URL` + `DB_NAME`.

### Required env vars for core backend boot
Required for real persistence:
- `MONGO_URL`
- `DB_NAME`

Required for browser/web connectivity (practical runtime requirement):
- `ALLOWED_ORIGINS` must include actual web origin(s).

Not required for core email/password flow:
- `GOOGLE_CLIENT_IDS` (required only for `/api/auth/google`)
- `APPLE_APP_ID` (required only for `/api/auth/apple/login`)
- OpenAI vars (`OPENAI_API_KEY`, models) are optional for core CRUD/data-flow and only needed for AI endpoints.

### Important env/config nuance
- Backend loads dotenv from `backend/.env` specifically (`load_dotenv(ROOT_DIR / ".env")`). If operators only set a repo-root `.env`, backend may silently run defaults.

### DB initialization/index behavior
- Mongo client/db are initialized lazily on import via `AsyncIOMotorClient(settings.MONGO_URL)` and selected DB name.
- Collections are created by Mongo on first write.
- Indexes are explicitly created at startup for key collections (`users`, `user_sessions`, `profiles`, `categories`, `payment_methods`, `expenses`, `budgets`, `savings_goals`, `weekly_digests`).
- TTL index exists on `user_sessions.expires_at` (session cleanup).

## 2) Minimum persistence/data-flow audit

### Minimum viable route sequence (real DB write/read)
1. `POST /api/auth/register`
   - Payload: `{ email, password, name }`
   - Writes:
     - `users` record
     - `user_sessions` token
     - default seed records in `profiles`, `categories`, `payment_methods`
2. `GET /api/profiles` (with `Authorization: Bearer <session_token>`)
   - read seeded profiles and choose `profile_id`
3. `GET /api/categories` and `GET /api/payment-methods`
   - read seeded dependencies needed by expense creation
4. `POST /api/expenses`
   - Required payload minimum:
     - `profile_id`, `type`, `amount`, `payment_method_id`, `description`, `date`
     - optional `category_id` (if provided, must exist and belong to user)
   - Route enforces owned-profile and owned-payment-method existence, plus category existence when provided
5. `GET /api/analytics/summary`
   - confirms persisted expense is queryable through analytics path
6. Optional first-write expansions:
   - `POST /api/budgets` (needs valid `profile_id`, optional valid `category_id`)
   - `POST /api/savings-goals` (needs valid `profile_id`)

### Prerequisites before first expense
- Must be authenticated (valid session token).
- Must have at least one valid profile and payment method.
  - This is auto-seeded during register/login-first-user creation path.
- Category is not mandatory for expense, but if provided it must exist.

### Collections expected after minimum flow
After register + one expense + one analytics read:
- `users`
- `user_sessions`
- `profiles`
- `categories`
- `payment_methods`
- `expenses`

After adding budget/goal:
- `budgets`
- `savings_goals`

## 3) Frontend/web/mobile connectivity audit

### Web client connectivity
- Web API base URL: `VITE_BACKEND_URL`, fallback `http://localhost:8001`.
- Production build throws if `VITE_BACKEND_URL` missing (non-localhost).
- Auth token sent via `Authorization: Bearer <session_token>` from localStorage.
- On 401, token cleared and app redirects to `/login`.

### Mobile client connectivity
- Mobile API base URL: `EXPO_PUBLIC_BACKEND_URL`, fallback `http://localhost:8001`.
- Auth token sent via Authorization header from SecureStore (native) / AsyncStorage (web).
- On 401, token cleared.

### Auth/session/CORS notes
- Backend auth dependency accepts either cookie `session_token` or bearer header; clients use bearer header.
- CORS is enabled with `allow_credentials=True`; origin allowlist must match actual browser origin(s).
- Mobile native requests are not browser-CORS constrained the same way, but wrong `EXPO_PUBLIC_BACKEND_URL` is a common failure.

### Guest mode behavior
- Both web and mobile support guest mode and local-only data paths.
- If users are in guest mode, backend sync is intentionally bypassed; this can appear as “nothing syncing” while app still works locally.

## 4) First real smoke-test checklist (backend-first)

### A. Backend + DB
1. Create `backend/.env` from `.env.example` with real values for:
   - `MONGO_URL`, `DB_NAME`, `ALLOWED_ORIGINS`
2. Start MongoDB and backend (`uvicorn main:app --reload --port 8001` from `backend/`).
3. Verify health/readiness:
   - `GET /healthz` => `ok`
   - `GET /readyz` => `ready`
4. Verify startup logs include index creation success (`MongoDB indexes ensured`).

### B. Core API data-flow
5. Register user:
   - `POST /api/auth/register` with email/password/name
   - capture `session_token`
6. With bearer token:
   - `GET /api/profiles` (expect Personal/Business)
   - `GET /api/categories` (expect seeded defaults)
   - `GET /api/payment-methods` (expect seeded defaults)
7. Create expense:
   - `POST /api/expenses` with valid profile_id + payment_method_id + amount + date + description
8. Verify analytics read:
   - `GET /api/analytics/summary`
9. DB verification in Mongo shell/GUI:
   - confirm docs in `users`, `user_sessions`, `profiles`, `categories`, `payment_methods`, `expenses`

### C. Web connectivity
10. Set `VITE_BACKEND_URL` to backend URL and run web app.
11. Register/login from web UI; verify transactions created in UI appear in backend DB.
12. Validate browser network calls target `<VITE_BACKEND_URL>/api/*` and include bearer token.
13. Confirm backend `ALLOWED_ORIGINS` includes actual web origin.

### D. Mobile connectivity
14. Set `EXPO_PUBLIC_BACKEND_URL` reachable from device/emulator (not localhost unless tunneled/forwarded).
15. Login/register in mobile app and create expense.
16. Verify same user data appears via backend API and in Mongo.
17. Repeat with guest mode to confirm local-only behavior (no backend writes expected).

## 5) Blockers / likely failure points

### Already implemented in code
- Full backend CRUD/auth/profile/category/payment/expense/analytics paths are implemented.
- Startup index provisioning and readiness probes are implemented.
- Web and mobile API clients are wired to backend URL envs and bearer-token auth.

### Missing infra/provisioning (most likely real-world blocker)
1. **Wrong env file location**: backend reads `backend/.env`; repo-root `.env` alone can cause misconfiguration.
2. **Mongo not reachable** (`MONGO_URL` bad, network/security/auth issue) => startup or readiness fails.
3. **CORS allowlist mismatch** for web origin => browser failures despite healthy backend.
4. **Mobile base URL misconfigured** (`EXPO_PUBLIC_BACKEND_URL` pointing to localhost from real device).
5. **Guest mode enabled** => expected local-only behavior mistaken as sync failure.

### Code gaps in critical path
- No critical code gap found for baseline end-to-end email/password + expense + analytics persistence flow.

## 6) Final recommendation

**Ready to wire up and test** (with provisioning discipline).

Interpretation:
- Critical path code exists.
- Most “no backend/no tables/nothing syncing” reports are more likely environment/provisioning or guest-mode issues than missing backend implementation.
