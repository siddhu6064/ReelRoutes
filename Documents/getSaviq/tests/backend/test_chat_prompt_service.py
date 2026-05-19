from services.chat_prompt_service import (
    apply_recommendation_guardrails,
    build_chat_prompt_template,
    format_recommendation_answer,
)


def _sample_context():
    return {
        "recent_spend": {"window_days": 30, "total": 900.0, "transaction_count": 22, "average_daily_spend": 30.0},
        "trends": {
            "month_over_month": {
                "current_total": 900.0,
                "previous_total": 700.0,
                "delta_amount": 200.0,
                "delta_percent": 28.6,
            }
        },
        "top_categories": [
            {"category_id": "cat_food", "category_name": "Food", "amount": 320.0},
            {"category_id": "cat_transport", "category_name": "Transport", "amount": 120.0},
        ],
        "budgets": {"period": "monthly", "risk": {"risk_score": 45.0}},
        "forecast": {
            "summary": {"totals": {"projected_month_total": 980.0}},
            "projections": {"next_7_days": 210.0},
        },
    }


def test_why_spend_more_prompt_template_builds_from_context():
    template = build_chat_prompt_template("Why did I spend more this month?", _sample_context())

    assert template["intent"] == "why_spend_more"
    assert "month-over-month" in template["user_prompt"]
    assert template["question"] == "Why did I spend more this month?"


def test_how_save_more_prompt_template_builds_from_context():
    template = build_chat_prompt_template("How can I save more?", _sample_context())

    assert template["intent"] == "how_save_more"
    assert "save more" in template["user_prompt"].lower()


def test_recommendation_formatting_returns_concise_actionable_output():
    recommendation = format_recommendation_answer("How can I save more?", _sample_context())

    assert recommendation["title"]
    assert recommendation["summary"]
    assert len(recommendation["actions"]) >= 2
    assert all(isinstance(item, str) and item.strip() for item in recommendation["actions"])


def test_recommendation_formatting_handles_sparse_context_safely():
    recommendation = format_recommendation_answer("How can I save more?", {})

    assert "activity" in recommendation["summary"].lower()
    assert len(recommendation["actions"]) >= 1


def test_recommendations_remain_grounded_to_available_context():
    recommendation = format_recommendation_answer("Why did I spend more?", _sample_context())

    assert "Food" in recommendation["summary"]
    assert "$200.00" in recommendation["summary"]


def test_unsupported_claims_are_downgraded_by_guardrails():
    unsafe = {
        "title": "Guaranteed wealth",
        "summary": "This is a guaranteed, risk-free way to double your money.",
        "actions": ["Use this stock pick to get certain return."],
    }

    safe = apply_recommendation_guardrails(unsafe, _sample_context())
    combined = f"{safe['title']} {safe['summary']} {' '.join(safe['actions'])}".lower()

    assert "guaranteed" not in combined
    assert "risk-free" not in combined
    assert "stock pick" not in combined
