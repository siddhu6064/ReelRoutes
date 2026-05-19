# Deployment Guide

SAVIQ — a modern cross-platform expense tracker with AI-powered insights.

## Required Environment Variables

### Backend
- `APP_ENV` (`development` | `staging` | `production`)
- `MONGO_URL`
- `DB_NAME`
- `ALLOWED_ORIGINS` (comma-separated)
- `SESSION_DAYS` (optional, default `7`)
- `LOG_LEVEL` (optional, default `INFO`)
- `REQUEST_LOGGING_ENABLED` (optional, default `true`)
- `RATE_LIMIT_ENABLED` (optional, default `true`)
- `SECURE_COOKIES` (optional, defaults `true` in prod)
- `COOKIE_SAMESITE` (optional: `lax|strict|none`)
- `COOKIE_DOMAIN` (optional)

### Frontend (web)
- `VITE_BACKEND_URL` (required for non-local production/staging builds)

## Local Development

### Backend
```bash
cd backend
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8001
```

### Web
```bash
cd web
npm ci
npm run dev
```

## Production/Staging Build + Run

### Web build
```bash
cd web
VITE_BACKEND_URL=https://api.your-domain.com npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

### Backend run
```bash
cd backend
APP_ENV=production \
MONGO_URL=<mongo-url> \
DB_NAME=expense_tracker \
ALLOWED_ORIGINS=https://app.your-domain.com \
uvicorn main:app --host 0.0.0.0 --port 8001
```

## Health / Readiness Endpoints
- `GET /health` and `GET /healthz`
- `GET /ready` and `GET /readyz`

Use readiness endpoint for rollout gating.

## CI / E2E Notes
- Install Playwright browser before E2E:
```bash
npx playwright install --with-deps chromium
```

## Rollback Basics
1. Re-deploy previous known-good backend + frontend artifacts.
2. Verify `/ready` returns `ready`.
3. Run smoke E2E or core manual checks.
4. Review logs for elevated 5xx/auth failures.


## CI Expectations
- Backend tests: `pytest tests/backend/test_api_backend.py -q`
- Web build: `npm --prefix web run build`
- Playwright smoke: `npx playwright test tests/e2e/smoke.spec.ts --config=playwright.config.ts`


## Staging Verification Steps
1. Register + login
2. Create, edit, and delete a transaction
3. Verify analytics and budgets pages load
4. Verify export CSV/JSON actions
5. Verify delete-account flow
6. Verify fallback UIs (error boundary + API failure banner)
