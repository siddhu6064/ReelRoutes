import test from 'node:test';
import assert from 'node:assert/strict';

import { mapSmartMetricsToCards } from './smartMetricsPresentation.js';
import { deriveSmartMetricsSectionState, getSmartMetricsModeRoots, resolveSmartMetricsMode } from './smartMetricsSectionState.js';
import { getSmartMetricsGridClass } from './smartMetricsDashboardState.js';

test('loading state renders safely', () => {
  const state = deriveSmartMetricsSectionState({
    loading: true,
    error: null,
    metricsPayload: null,
  });

  assert.equal(state.mode, 'loading');
  assert.equal(resolveSmartMetricsMode({ loading: true, error: null, metricsPayload: null }), 'loading');
});

test('empty state renders safely when payload is missing', () => {
  const state = deriveSmartMetricsSectionState({
    loading: false,
    error: null,
    metricsPayload: null,
  });

  assert.equal(state.mode, 'empty');
  assert.equal(resolveSmartMetricsMode({ loading: false, error: null, metricsPayload: null }), 'empty');
});

test('error state renders safely and remains isolated', () => {
  const state = deriveSmartMetricsSectionState({
    loading: false,
    error: 'Please try again in a moment.',
    metricsPayload: {
      savings_score: { value: 80, has_sufficient_data: true, components: {} },
    },
  });

  assert.equal(state.mode, 'error');
  assert.match(state.message || '', /try again/i);
  assert.equal(resolveSmartMetricsMode({
    loading: false,
    error: 'Please try again in a moment.',
    metricsPayload: null,
  }), 'error');
});

test('success state preserves six-card smart metric grid rendering', () => {
  const payload = {
    savings_score: { value: 82, has_sufficient_data: true, components: {} },
    spend_velocity: { value: 200, recent_daily_average: 30, has_sufficient_data: true },
    financial_health_score: { value: 76, has_sufficient_data: true, components: {} },
    budget_confidence: { value: 74, has_sufficient_data: true, components: {} },
    top_category_summary: { category_name: 'Rent', amount: 950, share_of_expenses: 0.4, has_sufficient_data: true },
    projected_savings_summary: { projected_savings: 420, basis: 'net_minus_velocity_remaining_spend', has_sufficient_data: true },
  };

  const state = deriveSmartMetricsSectionState({
    loading: false,
    error: null,
    metricsPayload: payload,
  });
  const cards = mapSmartMetricsToCards(payload);

  assert.equal(state.mode, 'success');
  assert.equal(cards.length, 6);
  assert.equal(getSmartMetricsGridClass(cards.length), 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4');
});

test('mode roots remain one-hot for all supported smart metrics modes', () => {
  for (const mode of ['loading', 'error', 'success', 'empty']) {
    const roots = getSmartMetricsModeRoots(mode);
    const trueCount = Object.values(roots).filter(Boolean).length;
    assert.equal(trueCount, 1);
  }
});
