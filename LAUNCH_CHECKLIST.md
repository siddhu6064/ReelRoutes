# ReelRoutes — Complete Launch Checklist

Everything needed for the app to work end-to-end in production.
Items are ordered by dependency — do not skip ahead.

---

## 🔴 BLOCKER — Must do before anything works

### Infrastructure

- [ ] **Create MongoDB Atlas cluster** (M0 free tier is fine for launch)
  - Create database user with read/write access
  - Add `0.0.0.0/0` to IP allowlist (Railway uses dynamic IPs)
  - Copy connection string → `MONGODB_URL`
  - Set `MONGODB_DB=reelroutes_production`

- [ ] **Deploy API to Railway**
  - `npm install -g @railway/cli && railway login`
  - `cd apps/api && railway init && railway link`
  - Set Root Directory to `apps/api` in Railway dashboard
  - Add Redis plugin (Railway dashboard → New → Database → Redis)
  - Add second Worker service: `poetry run arq app.workers.job_worker.WorkerSettings`
  - Add custom domain: `api.reelroutes.app`
  - Verify: `curl https://api.reelroutes.app/api/health` → 200 OK

- [ ] **Deploy web to Vercel**
  - `cd apps/web && vercel`
  - Set Root Directory to `apps/web`
  - Add custom domains: `reelroutes.app` and `www.reelroutes.app`

- [ ] **DNS records**
  - CNAME `api.reelroutes.app → <railway-generated>.up.railway.app`
  - CNAME/A `reelroutes.app → vercel`

---

## 🔑 API Keys — All required before launch

### Backend (Railway env vars)

- [ ] `MONGODB_URL` — MongoDB Atlas connection string
- [ ] `REDIS_URL` — Railway Redis plugin URL (auto-set if using Railway plugin)
- [ ] `OPENAI_API_KEY` — GPT-4o + Whisper (video extraction + AI chat + plan from scratch)
- [ ] `GOOGLE_PLACES_API_KEY` — Places Text Search, Geocoding, Routes, Details APIs
- [ ] `CLERK_SECRET_KEY` — Clerk dashboard → API Keys → Secret key
- [ ] `CLERK_PUBLISHABLE_KEY` — Clerk dashboard → API Keys → Publishable key
- [ ] `CLERK_WEBHOOK_SECRET` — Clerk dashboard → Webhooks → signing secret (for user sync)

### Web (Vercel env vars)

- [ ] `VITE_API_URL=https://api.reelroutes.app`
- [ ] `VITE_CLERK_PUBLISHABLE_KEY` — same as above
- [ ] `VITE_GOOGLE_MAPS_API_KEY` — for Places autocomplete in Plan from Scratch wizard

### Mobile (EAS env vars in `apps/mobile/eas.json`)

- [ ] `EXPO_PUBLIC_API_URL=https://api.reelroutes.app`
- [ ] `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — replace `pk_test_REPLACE_ME` (preview) and `pk_live_REPLACE_ME` (production)
- [ ] `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — for react-native-maps and Places autocomplete

### Optional but recommended

- [ ] `SENTRY_DSN` — Railway + Vercel + `EXPO_PUBLIC_SENTRY_DSN` in EAS
- [ ] `POSTHOG_API_KEY` — Railway + Vercel + EAS
- [ ] `MAPBOX_TOKEN` — Railway only (for flyover preview image)

---

## 🔐 Auth & Security (Code work — unblocked)

- [ ] **Clerk webhook svix signature verification** ← SECURITY GAP
  - File: `apps/api/app/routers/users.py` → `clerk_webhook()`
  - Currently accepts any POST — needs `svix` package to verify `CLERK_WEBHOOK_SECRET`
  - `poetry add svix` then implement: verify headers `svix-id`, `svix-timestamp`, `svix-signature`
- [ ] **Wire Clerk webhook in dashboard**
  - Clerk dashboard → Webhooks → Add endpoint: `https://api.reelroutes.app/api/webhooks/clerk`
  - Subscribe to events: `user.created`, `user.updated`, `user.deleted`
  - Copy signing secret → `CLERK_WEBHOOK_SECRET` Railway env var

- [ ] **Handle `user.deleted` webhook event**
  - Current handler only processes `user.created` and `user.updated`
  - Add branch to anonymise or delete `UserDocument` when Clerk account is deleted

- [ ] **Guest mode TTL index**
  - Add MongoDB TTL index on `TripDocument` where `user_id is null` → expires after 30 days
  - Add to `app/config/database.py` in `init_db()`: `await TripDocument.get_motor_collection().create_index("created_at", expireAfterSeconds=2592000, partialFilterExpression={"user_id": None})`

---

## 📱 Push Notifications (Code work — unblocked)

- [ ] **Register push token API endpoint**
  - `POST /api/users/push-token` route is missing from the router
  - `register_push_token()` function exists in `push_notifications.py` but is not wired to any HTTP endpoint
  - Add to `apps/api/app/routers/users.py` and register in `main.py`

- [ ] **Verify `usePushNotifications` hook calls the endpoint**
  - `apps/mobile/hooks/usePushNotifications.ts` calls `POST /api/users/push-token`
  - Endpoint must be live before notifications work at all

