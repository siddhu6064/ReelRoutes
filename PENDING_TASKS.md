# ReelRoutes — Pending Tasks

Tasks organised by category. Code-complete items need only an external
dashboard step. Development items are unblocked and ready to build.

---

## ✅ Recently Completed

| Task                                                      | Completed   |
| --------------------------------------------------------- | ----------- |
| Plan from Scratch — backend (8 services, 2 endpoints)     | ✅ Apr 2026 |
| Plan from Scratch — web wizard (4 steps + curation UI)    | ✅ Apr 2026 |
| Plan from Scratch — mobile wizard (4 steps + curation UI) | ✅ Apr 2026 |
| Test suite 898 → 990 tests, 79% → 83% coverage            | ✅ Apr 2026 |
| CI fully green (Python + TypeScript + Prettier)           | ✅ Apr 2026 |

---

## 🔑 Needs External Access (Dashboard Steps Only)

### Apple Developer Portal — Share Extension App Group

**Blocked by:** Apple Developer Portal  
**Time:** ~5 min

1. Go to **developer.apple.com → Identifiers → `app.reelroutes.mobile`**
2. Enable **App Groups**, create group: `group.app.reelroutes.mobile`
3. Create `app.reelroutes.mobile.ShareExtension`, add to same group
4. Run: `eas build --platform ios --profile preview`
5. Install via TestFlight → YouTube → Share → ReelRoutes

---

### EAS Dashboard — Clerk Keys

**Blocked by:** Clerk dashboard  
**Time:** ~2 min

In `apps/mobile/eas.json`, replace:

- `"pk_test_REPLACE_ME"` → test publishable key (preview profile)
- `"pk_live_REPLACE_ME"` → live publishable key (production profile)

---

### EAS Dashboard + App Store Connect — Submit config

**Blocked by:** Apple Team ID + ASC App ID  
**Time:** ~5 min

In `apps/mobile/eas.json` under `submit.production.ios`, replace:

- `"your-apple-id@example.com"` → your Apple ID
- `"ascAppId": "XXXXXXXXXX"` → App Store Connect numeric ID
- `"appleTeamId": "XXXXXXXXXX"` → 10-character Apple Team ID

For Android: add `google-play-service-account.json` to `apps/mobile/`

---

### Sentry DSN

**Blocked by:** Sentry project creation  
**Time:** ~3 min

1. Create project at **sentry.io** (React Native + FastAPI)
2. Add `SENTRY_DSN` to Railway, Vercel, and `EXPO_PUBLIC_SENTRY_DSN` to EAS

---

### PostHog API Key

**Blocked by:** PostHog project  
**Time:** ~2 min

Add `POSTHOG_API_KEY` to Railway, Vercel, and EAS env vars.

---

### Android — Digital Asset Links

**Blocked by:** Production domain + signing key  
**Time:** ~10 min

1. Get SHA-256: `eas credentials --platform android`
2. File is already at `apps/web/public/.well-known/assetlinks.json` — fill in SHA
3. Verify: `adb shell pm get-app-links app.reelroutes.mobile`

---

### Railway — API Deploy

**Blocked by:** Railway account + all API keys ready  
**Time:** ~15 min  
**Code:** ✅ `Procfile`, `railway.toml`, `.env.example` done

```bash
npm install -g @railway/cli
railway login && cd apps/api
railway init && railway link
```

- Root Directory: `apps/api`
- Add Redis plugin
- Add Worker service: `poetry run arq app.workers.job_worker.WorkerSettings`
- Add `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `CLERK_SECRET_KEY`, `MONGODB_URL`, `REDIS_URL`
- Custom domain: `api.reelroutes.app`

---

### Vercel — Web Deploy

**Blocked by:** Railway API deployed first + Clerk live key  
**Time:** ~5 min  
**Code:** ✅ `vercel.json`, `.env.example` done

```bash
cd apps/web && vercel
```

Env vars: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`  
Custom domains: `reelroutes.app` and `www.reelroutes.app`

---

### Custom Domains — DNS

**Blocked by:** DNS / registrar access

- API: CNAME `api.reelroutes.app → <railway>.up.railway.app`
- Web: CNAME/A `reelroutes.app → vercel`

