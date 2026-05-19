// Shared Types for SAVIQ
// Used by both Web and Mobile apps

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  auth_provider: string;
  created_at: string;
}

export interface Profile {
  profile_id: string;
  user_id: string;
  name: string;
  profile_type: 'personal' | 'business' | 'shared';
  is_default: boolean;
  created_at: string;
}

export interface Category {
  category_id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface PaymentMethod {
  payment_id: string;
  user_id: string;
  name: string;
  type: 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other';
  last_four?: string;
  is_default: boolean;
  created_at: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  transaction_id: string;
  user_id: string;
  profile_id: string;
  type: TransactionType;
  amount: number;
  category_id?: string;
  payment_method_id: string;
  description: string;
  merchant?: string;
  date: string;
  time?: string;
  receipt_image?: string;
  notes?: string;
  to_payment_method_id?: string;
  is_pending: boolean;
  is_recurring: boolean;
  recurring_frequency?: string;
  recurring_start_date?: string;
  recurring_end_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Expense extends Transaction {
  expense_id: string;
}

export interface Budget {
  budget_id: string;
  user_id: string;
  profile_id: string;
  category_id?: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  start_date?: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetProgress extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  is_over_budget: boolean;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  average: number;
  period: string;
  start_date: string;
  end_date: string;
  by_category: CategoryBreakdown[];
  income_total?: number;
  expense_total?: number;
  net_total?: number;
}

export interface CategoryBreakdown {
  category_id: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  percentage: number;
}

export interface ReceiptScanResult {
  amount?: number;
  merchant?: string;
  date?: string;
  time?: string;
  category_suggestion?: string;
  items?: string[];
  confidence: number;
}

export interface UserSettings {
  user_id: string;
  dark_mode: boolean;
  currency: string;
  updated_at?: string;
}

export interface ExportData {
  expenses: Expense[];
  summary: {
    total_income: number;
    total_expense: number;
    total_transfer: number;
    balance: number;
    transaction_count: number;
  };
  category_breakdown: { name: string; amount: number }[];
  period: {
    start: string;
    end: string;
  };
}
