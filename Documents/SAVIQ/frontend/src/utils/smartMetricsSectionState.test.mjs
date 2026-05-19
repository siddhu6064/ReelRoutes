import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDashboardSmartMetricCards } from './smartMetricsCards.js';
import { deriveSmartMetricsViewState } from './smartMetricsSectionState.js';

test('smart metrics section state resolves loading, error, empty, success', () => {
  const emptyCards = mapDashboardSmartMetricCards({});
  const successCards = mapDashboardSmartMetricCards({
    savings_score: { value: 80, has_sufficient_data: true, components: {} },
  });

  assert.equal(deriveSmartMetricsViewState({ isLoading: true, error: '', cards: emptyCards }), 'loading');
  assert.equal(deriveSmartMetricsViewState({ isLoading: false, error: 'failed', cards: successCards }), 'error');
  assert.equal(deriveSmartMetricsViewState({ isLoading: false, isRefreshing: true, error: '', cards: successCards }), 'loading');
  assert.equal(deriveSmartMetricsViewState({ isLoading: false, error: '', cards: emptyCards }), 'empty');
  assert.equal(deriveSmartMetricsViewState({ isLoading: false, error: '', cards: successCards }), 'success');
});

test('smart metrics mapping keeps invalid values safe for UI rendering', () => {
  const mapped = mapDashboardSmartMetricCards({
    savings_score: { value: NaN, has_sufficient_data: true, components: { goals_progress: undefined, budget_adherence: 'bad' } },
    spend_velocity: { value: 'nope', recent_daily_average: undefined, has_sufficient_data: true },
    top_category_summary: { category_name: '', amount: undefined, share_of_expenses: NaN, has_sufficient_data: false },
    projected_savings_summary: { projected_savings: undefined, basis: '', has_sufficient_data: false },
  });

  assert.equal(mapped.savingsScore.value, '--');
  assert.match(mapped.savingsScore.context, /Goals --/);

  assert.equal(mapped.spendVelocity.value, '--');
  assert.match(mapped.spendVelocity.context, /Daily avg \$0\.00/);

  assert.equal(mapped.topCategorySummary.value, '—');
  assert.equal(mapped.topCategorySummary.context, 'No dominant category yet');

  assert.equal(mapped.projectedSavingsSummary.value, '--');
  assert.equal(mapped.projectedSavingsSummary.context, 'Projection unavailable');
});