- [ ] **Fire `send_trip_ready()` after plan confirm**
  - `apps/api/app/services/plan/trip_builder.py` → `build_from_plan()` should call `send_trip_ready()` after saving the trip
  - Infrastructure exists, call is just missing

---

## 🚦 Rate Limiter (Code work — unblocked)

- [ ] **Redis-backed rate limiter for `/api/process`**
  - Current implementation: in-memory dict — resets on every restart, fails across multiple instances
  - `apps/api/app/middleware/rate_limit.py` needs Redis sliding window
  - Falls back to in-memory transparently if Redis is unavailable (already designed this way)

---

## 🌐 Web Routing (Code work — unblocked)

- [ ] **Verify `PlanEntryPage` is registered in `App.tsx`**
  - Check `apps/web/src/App.tsx` has a route for `/plan`
  - Check `NavBar.tsx` has a "Plan a trip" link or button
  - Without this the Plan from Scratch wizard is unreachable on web

---

## 📱 Mobile Discoverability (Code work — unblocked)

- [ ] **Add "Plan a trip" entry point to home screen**
  - `apps/mobile/app/(tabs)/index.tsx` or `new-trip.tsx` needs a prominent card/button
  - Currently reachable via `plan-wizard.tsx` but not linked from any tab

---

## 🍎 Apple (requires Apple Developer account)

- [ ] **Enable App Groups in Apple Developer Portal**
  - developer.apple.com → Identifiers → `app.reelroutes.mobile`
  - Enable App Groups → create `group.app.reelroutes.mobile`
  - Create identifier `app.reelroutes.mobile.ShareExtension`, add to same group
  - Without this the iOS Share Extension won't work

- [ ] **Fill `apps/mobile/eas.json` with real Apple credentials**
  - `appleId`: your Apple ID email
  - `ascAppId`: App Store Connect numeric app ID
  - `appleTeamId`: 10-character Apple Team ID

- [ ] **Build iOS preview for TestFlight**
  - `cd apps/mobile && eas build --platform ios --profile preview`
  - Install via TestFlight and test: YouTube → Share → ReelRoutes

- [ ] **App Store screenshots (6.7" iPhone)**
  1. Share sheet showing ReelRoutes option
  2. Processing screen with progress steps
  3. Trip map with pins
  4. Day-by-day itinerary
  5. Plan from Scratch wizard
  6. Trip Wrapped stats card

- [ ] **App Store submission**
  - `eas build --platform ios --profile production`
  - `eas submit --platform ios`
  - Fill App Store Connect from `apps/mobile/store-listings/en.md`
  - Set Privacy labels: location (when in use), usage data

---

## 🤖 Android (requires Google Play account)

- [ ] **Digital Asset Links for deep link autoVerify**
  - Get SHA-256: `eas credentials --platform android`
  - File already at `apps/web/public/.well-known/assetlinks.json` — fill in your SHA-256
  - Verify with: `adb shell pm get-app-links app.reelroutes.mobile`
  - Add `google-play-service-account.json` to `apps/mobile/`

- [ ] **Google Play submission**
  - `eas build --platform android --profile production`
  - `eas submit --platform android`
  - Upload all 5 language store listings from `apps/mobile/store-listings/*.md`
  - Complete Data Safety form (location, background processing)

---

## 📊 Observability (Optional but important)

- [ ] **Sentry — create project**
  - sentry.io → New Project → React Native + FastAPI
  - Add DSN to Railway (`SENTRY_DSN`), Vercel (`SENTRY_DSN`), EAS (`EXPO_PUBLIC_SENTRY_DSN`)
  - Add `@sentry/react` to `apps/web`, `@sentry/react-native` to `apps/mobile`

- [ ] **PostHog — create project**
  - posthog.com → New Project
  - Add `POSTHOG_API_KEY` to Railway, Vercel, and EAS

---

## ✅ Already done — no action needed

- [x] Full backend: 26 API endpoints, all services
- [x] Plan from Scratch: 8 backend services, web wizard, mobile wizard
- [x] Auth middleware: Clerk JWT verification, guest mode, claim flow
- [x] Clerk webhook handler: `user.created` / `user.updated` sync (needs svix verification ↑)
- [x] Push notification functions: `send_trip_ready()`, `send_import_failed()`, `send_trip_complete_notification()`
- [x] Web: all 12 feature panels (map, chat, budget, wrapped, collab, reservations, directions, suggestions, flyover, book, undo, GPS)
- [x] Mobile: full parity with web — all 12 sheets
- [x] iOS Share Extension + Android intent handler
- [x] CarPlay stop list
- [x] Multilingual: EN, ES, JA, KO, PT
- [x] Offline support
- [x] Test suite: 990 tests, 83% coverage, CI green
- [x] Railway `Procfile` + `railway.toml` ready
- [x] Vercel `vercel.json` ready
- [x] EAS `eas.json` profiles ready (needs real credentials)
- [x] Store listings in 5 languages
- [x] README and PENDING_TASKS up to date
