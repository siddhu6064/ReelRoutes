import { Expense } from '../types';

export function filterTransactionsForMonth(expenses: Expense[], month: number, year: number): Expense[];
export function searchTransactions(
  expenses: Expense[],
  query: string,
  categoryNameById?: Record<string, string>
): Expense[];
export function upsertTransaction(expenses: Expense[], nextExpense: Expense): Expense[];
export function removeTransaction(expenses: Expense[], expenseId: string): Expense[];
