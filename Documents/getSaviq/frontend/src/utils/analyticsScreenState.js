function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncateLabel(label, maxLength = 18) {
  const text = typeof label === 'string' ? label.trim() : '';
  if (!text) return 'Unknown';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function sanitizeSummary(summary) {
  return {
    net_balance: toSafeNumber(summary?.net_balance),
    total_income: toSafeNumber(summary?.total_income),
    total_spend: toSafeNumber(summary?.total_spend),
    month_over_month_change_pct: toSafeNumber(summary?.month_over_month_change_pct),
  };
}

function sanitizeCategoryItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: item?.category_id || `category-${index}`,
    label: truncateLabel(item?.category_name || 'Uncategorized', 20),
    fullLabel: typeof item?.category_name === 'string' && item.category_name.trim() ? item.category_name : 'Uncategorized',
    amount: toSafeNumber(item?.amount),
    percentage: Math.max(0, Math.min(100, toSafeNumber(item?.percentage))),
  }));
}

function sanitizePaymentItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: item?.payment_method_id || `payment-${index}`,
    label: truncateLabel(item?.payment_method_name || 'Unknown', 20),
    fullLabel: typeof item?.payment_method_name === 'string' && item.payment_method_name.trim() ? item.payment_method_name : 'Unknown',
    amount: toSafeNumber(item?.amount),
  }));
}

function sanitizeTrendItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: `${item?.month || 'month'}-${index}`,
    month: typeof item?.month === 'string' && item.month.trim() ? item.month : 'Unknown',
    amount: toSafeNumber(item?.amount),
  }));
}

export function sanitizeAnalyticsPayload(payload) {
  return {
    summary: sanitizeSummary(payload?.summary),
    categoryItems: sanitizeCategoryItems(payload?.categoryItems),
    paymentItems: sanitizePaymentItems(payload?.paymentItems),
    trendItems: sanitizeTrendItems(payload?.trendItems),
  };
}

export function deriveAnalyticsViewState({ isLoading, error, summary, categoryItems, paymentItems, trendItems }) {
  if (isLoading) return 'loading';
  if (error) return 'error';

  const safeSummary = sanitizeSummary(summary);
  const hasSummaryData =
    safeSummary.total_income > 0 ||
    safeSummary.total_spend > 0 ||
    safeSummary.net_balance !== 0 ||
    safeSummary.month_over_month_change_pct !== 0;

  if (hasSummaryData) return 'success';
  if ((categoryItems || []).length > 0) return 'success';
  if ((paymentItems || []).length > 0) return 'success';
  if ((trendItems || []).length > 0) return 'success';
  return 'empty';
}

