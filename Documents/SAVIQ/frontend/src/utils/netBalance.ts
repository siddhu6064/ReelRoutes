import { Expense, PaymentMethod } from '../types';

export interface AccountSummaryItem {
  paymentId: string;
  name: string;
  type: string;
  lastFour?: string;
  income: number;
  expense: number;
  count: number;
}

export interface NetBalanceSummary {
  accountData: AccountSummaryItem[];
  totalIncome: number;
  totalExpense: number;
  totalBalance: number;
}

export function buildNetBalanceSummary(
  paymentMethods: PaymentMethod[],
  expenses: Expense[]
): NetBalanceSummary {
  const map: Record<string, AccountSummaryItem> = {};

  paymentMethods.forEach((pm) => {
    map[pm.payment_id] = {
      paymentId: pm.payment_id,
      name: pm.name,
      type: pm.type,
      lastFour: pm.last_four,
      income: 0,
      expense: 0,
      count: 0,
    };
  });

  expenses.forEach((e) => {
    const pmId = e.payment_method_id;
    if (!map[pmId]) {
      map[pmId] = {
        paymentId: pmId,
        name: 'Unknown',
        type: 'other',
        income: 0,
        expense: 0,
        count: 0,
      };
    }

    if (e.type === 'income') {
      map[pmId].income += e.amount;
    } else if (e.type !== 'transfer') {
      map[pmId].expense += e.amount;
    }

    map[pmId].count += 1;
  });

  const accountData = Object.values(map);
  const totalIncome = accountData.reduce((sum, item) => sum + item.income, 0);
  const totalExpense = accountData.reduce((sum, item) => sum + item.expense, 0);

  return {
    accountData,
    totalIncome,
    totalExpense,
    totalBalance: totalIncome - totalExpense,
  };
}