---

### App Store Assets — Screenshots & Preview

**Blocked by:** Working build on real device  
**Time:** ~2 hours

1. Install EAS preview build via TestFlight
2. Record share flow: YouTube → Share → ReelRoutes → map pins drop
3. Screenshots (6.7" iPhone): share sheet, processing, map, itinerary, Wrapped
4. Capture **Plan from Scratch** flow: destination → wizard → curated map
5. Google Play feature graphic (1024×500px)
6. Upload to App Store Connect + Google Play Console

---

### App Store Submission

**Blocked by:** Assets + Apple/Google accounts + EAS production build

```bash
eas build --platform ios --profile production && eas submit --platform ios
eas build --platform android --profile production && eas submit --platform android
```

Store listings are in `apps/mobile/store-listings/*.md` (5 languages).

---

## 🛠 Development Tasks (Unblocked)

These are ready to build — no external access needed.

### 1. Open Now Badge on Map Pins

**Effort:** ~30 min  
**Value:** High — visual quality, data already available

`PinDocument.open_now: bool | null` is stored from Google Places.

- Mobile: overlay green/red/grey dot on `<Marker>` in `app/trip/[tripId].tsx`
- Web: same badge on map markers in `TripMapPage`

---

### 2. Trending Feed Cache

**Effort:** ~20 min  
**Value:** Medium — reduces DB load at scale

Add 5-minute in-memory TTL cache to `GET /api/explore/trending` in `app/routers/explore.py`.

---

### 3. Plan from Scratch — Deep Link Entry

**Effort:** ~1 hour  
**Value:** High — discoverability

Add a "Plan a trip" deep link / card to the home screen tab so users
discover scratch planning without having to find it buried in new-trip flow.

- Mobile: add card to `app/(tabs)/index.tsx`
- Web: add CTA to `ImportPage.tsx` or a new `HomePage`

---

### 4. Plan from Scratch — Share/Export Curated Plan

**Effort:** ~2 hours  
**Value:** High — virality

After confirming a plan, show a shareable summary card (Mapbox static
snapshot + destination + days + top 3 stops). Hook into existing
`FlyoverSheet` / `WrappedCard` pattern.

---

### 5. Itinerary Refinement Chat

**Effort:** ~3 hours  
**Value:** High — retention

After a plan is confirmed, surface the AI chat drawer pre-seeded with
context about the scratch-planned trip (destination, days, stops). Currently
chat works for video-imported trips only — extend it to scratch trips by
passing `source: "scratch"` context in the system prompt.

---

### 6. Push Notification — Plan Ready

**Effort:** ~1 hour  
**Value:** Medium

When `POST /trips/plan/confirm` completes, fire `send_trip_ready()` to
notify the user their curated plan has been saved. Infrastructure is
already wired — just needs the call added to `trip_builder.py`.

---

### 7. Test Coverage — Remaining 17%

**Effort:** ~3 hours  
**Value:** Medium — hygiene

Current coverage: **83%**. Next targets:

- `routers/trip_extras.py` (54%) — 62 uncovered lines, mostly HTTP handler branches
- `services/geocoding/storage.py` (67%) — `geocoded_locations_to_pins` branches
- `adapters/youtube.py` (67%) — ytdlp error path branches
- `services/expense_service.py` (73%) — settlement calculation paths

---

### 8. Rate Limit Middleware Tests

**Effort:** ~1 hour  
**Value:** Medium

`app/middleware/rate_limit.py` is at 25% coverage. The Redis-dependent
paths need `fakeredis` or a mock. Add to a new `tests/middleware/` suite.

---

### 9. Mobile — Plan Wizard Google Maps Integration

**Effort:** ~30 min (keys only)  
**Value:** Blocker for real-device use

Add `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` to `apps/mobile/eas.json` preview
and production env sections. Currently the key is read from env but not
set in the EAS build profiles.

---

### 10. Web — PlanEntryPage Route Registration

**Effort:** ~15 min  
**Value:** Required for web launch

Confirm `PlanEntryPage` is registered in `App.tsx` router and linked
from the main nav. Check that `NavBar.tsx` has a "Plan a trip" link.
