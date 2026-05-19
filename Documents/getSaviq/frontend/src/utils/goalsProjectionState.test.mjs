import test from 'node:test';
import assert from 'node:assert/strict';
import { getGoalDeadlineStatus, getProjectedCompletionSummary } from './goalsProjectionState.js';

test('projection summary matches web intent for projected date', () => {
  const text = getProjectedCompletionSummary({
    projected_completion: {
      projected_completion_date: '2026-10-01T00:00:00Z',
    },
  });

  assert.match(text, /^Projected completion:/);
});

test('projection summary handles completed and missing states', () => {
  assert.equal(
    getProjectedCompletionSummary({ projected_completion: { basis: 'already_completed' } }),
    'Projected completion: Completed'
  );
  assert.equal(getProjectedCompletionSummary(null), 'Projection unavailable');
});

test('projection summary handles month fallback', () => {
  const text = getProjectedCompletionSummary({
    projected_completion: {
      months_remaining: 4.12,
    },
  });
  assert.equal(text, 'Projected completion: ~4.1 months');
});

test('deadline status marks active past-deadline goals only', () => {
  const past = getGoalDeadlineStatus({
    status: 'active',
    current_amount: 100,
    target_amount: 1000,
    deadline: '2020-01-01T00:00:00Z',
  }, new Date('2026-04-21T00:00:00Z'));
  assert.equal(past, 'Past deadline');

  const completed = getGoalDeadlineStatus({
    status: 'completed',
    current_amount: 1000,
    target_amount: 1000,
    deadline: '2020-01-01T00:00:00Z',
  }, new Date('2026-04-21T00:00:00Z'));
  assert.equal(completed, null);
});
