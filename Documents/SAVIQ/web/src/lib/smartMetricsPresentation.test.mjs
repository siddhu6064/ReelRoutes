import test from 'node:test';
import assert from 'node:assert/strict';

import { mapSmartMetricsToCards, SMART_METRIC_HELPERS } from './smartMetricsPresentation.js';

test('all six smart cards render from valid metric payload', () => {
  const cards = mapSmartMetricsToCards({
    savings_score: {
      value: 78,
      has_sufficient_data: true,
      components: { goals_progress: 70, budget_adherence: 76 },
    },
    spend_velocity: {
      value: 242.25,
      recent_daily_average: 34.6,
      has_sufficient_data: true,
    },
    financial_health_score: {
      value: 66,
      has_sufficient_data: true,
      components: { net_position: 61, goal_progress: 58 },
    },
    budget_confidence: {
      value: 71,
      has_sufficient_data: true,
      components: { forecast_alignment: 64, historical_consistency: 80 },
    },
    top_category_summary: {
      category_name: 'Rent',
      amount: 960,
      share_of_expenses: 0.42,
      has_sufficient_data: true,
    },
    projected_savings_summary: {
      projected_savings: 430,
      basis: 'net_minus_velocity_remaining_spend',
      has_sufficient_data: true,
    },
  });

  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map((card) => card.id), [
    'savings-score',
    'spend-velocity',
    'financial-health',
    'top-category',
    'budget-confidence',
    'projected-savings',
  ]);
  assert.equal(cards.find((item) => item.id === 'savings-score')?.helperText, SMART_METRIC_HELPERS['savings-score']);
  assert.equal(cards.find((item) => item.id === 'spend-velocity')?.helperText, SMART_METRIC_HELPERS['spend-velocity']);
  assert.equal(cards.find((item) => item.id === 'financial-health')?.helperText, SMART_METRIC_HELPERS['financial-health']);
  assert.equal(cards.find((item) => item.id === 'budget-confidence')?.helperText, SMART_METRIC_HELPERS['budget-confidence']);
  assert.equal(cards.find((item) => item.id === 'projected-savings')?.helperText, SMART_METRIC_HELPERS['projected-savings']);
});

test('score values map correctly to card value content', () => {
  const cards = mapSmartMetricsToCards({
    savings_score: { value: 82, has_sufficient_data: true, components: {} },
    financial_health_score: { value: 68, has_sufficient_data: true, components: {} },
    budget_confidence: { value: 77, has_sufficient_data: true, components: {} },
  });

  assert.equal(cards.find((item) => item.id === 'savings-score')?.value, '82');
  assert.equal(cards.find((item) => item.id === 'financial-health')?.value, '68');
  assert.equal(cards.find((item) => item.id === 'budget-confidence')?.value, '77');
});

test('top category and projected savings render safely with sparse inputs', () => {
  const cards = mapSmartMetricsToCards({
    top_category_summary: {
      category_name: null,
      amount: null,
      share_of_expenses: null,
      has_sufficient_data: false,
    },
    projected_savings_summary: {
      projected_savings: null,
      basis: null,
      has_sufficient_data: false,
    },
  });

  assert.equal(cards.find((item) => item.id === 'top-category')?.value, '—');
  assert.match(cards.find((item) => item.id === 'top-category')?.context || '', /\$0\.00/);
  assert.equal(cards.find((item) => item.id === 'top-category')?.helperText, null);
  assert.equal(cards.find((item) => item.id === 'projected-savings')?.value, '--');
  assert.equal(cards.find((item) => item.id === 'projected-savings')?.context, 'Projection unavailable');
});

test('no metric payload does not crash and produces safe defaults', () => {
  const cards = mapSmartMetricsToCards(null);

  assert.equal(cards.length, 6);
  assert.equal(cards.find((item) => item.id === 'savings-score')?.value, '--');
  assert.equal(cards.find((item) => item.id === 'spend-velocity')?.value, '--');
  assert.equal(cards.find((item) => item.id === 'top-category')?.badge, 'Waiting for data');
  assert.equal(cards.find((item) => item.id === 'budget-confidence')?.helperText, SMART_METRIC_HELPERS['budget-confidence']);
  assert.equal(cards.find((item) => item.id === 'projected-savings')?.helperText, SMART_METRIC_HELPERS['projected-savings']);
});

test('helper text for confidence and projection remains cautious and non-guaranteed', () => {
  assert.match(SMART_METRIC_HELPERS['budget-confidence'], /not a guarantee/i);
  assert.match(SMART_METRIC_HELPERS['projected-savings'], /conservative estimate/i);
  assert.match(SMART_METRIC_HELPERS['projected-savings'], /can change/i);
});
