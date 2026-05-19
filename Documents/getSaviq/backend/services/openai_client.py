import json
import logging
import os
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)


class OpenAIClientError(Exception):
    """Raised when OpenAI client output is invalid or the request fails."""

    def __init__(self, message: str, error_type: str = "unknown", request_id: str | None = None):
        super().__init__(message)
        self.error_type = error_type
        self.request_id = request_id


_METRICS = {
    "receipt_success_count": 0,
    "receipt_failure_count": 0,
    "insights_success_count": 0,
    "insights_failure_count": 0,
}


def _log_ai_event(event: str, feature: str, request_id: str, **kwargs):
    payload = {"event": event, "feature": feature, "request_id": request_id, **kwargs}
    logger.info("ai_observability %s", json.dumps(payload, default=str, separators=(",", ":")))


def _strip_json_fences(text: str) -> str:
    text = (text or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = lines[-1].startswith("```") if lines else False
        text = "\n".join(lines[1:-1] if end else lines[1:])
    return text.strip()


def _parse_json_payload(text: str) -> Any:
    cleaned = _strip_json_fences(text)
    if not cleaned:
        raise OpenAIClientError("Empty model output", error_type="parse_error")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        for start_char, end_char in (("{", "}"), ("[", "]")):
            start = cleaned.find(start_char)
            end = cleaned.rfind(end_char) + 1
            if start != -1 and end > start:
                try:
                    return json.loads(cleaned[start:end])
                except json.JSONDecodeError:
                    continue
    raise OpenAIClientError("Model output was not valid JSON", error_type="parse_error")


def _extract_output_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    try:
        response_dict = response.model_dump() if hasattr(response, "model_dump") else {}
        return str(response_dict.get("output_text") or "")
    except Exception:
        return ""


def _validate_insights_shape(payload: list[Any]) -> list[dict]:
    normalized: list[dict] = []
    for item in payload:
        if not isinstance(item, dict):
            raise OpenAIClientError("Each insight must be an object", error_type="validation_error")
        if not all(key in item for key in ("icon", "text", "type")):
            raise OpenAIClientError("Each insight must include icon, text, and type", error_type="validation_error")
        normalized.append(
            {
                "icon": str(item.get("icon") or ""),
                "text": str(item.get("text") or ""),
                "type": str(item.get("type") or ""),
            }
        )
    return normalized


def _get_async_openai_cls():
    try:
        from openai import AsyncOpenAI

        return AsyncOpenAI
    except ModuleNotFoundError as exc:
        raise OpenAIClientError("openai package is not installed", error_type="config_error") from exc


def _build_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise OpenAIClientError("OPENAI_API_KEY not configured", error_type="config_error")
    async_openai_cls = _get_async_openai_cls()
    return async_openai_cls(api_key=api_key)


def _int_from_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return default
    return max(min(value, maximum), minimum)


def _compact_insights_stats(spending_stats: dict) -> dict:
    category_limit = _int_from_env("OPENAI_INSIGHTS_CATEGORY_LIMIT", default=6, minimum=3, maximum=12)
    monthly_categories = spending_stats.get("this_month_by_category") or {}
    if isinstance(monthly_categories, dict):
        top_monthly_categories = dict(
            sorted(
                ((str(name), float(amount)) for name, amount in monthly_categories.items()),
                key=lambda item: item[1],
                reverse=True,
            )[:category_limit]
        )
    else:
        top_monthly_categories = {}

    return {
        "this_week_total": spending_stats.get("this_week_total", 0),
        "last_week_total": spending_stats.get("last_week_total", 0),
        "this_month_total": spending_stats.get("this_month_total", 0),
        "last_month_total": spending_stats.get("last_month_total", 0),
        "this_week_income": spending_stats.get("this_week_income", 0),
        "this_month_income": spending_stats.get("this_month_income", 0),
        "this_week_tx_count": spending_stats.get("this_week_tx_count", 0),
        "this_month_tx_count": spending_stats.get("this_month_tx_count", 0),
        "this_month_top_categories": top_monthly_categories,
    }


async def analyze_receipt_image(image_data_url: str) -> dict:
    request_id = str(uuid.uuid4())
    if not image_data_url:
        raise OpenAIClientError("Receipt image is required", error_type="validation_error", request_id=request_id)

    model = os.environ.get("OPENAI_RECEIPT_MODEL", "gpt-4.1-mini")
    max_output_tokens = _int_from_env("OPENAI_RECEIPT_MAX_TOKENS", default=500, minimum=200, maximum=1200)
    started_at = time.monotonic()
    _log_ai_event("request_start", "receipt_analysis", request_id=request_id, model=model, max_output_tokens=max_output_tokens)

    image_url = image_data_url if image_data_url.startswith("data:") else f"data:image/jpeg;base64,{image_data_url}"

    try:
        client = _build_client()
        response = await client.responses.create(
            model=model,
            max_output_tokens=max_output_tokens,
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "You are a receipt scanner AI. Extract information from receipt images and "
                                "return ONLY raw JSON.\n"
                                "Use this exact object shape:\n"
                                "{\n"
                                '  "amount": <number or null>,\n'
                                '  "merchant": "<string or null>",\n'
                                '  "date": "<YYYY-MM-DD or null>",\n'
                                '  "time": "<HH:MM or null>",\n'
                                '  "category_suggestion": "<one of: Food & Dining, Transportation, Shopping, Bills & Utilities, Entertainment, Healthcare, Travel, Education, Other>",\n'
                                '  "items": ["<item1>", "<item2>"],\n'
                                '  "confidence": <0.0 to 1.0>\n'
                                "}\n"
                                "Set missing fields to null. No markdown, no explanations."
                            ),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Please scan this receipt and extract all relevant information. Return only the JSON response.",
                        },
                        {"type": "input_image", "image_url": image_url},
                    ],
                },
            ],
        )
    except OpenAIClientError as exc:
        if not getattr(exc, "request_id", None):
            exc.request_id = request_id
        latency_ms = round((time.monotonic() - started_at) * 1000, 2)
        _METRICS["receipt_failure_count"] += 1
        _log_ai_event(
            "request_failure",
            "receipt_analysis",
            request_id=request_id,
            model=model,
            latency_ms=latency_ms,
            failure_count=_METRICS["receipt_failure_count"],
            error_type=exc.error_type,
            exception=type(exc).__name__,
        )
        raise
    except Exception as exc:
        provider_error = OpenAIClientError(
            f"Receipt analysis failed: {exc}",
            error_type="provider_error",
            request_id=request_id,
        )
        latency_ms = round((time.monotonic() - started_at) * 1000, 2)
        _METRICS["receipt_failure_count"] += 1
        _log_ai_event(
            "request_failure",
            "receipt_analysis",
            request_id=request_id,
            model=model,
            latency_ms=latency_ms,
            failure_count=_METRICS["receipt_failure_count"],
            error_type=provider_error.error_type,
            exception=type(exc).__name__,
        )
        raise provider_error from exc

    try:
        payload = _parse_json_payload(_extract_output_text(response))
        if not isinstance(payload, dict):
            raise OpenAIClientError(
                "Receipt response must be a JSON object",
                error_type="validation_error",
                request_id=request_id,
            )
    except OpenAIClientError as exc:
        if not getattr(exc, "request_id", None):
            exc.request_id = request_id
        latency_ms = round((time.monotonic() - started_at) * 1000, 2)
        _METRICS["receipt_failure_count"] += 1
        _log_ai_event(
            "request_failure",
            "receipt_analysis",
            request_id=request_id,
            model=model,
            latency_ms=latency_ms,
            failure_count=_METRICS["receipt_failure_count"],
            error_type=exc.error_type,
            exception=type(exc).__name__,
        )
        raise

    latency_ms = round((time.monotonic() - started_at) * 1000, 2)
    _METRICS["receipt_success_count"] += 1
    _log_ai_event(
        "request_success",
        "receipt_analysis",
        request_id=request_id,
        model=model,
        latency_ms=latency_ms,
        success_count=_METRICS["receipt_success_count"],
    )
    return payload


