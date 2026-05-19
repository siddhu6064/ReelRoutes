import test from 'node:test';
import assert from 'node:assert/strict';

import { mapWeeklyDigestToCardData } from './weeklyDigestPresentation.js';

test('success rendering includes week label', () => {
  const data = mapWeeklyDigestToCardData({
    week: {
      start_date: '2026-04-06T00:00:00+00:00',
      end_date: '2026-04-12T23:59:59+00:00',
    },
    summary: {
      net_total: 280,
      income_total: 1000,
      expense_total: 720,
      transaction_count: 9,
    },
    highlights: {
      top_category_name: 'food',
      top_category_amount: 320,
      savings_rate: 0.28,
    },
    comparisons: {
      previous_week_net_delta: 80,
    },
    signals: {
      unusual_spending_detected: true,
      largest_expense: {
        merchant: 'Skyline Grocer',
        amount: 121.99,
      },
    },
    breakdown: {
      top_expense_categories: [
        { category_id: 'food', total_amount: 320 },
        { category_id: 'rent', total_amount: 250 },
        { category_id: 'transport', total_amount: 80 },
      ],
    },
  });

  assert.equal(data.weekLabel, 'Apr 6–12, 2026');
  assert.equal(data.netTotal, '$280.00');
  assert.equal(data.incomeTotal, '$1,000.00');
  assert.equal(data.expenseTotal, '$720.00');
  assert.equal(data.transactionCount, 9);
  assert.equal(data.topCategoryName, 'food');
  assert.equal(data.topCategoryAmount, '$320.00');
  assert.match(data.netDeltaCue, /Net up/);
});

test('savings rate renders only when provided', () => {
  const withRate = mapWeeklyDigestToCardData({
    highlights: { savings_rate: 0.7 },
  });
  const withoutRate = mapWeeklyDigestToCardData({
    highlights: { savings_rate: null },
  });

  assert.equal(withRate.savingsRate, '70.0%');
  assert.equal(withoutRate.savingsRate, null);
});

test('unusual spending indicator renders correctly for true and false cases', () => {
  const unusual = mapWeeklyDigestToCardData({
    signals: { unusual_spending_detected: true },
  });
  const normal = mapWeeklyDigestToCardData({
    signals: { unusual_spending_detected: false },
  });

  assert.equal(unusual.unusualSpendingDetected, true);
  assert.equal(normal.unusualSpendingDetected, false);
});

test('largest expense renders correctly when present and safely when absent', () => {
  const withLargest = mapWeeklyDigestToCardData({
    signals: {
      largest_expense: {
        merchant: 'River Cafe',
        amount: 89,
      },
    },
  });
  const withoutLargest = mapWeeklyDigestToCardData({
    signals: {
      largest_expense: null,
    },
  });

  assert.equal(withLargest.largestExpense, 'River Cafe · $89.00');
  assert.equal(withoutLargest.largestExpense, null);
});

test('top expense categories list renders max 3 items and handles empty input safely', () => {
  const data = mapWeeklyDigestToCardData({
    breakdown: {
      top_expense_categories: [
        { category_id: 'food', total_amount: 300 },
        { category_id: 'rent', total_amount: 250 },
        { category_id: 'travel', total_amount: 150 },
        { category_id: 'shopping', total_amount: 120 },
      ],
    },
  });

  const empty = mapWeeklyDigestToCardData({
    breakdown: {
      top_expense_categories: [],
    },
  });

  assert.equal(data.topExpenseCategories.length, 3);
  assert.deepEqual(data.topExpenseCategories.map((item) => item.categoryId), ['food', 'rent', 'travel']);
  assert.deepEqual(empty.topExpenseCategories, []);
});

