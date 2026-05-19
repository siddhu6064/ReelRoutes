import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDashboardSmartMetricCards } from './smartMetricsCards.js';

test('maps savings score and spend velocity values from payload', () => {
  const mapped = mapDashboardSmartMetricCards({
    savings_score: {
      value: 82.4,
      has_sufficient_data: true,
      components: { goals_progress: 70, budget_adherence: 90 },
    },
    spend_velocity: {
      value: 214.37,
      recent_daily_average: 30.5,
      has_sufficient_data: true,
    },
    financial_health_score: {
      value: 74.2,
      has_sufficient_data: true,
      components: { net_position: 66, goal_progress: 79 },
    },
    budget_confidence: {
      value: 68.6,
      has_sufficient_data: true,
      components: { forecast_alignment: 72, historical_consistency: 65 },
    },
    top_category_summary: {
      category_name: 'Rent',
      amount: 950,
      share_of_expenses: 0.4,
      has_sufficient_data: true,
    },
    projected_savings_summary: {
      projected_savings: 420,
      basis: 'net_minus_velocity_remaining_spend',
      has_sufficient_data: true,
    },
  });

  assert.equal(mapped.savingsScore.value, '82');
  assert.equal(mapped.savingsScore.badge, 'Active');
  assert.match(mapped.savingsScore.context, /Goals 70/);

  assert.equal(mapped.spendVelocity.value, '214.4/wk');
  assert.equal(mapped.spendVelocity.badge, 'Active');
  assert.match(mapped.spendVelocity.context, /Daily avg/);

  assert.equal(mapped.financialHealth.value, '74');
  assert.equal(mapped.financialHealth.badge, 'Active');
  assert.match(mapped.financialHealth.context, /Net 66/);

  assert.equal(mapped.budgetConfidence.value, '69');
  assert.equal(mapped.budgetConfidence.badge, 'Active');
  assert.match(mapped.budgetConfidence.context, /Forecast 72/);

  assert.equal(mapped.topCategorySummary.value, 'Rent');
  assert.equal(mapped.topCategorySummary.badge, 'Active');
  assert.match(mapped.topCategorySummary.context, /\$950\.00 • 40.0%/);

  assert.equal(mapped.projectedSavingsSummary.value, '$420.00');
  assert.equal(mapped.projectedSavingsSummary.badge, 'Active');
  assert.equal(mapped.projectedSavingsSummary.context, 'net_minus_velocity_remaining_spend');
});

test('provides safe fallback values when payload is missing/insufficient', () => {
  const mapped = mapDashboardSmartMetricCards({});

  assert.equal(mapped.savingsScore.value, '--');
  assert.equal(mapped.savingsScore.badge, 'Waiting for data');
  assert.equal(mapped.savingsScore.hasData, false);

  assert.equal(mapped.spendVelocity.value, '--');
  assert.equal(mapped.spendVelocity.badge, 'Waiting for data');
  assert.equal(mapped.spendVelocity.hasData, false);

  assert.equal(mapped.financialHealth.value, '--');
  assert.equal(mapped.financialHealth.badge, 'Waiting for data');
  assert.equal(mapped.financialHealth.hasData, false);

  assert.equal(mapped.budgetConfidence.value, '--');
  assert.equal(mapped.budgetConfidence.badge, 'Waiting for data');
  assert.equal(mapped.budgetConfidence.hasData, false);

  assert.equal(mapped.topCategorySummary.value, '—');
  assert.equal(mapped.topCategorySummary.badge, 'Waiting for data');
  assert.equal(mapped.topCategorySummary.hasData, false);
  assert.equal(mapped.topCategorySummary.context, 'No dominant category yet');

  assert.equal(mapped.projectedSavingsSummary.value, '--');
  assert.equal(mapped.projectedSavingsSummary.badge, 'Waiting for data');
  assert.equal(mapped.projectedSavingsSummary.hasData, false);
});

test('top category summary uses explicit fallback context when data is partial', () => {
  const mapped = mapDashboardSmartMetricCards({
    top_category_summary: {
      category_name: '',
      amount: 123,
      share_of_expenses: null,
      has_sufficient_data: true,
    },
  });

  assert.equal(mapped.topCategorySummary.value, '—');
  assert.equal(mapped.topCategorySummary.badge, 'Active');
  assert.equal(mapped.topCategorySummary.context, 'No dominant category yet');
});

test('projected savings uses waiting fallback when value is missing even if data flag is true', () => {
  const mapped = mapDashboardSmartMetricCards({
    projected_savings_summary: {
      projected_savings: null,
      basis: '',
      has_sufficient_data: true,
    },
  });

  assert.equal(mapped.projectedSavingsSummary.value, '--');
  assert.equal(mapped.projectedSavingsSummary.hasData, false);
  assert.equal(mapped.projectedSavingsSummary.badge, 'Waiting for data');
  assert.equal(mapped.projectedSavingsSummary.context, 'Projection unavailable');
});
