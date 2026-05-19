import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveForecastState,
  deriveSmartInsightsState,
  deriveSubscriptionState,
  deriveWeeklyDigestState,
} from './aiIntelligenceState.js';

test('smart insights state resolver handles loading/error/empty/success', () => {
  assert.equal(deriveSmartInsightsState({ isLoading: true, error: '', insights: [] }), 'loading');
  assert.equal(deriveSmartInsightsState({ isLoading: false, error: 'boom', insights: [{}] }), 'error');
  assert.equal(deriveSmartInsightsState({ isLoading: false, isRefreshing: true, error: '', insights: [{ title: 'A' }] }), 'loading');
  assert.equal(deriveSmartInsightsState({ isLoading: false, error: '', insights: [] }), 'empty');
  assert.equal(deriveSmartInsightsState({ isLoading: false, error: '', insights: [{ title: 'A' }] }), 'success');
});

test('forecast view model sanitizes invalid payload values and state', () => {
  const refreshing = deriveForecastState({ isLoading: false, isRefreshing: true, error: '', forecast: { basis: 'recent_history' } });
  assert.equal(refreshing.viewState, 'loading');

  const empty = deriveForecastState({ isLoading: false, error: '', forecast: { basis: 'no_data' } });
  assert.equal(empty.viewState, 'empty');

  const success = deriveForecastState({
    isLoading: false,
    error: '',
    forecast: {
      basis: 'recent_history',
      forecast_summary: { totals: { projected_month_total: 'bad', projected_remaining_spend: 123.5 } },
      confidence: { score: 'nope' },
      budget_exceed_risk: { level: null },
    },
  });
  assert.equal(success.viewState, 'success');
  assert.equal(success.projectedMonthTotal, 0);
  assert.equal(success.projectedRemaining, 123.5);
  assert.equal(success.confidence, 0);
  assert.equal(success.riskLevel, 'low');
});

test('weekly digest view model handles empty and invalid numeric values safely', () => {
  const refreshing = deriveWeeklyDigestState({ isLoading: false, isRefreshing: true, error: '', digest: { summary: { transaction_count: 2 } } });
  assert.equal(refreshing.viewState, 'loading');

  const empty = deriveWeeklyDigestState({
    isLoading: false,
    error: '',
    digest: { summary: { transaction_count: 0 } },
  });
  assert.equal(empty.viewState, 'empty');

  const success = deriveWeeklyDigestState({
    isLoading: false,
    error: '',
    digest: {
      week: { start_date: '2026-01-05', end_date: '2026-01-11' },
      summary: { income_total: '1000.2', expense_total: 'oops', net_total: undefined, transaction_count: '3' },
      comparisons: { previous_week_net_delta: 'bad' },
      narrative: { summary: null },
    },
  });

  assert.equal(success.viewState, 'success');
  assert.equal(success.summary.incomeTotal, 1000.2);
  assert.equal(success.summary.expenseTotal, 0);
  assert.equal(success.netDelta, 0);
});

test('subscription view model avoids leaking invalid values and limits candidates', () => {
  const refreshing = deriveSubscriptionState({ isLoading: false, isRefreshing: true, error: '', summary: { totals: { candidate_count: 1 } } });
  assert.equal(refreshing.viewState, 'loading');

  const empty = deriveSubscriptionState({
    isLoading: false,
    error: '',
    summary: { totals: { candidate_count: 0 } },
  });
  assert.equal(empty.viewState, 'empty');

  const success = deriveSubscriptionState({
    isLoading: false,
    error: '',
    summary: {
      totals: { candidate_count: '2', monthly_recurring_total: 'abc' },
      candidates: [
        { merchant_display: '', average_amount: 'not-a-number', interval: '' },
        { merchant_display: 'Netflix', average_amount: 15.99, interval: 'monthly' },
        { merchant_display: 'Spotify', average_amount: 10.99, interval: 'monthly' },
        { merchant_display: 'Extra', average_amount: 5, interval: 'monthly' },
      ],
    },
  });

  assert.equal(success.viewState, 'success');
  assert.equal(success.monthlyTotal, 0);
  assert.equal(success.candidates.length, 3);
  assert.equal(success.candidates[0].merchant, 'Recurring charge');
  assert.equal(success.candidates[0].amount, 0);
});
