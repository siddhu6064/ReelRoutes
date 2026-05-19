import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveWeeklyDigestCardState,
  triggerWeeklyDigestRefresh,
} from './weeklyDigestCardState.js';

test('card renders loading state', () => {
  assert.equal(resolveWeeklyDigestCardState({ loading: true, error: null, digest: null }), 'loading');
});

test('card renders error state safely', () => {
  assert.equal(resolveWeeklyDigestCardState({ loading: false, error: 'boom', digest: null }), 'error');
});

test('card renders empty-safe values state', () => {
  assert.equal(
    resolveWeeklyDigestCardState({ loading: false, error: null, digest: { summary: { transaction_count: 0 } } }),
    'empty'
  );
});

test('refresh action triggers expected reload flow safely', () => {
  let called = 0;
  const result = triggerWeeklyDigestRefresh({
    loading: false,
    onRefresh: () => {
      called += 1;
    },
  });
  assert.equal(result, true);
  assert.equal(called, 1);
});
