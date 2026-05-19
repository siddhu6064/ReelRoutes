import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransactionRowHandlers,
  deriveVisibleTransactions,
  deriveTransactionEmptyState,
  shouldCloseDetailModalAfterDelete,
  shouldResetTransactionDetailOnProfileChange,
  buildTransactionExportIntentParams,
  shouldClearExportIntentOnProfileSwitch,
  filterTransactionsForMonth,
  searchTransactions,
  upsertTransaction,
  removeTransaction,
} from './transactionFlowState.js';

const baseExpenses = [
  {
    expense_id: 'exp_1',
    amount: 20,
    date: '2026-04-02T10:00:00.000Z',
    category_id: 'cat_food',
    description: 'Lunch',
    merchant: 'Cafe 21',
    notes: 'team meal',
  },
  {
    expense_id: 'exp_2',
    amount: 45,
    date: '2026-04-14T10:00:00.000Z',
    category_id: 'cat_transport',
    description: 'Cab ride',
    merchant: 'City Taxi',
    notes: '',
  },
  {
    expense_id: 'exp_3',
    amount: 110,
    date: '2026-03-20T10:00:00.000Z',
    category_id: 'cat_bills',
    description: 'Electricity',
    merchant: 'Power Co',
    notes: '',
  },
];

test('create flow: upsert inserts new transaction at top for immediate visibility', () => {
  const created = {
    expense_id: 'exp_4',
    amount: 18,
    date: '2026-04-18T10:00:00.000Z',
    category_id: 'cat_food',
    description: 'Coffee',
  };

  const next = upsertTransaction(baseExpenses, created);
  assert.equal(next[0].expense_id, 'exp_4');
  assert.equal(next.length, 4);
});

test('edit flow: upsert replaces existing transaction in place', () => {
  const edited = { ...baseExpenses[1], amount: 49, notes: 'airport' };
  const next = upsertTransaction(baseExpenses, edited);

  assert.equal(next.length, 3);
  assert.equal(next[1].expense_id, 'exp_2');
  assert.equal(next[1].amount, 49);
  assert.equal(next[1].notes, 'airport');
});

test('delete flow: removeTransaction drops only the selected id', () => {
  const next = removeTransaction(baseExpenses, 'exp_2');
  assert.deepEqual(next.map((expense) => expense.expense_id), ['exp_1', 'exp_3']);
});

test('filter flow: month filter and search query combine safely', () => {
  const aprilExpenses = filterTransactionsForMonth(baseExpenses, 3, 2026);
  assert.deepEqual(aprilExpenses.map((expense) => expense.expense_id), ['exp_1', 'exp_2']);

  const searchResults = searchTransactions(aprilExpenses, 'taxi', {
    cat_food: 'Food & Dining',
    cat_transport: 'Transportation',
  });
  assert.deepEqual(searchResults.map((expense) => expense.expense_id), ['exp_2']);
});

test('screen-level orchestration: deriveVisibleTransactions preserves empty result safety', () => {
  const visible = deriveVisibleTransactions({
    expenses: baseExpenses,
    month: 3,
    year: 2026,
    searchQuery: 'non-existent merchant',
    categoryNameById: {
      cat_food: 'Food & Dining',
      cat_transport: 'Transportation',
    },
  });

  assert.deepEqual(visible, []);
});

test('screen-level orchestration: deriveVisibleTransactions applies transaction type filter', () => {
  const visible = deriveVisibleTransactions({
    expenses: [
      { ...baseExpenses[0], type: 'expense' },
      { ...baseExpenses[1], type: 'income' },
    ],
    month: 3,
    year: 2026,
    searchQuery: '',
    txType: 'income',
    categoryNameById: {
      cat_food: 'Food & Dining',
      cat_transport: 'Transportation',
    },
  });

  assert.deepEqual(visible.map((expense) => expense.expense_id), ['exp_2']);
});

test('empty-state orchestration: filtered-empty and month-empty states are explicit', () => {
  const filteredEmpty = deriveTransactionEmptyState({ hasFiltersApplied: true, filteredCount: 0 });
  assert.equal(filteredEmpty.showClearFilters, true);
  assert.equal(filteredEmpty.title, 'No transactions match current filters');

  const monthEmpty = deriveTransactionEmptyState({ hasFiltersApplied: false, filteredCount: 0 });
  assert.equal(monthEmpty.showClearFilters, false);
  assert.equal(monthEmpty.title, 'No transactions this month');
});

test('edit/delete parity helper: only close detail modal when deleted expense matches selected expense', () => {
  assert.equal(
    shouldCloseDetailModalAfterDelete({ selectedExpenseId: 'exp_1', deletedExpenseId: 'exp_1' }),
    true
  );
  assert.equal(
    shouldCloseDetailModalAfterDelete({ selectedExpenseId: 'exp_1', deletedExpenseId: 'exp_2' }),
    false
  );
});

test('profile-switch stability helper: close detail modal only on active profile change while open', () => {
  assert.equal(
    shouldResetTransactionDetailOnProfileChange({
      previousProfileId: 'p1',
      nextProfileId: 'p2',
      isDetailModalOpen: true,
    }),
    true
  );
  assert.equal(
    shouldResetTransactionDetailOnProfileChange({
      previousProfileId: 'p1',
      nextProfileId: 'p1',
      isDetailModalOpen: true,
    }),
    false
  );
});

test('export/share preparation helper: builds deterministic monthly export intent params', () => {
  const params = buildTransactionExportIntentParams({
    activeProfileId: 'profile_1',
    month: 3,
    year: 2026,
  });
  assert.deepEqual(params, {
    intent: 'export',
    profile_id: 'profile_1',
    month: '4',
    year: '2026',
    month_start: '2026-04-01',
  });
  assert.equal(buildTransactionExportIntentParams({ activeProfileId: '', month: 3, year: 2026 }), null);
  assert.equal(buildTransactionExportIntentParams({ activeProfileId: '   ', month: 3, year: 2026 }), null);
  assert.equal(buildTransactionExportIntentParams({ activeProfileId: 'profile_1', month: 12, year: 2026 }), null);
  assert.equal(buildTransactionExportIntentParams({ activeProfileId: ' profile_1 ', month: 3, year: 2026 }).profile_id, 'profile_1');
});

test('swipe row wiring: bound handlers preserve expense identity for press/edit/delete actions', () => {
  const calls = [];
  const expense = baseExpenses[0];
  const handlers = buildTransactionRowHandlers({
    expense,
    onPress: (value) => calls.push(['press', value.expense_id]),
    onEdit: (value) => calls.push(['edit', value.expense_id]),
    onDelete: (value) => calls.push(['delete', value.expense_id]),
  });

  handlers.onPress();
  handlers.onEdit();
  handlers.onDelete();

  assert.deepEqual(calls, [
    ['press', 'exp_1'],
    ['edit', 'exp_1'],
    ['delete', 'exp_1'],
  ]);
});

test('export intent cleanup helper: clears stale export intent only when profile actually switches', () => {
  assert.equal(
    shouldClearExportIntentOnProfileSwitch({ intentProfileId: 'p1', nextProfileId: 'p2' }),
    true
  );
  assert.equal(
    shouldClearExportIntentOnProfileSwitch({ intentProfileId: ' p1 ', nextProfileId: 'p1' }),
    false
  );
  assert.equal(
    shouldClearExportIntentOnProfileSwitch({ intentProfileId: '', nextProfileId: 'p1' }),
    false
  );
});
