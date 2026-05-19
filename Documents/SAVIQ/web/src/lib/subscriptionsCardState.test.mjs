import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSubscriptionsCardState,
  SUBSCRIPTIONS_AI_ASSISTED_TEXT,
  triggerSubscriptionsRefresh,
} from './subscriptionsCardState.js';

test('AI-assisted helper text renders with clear non-technical copy', () => {
  assert.equal(SUBSCRIPTIONS_AI_ASSISTED_TEXT.includes('AI-assisted'), true);
  assert.equal(SUBSCRIPTIONS_AI_ASSISTED_TEXT.includes('transactions'), true);
});

test('refresh/recalculate action is expected in non-loading states', () => {
  assert.equal(resolveSubscriptionsCardState({ loading: false, error: null, summary: { candidates: [] } }), 'empty');
  assert.equal(resolveSubscriptionsCardState({ loading: false, error: null, summary: { candidates: [{ merchant_display: 'Netflix' }] } }), 'ready');
});

test('refresh action triggers expected reload flow safely', () => {
  let called = 0;
  const result = triggerSubscriptionsRefresh({
    loading: false,
    onRefresh: () => {
      called += 1;
    },
  });

  assert.equal(result, true);
  assert.equal(called, 1);
});

test('refresh action is ignored while loading', () => {
  let called = 0;
  const result = triggerSubscriptionsRefresh({
    loading: true,
    onRefresh: () => {
      called += 1;
    },
  });

  assert.equal(result, false);
  assert.equal(called, 0);
});

test('loading and error states still resolve correctly', () => {
  assert.equal(resolveSubscriptionsCardState({ loading: true, error: null, summary: null }), 'loading');
  assert.equal(resolveSubscriptionsCardState({ loading: false, error: 'boom', summary: null }), 'error');
});
