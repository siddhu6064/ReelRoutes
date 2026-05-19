export function validateBudgetAmount(amountInput) {
  const amount = Number.parseFloat(String(amountInput || '').trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, amount: null, error: 'Please enter a valid amount' };
  }
  return { valid: true, amount, error: null };
}

export function validateBudgetCategory(categoryId) {
  if (!categoryId) {
    return { valid: false, error: 'Please select a category' };
  }
  return { valid: true, error: null };
}

export function buildBudgetPayload({ profileId, amount, categoryId }) {
  return {
    profile_id: profileId,
    category_id: categoryId || null,
    amount,
    period: 'monthly',
  };
}
