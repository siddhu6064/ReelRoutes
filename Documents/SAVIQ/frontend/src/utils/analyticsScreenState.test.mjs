import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAnalyticsViewState, sanitizeAnalyticsPayload } from './analyticsScreenState.js';

test('analytics view state resolves loading, error, empty, success safely', () => {
  assert.equal(
    deriveAnalyticsViewState({
      isLoading: true,
      error: '',
      summary: null,
      categoryItems: [],
      paymentItems: [],
      trendItems: [],
    }),
    'loading'
  );

  assert.equal(
    deriveAnalyticsViewState({
      isLoading: false,
      error: 'Could not load analytics',
      summary: null,
      categoryItems: [],
      paymentItems: [],
      trendItems: [],
    }),
    'error'
  );

  assert.equal(
    deriveAnalyticsViewState({
      isLoading: false,
      error: '',
      summary: { total_income: 0, total_spend: 0, net_balance: 0, month_over_month_change_pct: 0 },
      categoryItems: [],
      paymentItems: [],
      trendItems: [],
    }),
    'empty'
  );

  assert.equal(
    deriveAnalyticsViewState({
      isLoading: false,
      error: '',
      summary: { total_income: 1200, total_spend: 300, net_balance: 900, month_over_month_change_pct: -4 },
      categoryItems: [],
      paymentItems: [],
      trendItems: [],
    }),
    'success'
  );
});

test('analytics sanitizer removes invalid numbers and preserves safe defaults', () => {
  const sanitized = sanitizeAnalyticsPayload({
    summary: { net_balance: NaN, total_income: undefined, total_spend: '500.2', month_over_month_change_pct: 'oops' },
    categoryItems: [{ category_name: 'Very Long Category Name For Mobile Width', amount: 'NaN', percentage: 120 }],
    paymentItems: [{ payment_method_name: '', amount: undefined }],
    trendItems: [{ month: '', amount: 'bad' }],
  });

  assert.equal(sanitized.summary.net_balance, 0);
  assert.equal(sanitized.summary.total_income, 0);
  assert.equal(sanitized.summary.total_spend, 500.2);
  assert.equal(sanitized.summary.month_over_month_change_pct, 0);

  assert.equal(sanitized.categoryItems[0].amount, 0);
  assert.equal(sanitized.categoryItems[0].percentage, 100);
  assert.match(sanitized.categoryItems[0].label, /…$/);

  assert.equal(sanitized.paymentItems[0].label, 'Unknown');
  assert.equal(sanitized.paymentItems[0].amount, 0);

  assert.equal(sanitized.trendItems[0].month, 'Unknown');
  assert.equal(sanitized.trendItems[0].amount, 0);
});
