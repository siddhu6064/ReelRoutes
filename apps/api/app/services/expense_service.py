"""
app/services/expense_service.py

Trip expense tracking — two modes:

  Solo mode (split_with=[]):
    Personal budget tracking. Who cares about the maths — just log what you spend.
    Good for solo travelers who want to see where their money went.

  Split mode (split_with has members):
    Tracks who paid what and calculates the minimum transactions to settle.
    People don't need ReelRoutes accounts — just names.

Settlement algorithm:
    We use a simplified debt-reduction approach:
    1. Calculate each person's net balance (paid - owed)
    2. Repeatedly match the biggest debtor with the biggest creditor
    3. Returns the minimum number of transfers to settle everything
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import NamedTuple

from app.middleware.error_handler import AppError, NotFoundError
from app.models.documents import (
    CollaboratorRole,
    ExpenseCategory,
    ExpenseSplit,
    SplitType,
    TripCollaborator,
    TripDocument,
    TripExpense,
)


class SettlementTransfer(NamedTuple):
    from_name: str
    to_name: str
    amount: float
    currency: str


class ExpenseSummary(NamedTuple):
    total_spent: float
    currency: str
    by_category: dict[str, float]
    per_person: dict[str, float]        # how much each person paid
    per_person_owes: dict[str, float]   # how much each person owes
    net_balances: dict[str, float]      # positive = owed money, negative = owes money
    settlements: list[SettlementTransfer]
    expense_count: int


# ── CRUD ──────────────────────────────────────────────────────

async def add_expense(
    trip: TripDocument,
    title: str,
    amount: float,
    paid_by_name: str,
    category: str = "other",
    currency: str | None = None,
    split_type: str = "equal",
    split_with: list[dict] | None = None,
    notes: str | None = None,
    pin_id: str | None = None,
    paid_by_id: str | None = None,
) -> TripExpense:
    """
    Add an expense to a trip.

    Solo tracking: pass split_with=[] or None
    Split: pass split_with=[{"member_name": "Alice"}, {"member_name": "Bob"}]
    """
    if amount <= 0:
        raise AppError("Expense amount must be greater than 0.", status_code=422)
    if not title.strip():
        raise AppError("Expense title is required.", status_code=422)

    # Build split entries
    splits: list[ExpenseSplit] = []
    members = split_with or []

    if members:
        resolved = _resolve_splits(
            members=members,
            total=amount,
            split_type=SplitType(split_type),
        )
        splits = resolved

    expense = TripExpense(
        id=str(uuid.uuid4()),
        title=title.strip(),
        amount=amount,
        currency=currency or trip.expense_currency,
        category=ExpenseCategory(category),
        paid_by_name=paid_by_name.strip(),
        paid_by_id=paid_by_id,
        split_type=SplitType(split_type),
        split_with=splits,
        notes=notes,
        pin_id=pin_id,
    )

    trip.expenses.append(expense)
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return expense


async def update_expense(
    trip: TripDocument,
    expense_id: str,
    **updates,
) -> TripExpense:
    """Update an existing expense by id."""
    expense = _find_expense(trip, expense_id)

    if "title" in updates and updates["title"]:
        expense.title = updates["title"].strip()
    if "amount" in updates and updates["amount"]:
        expense.amount = updates["amount"]
    if "category" in updates:
        expense.category = ExpenseCategory(updates["category"])
    if "notes" in updates:
        expense.notes = updates["notes"]
    if "pin_id" in updates:
        expense.pin_id = updates["pin_id"]
    if "split_with" in updates and updates["split_with"] is not None:
        expense.split_with = _resolve_splits(
            members=updates["split_with"],
            total=expense.amount,
            split_type=expense.split_type,
        )

    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return expense


async def delete_expense(trip: TripDocument, expense_id: str) -> None:
    """Remove an expense from a trip."""
    expense = _find_expense(trip, expense_id)
    trip.expenses = [e for e in trip.expenses if e.id != expense_id]
    trip.updated_at = datetime.now(UTC)
    await trip.save()


async def mark_settled(
    trip: TripDocument,
    expense_id: str,
    member_name: str,
) -> TripExpense:
    """Mark one member as settled for an expense."""
    expense = _find_expense(trip, expense_id)
    for split in expense.split_with:
        if split.member_name.lower() == member_name.lower():
            split.settled = True
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return expense


async def set_budget(trip: TripDocument, budget: float, currency: str) -> TripDocument:
    """Set a total budget for the trip."""
    if budget <= 0:
        raise AppError("Budget must be greater than 0.", status_code=422)
    trip.expense_budget = budget
    trip.expense_currency = currency
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return trip


# ── Summary & Settlement ───────────────────────────────────────

def compute_summary(trip: TripDocument) -> ExpenseSummary:
    """
    Compute the full expense summary for a trip:
    - Total spent
    - Spending by category
    - Per-person paid amounts
    - Per-person owed amounts
    - Net balances
    - Minimum settlement transfers
    """
    currency = trip.expense_currency
    total = 0.0
    by_category: dict[str, float] = {}
    per_paid: dict[str, float] = {}   # how much each person paid total
    per_owes: dict[str, float] = {}   # how much each person owes total

    for exp in trip.expenses:
        total += exp.amount
        cat = exp.category.value
        by_category[cat] = by_category.get(cat, 0) + exp.amount

        # Track who paid
        payer = exp.paid_by_name
        per_paid[payer] = per_paid.get(payer, 0) + exp.amount

        # Track who owes (only for split expenses)
        if exp.split_with:
            for split in exp.split_with:
                name = split.member_name
                if not split.settled:
                    per_owes[name] = per_owes.get(name, 0) + split.amount
        else:
            # Solo expense — payer owes themselves (it all balances out)
            per_owes[payer] = per_owes.get(payer, 0) + exp.amount

    # Net balance = paid - owed
    all_people = set(per_paid) | set(per_owes)
    net: dict[str, float] = {}
    for person in all_people:
        paid = per_paid.get(person, 0)
        owes = per_owes.get(person, 0)
        net[person] = round(paid - owes, 2)

    settlements = _compute_settlements(net, currency)

    return ExpenseSummary(
        total_spent=round(total, 2),
        currency=currency,
        by_category={k: round(v, 2) for k, v in by_category.items()},
        per_person=per_paid,
        per_person_owes=per_owes,
        net_balances=net,
        settlements=settlements,
        expense_count=len(trip.expenses),
    )


# ── Collaborator management ────────────────────────────────────

async def invite_collaborator(
    trip: TripDocument,
    name: str,
    role: str = "viewer",
    email: str | None = None,
) -> TripCollaborator:
    """
    Add a collaborator to a trip. Returns the collaborator with their invite_token.
    The invite link is: /trips/:id/join?token=<invite_token>
    """
    collaborator = TripCollaborator(
        name=name.strip(),
        email=email,
        role=CollaboratorRole(role),
    )
    trip.collaborators.append(collaborator)
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return collaborator


async def accept_invite(
    trip: TripDocument,
    invite_token: str,
    clerk_id: str,
) -> TripCollaborator:
    """
    Accept a trip invite. Links the collaborator to a Clerk user.
    Called when someone opens the invite link and signs in.
    """
    collaborator = next(
        (c for c in trip.collaborators if c.invite_token == invite_token),
        None,
    )
    if not collaborator:
        raise AppError("Invalid or expired invite link.", status_code=404)
    if collaborator.status == "active":
        raise AppError("Invite already accepted.", status_code=409)

    collaborator.clerk_id = clerk_id
    collaborator.status = "active"
    collaborator.joined_at = datetime.now(UTC)
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return collaborator


async def remove_collaborator(
    trip: TripDocument,
    collaborator_id: str,
    requesting_user_id: str,
) -> None:
    """Remove a collaborator. Only the trip owner can do this."""
    if trip.user_id != requesting_user_id:
        from app.middleware.error_handler import ForbiddenError
        raise ForbiddenError("Only the trip owner can remove collaborators.")

    trip.collaborators = [c for c in trip.collaborators if c.id != collaborator_id]
    trip.updated_at = datetime.now(UTC)
    await trip.save()


def check_can_edit(trip: TripDocument, clerk_id: str | None) -> bool:
    """
    Returns True if the clerk_id can edit this trip.
    Owner can always edit. Active editors can edit.
    Guests (no clerk_id) can edit only their own guest trips.
    """
    if not clerk_id:
        return trip.user_id is None  # guest can edit their own guest trip
    if trip.user_id == clerk_id:
        return True
    return any(
        c.clerk_id == clerk_id
        and c.role == CollaboratorRole.EDITOR
        and c.status == "active"
        for c in trip.collaborators
    )


# ── Private helpers ────────────────────────────────────────────

def _find_expense(trip: TripDocument, expense_id: str) -> TripExpense:
    exp = next((e for e in trip.expenses if e.id == expense_id), None)
    if not exp:
        raise NotFoundError("Expense", expense_id)
    return exp


def _resolve_splits(
    members: list[dict],
    total: float,
    split_type: SplitType,
) -> list[ExpenseSplit]:
    """Convert raw member dicts to ExpenseSplit objects with calculated amounts."""
    splits = []

    if split_type == SplitType.EQUAL:
        share = round(total / len(members), 2)
        # Adjust last person for rounding
        remainder = round(total - share * (len(members) - 1), 2)
        for i, m in enumerate(members):
            splits.append(ExpenseSplit(
                member_name=m.get("member_name", "Unknown"),
                member_id=m.get("member_id"),
                amount=remainder if i == len(members) - 1 else share,
                settled=m.get("settled", False),
            ))

    elif split_type == SplitType.EXACT:
        for m in members:
            splits.append(ExpenseSplit(
                member_name=m.get("member_name", "Unknown"),
                member_id=m.get("member_id"),
                amount=float(m.get("amount", 0)),
                settled=m.get("settled", False),
            ))

    elif split_type == SplitType.PERCENTAGE:
        for m in members:
            pct = float(m.get("percentage", 0))
            splits.append(ExpenseSplit(
                member_name=m.get("member_name", "Unknown"),
                member_id=m.get("member_id"),
                amount=round(total * pct / 100, 2),
                percentage=pct,
                settled=m.get("settled", False),
            ))

    return splits


def _compute_settlements(
    net: dict[str, float],
    currency: str,
) -> list[SettlementTransfer]:
    """
    Compute minimum transfers to settle all debts.
    Uses a greedy algorithm: match biggest debtor with biggest creditor.
    """
    debtors = [(name, -bal) for name, bal in net.items() if bal < -0.01]
    creditors = [(name, bal) for name, bal in net.items() if bal > 0.01]

    debtors.sort(key=lambda x: -x[1])
    creditors.sort(key=lambda x: -x[1])

    transfers = []
    di, ci = 0, 0

    while di < len(debtors) and ci < len(creditors):
        d_name, d_amt = debtors[di]
        c_name, c_amt = creditors[ci]

        transfer = round(min(d_amt, c_amt), 2)
        if transfer > 0.01:
            transfers.append(SettlementTransfer(
                from_name=d_name,
                to_name=c_name,
                amount=transfer,
                currency=currency,
            ))

        d_amt -= transfer
        c_amt -= transfer

        if d_amt < 0.01:
            di += 1
        else:
            debtors[di] = (d_name, d_amt)

        if c_amt < 0.01:
            ci += 1
        else:
            creditors[ci] = (c_name, c_amt)

    return transfers
