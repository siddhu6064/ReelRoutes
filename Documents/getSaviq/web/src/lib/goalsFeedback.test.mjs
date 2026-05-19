import test from 'node:test';
import assert from 'node:assert/strict';
import { GOALS_EMPTY_STATE_COPY, getGoalActionMessage } from './goalsFeedback.js';

test('empty state copy is encouraging and includes CTA text', () => {
  assert.match(GOALS_EMPTY_STATE_COPY.title, /first savings goal/i);
  assert.match(GOALS_EMPTY_STATE_COPY.description, /track progress/i);
  assert.match(GOALS_EMPTY_STATE_COPY.cta, /create/i);
});

test('create success banner message is friendly', () => {
  assert.equal(getGoalActionMessage('create', true), 'Goal created successfully.');
});

test('update success banner message is friendly', () => {
  assert.equal(getGoalActionMessage('update', true), 'Goal updated successfully.');
});

test('delete success banner message is friendly', () => {
  assert.equal(getGoalActionMessage('delete', true), 'Goal deleted successfully.');
});

test('failure banner messages are safe and generic', () => {
  assert.equal(getGoalActionMessage('create', false), 'Could not create goal. Please try again.');
  assert.equal(getGoalActionMessage('update', false), 'Could not update goal. Please try again.');
  assert.equal(getGoalActionMessage('delete', false), 'Could not delete goal. Please try again.');
  assert.equal(getGoalActionMessage('load', false), 'Could not load goals right now. Please refresh and try again.');
});
