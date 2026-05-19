# SAVIQ

[![Backend: FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](backend/)
[![Web: React + Vite](https://img.shields.io/badge/web-React%20%2B%20Vite-61DAFB?logo=react&logoColor=111)](web/)
[![Mobile: Expo](https://img.shields.io/badge/mobile-Expo-000020?logo=expo&logoColor=white)](frontend/)
[![Database: MongoDB](https://img.shields.io/badge/database-MongoDB-47A248?logo=mongodb&logoColor=white)](backend/)
[![Tests: Pytest + Playwright](https://img.shields.io/badge/tests-pytest%20%7C%20node:test%20%7C%20Playwright-6E40C9)](tests/)

**Financial intelligence for modern households and solo operators.**  
SAVIQ combines transaction tracking, forecasting, savings planning, and AI guidance across web and mobile in one profile-aware platform.

> **Current posture:** feature-complete for internal beta, with remaining runtime/device validation and observability work before broader rollout.

---

## Table of Contents

- [Why SAVIQ](#why-saviq)
- [Core Differentiators](#core-differentiators)
- [Feature Highlights](#feature-highlights)
- [Profile Model (Current Scope)](#profile-model-current-scope)
- [Architecture Overview](#architecture-overview)
- [AI Stack and Degradation Behavior](#ai-stack-and-degradation-behavior)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Testing](#testing)
- [Mobile & Runtime Notes](#mobile--runtime-notes)
- [Release Readiness](#release-readiness)
- [Roadmap (Near-Term)](#roadmap-near-term)

---

## Why SAVIQ

Most expense apps answer **“what happened?”**. SAVIQ is designed to answer:

- **What is happening now?** (real-time spend visibility)
- **What is likely next?** (forecasting + budget risk)
- **What should I do?** (AI recommendations and guided savings)

SAVIQ exists to help users make confident financial decisions, not just log transactions.

## Core Differentiators

- **AI-native financial UX:** conversational and card-based insights integrated directly into product flows.
- **Forecast + action loop:** projections, confidence scoring, and recommendation layers tied to savings goals and budget posture.
- **Cross-platform continuity:** web and Expo mobile surfaces cover the same core financial workflows.
- **Profile-aware data boundaries:** personal/business/shared profile contexts with explicit scoped rendering and data access.

---

## Feature Highlights

### 1) Financial Dashboard & Smart Metrics
- Net balance, income, spend, month-over-month movement, top goal summary.
- Smart metrics including savings score, spend velocity, financial health, budget confidence, and projected savings.
- Loading/empty/error state handling across dashboard cards and widgets.

### 2) Goals, Budgets, and Planning
- Savings goals CRUD with progress, milestones, projected completion dates, and monthly recommendation support.
- Budget tracking with risk-oriented visibility and profile-aware filtering.
- Priority goal surfacing from dashboard context.

### 3) Forecasting & Risk Intelligence
- 7-day and 30-day projection windows.
- Month-end spend forecasting and velocity modeling.
- Budget exceed risk and confidence scoring with plain-language explanation layers.

### 4) AI-Powered Intelligence
- Smart insights and recommendations on dashboard surfaces.
- AI receipt scanning endpoint support.
- AI chat insights (`/ai/chat-insights`) with prompt suggestions, retry/failure handling, and profile-isolated conversation context.

### 5) Weekly Digest & Recurring Spend Detection
- Weekly financial digest with narrative summary, income/expense delta, and profile switching support.
- Recurring spend detection with subscription candidates and monthly recurring totals.

### 6) Exports
- Data export endpoints for CSV and JSON scoped by profile/date windows.

### 7) Mobile Coverage
- Route-level coverage across dashboard, transactions, budgets, goals, analytics, and AI chat flows.
- Mobile-first interaction patterns, dark mode support for primary flows, and profile switching restore behavior.

---

## Profile Model (Current Scope)

SAVIQ supports profile switching with explicit `profile_type` values:

- `personal`
- `business`
- `shared`

Important scope boundary:

- `business` currently represents profile context and data partitioning, **not** a full multi-user organization account model.
- Ownership remains single-user scoped per authenticated account.
- Team memberships, invitations, shared ownership, and role-based org collaboration are not implemented yet.

---

## Architecture Overview

| Layer | Stack | Notes |
|---|---|---|
| Backend API | Python, FastAPI, Pydantic, Motor/PyMongo | Session/auth flows, profile-scoped data model, analytics/forecast/AI endpoints |
| Database | MongoDB | Collections + startup index initialization (including TTL on sessions) |
| Web App | React + Vite, Tailwind, Recharts | Product UI, dashboards, goals, analytics, exports, AI chat |
| Mobile App | React Native (Expo) | Cross-platform mobile experience with backend auth integration |
| Shared Logic | `shared/` TypeScript package | Shared constants/types/utils across app surfaces |
| Testing | `pytest`, `node:test`, Playwright | Backend coverage + web logic/E2E + mobile helper/orchestration tests |

---

## AI Stack and Degradation Behavior

### Primary dependency
- OpenAI integration is wired via backend service layer and environment configuration.

### Optionality
- AI-specific configuration is optional for core CRUD and analytics flows.
- If AI is unavailable or disabled, core expense tracking, budgets, goals, and non-AI analytics remain available.

### Feature control
- `ENABLE_AI_FEATURES` can be used to gate AI behavior by environment.
- OpenAI model/runtime values are configured via backend environment variables.

---

## Environment Setup

> ⚠️ **Important:** Backend runtime loads env from `backend/.env` (not only repo root). Copy from `backend/.env.example`.

### Minimum required variables (core backend persistence)

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=expense_tracker
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8081
JWT_SECRET=replace_with_long_random_secret
```

### Client connectivity variables

- Web: `VITE_BACKEND_URL` (recommended; production build expects this outside localhost).
- Mobile (Expo): `EXPO_PUBLIC_BACKEND_URL`.

### Optional integrations

- OpenAI (`OPENAI_API_KEY`, model vars) for AI features.
- Google/Apple auth for social login endpoints.
- Telemetry providers (Sentry/PostHog) and additional infrastructure integrations are scaffolded in env templates but not required for core local operation.

---

## Local Development

### 1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8001
```

### 2) Web

```bash
cd web
npm install
npm run dev
```

### 3) Mobile (Expo)

```bash
cd frontend
npm install
npm run start
```

Set `EXPO_PUBLIC_BACKEND_URL` to a backend URL reachable from your emulator/device.

---

## Testing

### Backend
```bash
pytest
```

### Web logic tests
```bash
node --test web/src/lib/*.test.mjs
```

### Web E2E (smoke/core flows)
```bash
npx playwright test
```

### Build checks
```bash
cd web && npm run build
```

---

## Mobile & Runtime Notes

- Automated mobile coverage currently emphasizes high-signal helper/state/orchestration logic.
- Full mobile UI E2E/device-matrix validation is intentionally not yet exhaustive.
- Additional runtime validation remains necessary for:
  - gesture behavior
  - lifecycle handling
  - deep links
  - notifications

This is the primary remaining validation gap between internal beta and wider rollout confidence.

---

## Release Readiness

| Area | Status |
|---|---|
| Feature scope (V2) | ✅ Complete |
| Web + mobile route parity | ✅ Complete |
| Backend/API implementation | ✅ Complete for core flows |
| Automated tests | ✅ Strong (backend + web + targeted mobile logic) |
| Device/runtime validation | ⛔ Pending final pass |
| Observability hardening | ⚠️ Minimal / in progress |

**Current release posture:** ready for **internal beta** and controlled usage; not yet positioned as broad production rollout.

---

## Roadmap (Near-Term)

1. **Observability hardening**
   - Crash tracking and key analytics instrumentation.
2. **Export expansion**
   - PDF export support to complement CSV/JSON.
3. **Device/runtime confidence**
   - Broader on-device validation across lifecycle/deep-link/notification scenarios.
4. **Collaboration & business profile evolution**
   - Team/org primitives (roles, memberships, invitations, shared ownership).

---

SAVIQ is already a strong internal-beta product baseline: feature-complete, cross-platform, and AI-augmented. The remaining work is operational hardening and runtime validation for larger-scale rollout.
