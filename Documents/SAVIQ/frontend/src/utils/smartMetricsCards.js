function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercentage(value) {
  const parsed = toSafeNumber(value);
  if (parsed == null) return null;
  return Math.max(0, Math.min(100, parsed));
}

function formatScore(value) {
  const safe = clampPercentage(value);
  if (safe == null) return '--';
  return `${Math.round(safe)}`;
}

function formatVelocity(value) {
  const safe = toSafeNumber(value);
  if (safe == null) return '--';
  return `${safe.toFixed(1)}/wk`;
}

function formatCurrencyValue(value) {
  const safe = toSafeNumber(value);
  const normalized = safe == null ? 0 : safe;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(normalized);
}

function hasData(metric) {
  return Boolean(metric?.has_sufficient_data);
}

function fallbackLabel(flag) {
  return flag ? 'Active' : 'Waiting for data';
}

export const SMART_METRIC_HELPERS = {
  savingsScore: '0–100 signal from goal progress, budget adherence, and discretionary spending trend.',
  spendVelocity: 'Recent spend pace, normalized to a weekly run-rate from current expense activity.',
  financialHealth: '0–100 snapshot balancing net position, savings behavior, budget pressure, and goals.',
  budgetConfidence: 'Confidence signal for budget stability based on recent patterns, not a guarantee.',
  projectedSavings: 'Conservative estimate from current net and recent spend pace; outcomes can change.',
};

function formatPercent(value) {
  const safe = toSafeNumber(value);
  if (safe == null) return '--';
  return `${(safe * 100).toFixed(1)}%`;
}

function normalizeTopCategorySummary(topCategory) {
  const hasCategoryName = Boolean((topCategory?.category_name || '').trim());
  const amount = toSafeNumber(topCategory?.amount);
  const share = toSafeNumber(topCategory?.share_of_expenses);
  const hasEnoughContext = hasCategoryName && amount != null && share != null;

  return {
    value: hasCategoryName ? topCategory.category_name : '—',
    context: hasEnoughContext
      ? `${formatCurrencyValue(amount)} • ${formatPercent(share)}`
      : 'No dominant category yet',
  };
}

function normalizeProjectedSavingsSummary(projectedSavings) {
  const rawProjectedValue = projectedSavings?.projected_savings;
  const projectedValue = rawProjectedValue == null ? null : toSafeNumber(rawProjectedValue);
  const hasProjectedValue = projectedValue != null;
  return {
    value: hasProjectedValue ? formatCurrencyValue(projectedValue) : '--',
    context: projectedSavings?.basis || 'Projection unavailable',
    hasData: Boolean(projectedSavings?.has_sufficient_data) && hasProjectedValue,
  };
}

export function mapDashboardSmartMetricCards(payload) {
  const metrics = payload || {};
  const savingsScore = metrics.savings_score || {};
  const spendVelocity = metrics.spend_velocity || {};
  const financialHealth = metrics.financial_health_score || {};
  const budgetConfidence = metrics.budget_confidence || {};
  const topCategory = metrics.top_category_summary || {};
  const projectedSavings = metrics.projected_savings_summary || {};
  const topCategoryNormalized = normalizeTopCategorySummary(topCategory);
  const projectedSavingsNormalized = normalizeProjectedSavingsSummary(projectedSavings);

  return {
    savingsScore: {
      title: 'Savings Score',
      value: formatScore(savingsScore.value),
      badge: fallbackLabel(hasData(savingsScore)),
      hasData: hasData(savingsScore),
      helperText: SMART_METRIC_HELPERS.savingsScore,
      context: `Goals ${formatScore(savingsScore?.components?.goals_progress)} • Budget ${formatScore(savingsScore?.components?.budget_adherence)}`,
    },
    spendVelocity: {
      title: 'Spend Velocity',
      value: formatVelocity(spendVelocity.value),
      badge: fallbackLabel(hasData(spendVelocity)),
      hasData: hasData(spendVelocity),
      helperText: SMART_METRIC_HELPERS.spendVelocity,
      context: `Daily avg ${formatCurrencyValue(spendVelocity.recent_daily_average)}`,
    },
    financialHealth: {
      title: 'Financial Health',
      value: formatScore(financialHealth.value),
      badge: fallbackLabel(hasData(financialHealth)),
      hasData: hasData(financialHealth),
      helperText: SMART_METRIC_HELPERS.financialHealth,
      context: `Net ${formatScore(financialHealth?.components?.net_position)} • Goal ${formatScore(financialHealth?.components?.goal_progress)}`,
    },
    topCategorySummary: {
      title: 'Top Category',
      value: topCategoryNormalized.value,
      badge: fallbackLabel(hasData(topCategory)),
      hasData: hasData(topCategory),
      helperText: null,
      context: topCategoryNormalized.context,
    },
    budgetConfidence: {
      title: 'Budget Confidence',
      value: formatScore(budgetConfidence.value),
      badge: fallbackLabel(hasData(budgetConfidence)),
      hasData: hasData(budgetConfidence),
      helperText: SMART_METRIC_HELPERS.budgetConfidence,
      context: `Forecast ${formatScore(budgetConfidence?.components?.forecast_alignment)} • Consistency ${formatScore(budgetConfidence?.components?.historical_consistency)}`,
    },
    projectedSavingsSummary: {
      title: 'Projected Savings',
      value: projectedSavingsNormalized.value,
      badge: fallbackLabel(projectedSavingsNormalized.hasData),
      hasData: projectedSavingsNormalized.hasData,
      helperText: SMART_METRIC_HELPERS.projectedSavings,
      context: projectedSavingsNormalized.context,
    },
  };
}
