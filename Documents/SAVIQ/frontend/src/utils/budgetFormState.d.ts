export function validateBudgetAmount(amountInput: string): {
  valid: boolean;
  amount: number | null;
  error: string | null;
};

export function validateBudgetCategory(categoryId: string | null): {
  valid: boolean;
  error: string | null;
};

export function buildBudgetPayload(input: {
  profileId: string;
  amount: number;
  categoryId: string | null;
}): {
  profile_id: string;
  category_id: string | null;
  amount: number;
  period: 'monthly';
};
