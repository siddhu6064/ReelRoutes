import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTotalBudgetModalState,
  createCategoryBudgetModalState,
  editBudgetModalState,
  deriveBudgetsViewState,
  deriveBudgetSaveMode,
  deriveBudgetModalTitle,
  removeBudgetFromProgress,
  shouldReloadBudgetsForProfileChange,
} from './budgetsScreenState.js';

test('budget modal helpers build deterministic create/edit states', () => {
  assert.deepEqual(createTotalBudgetModalState(), {
    editingBudgetId: null,
    isCategoryBudgetForm: false,
    selectedCategory: null,
    budgetAmount: '',
    showBudgetModal: true,
  });

  assert.deepEqual(createCategoryBudgetModalState(), {
    editingBudgetId: null,
    isCategoryBudgetForm: true,
    selectedCategory: null,
    budgetAmount: '',
    showBudgetModal: true,
  });

  assert.deepEqual(
    editBudgetModalState({ budget_id: 'b1', category_id: 'c1', amount: 125.5 }),
    {
      editingBudgetId: 'b1',
      isCategoryBudgetForm: true,
      selectedCategory: 'c1',
      budgetAmount: '125.5',
      showBudgetModal: true,
    }
  );
});

test('budget view state resolves loading/no-profile/ready and modal title transitions', () => {
  assert.equal(deriveBudgetsViewState({ activeProfile: null, isLoading: false }), 'no_profile');
  assert.equal(deriveBudgetsViewState({ activeProfile: { profile_id: 'p1' }, isLoading: true }), 'loading');
  assert.equal(deriveBudgetsViewState({ activeProfile: { profile_id: 'p1' }, isLoading: false }), 'ready');

  assert.equal(deriveBudgetModalTitle({ editingBudgetId: null, isCategoryBudgetForm: false }), 'Set Total Budget');
  assert.equal(deriveBudgetModalTitle({ editingBudgetId: null, isCategoryBudgetForm: true }), 'Add Category Budget');
  assert.equal(deriveBudgetModalTitle({ editingBudgetId: 'b1', isCategoryBudgetForm: true }), 'Edit Budget');
});

test('budget CRUD orchestration helpers keep create/edit/delete flows deterministic', () => {
  assert.equal(deriveBudgetSaveMode(null), 'create');
  assert.equal(deriveBudgetSaveMode('budget-1'), 'update');

  const afterDeleteCategory = removeBudgetFromProgress(
    {
      total_budget: { budget_id: 'total-1', amount: 500 },
      budgets: [
        { budget_id: 'cat-1', category_id: 'food', amount: 120 },
        { budget_id: 'cat-2', category_id: 'travel', amount: 80 },
      ],
    },
    'cat-1'
  );
  assert.equal(afterDeleteCategory.total_budget.budget_id, 'total-1');
  assert.deepEqual(afterDeleteCategory.budgets.map((budget) => budget.budget_id), ['cat-2']);

  const afterDeleteTotal = removeBudgetFromProgress(afterDeleteCategory, 'total-1');
  assert.equal(afterDeleteTotal.total_budget, null);
  assert.equal(afterDeleteTotal.budgets.length, 1);
});

test('profile-aware refresh helper only triggers for meaningful profile transitions', () => {
  assert.equal(shouldReloadBudgetsForProfileChange(null, 'profile-a'), true);
  assert.equal(shouldReloadBudgetsForProfileChange('profile-a', 'profile-a'), false);
  assert.equal(shouldReloadBudgetsForProfileChange('profile-a', 'profile-b'), true);
  assert.equal(shouldReloadBudgetsForProfileChange('profile-a', null), false);
});
