import test from 'node:test';
import assert from 'node:assert/strict';
import { toGoalPayload, validateGoalForm } from './goalsFormState.js';

test('validateGoalForm blocks empty title, invalid target, and past deadline', () => {
  const errors = validateGoalForm({
    title: '',
    target_amount: 0,
    current_amount: 0,
    deadline: '2020-01-01',
  }, new Date('2026-04-21T12:00:00Z'));

  assert.equal(errors.title, 'Title is required');
  assert.equal(errors.target_amount, 'Target amount must be greater than 0');
  assert.equal(errors.deadline, 'Deadline cannot be in the past');
});

test('validateGoalForm blocks current amount above target', () => {
  const errors = validateGoalForm({
    title: 'Emergency Fund',
    target_amount: 1000,
    current_amount: 1200,
    deadline: '2026-12-10',
  }, new Date('2026-04-21T12:00:00Z'));

  assert.equal(errors.current_amount, 'Current amount cannot exceed target amount');
});

test('toGoalPayload converts form values to API payload', () => {
  const payload = toGoalPayload({
    title: ' Vacation ',
    target_amount: '3000',
    current_amount: '',
    deadline: '2026-11-01',
    category: '',
    status: 'active',
  }, 'profile_1');

  assert.equal(payload.profile_id, 'profile_1');
  assert.equal(payload.title, 'Vacation');
  assert.equal(payload.target_amount, 3000);
  assert.equal(payload.current_amount, 0);
  assert.equal(payload.category, 'General');
  assert.equal(payload.status, 'active');
  assert.match(payload.deadline, /^2026-11-01T/);
});

test('toGoalPayload keeps explicit category/status values for edit flow', () => {
  const payload = toGoalPayload({
    title: 'Emergency Fund',
    target_amount: '5000',
    current_amount: '2500',
    deadline: '2026-12-25',
    category: 'Safety',
    status: 'paused',
  }, 'profile_2');

  assert.equal(payload.profile_id, 'profile_2');
  assert.equal(payload.category, 'Safety');
  assert.equal(payload.status, 'paused');
  assert.equal(payload.current_amount, 2500);
});
