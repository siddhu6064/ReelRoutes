# ReelRoutes — Deployment Secrets Checklist

Use this before every deploy to staging or production.
Check off each item — every blank = a broken feature.

## Backend (Railway)

### Required — app won't start without these

- [ ] `ENV` = `staging` or `production`
- [ ] `MONGODB_URL` — Atlas connection string (SRV format)
- [ ] `MONGODB_DB` = `reelroutes`
- [ ] `REDIS_URL` — Upstash or Railway Redis

### Auth — Clerk

- [ ] `CLERK_SECRET_KEY` — `sk_live_...` (not test key)
- [ ] `CLERK_PUBLISHABLE_KEY` — `pk_live_...`
- [ ] `CLERK_WEBHOOK_SECRET` — from Clerk Dashboard → Webhooks

### AI & Geocoding

- [ ] `OPENAI_API_KEY` — with GPT-4o + Whisper access
- [ ] `GOOGLE_PLACES_API_KEY` — Places API + YouTube Data API v3 enabled
- [ ] `YOUTUBE_API_KEY` — same key or separate, YouTube Data API v3 enabled

### Observability

- [ ] `SENTRY_DSN` — project DSN from sentry.io
- [ ] `SENTRY_ENVIRONMENT` = `production`

### CORS

- [ ] `CORS_ORIGINS` = `https://reelroutes.app` (no trailing slash)

---

## Frontend (Vercel)

- [ ] `VITE_API_URL` = `https://api.reelroutes.app`
- [ ] `VITE_WS_URL` = `wss://api.reelroutes.app`
- [ ] `VITE_GOOGLE_MAPS_API_KEY` — Maps JavaScript API enabled, HTTP referrer restricted to your domain
- [ ] `VITE_CLERK_PUBLISHABLE_KEY` — same as backend `CLERK_PUBLISHABLE_KEY`

---

## Clerk Dashboard Setup

- [ ] Allowed redirect URLs include `https://reelroutes.app`
- [ ] Webhook endpoint added: `https://api.reelroutes.app/api/webhooks/clerk`
- [ ] Webhook events enabled: `user.created`, `user.updated`
- [ ] Social login: Google OAuth configured with production credentials

## Google Cloud Console

- [ ] Places API enabled
- [ ] YouTube Data API v3 enabled
- [ ] Maps JavaScript API enabled
- [ ] API key restricted to your domain (HTTP referrer restriction)
- [ ] Billing account attached (required for Places API)

## MongoDB Atlas

- [ ] IP allowlist includes Railway egress IPs (or set to 0.0.0.0/0 for Railway)
- [ ] DB user has `readWrite` on `reelroutes` database
- [ ] Backup enabled

## Pre-deploy smoke test

After deploy, hit these endpoints and confirm 200:

```bash
curl https://api.reelroutes.app/health
curl https://api.reelroutes.app/version
```

Then run a real import:

```bash
poetry run python demo.py https://www.youtube.com/watch?v=dQw4w9WgXcQ
```
