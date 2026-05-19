import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBudgetPayload,
  validateBudgetAmount,
  validateBudgetCategory,
} from './budgetFormState.js';

test('validateBudgetAmount accepts positive numeric input', () => {
  const result = validateBudgetAmount('1500.50');
  assert.equal(result.valid, true);
  assert.equal(result.amount, 1500.5);
});

test('validateBudgetAmount rejects empty/invalid input', () => {
  assert.equal(validateBudgetAmount('').valid, false);
  assert.equal(validateBudgetAmount('0').valid, false);
  assert.equal(validateBudgetAmount('abc').valid, false);
});

test('validateBudgetCategory requires category for category budget form', () => {
  assert.equal(validateBudgetCategory(null).valid, false);
  assert.equal(validateBudgetCategory('cat_food').valid, true);
});

test('buildBudgetPayload returns monthly contract payload', () => {
  const payload = buildBudgetPayload({
    profileId: 'profile_1',
    amount: 800,
    categoryId: 'cat_food',
  });

  assert.deepEqual(payload, {
    profile_id: 'profile_1',
    category_id: 'cat_food',
    amount: 800,
    period: 'monthly',
  });
});

test('buildBudgetPayload handles total budget (no category)', () => {
  const payload = buildBudgetPayload({
    profileId: 'profile_1',
    amount: 1200,
    categoryId: null,
  });

  assert.equal(payload.category_id, null);
  assert.equal(payload.period, 'monthly');
});

test('validateBudgetAmount supports trimmed numeric input', () => {
  const result = validateBudgetAmount('  990.25 ');
  assert.equal(result.valid, true);
  assert.equal(result.amount, 990.25);
});
