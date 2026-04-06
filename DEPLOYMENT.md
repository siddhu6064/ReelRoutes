# ReelRoutes — Deployment Guide

Three services to deploy: **API** (Railway), **Web** (Vercel), **Mobile** (EAS).

---

## Prerequisites

- Railway account → railway.app
- Vercel account → vercel.com
- MongoDB Atlas cluster (M0 free tier works for launch)
- Redis (Railway plugin or Upstash free tier)
- All API keys from `.env.example`

---

## 1. MongoDB Atlas

1. Create a free cluster at **cloud.mongodb.com**
2. Create database user with read/write access
3. Add `0.0.0.0/0` to IP allowlist (Railway uses dynamic IPs)
4. Copy the connection string → use as `MONGODB_URL`
5. Set `MONGODB_DB=reelroutes_production`

---

## 2. API — Railway

### First deploy

```bash
npm install -g @railway/cli
railway login
railway init          # create new project
railway link          # link to this repo
```

### Set root directory

In Railway dashboard → Service Settings → Source → **Root Directory**: `apps/api`

### Add environment variables

In Railway dashboard → Variables, add everything from `apps/api/.env.example`:

```
ENV=production
CORS_ORIGINS=https://reelroutes.app,https://www.reelroutes.app
MONGODB_URL=mongodb+srv://...
MONGODB_DB=reelroutes_production
REDIS_URL=redis://...        ← from Railway Redis plugin (add it first)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
OPENAI_API_KEY=sk-...
GOOGLE_PLACES_API_KEY=AIza...
YOUTUBE_API_KEY=AIza...
MAPBOX_TOKEN=pk.eyJ1...
SENTRY_DSN=https://...
POSTHOG_API_KEY=phc_...
```

### Add Redis plugin

Railway dashboard → New → Database → **Redis** → attach to project.
`REDIS_URL` is injected automatically.

### Add ARQ worker service

Railway dashboard → New Service → **Worker**:

- Same repo, same root directory (`apps/api`)
- Start command: `poetry run arq app.workers.job_worker.WorkerSettings`
- Same environment variables as the web service

### Custom domain

Railway dashboard → Settings → Domains → **Custom Domain**: `api.reelroutes.app`

### Verify

```bash
curl https://api.reelroutes.app/api/health
# → {"ok": true, "status": "healthy", ...}
```

---

## 3. Web — Vercel

### First deploy

```bash
npm install -g vercel
cd apps/web
vercel                # follow prompts, select existing project or create new
```

Or connect via Vercel dashboard → New Project → Import from GitHub.

### Settings in Vercel dashboard

- **Root Directory**: `apps/web`
- **Framework Preset**: Vite
- **Build Command**: `pnpm build` _(auto-detected from vercel.json)_
- **Output Directory**: `dist` _(auto-detected from vercel.json)_

### Environment variables (Vercel dashboard → Settings → Environment Variables)

```
VITE_API_URL=https://api.reelroutes.app
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_SENTRY_DSN=https://...           (optional)
VITE_POSTHOG_KEY=phc_...              (optional)
```

### Custom domains

Vercel dashboard → Settings → Domains:

- `reelroutes.app`
- `www.reelroutes.app`

### Verify

```bash
curl https://reelroutes.app
# → 200 OK, React app HTML
```

---

## 4. Mobile — EAS

### One-time setup

```bash
npm install -g eas-cli
eas login
cd apps/mobile
```

### Fill in eas.json placeholders

Edit `apps/mobile/eas.json`:

```json
"appleId": "your@apple-id.com",
"ascAppId": "1234567890",        ← from App Store Connect
"appleTeamId": "ABCDE12345"      ← 10-char team ID
```

And add real Clerk keys to the env blocks:

```json
"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_test_..."   ← preview
"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_..."   ← production
```

### Preview build (TestFlight — test share extension on real device)

```bash
eas build --platform ios --profile preview
# → Download from EAS dashboard and install via TestFlight
```

### Production build + submit

```bash
# Build
eas build --platform all --profile production

# Submit to stores
eas submit --platform ios      # → App Store Connect
eas submit --platform android  # → Google Play Console
```

### Android Digital Asset Links

After deploying the web app, update `apps/web/public/.well-known/assetlinks.json`:

1. Get SHA-256: `eas credentials --platform android`
2. Replace `REPLACE_WITH_SHA256_FROM_EAS_CREDENTIALS` with the real fingerprint
3. Redeploy web → Vercel auto-deploys on push

---

## 5. Post-deploy checklist

- [ ] `GET https://api.reelroutes.app/api/health` returns 200
- [ ] `https://reelroutes.app` loads the React app
- [ ] Import a YouTube video end-to-end (API → job → MongoDB → WebSocket)
- [ ] iOS: install TestFlight build, test YouTube → Share → ReelRoutes
- [ ] Android: install APK, test share intent
- [ ] Check Sentry dashboard for any startup errors
- [ ] Verify CORS: web app can call the API without errors
- [ ] MongoDB Atlas: verify indexes were created on first startup

---

## Environment variable reference

| Variable                            | Where                  | Notes                            |
| ----------------------------------- | ---------------------- | -------------------------------- |
| `MONGODB_URL`                       | Railway                | Atlas connection string          |
| `REDIS_URL`                         | Railway                | Auto-set by Railway Redis plugin |
| `OPENAI_API_KEY`                    | Railway                | GPT-4o extraction + chat         |
| `GOOGLE_PLACES_API_KEY`             | Railway                | Places, Geocoding, Routes APIs   |
| `YOUTUBE_API_KEY`                   | Railway                | YouTube Data API v3              |
| `MAPBOX_TOKEN`                      | Railway                | Flyover map generation           |
| `CLERK_SECRET_KEY`                  | Railway                | Server-side auth                 |
| `SENTRY_DSN`                        | Railway + Vercel + EAS | Error tracking                   |
| `VITE_API_URL`                      | Vercel                 | Points to Railway API            |
| `VITE_CLERK_PUBLISHABLE_KEY`        | Vercel                 | Client-side auth                 |
| `EXPO_PUBLIC_API_URL`               | EAS                    | Points to Railway API            |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | EAS                    | Mobile auth                      |
