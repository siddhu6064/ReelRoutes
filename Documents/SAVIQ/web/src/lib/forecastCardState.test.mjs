import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveForecastCardState,
  shouldApplyForecastResponse,
  triggerForecastRetry,
} from './forecastCardState.js';

test('forecast card loading state renders safely', () => {
  const state = resolveForecastCardState({ loading: true, error: null, forecast: null });
  assert.equal(state, 'loading');
});

test('forecast card empty state renders when no usable forecast data exists', () => {
  const state = resolveForecastCardState({
    loading: false,
    error: null,
    forecast: { budget_exceed_risk: { level: 'low' } },
  });
  assert.equal(state, 'empty');
});

test('retry/failure state resolves and retry action triggers reload callback', () => {
  const state = resolveForecastCardState({
    loading: false,
    error: 'Forecast unavailable right now. Please try again.',
    forecast: null,
  });
  assert.equal(state, 'error');

  let called = 0;
  const didRetry = triggerForecastRetry(state, () => {
    called += 1;
  });

  assert.equal(didRetry, true);
  assert.equal(called, 1);
});

test('forecast response is ignored when active profile changes', () => {
  const shouldApply = shouldApplyForecastResponse({
    isMounted: true,
    requestId: 4,
    latestRequestId: 4,
    requestedProfileId: 'profile_a',
    activeProfileId: 'profile_b',
  });

  assert.equal(shouldApply, false);
});

test('existing normal forecast rendering state remains intact', () => {
  const state = resolveForecastCardState({
    loading: false,
    error: null,
    forecast: {
      forecast_summary: {
        totals: { projected_month_total: 1200 },
      },
    },
  });

  assert.equal(state, 'ready');
});
