function formatCurrency(value) {
  const amount = Number(value || 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(safe);
}

function formatNetDelta(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return 'Net unchanged vs last week';
  const direction = amount > 0 ? 'up' : 'down';
  const sign = amount > 0 ? '+' : '-';
  return `Net ${direction} ${sign}${formatCurrency(Math.abs(amount)).replace('$', '')} vs last week`;
}

function formatWeekLabel(week) {
  const startDate = week?.start_date ? new Date(week.start_date) : null;
  const endDate = week?.end_date ? new Date(week.end_date) : null;

  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'Week unavailable';
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const startParts = fmt.formatToParts(startDate);
  const endParts = fmt.formatToParts(endDate);

  const startMonth = startParts.find((part) => part.type === 'month')?.value;
  const startDay = startParts.find((part) => part.type === 'day')?.value;
  const startYear = startParts.find((part) => part.type === 'year')?.value;

  const endMonth = endParts.find((part) => part.type === 'month')?.value;
  const endDay = endParts.find((part) => part.type === 'day')?.value;
  const endYear = endParts.find((part) => part.type === 'year')?.value;

  if (!startMonth || !startDay || !startYear || !endMonth || !endDay || !endYear) {
    return 'Week unavailable';
  }

  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${endYear}`;
  }

  if (startYear === endYear) {
    return `${startMonth} ${startDay}–${endMonth} ${endDay}, ${endYear}`;
  }

  return `${startMonth} ${startDay}, ${startYear}–${endMonth} ${endDay}, ${endYear}`;
}

function formatPercent(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return null;
  return `${(rate * 100).toFixed(1)}%`;
}

function formatLargestExpense(largestExpense) {
  if (!largestExpense) return null;
  const amount = formatCurrency(largestExpense.amount);
  const title = largestExpense.merchant || largestExpense.description || largestExpense.category_id || 'Expense';
  return `${title} · ${amount}`;
}

function formatTopExpenseCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return [];
  return categories.slice(0, 3).map((item) => ({
    categoryId: item?.category_id || 'uncategorized',
    amount: formatCurrency(item?.total_amount),
  }));
}

export function mapWeeklyDigestToCardData(digest) {
  const summary = digest?.summary || {};
  const highlights = digest?.highlights || {};
  const comparisons = digest?.comparisons || {};
  const signals = digest?.signals || {};
  const breakdown = digest?.breakdown || {};

  return {
    weekLabel: formatWeekLabel(digest?.week),
    netTotal: formatCurrency(summary.net_total),
    incomeTotal: formatCurrency(summary.income_total),
    expenseTotal: formatCurrency(summary.expense_total),
    transactionCount: Number(summary.transaction_count || 0),
    topCategoryName: highlights.top_category_name || null,
    topCategoryAmount: formatCurrency(highlights.top_category_amount),
    netDeltaCue: formatNetDelta(comparisons.previous_week_net_delta),
    savingsRate: highlights.savings_rate == null ? null : formatPercent(highlights.savings_rate),
    unusualSpendingDetected: Boolean(signals.unusual_spending_detected),
    largestExpense: formatLargestExpense(signals.largest_expense),
    topExpenseCategories: formatTopExpenseCategories(breakdown.top_expense_categories),
  };
}
