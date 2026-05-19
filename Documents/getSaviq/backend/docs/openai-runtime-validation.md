# OpenAI Runtime Validation — SAVIQ Backend

Date: 2026-04-22
Scope: backend AI runtime only (`/api/scan-receipt`, `/api/insights` AI path)

## Validation method

- Code-path inspection for endpoint contracts, wrapper invocation, fallback behavior, and logging.
- Runtime-adjacent mocked validation for OpenAI wrapper success/failure/config/parse scenarios.
- Syntax/import sanity for touched backend files.
- No live OpenAI network calls were executed in this environment.

## Endpoint status

### 1) `POST /api/scan-receipt`

**Request path / invocation**
- Route accepts `ScanReceiptRequest.image` and invokes `analyze_receipt_image(data.image)`.
- Result is merged onto stable fallback defaults to preserve response contract fields.

**Validated behavior**
- **Success path**: JSON object output returns expected structured fields.
- **Malformed model output**: parse error classified as `parse_error` and route returns fallback object.
- **Missing API key**: classified as `config_error`; route returns fallback object.
- **Provider failure**: classified as `provider_error`; route returns fallback object.

**Contract stability**
- Route fallback contract remains:
  - `amount`, `merchant`, `date`, `time`, `category_suggestion`, `items`, `confidence`.

Status: ✅ PASS

### 2) `GET /api/insights` AI generation path

**Request path / invocation**
- Route computes `stats`, calls `generate_spending_insights(stats)`, returns `{ "stats": stats, "insights": insights }` on AI success.
- On AI failure, route falls back to deterministic insight generation.

**Validated behavior**
- **Success path**: wrapper accepts valid JSON array and returns normalized insight objects.
- **Invalid model output**: parse/validation failures classified and surfaced to route.
- **Provider failure**: classified as `provider_error`; route fallback path triggers.
- **Deterministic fallback output**: route fallback still returns safe output with `stats` + non-empty `insights` list.

Status: ✅ PASS (runtime-adjacent + code-path validation)

## Observability validation summary

### Wrapper logging (`backend/services/openai_client.py`)

Validated events per call:
- `request_start`
- `request_success`
- `request_failure`

Validated fields:
- `feature` (`receipt_analysis` / `spending_insights`)
- `model`
- `latency_ms`
- `error_type` on failures (`provider_error`, `parse_error`, `validation_error`, `config_error`)
- counter fields (`success_count`, `failure_count`)

Sensitive data check:
- No raw image payload logged.
- No full spending payload logged; only safe metadata (`category_count`) is emitted.

### Route fallback logging (`backend/routers/ai.py`)

- `fallback_triggered` log event exists in `/api/insights` fallback branch.
- Includes `fallback_count`, `error_type`, and exception class.

Status: ✅ Operationally useful for first-line production troubleshooting.

## Cost optimization safety review

Current defaults in wrapper:
- `OPENAI_RECEIPT_MAX_TOKENS=500` (bounded 200..1200)
- `OPENAI_INSIGHTS_MAX_TOKENS=350` (bounded 150..900)
- Insights payload compacting with category cap (default 6; bounded 3..12)

Assessment:
- Token ceilings are reasonable for current output contracts (receipt JSON object, short insights array).
- JSON truncation risk exists theoretically if model verbosity spikes, but bounded prompts + strict output instructions make risk low-to-moderate.
- Env overrides provide safe operational escape hatch without code changes.

Status: ✅ SAFE for beta with monitoring.

## Targeted fix made during this pass

- Fixed observability gap where parse/validation failures could bypass failure logging/counters.
- Parse/validation phases are now wrapped so `request_failure` logs and failure counters are emitted consistently.

## Remaining risks

1. Live model drift can still produce malformed JSON occasionally (mitigated by fallback behavior and structured failure logs).
2. Token ceilings may need tuning if production data volume grows significantly.
3. In-memory counters reset on process restart (acceptable for lightweight logging-based observability).

## Recommendation

**Ready for beta** ✅

Reasoning:
- Endpoint contracts stable.
- Success/failure/fallback paths verified.
- Observability now covers request lifecycle, latency, model, error class, and fallback trigger.
- No blocker found requiring architectural change.
