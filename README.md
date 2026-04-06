# ReelRoutes V4

> Paste any YouTube, TikTok, Instagram, Facebook, or X travel video URL.  
> ReelRoutes extracts every location with AI and builds an interactive, navigable trip map — in under 60 seconds.

---

## What is it?

ReelRoutes turns travel creators' videos into actionable trip plans. Paste a video URL → GPT-4o reads the transcript → locations are geocoded via Google Places → an interactive map appears with every stop numbered and ready to navigate.

**Key differentiator:** Share any video directly from YouTube, Instagram, TikTok, or any browser using the native iOS Share Extension or Android intent handler. One tap — no copy-pasting.

---

## Features

| Feature                   | Description                                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| 📥 Video import           | YouTube, Instagram, TikTok, Facebook, X — paste URL or share from any app |
| 📍 AI location extraction | GPT-4o + Whisper fallback extracts every visitable place                  |
| 🗺 Interactive map        | Pins, route polyline, open/closed indicators, city grouping               |
| 📅 Day-by-day itinerary   | AI groups pins into days with travel times                                |
| 🚗 Route optimisation     | Nearest-neighbour TSP, before/after distance comparison                   |
| ✅ Visit tracking         | Mark stops visited, add diary notes, auto-visit via GPS                   |
| 💬 AI travel chat         | Ask anything about your trip — recommendations, budget, tips              |
| 👥 Collaboration          | Invite editors/viewers via share link                                     |
| 💰 Budget tracking        | Expenses with splitting and settlement                                    |
| 📤 Share Extension        | iOS Share Extension + Android intent — share from any video app           |
| 🌍 Multilingual           | English, Spanish, Japanese, Korean, Portuguese                            |
| 📴 Offline                | Cached trips work without signal                                          |
| 📖 Travel book            | Export trip as printable PDF layout (Lulu/Blurb compatible)               |
| 🎬 Flyover                | Mapbox static preview image for social sharing                            |
| 🏎 CarPlay                | Stop list + "Navigate to next stop" action                                |

---

## Architecture

```
reelroutes/
├── apps/
│   ├── api/          # FastAPI backend (Python 3.12)
│   ├── web/          # React + Vite web app (TypeScript)
│   └── mobile/       # Expo React Native (iOS + Android)
└── packages/
    └── shared/       # Shared TypeScript types
```

| Layer      | Tech                            | Notes                                          |
| ---------- | ------------------------------- | ---------------------------------------------- |
| API        | FastAPI + Uvicorn               | Async, ~675 tests, 75% coverage                |
| Database   | MongoDB Atlas + Beanie ODM      | Embedded pins, TTL indexes                     |
| Job queue  | ARQ + Redis                     | Async video processing pipeline                |
| AI         | GPT-4o + Whisper                | Extraction, chat, suggestions, book layout     |
| Geocoding  | Google Places API               | Places, Routes, Geocoding                      |
| Mobile     | Expo Router + react-native-maps | EAS Build, Share Extension                     |
| Web deploy | Vercel                          | `vercel.json` configured, auto-deploys on push |
| API deploy | Railway                         | `Procfile` + `railway.toml`, nixpacks + ffmpeg |
| Auth       | Clerk                           | JWT on API, ClerkProvider on web and mobile    |
| Errors     | Sentry                          | FastAPI + ARQ integration, 4xx filtered        |
| Analytics  | PostHog                         | Server-side event tracking                     |

---

## Local development

```bash
# Install dependencies
pnpm install --no-frozen-lockfile

# API
cd apps/api
cp .env.example .env          # fill in your keys
poetry install
poetry run uvicorn app.main:app --reload

# ARQ worker (separate terminal)
poetry run arq app.workers.job_worker.WorkerSettings

# Web
cd apps/web
pnpm dev                       # http://localhost:5173

# Mobile
cd apps/mobile
pnpm expo start                # scan QR with Expo Go (limited)
# For share extension testing:
eas build --platform ios --profile preview
```

---

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full step-by-step guide.

| Service | Platform  | Config                               |
| ------- | --------- | ------------------------------------ |
| API     | Railway   | `apps/api/Procfile` + `railway.toml` |
| Web     | Vercel    | `apps/web/vercel.json`               |
| Mobile  | EAS Build | `apps/mobile/eas.json`               |

**Pending manual steps** (requires external account access): see [`PENDING_TASKS.md`](./PENDING_TASKS.md).

---

## Environment variables

| Variable                     | Service | Required           |
| ---------------------------- | ------- | ------------------ |
| `MONGODB_URL`                | Railway | ✅                 |
| `REDIS_URL`                  | Railway | ✅                 |
| `OPENAI_API_KEY`             | Railway | ✅                 |
| `GOOGLE_PLACES_API_KEY`      | Railway | ✅                 |
| `CLERK_SECRET_KEY`           | Railway | ✅                 |
| `SENTRY_DSN`                 | All     | Optional           |
| `MAPBOX_TOKEN`               | Railway | Optional (flyover) |
| `VITE_API_URL`               | Vercel  | ✅                 |
| `VITE_CLERK_PUBLISHABLE_KEY` | Vercel  | ✅                 |
| `EXPO_PUBLIC_API_URL`        | EAS     | ✅                 |

Full reference: `apps/api/.env.example` and `apps/web/.env.example`

---

## Testing

```bash
cd apps/api
poetry run pytest tests/ -q --tb=short --cov=app
# 686 tests · 75% coverage
```

CI runs on every push: Python lint + tests, TypeScript typecheck (web + mobile + shared), Prettier format check, web build.

---

## iOS Share Extension

Users can share any video URL directly from YouTube, Instagram, TikTok, or any browser:

1. Open any travel video in any app
2. Tap the native **Share** button
3. Choose **ReelRoutes** from the share sheet
4. Import starts automatically — no copy-pasting

**iOS:** Powered by `expo-share-intent` — App Group entitlement configured in `app.json`.  
**Android:** `ACTION_SEND` + `ACTION_VIEW` intent filters — catches shares from all apps and "Open with" on URLs.

To test: run `eas build --platform ios --profile preview` and install via TestFlight.

---

## Roadmap status

All 5 phases of the Grand Roadmap complete. See [`PENDING_TASKS.md`](./PENDING_TASKS.md) for the remaining launch steps (deployment credentials, App Store submission, DNS).
