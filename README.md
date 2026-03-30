# ReelRoutes V4

> Paste a YouTube, Instagram, TikTok, or Facebook travel video URL.  
> ReelRoutes extracts every location mentioned, geocodes them, and builds an interactive trip map — in under 60 seconds.

---

## What is this?

ReelRoutes turns travel content creators' videos into actionable trip plans. A user imports any travel video URL; the AI pipeline transcribes the audio, extracts location mentions, geocodes them via Google Places, and returns a numbered map with pins the user can edit, chat with, and share.

**V4** adds full mobile support (Expo React Native), MongoDB as the primary datastore (replacing PostgreSQL), an AI trip-chat feature, and a complete web redesign.

---

## Architecture

```
reelroutes/
├── apps/
│   ├── api/          FastAPI — async Python backend
│   │   ├── app/
│   │   │   ├── routers/       Route handlers (thin)
│   │   │   ├── services/      Business logic
│   │   │   ├── repositories/  MongoDB persistence (Beanie ODM)
│   │   │   ├── models/        Beanie document models
│   │   │   ├── workers/       ARQ async job workers
│   │   │   └── config.py      Settings / env
│   │   └── tests/
│   │
│   ├── web/          React 18 + Vite — web app
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── hooks/
│   │       ├── stores/        Zustand state
│   │       └── api/           TanStack Query + typed fetch
│   │
│   └── mobile/       Expo React Native — iOS + Android
│       └── src/
│           ├── app/           Expo Router file-based routes
│           ├── components/
│           ├── hooks/
│           └── stores/
│
└── packages/
    └── shared/       TypeScript types shared across web + mobile
        └── src/
            ├── types/         Trip, Pin, Job, User, Extraction, API
            └── index.ts       Single barrel export
```

### Key technology decisions

| Concern | Choice | Why |
|---|---|---|
| Backend | FastAPI + Python 3.12 | Async, fast, excellent AI/ML ecosystem |
| Database | MongoDB Atlas + Beanie ODM | Flexible schema for embedded pins; no joins needed |
| Job queue | ARQ (Redis-backed) | Lightweight async workers; integrates cleanly with FastAPI |
| Auth | Clerk | Handles Google + Apple OAuth; free tier generous |
| AI extraction | OpenAI GPT-4o | Best structured output quality for location extraction |
| Transcription | Whisper API (fallback) | Used when video has no captions; YouTube CC preferred |
| Geocoding | Google Places API | Most accurate; enables canonical placeId for deduplication |
| Web frontend | React 18 + Vite + TanStack Query | Fast DX; excellent SSE support for job progress streaming |
| Web maps | Google Maps JS API | Best data quality; Places Autocomplete integration |
| Mobile | Expo + Expo Router | Single codebase for iOS + Android; EAS Build for deploys |
| Mobile maps | react-native-maps (Google provider) | Consistent map style with web |
| Analytics | PostHog | Self-hostable; good session replay |
| Error monitoring | Sentry | FastAPI + React SDKs both excellent |
| Web deploy | Vercel | Preview deploys on every PR |
| API deploy | Railway | Postgres-less; easy env management |

---

## Local Development

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)
- Python 3.12 (`pyenv` recommended)
- Poetry (`pip install poetry`)
- MongoDB running locally **or** a free [MongoDB Atlas](https://cloud.mongodb.com) cluster
- Redis running locally (for job queue) — `docker run -p 6379:6379 redis:7`

### First-time setup

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-org/reelroutes.git
cd reelroutes

# 2. Install JS dependencies (all workspaces)
pnpm install

# 3. Build the shared types package
pnpm --filter shared build

# 4. Install Python dependencies
cd apps/api && poetry install && cd ../..

# 5. Set up environment variables
cp .env.example .env
# Edit .env and fill in your keys (see Environment Variables section below)
cp .env.test.example .env.test

# 6. Install Git hooks
pnpm prepare
```

### Running the stack

```bash
# Run API + web together (recommended during development)
pnpm dev

# Run individually
pnpm dev:api      # FastAPI on http://localhost:8000
pnpm dev:web      # React/Vite on http://localhost:5173

# Run the job worker (needed for video processing)
cd apps/api && poetry run arq app.workers.main.WorkerSettings

# Run mobile (requires Expo Go app or simulator)
pnpm --filter mobile start
```

### Running tests

```bash
# All JS/TS tests
pnpm test

# All Python tests
pnpm test:api

# Watch mode (web)
pnpm --filter web test

# With coverage (API)
cd apps/api && poetry run pytest --cov=app -v
```

### Useful commands

```bash
pnpm lint          # Lint all workspaces
pnpm typecheck     # TypeScript check all workspaces
pnpm format        # Prettier format everything
pnpm format:check  # Check formatting (used in CI)
```

---

## Environment Variables

All secrets live in `.env` (local) and `.env.test` (tests). Both are git-ignored.

See [`.env.example`](.env.example) for the full list with descriptions.

The minimum set to get the app running locally:

```
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=reelroutes_local
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
OPENAI_API_KEY=sk-...
GOOGLE_PLACES_API_KEY=...
YOUTUBE_API_KEY=...
VITE_API_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## Coding Standards

### TypeScript

- Strict mode is **non-negotiable** — all flags on in `tsconfig.base.json`
- No `any` without an explicit `// eslint-disable-next-line` comment explaining why
- Use `type` imports: `import type { Trip } from "@reelroutes/shared"`
- Prefer `interface` for object shapes, `type` for unions/intersections
- All async functions must have explicit return types

### Python

- Python 3.12 with full type annotations — all functions typed
- Ruff for formatting + linting (replaces Black + Flake8)
- Mypy in strict mode (`--strict`)
- Pydantic v2 for all request/response validation
- No `# type: ignore` without a comment explaining why

### Git workflow

- Branch off `develop`, not `main`
- Branch naming: `feat/short-description`, `fix/short-description`
- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):
  ```
  feat(api): add trip extraction endpoint
  fix(web): correct map pin reorder drag state
  chore: update pnpm lockfile
  ```
- Every PR requires passing CI before merge
- No direct pushes to `main` or `develop`

### Testing

- New API endpoints must have router-level tests
- New service functions must have unit tests
- Test files live alongside source: `trip.service.test.ts`, `test_trip_service.py`
- Aim for ≥ 80% coverage on service layer
- Integration tests that need MongoDB use the `reelroutes_test` database

### Work cadence

> Work only **1–2 tasks at a time**. Each task should result in code, tests, and validation before moving on.

---

## Phases & Roadmap

| Phase | Weeks | Focus |
|---|---|---|
| 1 | 1–2 | Foundation, monorepo, FastAPI skeleton, MongoDB |
| 2 | 3–4 | Core data models, Trip/Pin/Job services |
| 3 | 5–6 | Video ingestion, transcription, AI extraction |
| 4 | 7–8 | Geocoding, map UI, trip detail view |
| 5 | 9–12 | Auth, polish, share, analytics, deployment |
| 6 | 13–14 | Mobile (Expo React Native), App Store |

Full checklist: [`reelroutes_v4_checklist.html`](./reelroutes_v4_checklist.html)

---

## Contributing

Open an issue before starting significant work. Reference the checklist task in your PR description.
# ReelRoutes
# ReelRoutes
