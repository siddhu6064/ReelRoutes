import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDigestBannerDismiss,
  mapWeeklyDigestBannerData,
  resolveWeeklyDigestBannerState,
} from './weeklyDigestBannerState.js';

test('newest digest banner renders when a persisted digest exists', () => {
  const state = resolveWeeklyDigestBannerState({
    loading: false,
    error: null,
    digest: { digest: { narrative: { summary: 'Spending is down this week.' } } },
  });

  assert.equal(state, 'ready');
});

test('no-digest state is safe and does not break dashboard rendering', () => {
  const state = resolveWeeklyDigestBannerState({
    loading: false,
    error: null,
    digest: null,
  });

  assert.equal(state, 'hidden');
});

test('recommendation bullets render safely with polarity framing', () => {
  const mapped = mapWeeklyDigestBannerData({
    digest: {
      narrative: { summary: 'Weekly summary' },
      recommendations: [
        { id: 'a', text: 'Keep this trend.', polarity: 'positive' },
        { id: 'b', text: 'Watch this category.', polarity: 'neutral' },
        { id: 'c', text: 'Cut optional spend.', polarity: 'negative' },
        { id: 'd', text: 'ignored', polarity: 'positive' },
      ],
    },
  });

  assert.equal(mapped.recommendations.length, 3);
  assert.deepEqual(mapped.recommendations.map((item) => item.polarity), ['positive', 'neutral', 'negative']);
});

test('banner fetch failure remains isolated from the rest of dashboard', () => {
  const state = resolveWeeklyDigestBannerState({
    loading: false,
    error: 'network error',
    digest: null,
  });

  assert.equal(state, 'hidden');
});

test('dismiss/archive action hides banner without changing digest card payload', () => {
  const initial = {
    digest: {
      digest: {
        summary: { transaction_count: 4 },
      },
    },
    digestCard: {
      summary: { transaction_count: 4 },
    },
  };

  const next = applyDigestBannerDismiss(initial);

  assert.equal(next.digest, null);
  assert.deepEqual(next.digestCard, initial.digestCard);
});
