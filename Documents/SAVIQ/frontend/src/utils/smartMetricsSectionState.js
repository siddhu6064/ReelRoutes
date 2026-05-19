function isMetricActive(metric) {
  return Boolean(metric && metric.hasData);
}

export function deriveSmartMetricsViewState({ isLoading, isRefreshing = false, error, cards }) {
  if (isLoading || isRefreshing) return 'loading';
  if (error) return 'error';
  const hasAnyData =
    isMetricActive(cards?.savingsScore) ||
    isMetricActive(cards?.spendVelocity) ||
    isMetricActive(cards?.financialHealth) ||
    isMetricActive(cards?.budgetConfidence) ||
    isMetricActive(cards?.topCategorySummary) ||
    isMetricActive(cards?.projectedSavingsSummary);
  return hasAnyData ? 'success' : 'empty';
}

