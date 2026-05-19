import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import get_settings
from database import db
from deps import get_current_user
from models import ChatInsightsRequest, ChatInsightsResponse, ScanReceiptRequest
from services.chat_insights_service import build_chat_transaction_context
from services.chat_prompt_service import build_chat_prompt_template, format_recommendation_answer
from services.insights_v2_service import generate_spend_comparison
from services.openai_client import OpenAIClientError, analyze_receipt_image, generate_spending_insights

logger = logging.getLogger(__name__)
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
limiter.enabled = settings.RATE_LIMIT_ENABLED

router = APIRouter(tags=["ai"])

STATS_PROJECTION = {"_id": 0, "amount": 1, "type": 1, "category_id": 1}
_AI_ROUTE_METRICS = {"insights_fallback_count": 0}


async def _ensure_profile_owned(profile_id: str, user_id: str):
    profile = await db.profiles.find_one(
        {"profile_id": profile_id, "user_id": user_id},
        {"_id": 0, "profile_id": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")


# ===================== SHARED HELPERS =====================

# ===================== ENDPOINTS =====================

@router.post("/scan-receipt")
async def scan_receipt(
    data: ScanReceiptRequest,
    current_user: dict = Depends(get_current_user),
):
    """Scan a receipt image using AI and extract expense details."""
    try:
        fallback = {
            "amount": None,
            "merchant": None,
            "date": None,
            "time": None,
            "category_suggestion": "Other",
            "items": [],
            "confidence": 0.0,
        }
        try:
            result = await analyze_receipt_image(data.image)
            if not isinstance(result, dict):
                return fallback
            return {**fallback, **result}
        except OpenAIClientError as e:
            logger.warning(f"Receipt analysis failed: {e}")
            return fallback

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning receipt: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to scan receipt: {str(e)}")


@router.get("/insights")
async def get_spending_insights(
    profile_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get AI-powered spending insights comparing periods."""
    now = datetime.now(timezone.utc)


    base_query = {"user_id": current_user["user_id"]}
    if profile_id:
        base_query["profile_id"] = profile_id

    # Queries used by existing stats payload
    current_week_start = now - timedelta(days=now.weekday())
    last_week_start = current_week_start - timedelta(days=7)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if current_month_start.month == 1:
        last_month_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
    else:
        last_month_start = current_month_start.replace(month=current_month_start.month - 1)

    this_week_q = {**base_query, "date": {"$gte": current_week_start}}
    last_week_q = {**base_query, "date": {"$gte": last_week_start, "$lt": current_week_start}}
    this_month_q = {**base_query, "date": {"$gte": current_month_start}}
    last_month_q = {**base_query, "date": {"$gte": last_month_start, "$lt": current_month_start}}

    # Run spend-comparison service + supporting lookups in parallel
    (
        weekly_comparison,
        monthly_comparison,
        this_week_exps,
        last_week_exps,
        this_month_exps,
        last_month_exps,
        user_cats,
    ) = await asyncio.gather(
        generate_spend_comparison(
            user_id=current_user["user_id"],
            profile_id=profile_id,
            period_type="weekly",
            now=now,
        ),
        generate_spend_comparison(
            user_id=current_user["user_id"],
            profile_id=profile_id,
            period_type="monthly",
            now=now,
        ),
        db.expenses.find(this_week_q, STATS_PROJECTION).to_list(500),
        db.expenses.find(last_week_q, STATS_PROJECTION).to_list(500),
        db.expenses.find(this_month_q, STATS_PROJECTION).to_list(500),
        db.expenses.find(last_month_q, STATS_PROJECTION).to_list(500),
        db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100),
    )

    cats_lookup = {c["category_id"]: c["name"] for c in user_cats}

    def sum_income(exps):
        return sum(e.get("amount", 0) for e in exps if e.get("type") == "income")

    def by_category(exps, lookup):
        result = {}
        for e in exps:
            if e.get("type", "expense") == "income":
                continue
            cat_name = lookup.get(e.get("category_id", "unknown"), "Other")
            result[cat_name] = result.get(cat_name, 0) + e.get("amount", 0)
        return result

    stats = {
        "this_week_total": weekly_comparison["current_total"],
        "last_week_total": weekly_comparison["previous_total"],
        "this_month_total": monthly_comparison["current_total"],
        "last_month_total": monthly_comparison["previous_total"],
        "this_week_income": round(sum_income(this_week_exps), 2),
        "last_week_income": round(sum_income(last_week_exps), 2),
        "this_month_income": round(sum_income(this_month_exps), 2),
        "last_month_income": round(sum_income(last_month_exps), 2),
        "this_week_tx_count": len(this_week_exps),
        "last_week_tx_count": len(last_week_exps),
        "this_month_tx_count": len(this_month_exps),
        "last_month_tx_count": len(last_month_exps),
        "this_month_by_category": by_category(this_month_exps, cats_lookup),
        "last_month_by_category": by_category(last_month_exps, cats_lookup),
    }

    # Try AI-generated insights
    try:
        insights = await generate_spending_insights(stats)
        return {"stats": stats, "insights": insights}

    except Exception as e:
        logger.warning(f"AI insights generation failed: {e}")
        _AI_ROUTE_METRICS["insights_fallback_count"] += 1
        logger.warning(
            "ai_observability %s",
            {
                "event": "fallback_triggered",
                "feature": "spending_insights",
                "fallback_count": _AI_ROUTE_METRICS["insights_fallback_count"],
                "request_id": getattr(e, "request_id", None),
                "error_type": getattr(e, "error_type", "unknown"),
                "exception": type(e).__name__,
            },
        )

        # Fallback: rule-based insights
        insights = []

        if stats["last_week_total"] > 0:
            week_change = ((stats["this_week_total"] - stats["last_week_total"]) / stats["last_week_total"]) * 100
            if week_change > 10:
                insights.append({"icon": "trending-up",   "text": f"Spending up {week_change:.0f}% vs last week (${stats['this_week_total']:.0f} vs ${stats['last_week_total']:.0f})", "type": "warning"})
            elif week_change < -10:
                insights.append({"icon": "trending-down", "text": f"Great! Spending down {abs(week_change):.0f}% vs last week", "type": "positive"})

        if stats["last_month_total"] > 0:
            month_change = ((stats["this_month_total"] - stats["last_month_total"]) / stats["last_month_total"]) * 100
            if month_change > 10:
                insights.append({"icon": "alert-circle",     "text": f"Monthly spending up {month_change:.0f}% — consider reviewing", "type": "warning"})
            elif month_change < -10:
                insights.append({"icon": "checkmark-circle", "text": f"Monthly spending down {abs(month_change):.0f}% — keep it up!", "type": "positive"})

        if not insights:
            insights.append({"icon": "bulb", "text": "Add transactions to get personalized insights", "type": "tip"})

        return {"stats": stats, "insights": insights}


@router.post("/ai/chat-insights", response_model=ChatInsightsResponse)
@limiter.limit("10/minute")
async def build_ai_chat_insights_context(
    request: Request,
    data: ChatInsightsRequest,
    current_user: dict = Depends(get_current_user),
):
    await _ensure_profile_owned(data.profile_id, current_user["user_id"])

    try:
        context = await build_chat_transaction_context(
            user_id=current_user["user_id"],
            profile_id=data.profile_id,
            recent_days=data.recent_days,
            expenses_collection=db.expenses,
            categories_collection=db.categories,
            budgets_collection=db.budgets,
        )
        prompt_template = build_chat_prompt_template(data.question, context)
        recommendation = format_recommendation_answer(data.question, context)

        return {
            "profile_id": data.profile_id,
            "generated_at": datetime.now(timezone.utc),
            "context": context,
            "prompt_template": prompt_template,
            "recommendation": recommendation,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "chat_insights_request_failed user_id=%s profile_id=%s recent_days=%s question_len=%s error_type=%s",
            current_user.get("user_id"),
            data.profile_id,
            data.recent_days,
            len((data.question or "").strip()),
            type(exc).__name__,
        )
        raise HTTPException(status_code=500, detail="Unable to generate chat insights right now.")
