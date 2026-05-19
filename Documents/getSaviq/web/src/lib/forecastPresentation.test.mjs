import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildForecastTrendSeries,
  mapForecastToCardData,
  riskBadgeVariant,
} from './forecastPresentation.js';

test('maps forecast summary payload into dashboard card values', () => {
  const data = mapForecastToCardData({
    month_end_smoothing: {
      observed_daily_spend: 38,
      velocity_daily_spend: 42,
      smoothed_daily_spend: 40,
    },
    forecast_summary: {
      totals: {
        projected_month_total: 1234.56,
      },
      confidence: {
        score: 82.4,
      },
      risk: {
        level: 'high',
        badge: 'risk_high',
      },
    },
  });

  assert.equal(data.projectedMonthlySpend, '$1,234.56');
  assert.equal(data.confidencePercent, '82%');
  assert.equal(data.riskBadge.label, 'HIGH');
  assert.equal(data.riskBadge.badge, 'risk_high');
  assert.equal(data.hasData, true);
  assert.equal(data.trendSeries.length, 3);
  assert.match(data.explanation, /above budget/i);
});

test('falls back to top-level confidence/risk keys when summary is partial', () => {
  const data = mapForecastToCardData({
    confidence: {
      score: 45,
    },
    budget_exceed_risk: {
      level: 'medium',
      badge: 'risk_medium',
    },
  });

  assert.equal(data.projectedMonthlySpend, '$0.00');
  assert.equal(data.confidencePercent, '45%');
  assert.equal(data.riskBadge.label, 'MEDIUM');
  assert.equal(data.riskBadge.badge, 'risk_medium');
  assert.equal(data.hasData, false);
  assert.match(data.explanation, /need a bit more/i);
});

test('safe defaults when forecast data is missing', () => {
  const data = mapForecastToCardData(null);

  assert.equal(data.projectedMonthlySpend, '$0.00');
  assert.equal(data.confidencePercent, '0%');
  assert.equal(data.riskBadge.label, 'LOW');
  assert.equal(data.riskBadge.badge, 'risk_low');
  assert.equal(data.hasData, false);
  assert.equal(data.trendSeries.length, 0);
});

test('maps risk badge keys to badge variants', () => {
  assert.equal(riskBadgeVariant('risk_high'), 'expense');
  assert.equal(riskBadgeVariant('risk_medium'), 'warning');
  assert.equal(riskBadgeVariant('risk_low'), 'default');
  assert.equal(riskBadgeVariant('unknown'), 'default');
});

test('trend visualization data is generated safely for normal payload', () => {
  const series = buildForecastTrendSeries({
    month_end_smoothing: {
      observed_daily_spend: 30,
      velocity_daily_spend: 33,
      smoothed_daily_spend: 36,
    },
  });

  assert.deepEqual(series, [
    { label: 'Observed', amount: 30 },
    { label: 'Recent pace', amount: 33 },
    { label: 'Forecast pace', amount: 36 },
  ]);
});

test('trend visualization data safely falls back for incomplete payload', () => {
  const series = buildForecastTrendSeries({
    month_end_smoothing: {
      observed_daily_spend: null,
      velocity_daily_spend: undefined,
      smoothed_daily_spend: 0,
    },
  });
  assert.deepEqual(series, []);
});

test('forecast explanation remains understandable in low confidence state', () => {
  const data = mapForecastToCardData({
    forecast_summary: {
      totals: { projected_month_total: 900 },
      confidence: { score: 10 },
      risk: { level: 'low', badge: 'risk_low' },
    },
  });

  assert.match(data.explanation, /early estimate/i);
});
