import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSubmitTransaction,
  getTransactionSaveErrorMessage,
  isRetryableTransactionSaveError,
} from './transactionRetryState.js';

test('canSubmitTransaction prevents duplicate submit and invalid input', () => {
  assert.equal(canSubmitTransaction({ isSubmitting: true, amount: '12.50', hasActiveProfile: true }), false);
  assert.equal(canSubmitTransaction({ isSubmitting: false, amount: '', hasActiveProfile: true }), false);
  assert.equal(canSubmitTransaction({ isSubmitting: false, amount: '0', hasActiveProfile: true }), false);
  assert.equal(canSubmitTransaction({ isSubmitting: false, amount: '12.50', hasActiveProfile: false }), false);
  assert.equal(canSubmitTransaction({ isSubmitting: false, amount: '12.50', hasActiveProfile: true }), true);
});

test('retryable save errors include offline/no-response and 5xx', () => {
  assert.equal(isRetryableTransactionSaveError(new Error('Network Error')), true);
  assert.equal(isRetryableTransactionSaveError({ response: { status: 503 } }), true);
  assert.equal(isRetryableTransactionSaveError({ response: { status: 429 } }), true);
  assert.equal(isRetryableTransactionSaveError({ response: { status: 400 } }), false);
});

test('save error copy is actionable for create and edit', () => {
  assert.equal(
    getTransactionSaveErrorMessage({ response: { status: 401 } }, false),
    'Your session expired. Sign in again and retry.'
  );
  assert.equal(
    getTransactionSaveErrorMessage({ response: { status: 404 } }, true),
    'This transaction no longer exists.'
  );
  assert.equal(
    getTransactionSaveErrorMessage(new Error('Network Error'), false),
    'Could not add transaction. Check your connection and try again.'
  );
});
