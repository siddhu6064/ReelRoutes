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

function formatPercent(value) {
  const safe = toSafeNumber(value);
  if (safe == null) return '--';
  return `${(safe * 100).toFixed(1)}%`;
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
  'savings-score': '0–100 signal from goal progress, budget adherence, and discretionary spending trend.',
  'spend-velocity': 'Recent spend pace, normalized to a weekly run-rate from current expense activity.',
  'financial-health': '0–100 snapshot balancing net position, savings behavior, budget pressure, and goals.',
  'budget-confidence': 'Confidence signal for budget stability based on recent patterns, not a guarantee.',
  'projected-savings': 'Conservative estimate from current net and recent spend pace; outcomes can change.',
};

export function mapSmartMetricsToCards(payload) {
  const metrics = payload || {};
  const savingsScore = metrics.savings_score || {};
  const spendVelocity = metrics.spend_velocity || {};
  const financialHealth = metrics.financial_health_score || {};
  const budgetConfidence = metrics.budget_confidence || {};
  const topCategory = metrics.top_category_summary || {};
  const projectedSavings = metrics.projected_savings_summary || {};

  return [
    {
      id: 'savings-score',
      title: 'Savings Score',
      value: formatScore(savingsScore.value),
      accent: 'text-brand-primary',
      badge: fallbackLabel(hasData(savingsScore)),
      helperText: SMART_METRIC_HELPERS['savings-score'],
      context: `Goals ${formatScore(savingsScore?.components?.goals_progress)} • Budget ${formatScore(savingsScore?.components?.budget_adherence)}`,
    },
    {
      id: 'spend-velocity',
      title: 'Spend Velocity',
      value: formatVelocity(spendVelocity.value),
      accent: 'text-warning',
      badge: fallbackLabel(hasData(spendVelocity)),
      helperText: SMART_METRIC_HELPERS['spend-velocity'],
      context: `Daily avg ${formatCurrencyValue(spendVelocity.recent_daily_average)}`,
    },
    {
      id: 'financial-health',
      title: 'Financial Health',
      value: formatScore(financialHealth.value),
      accent: 'text-income',
      badge: fallbackLabel(hasData(financialHealth)),
      helperText: SMART_METRIC_HELPERS['financial-health'],
      context: `Net ${formatScore(financialHealth?.components?.net_position)} • Goal ${formatScore(financialHealth?.components?.goal_progress)}`,
    },
    {
      id: 'top-category',
      title: 'Top Category',
      value: topCategory.category_name || '—',
      accent: 'text-text-primary',
      badge: fallbackLabel(hasData(topCategory)),
      helperText: null,
      context: `${formatCurrencyValue(topCategory.amount)} • ${formatPercent(topCategory.share_of_expenses)}`,
    },
    {
      id: 'budget-confidence',
      title: 'Budget Confidence',
      value: formatScore(budgetConfidence.value),
      accent: 'text-brand-primary',
      badge: fallbackLabel(hasData(budgetConfidence)),
      helperText: SMART_METRIC_HELPERS['budget-confidence'],
      context: `Forecast ${formatScore(budgetConfidence?.components?.forecast_alignment)} • Consistency ${formatScore(budgetConfidence?.components?.historical_consistency)}`,
    },
    {
      id: 'projected-savings',
      title: 'Projected Savings',
      value: projectedSavings.projected_savings == null ? '--' : formatCurrencyValue(projectedSavings.projected_savings),
      accent: 'text-income',
      badge: fallbackLabel(hasData(projectedSavings)),
      helperText: SMART_METRIC_HELPERS['projected-savings'],
      context: projectedSavings.basis || 'Projection unavailable',
    },
  ];
}
