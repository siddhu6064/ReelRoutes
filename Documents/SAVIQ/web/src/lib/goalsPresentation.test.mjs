import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoalDisplayModel,
  getProjectedCompletionText,
  selectTopPriorityGoal,
} from './goalsPresentation.js';

test('goals presentation model includes progress, amounts, and projection text from API data', () => {
  const model = buildGoalDisplayModel({
    goal_id: 'goal_1',
    title: 'Emergency Fund',
    progress_percentage: 35.5,
    current_amount: 3550,
    target_amount: 10000,
    projected_completion: {
      basis: 'historical_velocity',
      projected_completion_date: '2026-12-01T00:00:00Z',
    },
  });

  assert.equal(model.progressPercent, 35.5);
  assert.equal(model.currentSavedText, '$3,550.00');
  assert.equal(model.targetAmountText, '$10,000.00');
  assert.match(model.projectionText, /^Projected completion:/);
});

test('projection unavailable fallback renders safely', () => {
  const text = getProjectedCompletionText({
    projected_completion: {
      basis: 'unavailable',
      projected_completion_date: null,
      months_remaining: null,
    },
  });
  assert.equal(text, 'Projection unavailable');
});

test('dashboard widget selector returns top-priority goal', () => {
  const selected = selectTopPriorityGoal([
    {
      goal_id: 'later_goal',
      status: 'active',
      current_amount: 100,
      target_amount: 1000,
      deadline: '2026-12-01T00:00:00Z',
      progress_percentage: 10,
    },
    {
      goal_id: 'soon_goal',
      status: 'active',
      current_amount: 700,
      target_amount: 1000,
      deadline: '2026-06-01T00:00:00Z',
      progress_percentage: 70,
    },
  ]);

  assert.equal(selected.goal_id, 'soon_goal');
});

test('dashboard widget selector handles no-goal state safely', () => {
  const selected = selectTopPriorityGoal([
    {
      goal_id: 'completed_goal',
      status: 'completed',
      current_amount: 1000,
      target_amount: 1000,
      deadline: '2026-06-01T00:00:00Z',
      progress_percentage: 100,
    },
  ]);
  assert.equal(selected, null);
});
