function parseExpenseDate(expense) {
  const parsed = new Date(expense.date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function filterTransactionsForMonth(expenses, month, year) {
  return expenses.filter((expense) => {
    const expenseDate = parseExpenseDate(expense);
    if (!expenseDate) return false;
    return expenseDate.getMonth() === month && expenseDate.getFullYear() === year;
  });
}

export function searchTransactions(expenses, query, categoryNameById = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return expenses;

  return expenses.filter((expense) => {
    const categoryName = categoryNameById[expense.category_id] || '';
    return [
      expense.description,
      expense.merchant,
      expense.notes,
      categoryName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

export function deriveVisibleTransactions({
  expenses,
  month,
  year,
  searchQuery,
  txType = 'all',
  categoryNameById = {},
}) {
  const monthSlice = filterTransactionsForMonth(expenses, month, year);
  const searched = searchTransactions(monthSlice, searchQuery, categoryNameById);
  if (txType === 'all') return searched;
  return searched.filter((expense) => expense.type === txType);
}

export function upsertTransaction(expenses, nextExpense) {
  const existingIndex = expenses.findIndex((expense) => expense.expense_id === nextExpense.expense_id);
  if (existingIndex < 0) return [nextExpense, ...expenses];

  const next = [...expenses];
  next[existingIndex] = nextExpense;
  return next;
}

export function removeTransaction(expenses, expenseId) {
  return expenses.filter((expense) => expense.expense_id !== expenseId);
}

export function buildTransactionRowHandlers({ expense, onPress, onEdit, onDelete }) {
  return {
    onPress: () => onPress?.(expense),
    onEdit: () => onEdit?.(expense),
    onDelete: () => onDelete?.(expense),
  };
}

export function deriveTransactionEmptyState({ hasFiltersApplied, filteredCount }) {
  if (filteredCount > 0) {
    return { title: '', subtitle: '', showClearFilters: false };
  }
  if (hasFiltersApplied) {
    return {
      title: 'No transactions match current filters',
      subtitle: 'Try clearing search or type filters.',
      showClearFilters: true,
    };
  }
  return {
    title: 'No transactions this month',
    subtitle: 'Tap + to add one',
    showClearFilters: false,
  };
}

export function shouldCloseDetailModalAfterDelete({ selectedExpenseId, deletedExpenseId }) {
  return Boolean(selectedExpenseId && deletedExpenseId && selectedExpenseId === deletedExpenseId);
}

export function shouldResetTransactionDetailOnProfileChange({
  previousProfileId,
  nextProfileId,
  isDetailModalOpen,
}) {
  if (!isDetailModalOpen) return false;
  if (!previousProfileId || !nextProfileId) return false;
  return previousProfileId !== nextProfileId;
}

export function buildTransactionExportIntentParams({
  activeProfileId,
  month,
  year,
}) {
  const safeProfileId = String(activeProfileId || '').trim();
  if (!safeProfileId) return null;
  if (!Number.isInteger(month) || month < 0 || month > 11) return null;
  if (!Number.isInteger(year) || year < 1970) return null;
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return {
    intent: 'export',
    profile_id: safeProfileId,
    month: String(month + 1),
    year: String(year),
    month_start: monthStart,
  };
}

export function shouldClearExportIntentOnProfileSwitch({
  intentProfileId,
  nextProfileId,
}) {
  const safeIntentProfileId = String(intentProfileId || '').trim();
  const safeNextProfileId = String(nextProfileId || '').trim();
  if (!safeIntentProfileId || !safeNextProfileId) return false;
  return safeIntentProfileId !== safeNextProfileId;
}
