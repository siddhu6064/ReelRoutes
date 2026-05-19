function formatCurrencyValue(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildExplanationCopy({ hasData, riskLevel, confidenceScore }) {
  if (!hasData) {
    return 'We need a bit more recent spending activity before we can estimate your month-end total.';
  }

  const roundedConfidence = Math.round(confidenceScore);
  if (roundedConfidence < 40) {
    return 'This is an early estimate based on limited recent activity, so expect it to shift as you log more transactions.';
  }

  if (riskLevel === 'high') {
    return 'At your current pace, you may finish this month above budget. A few smaller spend choices can still lower the total.';
  }

  if (riskLevel === 'medium') {
    return 'Your spending pace is close to your budget limit this month. Keeping the next few days lighter can help you stay on track.';
  }

  return 'At your current pace, your month-end spending looks manageable. Keep tracking to maintain this trend.';
}

export function buildForecastTrendSeries(forecast) {
  const smoothing = forecast?.month_end_smoothing || {};
  const observedDaily = toSafeNumber(smoothing.observed_daily_spend);
  const smoothedDaily = toSafeNumber(smoothing.smoothed_daily_spend);
  const velocityDaily = toSafeNumber(smoothing.velocity_daily_spend);

  const hasTrendData = observedDaily > 0 || smoothedDaily > 0 || velocityDaily > 0;
  if (!hasTrendData) return [];

  return [
    { label: 'Observed', amount: observedDaily },
    { label: 'Recent pace', amount: velocityDaily > 0 ? velocityDaily : smoothedDaily },
    { label: 'Forecast pace', amount: smoothedDaily },
  ];
}

export function mapForecastToCardData(forecast) {
  const totals = forecast?.forecast_summary?.totals || {};
  const confidence = forecast?.forecast_summary?.confidence || forecast?.confidence || {};
  const risk = forecast?.forecast_summary?.risk || forecast?.budget_exceed_risk || {};
  const confidenceScore = toSafeNumber(confidence.score);
  const riskLevel = risk.level || 'low';
  const hasData = Boolean(forecast?.forecast_summary);
  const trendSeries = buildForecastTrendSeries(forecast);

  return {
    projectedMonthlySpend: formatCurrencyValue(totals.projected_month_total || 0),
    confidencePercent: `${Math.round(confidenceScore)}%`,
    riskBadge: {
      label: riskLevel.toUpperCase(),
      badge: risk.badge || 'risk_low',
    },
    hasData,
    trendSeries,
    explanation: buildExplanationCopy({ hasData, riskLevel, confidenceScore }),
  };
}

export function riskBadgeVariant(riskBadge) {
  if (riskBadge === 'risk_high') return 'expense';
  if (riskBadge === 'risk_medium') return 'warning';
  return 'default';
}
