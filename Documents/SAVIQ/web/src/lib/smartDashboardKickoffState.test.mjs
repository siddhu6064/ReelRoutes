import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCurrentMonthSpendCardState, deriveIncomeCardState, deriveMonthOverMonthChangeCardState, deriveNetBalanceCardState, deriveTopSavingsGoalCardState, deriveTotalSpendCardState } from './smartDashboardKickoffState.js';

test('deriveNetBalanceCardState returns loading mode first', () => {
  const state = deriveNetBalanceCardState({ loading: true, error: 'ignored', summary: { net_balance: 42 } });
  assert.deepEqual(state, { mode: 'loading' });
});

test('deriveNetBalanceCardState returns error mode when request fails', () => {
  const state = deriveNetBalanceCardState({ loading: false, error: 'failed', summary: null });
  assert.deepEqual(state, { mode: 'error', message: 'Net balance is unavailable right now.' });
});

test('deriveNetBalanceCardState returns empty mode without numeric net balance', () => {
  const state = deriveNetBalanceCardState({ loading: false, error: null, summary: null });
  assert.deepEqual(state, { mode: 'empty', message: 'No balance data yet.' });
});

test('deriveNetBalanceCardState returns success mode with numeric net balance', () => {
  const state = deriveNetBalanceCardState({ loading: false, error: null, summary: { net_balance: 380 } });
  assert.deepEqual(state, { mode: 'success', netBalance: 380 });
});


test('deriveIncomeCardState returns loading mode first', () => {
  const state = deriveIncomeCardState({ loading: true, error: 'ignored', summary: { total_income: 42 } });
  assert.deepEqual(state, { mode: 'loading' });
});

test('deriveIncomeCardState returns error mode when request fails', () => {
  const state = deriveIncomeCardState({ loading: false, error: 'failed', summary: null });
  assert.deepEqual(state, { mode: 'error', message: 'Income is unavailable right now.' });
});

test('deriveIncomeCardState returns empty mode without numeric total income', () => {
  const state = deriveIncomeCardState({ loading: false, error: null, summary: null });
  assert.deepEqual(state, { mode: 'empty', message: 'No income data yet.' });
});

test('deriveIncomeCardState returns success mode with numeric total income', () => {
  const state = deriveIncomeCardState({ loading: false, error: null, summary: { total_income: 380 } });
  assert.deepEqual(state, { mode: 'success', totalIncome: 380 });
});


test('deriveTotalSpendCardState returns loading mode first', () => {
  const state = deriveTotalSpendCardState({ loading: true, error: 'ignored', summary: { total_spend: 42 } });
  assert.deepEqual(state, { mode: 'loading' });
});

test('deriveTotalSpendCardState returns error mode when request fails', () => {
  const state = deriveTotalSpendCardState({ loading: false, error: 'failed', summary: null });
  assert.deepEqual(state, { mode: 'error', message: 'Total spend is unavailable right now.' });
});

test('deriveTotalSpendCardState returns empty mode without numeric total spend', () => {
  const state = deriveTotalSpendCardState({ loading: false, error: null, summary: null });
  assert.deepEqual(state, { mode: 'empty', message: 'No spend data yet.' });
});

test('deriveTotalSpendCardState returns success mode with numeric total spend', () => {
  const state = deriveTotalSpendCardState({ loading: false, error: null, summary: { total_spend: 380 } });
  assert.deepEqual(state, { mode: 'success', totalSpend: 380 });
});


test('deriveCurrentMonthSpendCardState returns loading mode first', () => {
  const state = deriveCurrentMonthSpendCardState({ loading: true, error: 'ignored', summary: { current_month_spend: 42 } });
  assert.deepEqual(state, { mode: 'loading' });
});

test('deriveCurrentMonthSpendCardState returns error mode when request fails', () => {
  const state = deriveCurrentMonthSpendCardState({ loading: false, error: 'failed', summary: null });
  assert.deepEqual(state, { mode: 'error', message: 'Current month spend is unavailable right now.' });
});

test('deriveCurrentMonthSpendCardState returns empty mode without numeric current month spend', () => {
  const state = deriveCurrentMonthSpendCardState({ loading: false, error: null, summary: null });
  assert.deepEqual(state, { mode: 'empty', message: 'No current month spend data yet.' });
});

test('deriveCurrentMonthSpendCardState returns success mode with numeric current month spend', () => {
  const state = deriveCurrentMonthSpendCardState({ loading: false, error: null, summary: { current_month_spend: 380 } });
  assert.deepEqual(state, { mode: 'success', currentMonthSpend: 380 });
});


test('deriveMonthOverMonthChangeCardState returns loading mode first', () => {
  const state = deriveMonthOverMonthChangeCardState({ loading: true, error: 'ignored', summary: { month_over_month_change_pct: 42 } });
  assert.deepEqual(state, { mode: 'loading' });
});

test('deriveMonthOverMonthChangeCardState returns error mode when request fails', () => {
  const state = deriveMonthOverMonthChangeCardState({ loading: false, error: 'failed', summary: null });
  assert.deepEqual(state, { mode: 'error', message: 'MoM change is unavailable right now.' });
});

test('deriveMonthOverMonthChangeCardState returns empty mode without numeric MoM change', () => {
  const state = deriveMonthOverMonthChangeCardState({ loading: false, error: null, summary: null });
  assert.deepEqual(state, { mode: 'empty', message: 'No month-over-month trend yet.' });
});

test('deriveMonthOverMonthChangeCardState returns success mode with numeric MoM change', () => {
  const state = deriveMonthOverMonthChangeCardState({ loading: false, error: null, summary: { month_over_month_change_pct: 380 } });
  assert.deepEqual(state, { mode: 'success', monthOverMonthChange: 380 });
});


test('deriveTopSavingsGoalCardState returns loading mode first', () => {
  const state = deriveTopSavingsGoalCardState({
    loading: true,
    error: 'ignored',
    goalDisplay: { title: 'Emergency Fund' },
  });
  assert.deepEqual(state, { mode: 'loading' });
});

test('deriveTopSavingsGoalCardState returns error mode when request fails', () => {
  const state = deriveTopSavingsGoalCardState({ loading: false, error: 'failed', goalDisplay: null });
  assert.deepEqual(state, { mode: 'error', message: 'Savings goal is unavailable right now.' });
});

test('deriveTopSavingsGoalCardState returns empty mode without goal data', () => {
  const state = deriveTopSavingsGoalCardState({ loading: false, error: null, goalDisplay: null });
  assert.deepEqual(state, { mode: 'empty', message: 'No active savings goals yet.' });
});

test('deriveTopSavingsGoalCardState returns success mode with goal display data', () => {
  const goalDisplay = {
    title: 'Emergency Fund',
    progressPercent: 40,
    currentSavedText: '$400.00',
    targetAmountText: '$1,000.00',
    projectionText: 'Projected completion: ~6.0 months',
  };
  const state = deriveTopSavingsGoalCardState({ loading: false, error: null, goalDisplay });
  assert.deepEqual(state, { mode: 'success', goalDisplay });
});
