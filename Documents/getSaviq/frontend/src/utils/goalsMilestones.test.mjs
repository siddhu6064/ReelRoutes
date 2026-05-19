import test from 'node:test';
import assert from 'node:assert/strict';
import { getGoalMilestone } from './goalsMilestones.js';

test('milestone badge thresholds are deterministic', () => {
  assert.equal(getGoalMilestone(1, 'active'), 'Started');
  assert.equal(getGoalMilestone(50, 'active'), 'Halfway');
  assert.equal(getGoalMilestone(90, 'active'), 'Near Goal');
});

test('milestones are suppressed for completed/cancelled goals', () => {
  assert.equal(getGoalMilestone(100, 'completed'), null);
  assert.equal(getGoalMilestone(60, 'cancelled'), null);
});

test('milestones are hidden for 0 progress', () => {
  assert.equal(getGoalMilestone(0, 'active'), null);
});