async def generate_spending_insights(spending_stats: dict) -> list[dict]:
    request_id = str(uuid.uuid4())
    model = os.environ.get("OPENAI_INSIGHTS_MODEL", "gpt-4.1-mini")
    max_output_tokens = _int_from_env("OPENAI_INSIGHTS_MAX_TOKENS", default=350, minimum=150, maximum=900)
    compact_stats = _compact_insights_stats(spending_stats)
    started_at = time.monotonic()
    _log_ai_event(
        "request_start",
        "spending_insights",
        request_id=request_id,
        model=model,
        max_output_tokens=max_output_tokens,
        category_count=len((compact_stats.get("this_month_top_categories") or {}).keys()),
    )

    try:
        client = _build_client()
        response = await client.responses.create(
            model=model,
            max_output_tokens=max_output_tokens,
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "You are a personal finance advisor AI. Given spending data, generate 3-5 brief, actionable insights.\n"
                                "Return ONLY a JSON array. No markdown.\n"
                                "[\n"
                                '  {"icon": "trending-up", "text": "Your insight here", "type": "warning"},\n'
                                '  {"icon": "checkmark-circle", "text": "Your insight here", "type": "positive"},\n'
                                '  {"icon": "bulb", "text": "Your insight here", "type": "tip"}\n'
                                "]\n"
                                'Types: "warning" (spending increased), "positive" (good trend), "tip" (saving advice).\n'
                                "Icons must be valid Ionicons names: trending-up, trending-down, checkmark-circle, alert-circle, bulb, wallet, card, cash, restaurant, cart.\n"
                                "Keep each insight under 80 characters and include specific numbers when useful."
                            ),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Here is my spending data:\n"
                                f"{json.dumps(compact_stats, separators=(',', ':'))}\n\n"
                                "Generate personalized spending insights."
                            ),
                        }
                    ],
                },
            ],
        )
    except OpenAIClientError as exc:
        if not getattr(exc, "request_id", None):
            exc.request_id = request_id
        latency_ms = round((time.monotonic() - started_at) * 1000, 2)
        _METRICS["insights_failure_count"] += 1
        _log_ai_event(
            "request_failure",
            "spending_insights",
            request_id=request_id,
            model=model,
            latency_ms=latency_ms,
            failure_count=_METRICS["insights_failure_count"],
            error_type=exc.error_type,
            exception=type(exc).__name__,
        )
        raise
    except Exception as exc:
        provider_error = OpenAIClientError(
            f"Insights generation failed: {exc}",
            error_type="provider_error",
            request_id=request_id,
        )
        latency_ms = round((time.monotonic() - started_at) * 1000, 2)
        _METRICS["insights_failure_count"] += 1
        _log_ai_event(
            "request_failure",
            "spending_insights",
            request_id=request_id,
            model=model,
            latency_ms=latency_ms,
            failure_count=_METRICS["insights_failure_count"],
            error_type=provider_error.error_type,
            exception=type(exc).__name__,
        )
        raise provider_error from exc

    try:
        payload = _parse_json_payload(_extract_output_text(response))
        if not isinstance(payload, list):
            raise OpenAIClientError(
                "Insights response must be a JSON array",
                error_type="validation_error",
                request_id=request_id,
            )
        normalized = _validate_insights_shape(payload)
    except OpenAIClientError as exc:
        if not getattr(exc, "request_id", None):
            exc.request_id = request_id
        latency_ms = round((time.monotonic() - started_at) * 1000, 2)
        _METRICS["insights_failure_count"] += 1
        _log_ai_event(
            "request_failure",
            "spending_insights",
            request_id=request_id,
            model=model,
            latency_ms=latency_ms,
            failure_count=_METRICS["insights_failure_count"],
            error_type=exc.error_type,
            exception=type(exc).__name__,
        )
        raise

    latency_ms = round((time.monotonic() - started_at) * 1000, 2)
    _METRICS["insights_success_count"] += 1
    _log_ai_event(
        "request_success",
        "spending_insights",
        request_id=request_id,
        model=model,
        latency_ms=latency_ms,
        success_count=_METRICS["insights_success_count"],
    )
    return normalized
