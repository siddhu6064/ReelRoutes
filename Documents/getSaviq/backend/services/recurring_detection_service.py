from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re


_INTERVAL_RULES = [
    {"label": "weekly", "days": 7, "tolerance": 3},
    {"label": "monthly", "days": 30, "tolerance": 8},
    {"label": "quarterly", "days": 91, "tolerance": 20},
    {"label": "annual", "days": 365, "tolerance": 40},
]

_MIN_OCCURRENCES = 3
_MIN_CONFIDENCE = 0.55
_MONTHS_PER_YEAR = 12.0
_MAX_AMOUNT_VARIABILITY_RATIO = 0.4

_VARIABLE_MERCHANT_KEYWORDS = {
    "amazon",
    "walmart",
    "target",
    "costco",
    "paypal",
    "venmo",
    "zelle",
    "square",
    "toast",
}

_INTERVALS_PER_YEAR = {
    "weekly": 52.0,
    "monthly": 12.0,
    "quarterly": 4.0,
    "annual": 1.0,
}


def normalize_merchant_name(merchant: str | None) -> str:
    if not merchant:
        return ""
    normalized = merchant.lower().strip()
    normalized = re.sub(r"\*+", " ", normalized)
    normalized = re.sub(r"\b(inc|llc|ltd|corp|co)\b", " ", normalized)
    normalized = re.sub(r"\d+", " ", normalized)
    normalized = re.sub(r"[^a-z\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _coerce_utc_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        parsed = value.strip()
        if not parsed:
            return None
        try:
            dt = datetime.fromisoformat(parsed.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _days_between(d1: datetime, d2: datetime) -> float:
    return abs((d2 - d1).total_seconds()) / 86400.0


def _score_interval(intervals: list[float], target_days: int, tolerance_days: int) -> float:
    if not intervals:
        return 0.0
    mean_abs_error = sum(abs(i - target_days) for i in intervals) / len(intervals)
    score = 1.0 - (mean_abs_error / max(float(tolerance_days), 1.0))
    return round(max(0.0, min(1.0, score)), 4)


def calculate_interval_confidence(dates: list[datetime]) -> dict:
    if len(dates) < _MIN_OCCURRENCES:
        return {"interval": "none", "days": None, "confidence": 0.0, "occurrences": len(dates)}

    ordered = sorted(dates)
    intervals = [_days_between(ordered[idx - 1], ordered[idx]) for idx in range(1, len(ordered))]

    best = {"interval": "none", "days": None, "confidence": 0.0, "occurrences": len(ordered)}
    for rule in _INTERVAL_RULES:
        score = _score_interval(intervals, rule["days"], rule["tolerance"])
        if score > best["confidence"]:
            best = {
                "interval": rule["label"],
                "days": rule["days"],
                "confidence": score,
                "occurrences": len(ordered),
            }

    if best["confidence"] < _MIN_CONFIDENCE:
        return {"interval": "none", "days": None, "confidence": best["confidence"], "occurrences": len(ordered)}

    return best


def detect_recurring_merchants_from_transactions(transactions: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}

    ordered_transactions = sorted(
        transactions,
        key=lambda tx: (
            _coerce_utc_datetime(tx.get("date")) or datetime.min.replace(tzinfo=timezone.utc),
            normalize_merchant_name(tx.get("merchant")),
            float(tx.get("amount", 0.0) or 0.0),
        ),
    )

    for tx in ordered_transactions:
        merchant = normalize_merchant_name(tx.get("merchant"))
        if not merchant:
            continue
        if tx.get("type", "expense") == "income":
            continue
        amount = float(tx.get("amount", 0.0))
        if amount <= 0:
            continue

        group = grouped.setdefault(
            merchant,
            {
                "merchant_normalized": merchant,
                "merchant_display": tx.get("merchant") or merchant,
                "dates": [],
                "amounts": [],
            },
        )
        tx_date = _coerce_utc_datetime(tx.get("date"))
        if tx_date is None:
            continue
        group["dates"].append(tx_date)
        group["amounts"].append(amount)

    candidates = []
    for group in grouped.values():
        confidence = calculate_interval_confidence(group["dates"])
        if not _passes_false_positive_protection(
            merchant_normalized=group["merchant_normalized"],
            amounts=group["amounts"],
            confidence=confidence,
        ):
            continue

        ordered_dates = sorted(group["dates"])
        last_date = ordered_dates[-1]
        next_date = last_date + timedelta(days=confidence["days"])
        avg_amount = round(sum(group["amounts"]) / len(group["amounts"]), 2)

        candidates.append(
            {
                "merchant_normalized": group["merchant_normalized"],
                "merchant_display": group["merchant_display"],
                "interval": confidence["interval"],
                "interval_days": confidence["days"],
                "confidence": confidence["confidence"],
                "occurrences": confidence["occurrences"],
                "average_amount": avg_amount,
                "last_charge_date": last_date,
                "next_expected_charge_date": next_date,
            }
        )

    return sorted(candidates, key=lambda c: (-c["confidence"], -c["occurrences"], c["merchant_normalized"]))


def _annual_amount_for_candidate(candidate: dict) -> float:
    interval = candidate.get("interval")
    average_amount = float(candidate.get("average_amount", 0.0) or 0.0)
    interval_count_per_year = _INTERVALS_PER_YEAR.get(interval)
    if not interval_count_per_year or average_amount <= 0:
        return 0.0
    return average_amount * interval_count_per_year


def _amount_variability_ratio(amounts: list[float]) -> float:
    if not amounts:
        return 1.0
    mean_amount = sum(amounts) / len(amounts)
    if mean_amount <= 0:
        return 1.0
    variance = sum((amount - mean_amount) ** 2 for amount in amounts) / len(amounts)
    std_dev = variance ** 0.5
    return std_dev / mean_amount


def _passes_false_positive_protection(*, merchant_normalized: str, amounts: list[float], confidence: dict) -> bool:
    if confidence.get("interval") == "none":
        return False

    if _amount_variability_ratio(amounts) > _MAX_AMOUNT_VARIABILITY_RATIO:
        return False

    merchant_is_variable = any(keyword in merchant_normalized for keyword in _VARIABLE_MERCHANT_KEYWORDS)
    if merchant_is_variable:
        if confidence.get("occurrences", 0) < 4:
            return False
        if float(confidence.get("confidence", 0.0) or 0.0) < 0.75:
            return False

    return True


def summarize_recurring_candidates(candidates: list[dict]) -> dict:
    eligible = [
        candidate
        for candidate in candidates
        if candidate.get("interval") in _INTERVALS_PER_YEAR and float(candidate.get("confidence", 0.0) or 0.0) >= _MIN_CONFIDENCE
    ]

    annual_estimate = round(sum(_annual_amount_for_candidate(candidate) for candidate in eligible), 2)
    monthly_total = round(annual_estimate / _MONTHS_PER_YEAR, 2)

    return {
        "candidate_count": len(eligible),
        "monthly_recurring_total": monthly_total,
        "annual_recurring_estimate": annual_estimate,
    }


def build_recurring_detection_result(*, user_id: str, profile_id: str, candidates: list[dict]) -> dict:
    totals = summarize_recurring_candidates(candidates)
    return {
        "user_id": user_id,
        "profile_id": profile_id,
        "totals": totals,
        "candidates": candidates,
    }


async def detect_recurring_merchants(
    *,
    user_id: str,
    profile_id: str,
    expenses_collection,
    lookback_days: int = 400,
    now: datetime | None = None,
) -> list[dict]:
    current_now = now or datetime.now(timezone.utc)
    if current_now.tzinfo is None:
        current_now = current_now.replace(tzinfo=timezone.utc)

    start = current_now - timedelta(days=max(lookback_days, 30))
    query = {
        "user_id": user_id,
        "profile_id": profile_id,
        "date": {"$gte": start, "$lte": current_now},
    }
    projection = {"_id": 0, "merchant": 1, "amount": 1, "date": 1, "type": 1}
    rows = await expenses_collection.find(query, projection).to_list(5000)
    return detect_recurring_merchants_from_transactions(rows)


async def detect_recurring_profile_summary(
    *,
    user_id: str,
    profile_id: str,
    expenses_collection,
    lookback_days: int = 400,
    now: datetime | None = None,
) -> dict:
    candidates = await detect_recurring_merchants(
        user_id=user_id,
        profile_id=profile_id,
        expenses_collection=expenses_collection,
        lookback_days=lookback_days,
        now=now,
    )
    return build_recurring_detection_result(
        user_id=user_id,
        profile_id=profile_id,
        candidates=candidates,
    )
