# ReelRoutes V4

> Paste any YouTube, TikTok, Instagram, Facebook, or X travel video URL.  
> ReelRoutes extracts every location with AI and builds an interactive, navigable trip map — in under 60 seconds.  
> Or skip the video entirely — describe where you're going and let AI plan the whole itinerary from scratch.

---

## What is it?

ReelRoutes turns travel content into actionable trip plans — two ways:

**Import from video** — Paste a video URL → GPT-4o reads the transcript → locations are geocoded via Google Places → an interactive map appears with every stop numbered and ready to navigate.

**Plan from scratch** — Tell us your destination, how many days, and your vibe → GPT-4o generates a personalised itinerary → Google Places geocodes and enriches every stop → you curate, drag-to-reorder, swap restaurants, and save.

**Key differentiator:** Share any video directly from YouTube, Instagram, TikTok, or any browser using the native iOS Share Extension or Android intent handler. One tap — no copy-pasting.

---

## Features

| Feature | Description |
| --- | --- |
| 📥 Video import | YouTube, Instagram, TikTok, Facebook, X — paste URL or share from any app |
| ✨ Plan from scratch | AI-generated itinerary from destination + preferences, no video needed |
| 📍 AI location extraction | GPT-4o + Whisper fallback extracts every visitable place |
| 🗺 Interactive map | Pins, route polyline, open/closed indicators, city grouping |
| 📅 Day-by-day itinerary | AI groups pins into days with travel times |
| 🍽 Food slot injection | Breakfast, lunch, dinner options injected per day (3 choices each) |
| 🔀 Drag-to-reorder | Reorder stops within a day on web and mobile |
| 🚗 Route optimisation | Nearest-neighbour TSP, before/after distance comparison |
| ✅ Visit tracking | Mark stops visited, add diary notes, auto-visit via GPS |
| 💬 AI travel chat | Ask anything about your trip — recommendations, budget, tips |
| 👥 Collaboration | Invite editors/viewers via share link |
| 💰 Budget tracking | Expenses with splitting and settlement |
| 📤 Share Extension | iOS Share Extension + Android intent — share from any video app |
| 🌍 Multilingual | English, Spanish, Japanese, Korean, Portuguese |
| 📴 Offline | Cached trips work without signal |
| 📖 Travel book | Export trip as printable PDF layout (Lulu/Blurb compatible) |
| 🎬 Flyover | Mapbox static preview image for social sharing |
| 🏎 CarPlay | Stop list + "Navigate to next stop" action |

---

## Architecture

```
reelroutes/
├── apps/
│   ├── api/          # FastAPI backend (Python 3.12)
│   ├── web/          # React + Vite web app (TypeScript)
│   └── mobile/       # Expo React Native (iOS + Android)
├── packages/
│   └── shared/       # Shared TypeScript types
└── docs/             # Integration guides
```

| Layer | Tech | Notes |
| --- | --- | --- |
| API | FastAPI + Uvicorn | Async, 898 tests, 79% coverage |
| Database | MongoDB Atlas + Beanie ODM | Embedded pins, TTL indexes |
| Job queue | ARQ + Redis | Async video processing pipeline |
| AI | GPT-4o + Whisper | Extraction, planning, chat, suggestions |
| Geocoding | Google Places API | Places, Routes, Geocoding, Details |
| Mobile | Expo Router + react-native-maps | EAS Build, Share Extension |
| Web deploy | Vercel | `vercel.json` configured, auto-deploys on push |
| API deploy | Railway | `Procfile` + `railway.toml`, nixpacks + ffmpeg |
| Auth | Clerk | JWT on API, ClerkProvider on web and mobile |
| Errors | Sentry | FastAPI + ARQ integration, 4xx filtered |
| Analytics | PostHog | Server-side event tracking |

---

## Plan from Scratch — how it works

```
User inputs destination + days + preferences
        ↓
GPT-4o generates place list with local tips
        ↓
Google Places geocodes every location
        ↓
Nearest-neighbour scheduler organises stops by day
        ↓
Food injector adds 3 restaurant options per meal slot
        ↓
Places Details API enriches each stop
        ↓
Draft itinerary returned — user curates on web/mobile
        ↓
POST /trips/plan/confirm → saved TripDocument
```

### New API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/trips/plan` | Generate AI draft itinerary |
| `POST` | `/trips/plan/confirm` | Save curated plan as a trip |

### New backend services (`app/services/plan/`)

