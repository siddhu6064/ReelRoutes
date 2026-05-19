function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveSmartInsightsState({ isLoading, isRefreshing = false, error, insights }) {
  if (isLoading || isRefreshing) return 'loading';
  if (error) return 'error';
  return Array.isArray(insights) && insights.length > 0 ? 'success' : 'empty';
}

export function deriveForecastState({ isLoading, isRefreshing = false, error, forecast }) {
  if (isLoading || isRefreshing) return { viewState: 'loading' };
  if (error) return { viewState: 'error' };

  const projectedMonthTotal = toNumber(forecast?.forecast_summary?.totals?.projected_month_total);
  const projectedRemaining = toNumber(forecast?.forecast_summary?.totals?.projected_remaining_spend);
  const confidence = toNumber(forecast?.confidence?.score);
  const riskLevel = String(forecast?.budget_exceed_risk?.level || 'low');
  const hasData = Boolean(forecast && forecast?.basis !== 'no_data');

  return {
    viewState: hasData ? 'success' : 'empty',
    projectedMonthTotal,
    projectedRemaining,
    confidence,
    riskLevel,
  };
}

export function deriveWeeklyDigestState({ isLoading, isRefreshing = false, error, digest }) {
  if (isLoading || isRefreshing) return { viewState: 'loading' };
  if (error) return { viewState: 'error' };

  const summary = digest?.summary || {};
  const transactionCount = toNumber(summary?.transaction_count);
  const hasData = transactionCount > 0;

  return {
    viewState: hasData ? 'success' : 'empty',
    summary: {
      incomeTotal: toNumber(summary?.income_total),
      expenseTotal: toNumber(summary?.expense_total),
      netTotal: toNumber(summary?.net_total),
      transactionCount,
    },
    netDelta: toNumber(digest?.comparisons?.previous_week_net_delta),
    narrative: String(digest?.narrative?.summary || ''),
    weekStart: digest?.week?.start_date || undefined,
    weekEnd: digest?.week?.end_date || undefined,
  };
}

export function deriveSubscriptionState({ isLoading, isRefreshing = false, error, summary }) {
  if (isLoading || isRefreshing) return { viewState: 'loading' };
  if (error) return { viewState: 'error' };

  const monthlyTotal = toNumber(summary?.totals?.monthly_recurring_total);
  const candidateCount = toNumber(summary?.totals?.candidate_count);
  const hasData = candidateCount > 0;
  const candidates = Array.isArray(summary?.candidates) ? summary.candidates : [];

  return {
    viewState: hasData ? 'success' : 'empty',
    monthlyTotal,
    candidateCount,
    candidates: candidates.slice(0, 3).map((candidate) => ({
      merchant: String(candidate?.merchant_display || 'Recurring charge'),
      amount: toNumber(candidate?.average_amount),
      interval: String(candidate?.interval || 'monthly'),
    })),
  };
}
