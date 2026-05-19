import { Expense } from '../types';

export type MoMDirection = 'up' | 'down' | 'flat' | 'none';

export interface MoMSummary {
  currentMonthSpend: number;
  previousMonthSpend: number;
  deltaAmount: number;
  deltaPercent: number | null;
  hasCurrentData: boolean;
  hasPreviousData: boolean;
  direction: MoMDirection;
}

function parseExpenseDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function previousMonthKey(referenceDate: Date): string {
  const year = referenceDate.getMonth() === 0 ? referenceDate.getFullYear() - 1 : referenceDate.getFullYear();
  const month = referenceDate.getMonth() === 0 ? 11 : referenceDate.getMonth() - 1;
  return `${year}-${month}`;
}

export function buildMonthSpendSummary(expenses: Expense[], now = new Date()): MoMSummary {
  const currentKey = monthKey(now);
  const prevKey = previousMonthKey(now);

  let currentMonthSpend = 0;
  let previousMonthSpend = 0;
  let hasCurrentData = false;
  let hasPreviousData = false;

  expenses.forEach((expense) => {
    if (expense.type === 'income' || expense.type === 'transfer') return;

    const parsed = parseExpenseDate(expense.date as any);
    if (!parsed) return;

    const key = monthKey(parsed);
    if (key === currentKey) {
      currentMonthSpend += expense.amount;
      hasCurrentData = true;
    } else if (key === prevKey) {
      previousMonthSpend += expense.amount;
      hasPreviousData = true;
    }
  });

  const deltaAmount = currentMonthSpend - previousMonthSpend;
  let deltaPercent: number | null = null;
  if (previousMonthSpend > 0) {
    deltaPercent = (deltaAmount / previousMonthSpend) * 100;
  }

  let direction: MoMDirection = 'none';
  if (currentMonthSpend === 0 && previousMonthSpend === 0) {
    direction = 'none';
  } else if (Math.abs(deltaAmount) < 0.01) {
    direction = 'flat';
  } else if (deltaAmount > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return {
    currentMonthSpend,
    previousMonthSpend,
    deltaAmount,
    deltaPercent,
    hasCurrentData,
    hasPreviousData,
    direction,
  };
}
