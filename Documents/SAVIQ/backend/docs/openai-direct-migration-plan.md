# SAVIQ Backend AI Migration Plan: Emergent → Direct OpenAI SDK

## Goal
Migrate the backend AI integration from `emergentintegrations` wrappers to direct OpenAI SDK calls with minimal behavior changes.

## Current Emergent Usage (Repo-verified)

### 1) Receipt Scanning (`POST /api/scan-receipt`)
- File: `backend/routers/ai.py`
- Function: `scan_receipt`
- Current provider path:
  - Imports `LlmChat`, `UserMessage`, `ImageContent` from `emergentintegrations.llm.chat`.
  - Reads `EMERGENT_LLM_KEY`.
  - Calls `LlmChat(...).with_model("openai", "gpt-4.1").with_max_tokens(2000)`.
  - Expects JSON object response with merchant/amount/date/category/description.

### 2) AI Spending Insights (`GET /api/insights`, AI path)
- File: `backend/routers/ai.py`
- Function: `get_spending_insights`
- Current provider path:
  - Reads `EMERGENT_LLM_KEY`.
  - Calls `LlmChat(...).with_model("openai", "gpt-4.1").with_max_tokens(1500)`.
  - Expects JSON array of insight objects.
  - Has fallback to deterministic `generate_smart_insights(...)`.

### 3) Config + dependency surfaces
- `.env.example` includes `EMERGENT_LLM_KEY`.
- `backend/requirements.txt` includes `emergentintegrations==0.1.0`.

## Non-impacted AI-like features

### Deterministic insights routes/services
- `backend/routers/insights.py` and related services are rule-based and do not call Emergent/OpenAI.

### Weekly digest generation
- `backend/services/weekly_digest_service.py` composes deterministic digest payloads and does not call Emergent/OpenAI.

### AI chat-insights route today
- `POST /api/ai/chat-insights` builds deterministic context + recommendation.
- No runtime LLM/provider call currently.

## Recommended Migration Architecture

### Introduce thin internal OpenAI wrapper
Create `backend/services/openai_client.py` with 2 focused helpers:
1. `analyze_receipt_image(image_data_url: str) -> dict`
2. `generate_spending_insights(spending_stats: dict) -> list[dict]`

Implementation guidelines:
- Use OpenAI Python SDK directly.
- Keep prompt text and output contracts equivalent to current behavior.
- Parse/sanitize JSON output robustly (strip markdown code fences, validate type).
- Raise controlled exceptions so callers can preserve existing fallback/status behavior.

### Keep routers stable
Update only provider call sites in `backend/routers/ai.py`:
- `scan_receipt`: replace Emergent object construction with `openai_client.analyze_receipt_image(...)`.
- `get_spending_insights`: replace Emergent call with `openai_client.generate_spending_insights(...)`.

Maintain:
- Existing HTTP schema/response fields.
- Existing fallback to `generate_smart_insights(...)`.

## Configuration changes

### Environment variables
- Add: `OPENAI_API_KEY`
- Optional model overrides:
  - `OPENAI_RECEIPT_MODEL` (default `gpt-4.1-mini`)
  - `OPENAI_INSIGHTS_MODEL` (default `gpt-4.1-mini`)
- Remove/deprecate: `EMERGENT_LLM_KEY`

### Dependency changes
- Add/ensure `openai` package in backend requirements.
- Remove `emergentintegrations` after cutover is validated.

## Model Recommendations (cost/quality)
- Receipt scan (vision + structured extraction): start with `gpt-4.1-mini`.
- Insights text generation: `gpt-4.1-mini`.
- Escalate receipt route to `gpt-4.1` only if accuracy regressions are observed.

## Risks and Mitigations

1. **Output shape drift (highest risk)**
   - Risk: model returns non-JSON or wrong schema.
   - Mitigation: strict parser/validator + defaulting + existing fallback on insights route.

2. **Receipt parsing quality variance**
   - Risk: category/merchant accuracy changes.
   - Mitigation: evaluate against sample corpus; allow model override env.

3. **Config/runtime failures**
   - Risk: missing `OPENAI_API_KEY`, quota/rate errors.
   - Mitigation: startup/config checks; explicit logs; preserve graceful fallback where available.

4. **Behavior regressions hidden by broad catch blocks**
   - Mitigation: add focused tests around provider failures and malformed model outputs.

## Rollout Plan
1. Add OpenAI wrapper service + tests.
2. Dual-path feature flag (optional): keep Emergent path as temporary fallback.
3. Switch receipt and insights routes to OpenAI wrapper.
4. Verify staging metrics/logs (success rate, latency, parse failures).
5. Remove Emergent dependency and env usage.

## Suggested File-level Change List
- `backend/services/openai_client.py` (new)
- `backend/routers/ai.py` (provider call-site replacement only)
- `backend/requirements.txt` (deps)
- `.env.example` (env vars)
- `backend/tests/...` add unit tests for wrapper and route fallbacks

## Acceptance Criteria
- Receipt scan endpoint preserves response contract.
- Insights endpoint preserves response contract and fallback behavior.
- No remaining runtime import/usage of `emergentintegrations`.
- Docs/config updated to OpenAI-native keys.