| Service | Role |
| --- | --- |
| `ai_planner` | GPT-4o place generation with JSON parsing |
| `plan_geocoder` | Batch geocoding via Google Places Text Search |
| `origin_geocoder` | Geocodes the user's starting point |
| `haversine` | Distance utility for proximity sorting |
| `scheduler` | 2-stage geographic clustering + nearest-neighbour |
| `food_injector` | Meal slot injection with radius fallback |
| `activity_enricher` | Places Details enrichment per stop |
| `trip_builder` | Saves confirmed plan as TripDocument |

### New web components (`apps/web/src/components/plan/`)

```
PlanFromScratch.tsx          Wizard container + progress bar
planStyles.css               All plan component styles
steps/
  StepOrigin.tsx             Origin + destination with Places autocomplete
  StepDays.tsx               Days stepper (1–14) with presets
  StepPreferences.tsx        7-preference chip grid
  StepLoading.tsx            Animated globe + progress while AI plans
curation/
  CurationScreen.tsx         Main layout + save CTA
  DayAccordion.tsx           Day tabs with drag-to-reorder (@dnd-kit)
  ActivityCard.tsx           Stop card with famous_for, tip, remove
  FoodSlot.tsx               3-option meal slot with skip
  RestaurantCard.tsx         Selectable restaurant card
  CurationMap.tsx            Live Google Map with activity + food pins
```

### New mobile screens (`apps/mobile/`)

```
app/plan-wizard.tsx                  Expo Router page (wizard entry)
components/plan/
  PlanMap.tsx                        react-native-maps with numbered pins
  steps/StepOrigin.tsx               Places autocomplete
  steps/StepDays.tsx                 Stepper with haptic feedback
  steps/StepPreferences.tsx          2-col chip grid with haptics
  steps/StepLoading.tsx              Animated progress bar
  curation/CurationScreen.tsx        DraggableFlatList + floating save
  curation/ActivityCardMobile.tsx    Long-press drag, tap-for-detail
  curation/FoodSlotMobile.tsx        Horizontal ScrollView restaurant cards
  curation/PlaceDetailSheet.tsx      @gorhom/bottom-sheet full detail view
```

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

| Service | Platform | Config |
| --- | --- | --- |
| API | Railway | `apps/api/Procfile` + `railway.toml` |
| Web | Vercel | `apps/web/vercel.json` |
| Mobile | EAS Build | `apps/mobile/eas.json` |

---

## Environment variables

| Variable | Service | Required |
| --- | --- | --- |
| `MONGODB_URL` | Railway | ✅ |
| `REDIS_URL` | Railway | ✅ |
| `OPENAI_API_KEY` | Railway | ✅ |
| `GOOGLE_PLACES_API_KEY` | Railway | ✅ |
| `CLERK_SECRET_KEY` | Railway | ✅ |
| `SENTRY_DSN` | All | Optional |
| `MAPBOX_TOKEN` | Railway | Optional (flyover) |
| `VITE_API_URL` | Vercel | ✅ |
| `VITE_CLERK_PUBLISHABLE_KEY` | Vercel | ✅ |
| `VITE_GOOGLE_MAPS_API_KEY` | Vercel | ✅ (plan from scratch) |
| `EXPO_PUBLIC_API_URL` | EAS | ✅ |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | EAS | ✅ (plan from scratch) |

Full reference: `apps/api/.env.example` and `apps/web/.env.example`

---

## Testing

```bash
cd apps/api
poetry run pytest tests/ -q --tb=short --cov=app
# 898 tests · 79% coverage
```

Test breakdown:

| Suite | Tests | What's covered |
| --- | --- | --- |
| Unit (services) | ~600 | Adapters, extraction, geocoding, all plan services |
| Integration | ~100 | MongoDB documents, schema validation |
| Router (HTTP) | ~160 | All endpoints including plan/confirm |
| E2E (plan pipeline) | 41 | Full scratch plan → curate → confirm flow |

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

## Mobile dependencies for Plan from Scratch

These packages need to be installed before the plan wizard works on device:

```bash
cd apps/mobile
pnpm add react-native-google-places-autocomplete react-native-maps \
  react-native-draggable-flatlist react-native-gesture-handler \
  @gorhom/bottom-sheet expo-haptics
```

(`@gorhom/bottom-sheet` and `react-native-gesture-handler` may already be installed.)

---

## Roadmap status

All 5 original phases complete. Plan from Scratch feature shipped (all 8 sub-phases, CI green). See [`PENDING_TASKS.md`](./PENDING_TASKS.md) for remaining launch steps (deployment credentials, App Store submission, DNS).
