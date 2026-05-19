import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatCadence,
  formatConfidence,
  mapSubscriptionsSummary,
} from './subscriptionsPresentation.js';

test('subscriptions card mapping renders recurring items from API data', () => {
  const view = mapSubscriptionsSummary({
    candidates: [
      {
        merchant_display: 'Netflix',
        average_amount: 15.99,
        interval: 'monthly',
        confidence: 0.92,
      },
    ],
  });

  assert.equal(view.hasItems, true);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].merchant, 'Netflix');
});

test('merchant, amount, cadence, and confidence fields map correctly', () => {
  const view = mapSubscriptionsSummary({
    candidates: [
      {
        merchant_normalized: 'spotify',
        average_amount: 9.99,
        interval: 'weekly',
        confidence: 0.81,
      },
    ],
  });

  assert.equal(view.items[0].merchant, 'spotify');
  assert.equal(view.items[0].amount, '$9.99');
  assert.equal(view.items[0].cadence, 'Weekly');
  assert.equal(view.items[0].confidence, '81%');
});

test('safe handling for empty/no-data state', () => {
  const view = mapSubscriptionsSummary(null);
  assert.equal(view.hasItems, false);
  assert.deepEqual(view.items, []);
  assert.equal(view.monthlyRecurringTotal, 0);
  assert.equal(view.annualRecurringTotal, 0);
});

test('monthly recurring total renders correctly from API data', () => {
  const view = mapSubscriptionsSummary({
    totals: {
      monthly_recurring_total: 83.33,
      annual_recurring_estimate: 1000,
    },
    candidates: [],
  });
  assert.equal(view.monthlyRecurringTotal, 83.33);
});

test('annual recurring total renders correctly from API data', () => {
  const view = mapSubscriptionsSummary({
    totals: {
      monthly_recurring_total: 83.33,
      annual_recurring_estimate: 1000,
    },
    candidates: [],
  });
  assert.equal(view.annualRecurringTotal, 1000);
});

test('unknown cadence candidates are safely excluded from recurring list', () => {
  const view = mapSubscriptionsSummary({
    candidates: [
      {
        merchant_display: 'Some Store',
        average_amount: 40,
        interval: 'none',
        confidence: 0.2,
      },
    ],
  });
  assert.equal(view.hasItems, false);
});

test('format helpers remain deterministic', () => {
  assert.equal(formatCadence('quarterly'), 'Quarterly');
  assert.equal(formatCadence(''), 'Unknown');
  assert.equal(formatConfidence(0.505), '51%');
  assert.equal(formatConfidence(null), '0%');
});

test('existing recurring list mapping remains intact when data exists', () => {
  const view = mapSubscriptionsSummary({
    candidates: [
      {
        merchant_display: 'Netflix',
        average_amount: 15.99,
        interval: 'monthly',
        confidence: 0.92,
      },
      {
        merchant_display: 'Spotify',
        average_amount: 9.99,
        interval: 'monthly',
        confidence: 0.88,
      },
    ],
  });

  assert.equal(view.hasItems, true);
  assert.equal(view.items.length, 2);
  assert.equal(view.items[0].merchant, 'Netflix');
  assert.equal(view.items[1].merchant, 'Spotify');
});
