import { useState } from "react";

import {
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  useAddExpense,
  useDeleteExpense,
  useExpenses,
  useExpenseSummary,
  useSetBudget,
  type Expense,
  type ExpenseCategory,
} from "../api/client";

import styles from "./BudgetPanel.module.css";

// ── helpers ────────────────────────────────────────────────────

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ── LimitBar ───────────────────────────────────────────────────

function LimitBar({
  spent,
  budget,
  currency,
}: {
  spent: number;
  budget: number | null;
  currency: string;
}): React.ReactElement | null {
  if (budget === null) return null;
  const pct = Math.min((spent / budget) * 100, 100);
  const over = spent > budget;
  return (
    <div className={styles.limitBar}>
      <div className={styles.limitLabels}>
        <span className={over ? styles.spentOver : styles.spent}>
          {money(spent, currency)} spent
        </span>
        <span className={styles.limitLabel}>limit {money(budget, currency)}</span>
      </div>
      <div className={styles.track}>
        <div
          className={[styles.fill, over ? styles.fillOver : ""].filter(Boolean).join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {over && (
        <p className={styles.overWarning}>⚠️ {money(spent - budget, currency)} over budget</p>
      )}
    </div>
  );
}

// ── CategoryBreakdown ──────────────────────────────────────────

function CategoryBreakdown({
  byCategory,
  total,
  currency,
}: {
  byCategory: Record<string, number>;
  total: number;
  currency: string;
}): React.ReactElement | null {
  const entries = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) return null;
  const max = entries[0]?.[1] ?? 1;

  return (
    <div className={styles.cats}>
      <p className={styles.sectionLabel}>By category</p>
      {entries.map(([cat, amount]) => {
        const icon = EXPENSE_CATEGORY_ICONS[cat as ExpenseCategory] ?? "📎";
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
        return (
          <div key={cat} className={styles.catRow}>
            <span>{icon}</span>
            <span className={styles.catName}>{cat}</span>
            <div className={styles.catTrack}>
              <div className={styles.catFill} style={{ width: `${(amount / max) * 100}%` }} />
            </div>
            <span className={styles.catPct}>{pct}%</span>
            <span className={styles.catAmt}>{money(amount, currency)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── ExpenseRow ─────────────────────────────────────────────────

function ExpenseRow({
  expense,
  currency,
  onDelete,
  isDeleting,
}: {
  expense: Expense;
  currency: string;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const icon = EXPENSE_CATEGORY_ICONS[expense.category] ?? "📎";
  return (
    <div className={styles.expenseRow}>
      <span className={styles.expenseIcon}>{icon}</span>
      <div className={styles.expenseBody}>
        <p className={styles.expenseTitle}>{expense.title}</p>
        {expense.notes && <p className={styles.expenseNotes}>{expense.notes}</p>}
      </div>
      <span className={styles.expenseAmount}>{money(expense.amount, currency)}</span>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Remove ${expense.title}`}
      >
        {isDeleting ? "…" : "✕"}
      </button>
    </div>
  );
}

// ── AddExpenseForm ─────────────────────────────────────────────

function AddExpenseForm({
  tripId,
  userId,
  currency,
}: {
  tripId: string;
  userId?: string;
  currency: string;
}): React.ReactElement {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("other");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  const addMutation = useAddExpense();

  function handleSubmit(): void {
    const parsed = parseFloat(amount);
    if (!title.trim()) {
      setErr("Enter a description");
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    setErr("");
    addMutation.mutate(
      {
        tripId,
        ...(userId !== undefined ? { userId } : {}),
        title: title.trim(),
        amount: parsed,
        category,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: () => {
          setTitle("");
          setAmount("");
          setNotes("");
          setCategory("other");
        },
        onError: () => setErr("Could not add expense."),
      },
    );
  }

  return (
    <div className={styles.addForm}>
      <p className={styles.sectionLabel}>Add expense</p>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Description"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <input
          className={`${styles.input} ${styles.inputAmount}`}
          type="number"
          placeholder={`Amount (${currency})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
        />
      </div>

      <div className={styles.catChips}>
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={[styles.catChip, category === c ? styles.catChipActive : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setCategory(c)}
          >
            {EXPENSE_CATEGORY_ICONS[c]} {c}
          </button>
        ))}
      </div>

      <input
        className={styles.input}
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={500}
      />

      {err && <p className={styles.errText}>{err}</p>}

      <button
        type="button"
        className={styles.submitBtn}
        onClick={handleSubmit}
        disabled={addMutation.isPending}
      >
        {addMutation.isPending ? "Adding…" : "+ Add expense"}
      </button>
    </div>
  );
}

// ── SetBudgetRow ───────────────────────────────────────────────

function SetBudgetRow({
  tripId,
  userId,
  current,
  currency,
}: {
  tripId: string;
  userId?: string;
  current: number | null;
  currency: string;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current !== null ? String(current) : "");
  const setBudgetMutation = useSetBudget();

  function handleSave(): void {
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed <= 0) return;
    setBudgetMutation.mutate(
      { tripId, ...(userId !== undefined ? { userId } : {}), budget: parsed, currency },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (!editing) {
    return (
      <button type="button" className={styles.setBudgetBtn} onClick={() => setEditing(true)}>
        {current !== null ? `✏️ Edit limit (${money(current, currency)})` : "＋ Set a budget limit"}
      </button>
    );
  }

  return (
    <div className={styles.setBudgetForm}>
      <input
        className={`${styles.input} ${styles.inputAmount}`}
        type="number"
        placeholder="Budget limit"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        min="0"
        step="1"
        autoFocus
      />
      <button
        type="button"
        className={styles.saveBudgetBtn}
        onClick={handleSave}
        disabled={setBudgetMutation.isPending}
      >
        {setBudgetMutation.isPending ? "…" : "Save"}
      </button>
      <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  );
}

// ── BudgetPanel (main) ─────────────────────────────────────────

interface BudgetPanelProps {
  tripId: string;
  userId?: string;
}

export default function BudgetPanel({
  tripId,
  userId,
}: BudgetPanelProps): React.ReactElement | null {
  const expensesQuery = useExpenses(tripId, userId);
  const summaryQuery = useExpenseSummary(tripId, userId);
  const deleteMutation = useDeleteExpense();

  const isLoading = expensesQuery.isLoading || summaryQuery.isLoading;
  const isError = expensesQuery.isError || summaryQuery.isError;

  if (isLoading) {
    return (
      <div className={`${styles.panel} ${styles.loading}`} aria-busy="true">
        <div className={styles.spinner} />
        <p>Loading budget…</p>
      </div>
    );
  }

  if (isError || !expensesQuery.data || !summaryQuery.data) {
    return (
      <div className={`${styles.panel} ${styles.error}`}>
        <p>Could not load budget data.</p>
      </div>
    );
  }

  const { expenses, budget, currency } = expensesQuery.data;
  const summary = summaryQuery.data;
  const sorted = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <section className={styles.panel} aria-label="Budget tracker">
      {/* header */}
      <div className={styles.header}>
        <h3 className={styles.panelTitle}>💰 Budget Tracker</h3>
        <span className={styles.currencyBadge}>{currency}</span>
      </div>

      {/* total */}
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total spent</span>
        <span className={styles.totalValue}>{money(summary.totalSpent, currency)}</span>
      </div>

      <LimitBar spent={summary.totalSpent} budget={budget} currency={currency} />

      <SetBudgetRow
        tripId={tripId}
        current={budget}
        currency={currency}
        {...(userId !== undefined ? { userId } : {})}
      />

      <CategoryBreakdown
        byCategory={summary.byCategory}
        total={summary.totalSpent}
        currency={currency}
      />

      {/* expense list */}
      {sorted.length > 0 && (
        <div className={styles.expenseList}>
          <p className={styles.sectionLabel}>All expenses</p>
          {sorted.map((exp) => (
            <ExpenseRow
              key={exp.id}
              expense={exp}
              currency={currency}
              onDelete={() =>
                deleteMutation.mutate({
                  tripId,
                  expenseId: exp.id,
                  ...(userId !== undefined ? { userId } : {}),
                })
              }
              isDeleting={
                deleteMutation.isPending && deleteMutation.variables?.expenseId === exp.id
              }
            />
          ))}
        </div>
      )}

      <AddExpenseForm
        tripId={tripId}
        currency={currency}
        {...(userId !== undefined ? { userId } : {})}
      />
    </section>
  );
}
