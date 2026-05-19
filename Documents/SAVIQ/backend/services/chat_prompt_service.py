from __future__ import annotations


def _to_float(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _detect_intent(question: str) -> str:
    normalized = (question or "").strip().lower()
    if "why" in normalized and "spend" in normalized and "more" in normalized:
        return "why_spend_more"
    if "save" in normalized:
        return "how_save_more"
    return "general_finance_insight"


_UNSUPPORTED_ADVICE_PHRASES = (
    "guaranteed",
    "guarantee",
    "risk-free",
    "double your money",
    "beat the market",
    "stock pick",
    "crypto signal",
    "certain return",
)


def _safe_top_category(context: dict) -> dict:
    top_categories = context.get("top_categories") or []
    if not top_categories:
        return {"category_name": "your top spend category", "amount": 0.0}
    first = top_categories[0] or {}
    return {
        "category_name": first.get("category_name") or "your top spend category",
        "amount": _to_float(first.get("amount"), 0.0),
    }


def build_chat_prompt_template(question: str, context: dict) -> dict:
    intent = _detect_intent(question)

    base_system = (
        "You are SAVIQ insights assistant. Be clear, calm, and practical. "
        "Use only supplied context, avoid guarantees, and avoid investment advice."
    )

    if intent == "why_spend_more":
        return {
            "intent": intent,
            "system_prompt": base_system,
            "user_prompt": (
                "Explain why spending increased using month-over-month trend, top categories, "
                "budget risk, and forecast summary. Keep explanation short and practical."
            ),
            "question": question,
        }

    if intent == "how_save_more":
        return {
            "intent": intent,
            "system_prompt": base_system,
            "user_prompt": (
                "Give concise ways to save more this month using top categories, budget risk, "
                "recent spend pace, and forecast. Return practical next steps only."
            ),
            "question": question,
        }

    return {
        "intent": intent,
        "system_prompt": base_system,
        "user_prompt": "Provide concise financial insight and next best actions from the supplied SAVIQ context.",
        "question": question,
    }


def _format_why_spend_more(context: dict) -> dict:
    mom = (context.get("trends") or {}).get("month_over_month") or {}
    current_total = _to_float(mom.get("current_total"), 0.0)
    previous_total = _to_float(mom.get("previous_total"), 0.0)
    delta_amount = _to_float(mom.get("delta_amount"), current_total - previous_total)
    delta_percent = _to_float(mom.get("delta_percent"), 0.0)
    top_category = _safe_top_category(context)

    if current_total <= 0 and previous_total <= 0:
        return {
            "title": "Need a bit more activity first",
            "summary": "There isn’t enough recent history yet to explain a meaningful spend shift.",
            "actions": [
                "Continue logging transactions over the next 1–2 weeks.",
                "Keep categories up to date so trend signals stay accurate.",
            ],
        }

    return {
        "title": "Spending is higher this period",
        "summary": (
            f"Month-over-month spend is up by ${delta_amount:.2f} ({delta_percent:.1f}%). "
            f"The strongest pressure appears in {top_category['category_name']} (${top_category['amount']:.2f})."
        ),
        "actions": [
            f"Review recent {top_category['category_name']} transactions and remove one repeat expense this week.",
            "Set a realistic weekly cap for discretionary spend through month-end.",
            "Check budget-risk status midweek so adjustments happen earlier.",
        ],
    }


def _format_how_save_more(context: dict) -> dict:
    recent = context.get("recent_spend") or {}
    avg_daily = _to_float(recent.get("average_daily_spend"), 0.0)
    budget_risk = (context.get("budgets") or {}).get("risk") or {}
    risk_score = _to_float(budget_risk.get("risk_score"), 0.0)
    top_category = _safe_top_category(context)

    if avg_daily <= 0 and top_category["amount"] <= 0:
        return {
            "title": "Start with a simple savings baseline",
            "summary": "There isn’t enough recent data yet for precise savings recommendations.",
            "actions": [
                "Track expenses consistently for the next 7 days.",
                "Set one small weekly savings target and review it at week end.",
            ],
        }

    suggested_daily_cut = max(round(avg_daily * 0.1, 2), 1.0)
    return {
        "title": "Practical ways to save more this month",
        "summary": (
            f"Current spend pace is about ${avg_daily:.2f}/day, with budget risk at {risk_score:.1f}. "
            f"Your largest category is {top_category['category_name']} (${top_category['amount']:.2f})."
        ),
        "actions": [
            f"Target a daily reduction of about ${suggested_daily_cut:.2f} from variable spending.",
            f"Trim {top_category['category_name']} by one purchase cycle this week.",
            "Transfer the saved amount to your top goal at week end.",
        ],
    }


def _is_sparse_context(context: dict) -> bool:
    recent = context.get("recent_spend") or {}
    trends = (context.get("trends") or {}).get("month_over_month") or {}
    top_categories = context.get("top_categories") or []
    return (
        _to_float(recent.get("total"), 0.0) <= 0
        and _to_float(trends.get("current_total"), 0.0) <= 0
        and len(top_categories) == 0
    )


def _contains_unsupported_claim(text: str) -> bool:
    normalized = (text or "").strip().lower()
    return any(phrase in normalized for phrase in _UNSUPPORTED_ADVICE_PHRASES)


def apply_recommendation_guardrails(answer: dict, context: dict) -> dict:
    safe_answer = {
        "title": str((answer or {}).get("title") or "SAVIQ insight"),
        "summary": str((answer or {}).get("summary") or "Use recent spending trends to guide your next step."),
        "actions": [str(item) for item in ((answer or {}).get("actions") or []) if str(item).strip()],
    }

    if not safe_answer["actions"]:
        safe_answer["actions"] = ["Review your most recent transactions and choose one small spending cut this week."]

    if _is_sparse_context(context):
        return {
            "title": "More data will improve this insight",
            "summary": "SAVIQ needs a bit more recent activity to provide grounded, high-confidence guidance.",
            "actions": [
                "Log spending consistently over the next 7 days.",
                "Categorize each transaction so recommendations stay context-specific.",
            ],
        }

    full_text = " ".join([safe_answer["title"], safe_answer["summary"], *safe_answer["actions"]])
    if _contains_unsupported_claim(full_text):
        return {
            "title": "Grounded guidance from your SAVIQ data",
            "summary": "Recommendations are limited to what your recent spending and forecast data can support.",
            "actions": [
                "Start with your highest spending category first.",
                "Use a short weekly cap and review progress midweek.",
            ],
        }

    safe_answer["summary"] = safe_answer["summary"][:240]
    safe_answer["actions"] = [item[:140] for item in safe_answer["actions"][:3]]
    return safe_answer


def format_recommendation_answer(question: str, context: dict) -> dict:
    intent = _detect_intent(question)
    if intent == "why_spend_more":
        answer = _format_why_spend_more(context)
    elif intent == "how_save_more":
        answer = _format_how_save_more(context)
    else:
        top_category = _safe_top_category(context)
        answer = {
            "title": "Quick spending check-in",
            "summary": f"Your top spend area is {top_category['category_name']} (${top_category['amount']:.2f}).",
            "actions": ["Review this category first and choose one realistic cut for this week."],
        }
    return apply_recommendation_guardrails(answer, context)
