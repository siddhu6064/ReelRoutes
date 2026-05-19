from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _sample_append(target: list[str], value: str, sample_size: int) -> None:
    if len(target) < sample_size:
        target.append(value)


async def run_integrity_checks(
    db: Any,
    *,
    now: datetime | None = None,
    sample_size: int = 10,
    max_scan: int = 50000,
) -> dict[str, Any]:
    """
    Read-only integrity checks for admin usage.
    Returns counts and bounded samples; does not mutate data.
    """
    current_time = now or datetime.now(timezone.utc)

    profiles = await db.profiles.find({}, {"_id": 0, "profile_id": 1, "user_id": 1, "name_normalized": 1}).to_list(max_scan)
    categories = await db.categories.find({}, {"_id": 0, "category_id": 1, "user_id": 1, "profile_id": 1, "name_normalized": 1}).to_list(max_scan)
    payment_methods = await db.payment_methods.find({}, {"_id": 0, "payment_id": 1, "user_id": 1, "type": 1, "last_four": 1, "name_normalized": 1}).to_list(max_scan)
    expenses = await db.expenses.find({}, {"_id": 0, "expense_id": 1, "user_id": 1, "profile_id": 1, "category_id": 1, "payment_method_id": 1, "to_payment_method_id": 1}).to_list(max_scan)
    budgets = await db.budgets.find({}, {"_id": 0, "budget_id": 1, "user_id": 1, "profile_id": 1, "category_id": 1}).to_list(max_scan)
    sessions = await db.user_sessions.find({}, {"_id": 0, "session_id": 1, "user_id": 1, "expires_at": 1}).to_list(max_scan)

    profile_ids = {p.get("profile_id") for p in profiles}
    category_ids = {c.get("category_id") for c in categories}
    payment_ids = {p.get("payment_id") for p in payment_methods}

    issues: dict[str, dict[str, Any]] = {
        "expenses_missing_profile_ref": {"count": 0, "sample_ids": []},
        "expenses_missing_category_ref": {"count": 0, "sample_ids": []},
        "expenses_missing_payment_ref": {"count": 0, "sample_ids": []},
        "expenses_missing_to_payment_ref": {"count": 0, "sample_ids": []},
        "budgets_missing_profile_ref": {"count": 0, "sample_ids": []},
        "budgets_missing_category_ref": {"count": 0, "sample_ids": []},
        "profiles_missing_name_normalized": {"count": 0, "sample_ids": []},
        "categories_missing_name_normalized": {"count": 0, "sample_ids": []},
        "payment_methods_missing_name_normalized": {"count": 0, "sample_ids": []},
        "profiles_duplicate_normalized_name": {"count": 0, "sample_keys": []},
        "categories_duplicate_normalized_name": {"count": 0, "sample_keys": []},
        "payment_methods_duplicate_normalized_name": {"count": 0, "sample_keys": []},
        "expired_sessions_present": {"count": 0, "sample_ids": []},
    }

    for exp in expenses:
        exp_id = exp.get("expense_id", "")
        if exp.get("profile_id") not in profile_ids:
            issues["expenses_missing_profile_ref"]["count"] += 1
            _sample_append(issues["expenses_missing_profile_ref"]["sample_ids"], exp_id, sample_size)
        if exp.get("category_id") and exp.get("category_id") not in category_ids:
            issues["expenses_missing_category_ref"]["count"] += 1
            _sample_append(issues["expenses_missing_category_ref"]["sample_ids"], exp_id, sample_size)
        if exp.get("payment_method_id") not in payment_ids:
            issues["expenses_missing_payment_ref"]["count"] += 1
            _sample_append(issues["expenses_missing_payment_ref"]["sample_ids"], exp_id, sample_size)
        if exp.get("to_payment_method_id") and exp.get("to_payment_method_id") not in payment_ids:
            issues["expenses_missing_to_payment_ref"]["count"] += 1
            _sample_append(issues["expenses_missing_to_payment_ref"]["sample_ids"], exp_id, sample_size)

    for budget in budgets:
        budget_id = budget.get("budget_id", "")
        if budget.get("profile_id") not in profile_ids:
            issues["budgets_missing_profile_ref"]["count"] += 1
            _sample_append(issues["budgets_missing_profile_ref"]["sample_ids"], budget_id, sample_size)
        if budget.get("category_id") and budget.get("category_id") not in category_ids:
            issues["budgets_missing_category_ref"]["count"] += 1
            _sample_append(issues["budgets_missing_category_ref"]["sample_ids"], budget_id, sample_size)

    profile_seen: dict[tuple[str, str], int] = {}
    for doc in profiles:
        profile_id = doc.get("profile_id", "")
        normalized = doc.get("name_normalized")
        if not isinstance(normalized, str):
            issues["profiles_missing_name_normalized"]["count"] += 1
            _sample_append(issues["profiles_missing_name_normalized"]["sample_ids"], profile_id, sample_size)
            continue
        key = (doc.get("user_id", ""), normalized)
        profile_seen[key] = profile_seen.get(key, 0) + 1
    for key, count in profile_seen.items():
        if count > 1:
            issues["profiles_duplicate_normalized_name"]["count"] += 1
            _sample_append(issues["profiles_duplicate_normalized_name"]["sample_keys"], f"{key[0]}::{key[1]}", sample_size)

    category_seen: dict[tuple[str, str, str], int] = {}
    for doc in categories:
        category_id = doc.get("category_id", "")
        normalized = doc.get("name_normalized")
        if not isinstance(normalized, str):
            issues["categories_missing_name_normalized"]["count"] += 1
            _sample_append(issues["categories_missing_name_normalized"]["sample_ids"], category_id, sample_size)
            continue
        key = (doc.get("user_id", ""), str(doc.get("profile_id")), normalized)
        category_seen[key] = category_seen.get(key, 0) + 1
    for key, count in category_seen.items():
        if count > 1:
            issues["categories_duplicate_normalized_name"]["count"] += 1
            _sample_append(
                issues["categories_duplicate_normalized_name"]["sample_keys"],
                f"{key[0]}::{key[1]}::{key[2]}",
                sample_size,
            )

    payment_seen: dict[tuple[str, str, str, str | None], int] = {}
    for doc in payment_methods:
        payment_id = doc.get("payment_id", "")
        normalized = doc.get("name_normalized")
        if not isinstance(normalized, str):
            issues["payment_methods_missing_name_normalized"]["count"] += 1
            _sample_append(issues["payment_methods_missing_name_normalized"]["sample_ids"], payment_id, sample_size)
            continue
        key = (doc.get("user_id", ""), normalized, str(doc.get("type")), doc.get("last_four"))
        payment_seen[key] = payment_seen.get(key, 0) + 1
    for key, count in payment_seen.items():
        if count > 1:
            issues["payment_methods_duplicate_normalized_name"]["count"] += 1
            _sample_append(
                issues["payment_methods_duplicate_normalized_name"]["sample_keys"],
                f"{key[0]}::{key[1]}::{key[2]}::{key[3]}",
                sample_size,
            )

    for session in sessions:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, datetime) and expires_at < current_time:
            issues["expired_sessions_present"]["count"] += 1
            _sample_append(issues["expired_sessions_present"]["sample_ids"], session.get("session_id", ""), sample_size)

    total_issues = sum(item["count"] for item in issues.values())
    return {
        "checked_collections": [
            "profiles",
            "categories",
            "payment_methods",
            "expenses",
            "budgets",
            "user_sessions",
        ],
        "scan_limits": {"max_scan": max_scan, "sample_size": sample_size},
        "issues": issues,
        "overall_status": "ok" if total_issues == 0 else "issues_found",
        "total_issue_count": total_issues,
    }
