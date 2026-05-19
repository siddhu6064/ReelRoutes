import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGoalForm, toGoalPayload } from './goalsValidation.js';

test('validateGoalForm blocks empty title, invalid target, and past deadline', () => {
  const errors = validateGoalForm({
    title: '   ',
    target_amount: 0,
    deadline: '2020-01-01',
  }, new Date('2026-04-05T00:00:00Z'));

  assert.equal(errors.title, 'Title is required');
  assert.equal(errors.target_amount, 'Target amount must be greater than 0');
  assert.equal(errors.deadline, 'Deadline cannot be in the past');
});

test('validateGoalForm accepts valid input', () => {
  const errors = validateGoalForm({
    title: 'Emergency Fund',
    target_amount: 5000,
    deadline: '2026-12-01',
  }, new Date('2026-04-05T00:00:00Z'));

  assert.deepEqual(errors, {});
});

test('toGoalPayload normalizes fields', () => {
  const payload = toGoalPayload({
    title: '  Trip  ',
    target_amount: '3000',
    current_amount: '',
    deadline: '2026-11-01',
    category: '',
    status: 'active',
  }, 'profile_1');

  assert.equal(payload.profile_id, 'profile_1');
  assert.equal(payload.title, 'Trip');
  assert.equal(payload.target_amount, 3000);
  assert.equal(payload.current_amount, 0);
  assert.equal(payload.category, 'General');
});
