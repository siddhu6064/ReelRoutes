# ReelRoutes — Release Checklist

Run this before every production deploy. Check every box.

---

## Pre-deploy (local)

- [ ] `ENV=test poetry run pytest tests/` — all passing
- [ ] `git log --oneline -5` — confirm you're deploying the right commit
- [ ] `.env.production.example` — all vars accounted for in Railway + Vercel
- [ ] No hardcoded secrets in source (`grep -r "sk-" apps/ --include="*.py" --include="*.ts"`)

---

## Deploy — API (Railway)

### Steps

1. Push to `siddhu6064` branch on GitHub
2. Railway auto-deploys from the connected branch
3. Watch build logs in Railway dashboard

### Verify health

```bash
curl https://api.reelroutes.app/health
# Expected: {"ok": true, "data": {"status": "healthy", "db": "connected", "latency_ms": <N>}}

curl https://api.reelroutes.app/version
# Expected: {"ok": true, "data": {"version": "0.1.0", "env": "production"}}
```

### Smoke test — import flow

```bash
curl -X POST https://api.reelroutes.app/api/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# Expected: {"ok": true, "data": {"jobId": "...", "status": "queued"}}
```

---

## Deploy — Web (Vercel)

### Steps

1. Push to `siddhu6064` branch on GitHub
2. Vercel auto-deploys from the connected branch
3. Preview URL available in Vercel dashboard

### Verify

- [ ] `https://reelroutes.app` loads the import page
- [ ] Paste a YouTube URL → Import → processing screen shows 5 steps
- [ ] Trip map page renders pins correctly
- [ ] Share link generates and `/share/:token` loads without auth

---

## Post-deploy smoke tests (5 min)

Run in order — each depends on the previous:

| #   | Action                               | Expected                               |
| --- | ------------------------------------ | -------------------------------------- |
| 1   | Open `https://reelroutes.app`        | Import page loads in <2s               |
| 2   | Paste YouTube URL, click Import      | Redirects to `/processing/:jobId`      |
| 3   | Processing page runs                 | 5 steps complete, redirects to map     |
| 4   | Trip map shows pins                  | Coral numbered markers on dark map     |
| 5   | Click a pin                          | Detail panel slides in with place name |
| 6   | Open AI chat, send "Build itinerary" | Reply in <10s                          |
| 7   | Click Share → copy link              | `/share/:token` loads read-only view   |
| 8   | Visit share link incognito           | Map visible, "Import your video" CTA   |
| 9   | Check Sentry dashboard               | No new errors                          |
| 10  | Check Railway logs                   | No 5xx errors in last 5 min            |

---

## Rollback procedure

### API (Railway)

```bash
# In Railway dashboard: Deployments → previous build → Redeploy
# Or via CLI:
railway rollback
```

### Web (Vercel)

```bash
# In Vercel dashboard: Deployments → previous build → Promote to Production
# Or via CLI:
vercel rollback
```

### Database

- MongoDB Atlas: point-in-time recovery available (Atlas M10+ clusters)
- No schema migrations needed — Beanie handles field additions gracefully

---

## Monitoring links

| Service        | URL                                                |
| -------------- | -------------------------------------------------- |
| Railway logs   | `https://railway.app/project/YOUR_PROJECT`         |
| Vercel logs    | `https://vercel.com/YOUR_TEAM/reelroutes`          |
| Sentry errors  | `https://sentry.io/organizations/YOUR_ORG/issues/` |
| PostHog events | `https://app.posthog.com/project/YOUR_PROJECT`     |
| MongoDB Atlas  | `https://cloud.mongodb.com/v2/YOUR_PROJECT`        |
| Upstash Redis  | `https://console.upstash.com`                      |

---

## Alert thresholds (set in Sentry / Railway)

- Error rate > 1% → page on-call
- P95 response time > 5s → investigate
- Job failure rate > 10% → check OpenAI / Google Places keys
- MongoDB connection errors → check Atlas IP allowlist
