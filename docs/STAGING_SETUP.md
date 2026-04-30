# ReelRoutes — Staging Environment Setup

One-time guide to bring up a fully isolated staging environment.
Estimated time: **~45 minutes** (mostly waiting for Railway/Vercel to provision).

---

## What Staging Gives You

| Concern | Production | Staging |
|---------|-----------|---------|
| Database | `reelroutes_production` (Atlas M10+) | `reelroutes_staging` (Atlas M0 free) |
| Auth | Clerk **live** keys (`pk_live_`) | Clerk **dev** keys (`pk_test_`) |
| Deploy trigger | Push to `main` | Push to `siddhu6064` |
| Web URL | `https://reelroutes.app` | `https://reelroutes-staging.vercel.app` |
| API URL | `https://api.reelroutes.app` | `https://reelroutes-api-staging.railway.app` |
| Sentry tag | `production` | `staging` |
| Import limit | 10/user/day | 50/user/day (for QA) |
| Data durability | Permanent | **Can be wiped at any time** |

---

## Step 1 — MongoDB Atlas (staging cluster)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a new **M0 free cluster** named `reelroutes-staging`
3. Create a database user with read/write access
4. Copy the connection string — you'll need it as `MONGODB_URL` in Railway

---

## Step 2 — Clerk (staging application)

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create a new application named **"ReelRoutes Staging"**
3. Enable: Email/Password + Google OAuth + Apple Sign-In
4. From **API Keys**, copy:
   - `CLERK_SECRET_KEY` (sk_test_...)
   - `CLERK_PUBLISHABLE_KEY` (pk_test_...)
5. From **Webhooks → Add Endpoint**:
   - URL: `https://reelroutes-api-staging.railway.app/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
   - Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET`

---

## Step 3 — Railway (staging API + Worker)

1. Go to [railway.app](https://railway.app) → **New Project**
2. Name it **"ReelRoutes Staging"**
3. **Service 1: API**
   - Deploy from GitHub → `siddhu6064/ReelRoutes` → branch: `siddhu6064`
   - Root directory: `/`
   - Build command: `cd apps/api && pip install poetry && poetry install --no-dev`
   - Start command: `cd apps/api && poetry run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Add all variables from `.env.staging.example`
4. **Service 2: Worker**
   - Add another service from the same repo
   - Start command: `cd apps/api && poetry run arq app.workers.job_worker.WorkerSettings`
5. **Redis plugin** → Add to project → Railway sets `REDIS_URL` automatically
6. From **Settings → Deploy Hooks** → copy the webhook URL → save as GitHub Secret `RAILWAY_STAGING_WEBHOOK`
7. Copy the public API domain → save as GitHub Secret `STAGING_API_URL`

---

## Step 4 — Vercel (staging web)

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**
2. Import `siddhu6064/ReelRoutes`
3. Set **Root Directory** to `apps/web`
4. Set **Framework** to Vite
5. Set **Build Command** to `pnpm run build`
6. Add all variables from `apps/web/.env.staging.example`
   - Make sure to select **Preview** environment (not Production)
7. Deploy → copy the preview URL → save as GitHub Secret `STAGING_WEB_URL`

---

## Step 5 — GitHub Secrets

Go to `github.com/siddhu6064/ReelRoutes` → **Settings → Secrets → Actions**

Add these secrets:

| Secret | Value |
|--------|-------|
| `RAILWAY_STAGING_WEBHOOK` | From Railway staging project → Settings → Deploy Hooks |
| `STAGING_API_URL` | `https://reelroutes-api-staging.railway.app` |
| `STAGING_WEB_URL` | `https://reelroutes-staging.vercel.app` |

---

## Step 6 — Seed staging with test data

```bash
# From repo root:
MONGODB_URL="<your-staging-atlas-url>" \
MONGODB_DB="reelroutes_staging" \
  python scripts/seed_staging.py
```

This creates 3 pre-built trips so QA testers can immediately test the UI
without importing videos.

---

## Step 7 — Verify it works

```bash
# Quick health check:
./scripts/check_staging.sh https://reelroutes-api-staging.railway.app

# Full smoke test suite:
SMOKE_TEST_URL=https://reelroutes-api-staging.railway.app \
  cd apps/api && ENV=test poetry run pytest tests/test_smoke.py -v
```

---

## Ongoing workflow

| Action | What happens |
|--------|-------------|
| Push to `siddhu6064` | CI tests → Railway staging redeploys → smoke tests run |
| Push to `main` | CI tests only (production deploy is manual via Railway dashboard) |
| Wipe staging DB | `mongosh <staging-url> --eval "db.dropDatabase()"` then re-seed |
| Mobile staging build | `cd apps/mobile && eas build --platform ios --profile staging` |

---

## Mobile testing on staging

```bash
# Build and distribute to TestFlight internal group:
cd apps/mobile
eas build --platform ios --profile staging
```

The `staging` EAS profile in `eas.json` points at the Railway staging API
and uses `pk_test_` Clerk keys — completely isolated from production.
