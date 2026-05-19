export function createTotalBudgetModalState() {
  return {
    editingBudgetId: null,
    isCategoryBudgetForm: false,
    selectedCategory: null,
    budgetAmount: '',
    showBudgetModal: true,
  };
}

export function createCategoryBudgetModalState() {
  return {
    editingBudgetId: null,
    isCategoryBudgetForm: true,
    selectedCategory: null,
    budgetAmount: '',
    showBudgetModal: true,
  };
}

export function editBudgetModalState(budget) {
  return {
    editingBudgetId: budget?.budget_id || null,
    isCategoryBudgetForm: Boolean(budget?.category_id),
    selectedCategory: budget?.category_id || null,
    budgetAmount: String(budget?.amount ?? ''),
    showBudgetModal: true,
  };
}

export function deriveBudgetsViewState({ activeProfile, isLoading }) {
  if (!activeProfile) return 'no_profile';
  if (isLoading) return 'loading';
  return 'ready';
}

export function deriveBudgetSaveMode(editingBudgetId) {
  return editingBudgetId ? 'update' : 'create';
}

export function deriveBudgetModalTitle({ editingBudgetId, isCategoryBudgetForm }) {
  if (editingBudgetId) return 'Edit Budget';
  return isCategoryBudgetForm ? 'Add Category Budget' : 'Set Total Budget';
}

export function removeBudgetFromProgress(progress, budgetId) {
  const current = progress || { budgets: [], total_budget: null };
  const nextTotalBudget = current?.total_budget?.budget_id === budgetId ? null : current?.total_budget || null;
  const nextBudgets = Array.isArray(current?.budgets)
    ? current.budgets.filter((budget) => budget?.budget_id !== budgetId)
    : [];

  return {
    ...current,
    total_budget: nextTotalBudget,
    budgets: nextBudgets,
  };
}

export function shouldReloadBudgetsForProfileChange(previousProfileId, nextProfileId) {
  return Boolean(nextProfileId) && previousProfileId !== nextProfileId;
}
