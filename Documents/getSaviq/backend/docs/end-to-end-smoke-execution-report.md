# SAVIQ End-to-End Smoke Execution Report

Date: 2026-04-23 (UTC)
Execution order required: backend -> web -> mobile

## Overall status
- Backend: **BLOCKED**
- Web: **BLOCKED** (gated by backend failure per required order)
- Mobile: **BLOCKED** (gated by backend + web not passing)

---

## Part A — Backend smoke execution

### A1) Environment/setup verification (executed)
Command:
- `test -f backend/.env && echo 'backend/.env:present' || echo 'backend/.env:missing'`
- `rg -n "^(MONGO_URL|DB_NAME|SESSION_SECRET|ALLOWED_ORIGINS)=" backend/.env`
- `rg -n "load_dotenv\(ROOT_DIR / \"\.env\"\)" backend/database.py`

Observed:
- `backend/.env:missing`
- dotenv load path confirmed: `load_dotenv(ROOT_DIR / ".env")`

Result:
- Backend env file expected at `backend/.env` is missing.

### A2) Backend boot (executed)
Command:
- `uvicorn main:app --host 127.0.0.1 --port 8001` (from `backend/`)

Observed startup logs:
- `Started server process`
- `Waiting for application startup`
- then startup failure traceback from `create_indexes()` with:
  - `pymongo.errors.ServerSelectionTimeoutError`
  - `localhost:27017: [Errno 111] Connection refused`

Health probe attempt while boot was hanging/failing:
- `curl -sS -m 3 http://127.0.0.1:8001/healthz`
- result: connection failed (`Couldn't connect to server`)

Mongo runtime check:
- `nc -z 127.0.0.1 27017 && echo mongo_port_open || echo mongo_port_closed`
- result: `mongo_port_closed`
- `command -v mongod` -> `mongod_not_found`
- `command -v docker` -> `docker_not_found`

Result:
- Backend boot is blocked by unavailable MongoDB service; startup hook cannot complete index creation.

### A3) API persistence smoke flow (executed vs blocked)
Planned flow:
1. register user
2. login
3. fetch profiles
4. fetch categories
5. fetch payment methods
6. create expense
7. fetch analytics summary

Execution outcome:
- **Not executable** because backend did not start successfully.

### A4) DB persistence verification
- Direct DB verification was **blocked** (no running MongoDB, no `mongod`, no docker runtime).
- API-level DB evidence is also unavailable because backend startup failed before serving requests.

---

## Part B — Web smoke execution

Per required order, web smoke runs only after backend passes.
- Backend status is BLOCKED.
- Therefore web runtime smoke was **not executed**.

Static config check (non-runtime evidence only):
- Web uses `VITE_BACKEND_URL` with fallback `http://localhost:8001`.
- Production build throws if missing `VITE_BACKEND_URL` on non-localhost.

Runtime result:
- **BLOCKED** (dependency on backend pass).

---

## Part C — Mobile smoke execution

Per required order, mobile smoke runs only after backend + web pass.
- Backend status is BLOCKED.
- Web status is BLOCKED.
- Therefore mobile runtime smoke was **not executed**.

Static config check (non-runtime evidence only):
- Mobile uses `EXPO_PUBLIC_BACKEND_URL` with fallback `http://localhost:8001`.
- Guest mode exists and can bypass backend sync behavior.

Runtime result:
- **BLOCKED** (dependency on backend/web pass).

---

## Part D — Blockers found

1. **Missing backend env file at expected path** (`backend/.env`).
2. **No reachable MongoDB at `localhost:27017`**.
3. **No local Mongo runtime available in environment** (`mongod` missing, `docker` missing), preventing quick local provisioning.

These blockers fully explain why backend cannot start and why end-to-end sync cannot be proven in this environment.

---

## Fixes applied
- No code changes/fixes were applied in this execution pass.
- This was execution-first validation; failure is environment/provisioning, not proven code-path defect.

---

## Final answer
- Backend works end-to-end: **NOT PROVEN (blocked by Mongo provisioning)**
- Web works against backend: **NOT PROVEN (blocked by backend status + required order)**
- Mobile works against backend: **NOT PROVEN (blocked by backend/web status + required order)**

To continue this exact smoke pass, provision MongoDB reachable by backend (`MONGO_URL`), create `backend/.env`, then rerun in the same order.
