// Shared Constants for SAVIQ
// Used by both Web and Mobile apps

// Category colors palette
export const CATEGORY_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#6b7280', // Gray
  '#4A6D5C', // Brand Green
];

// Payment method types
export const PAYMENT_TYPES = [
  { type: 'cash', label: 'Cash', icon: 'cash' },
  { type: 'credit_card', label: 'Credit Card', icon: 'card' },
  { type: 'debit_card', label: 'Debit Card', icon: 'card-outline' },
  { type: 'bank_transfer', label: 'Bank Transfer', icon: 'business' },
  { type: 'other', label: 'Other', icon: 'wallet' },
] as const;

// Category icon mapping (Ionicons to Lucide)
export const CATEGORY_ICON_MAP: Record<string, string> = {
  'restaurant': 'Utensils',
  'car': 'Car',
  'cart': 'ShoppingCart',
  'flash': 'Zap',
  'film': 'Film',
  'medical': 'HeartPulse',
  'airplane': 'Plane',
  'school': 'GraduationCap',
  'ellipsis-horizontal': 'MoreHorizontal',
  'tag': 'Tag',
  'home': 'Home',
  'wallet': 'Wallet',
  'card': 'CreditCard',
  'cash': 'Banknote',
  'business': 'Building2',
  'pricetag': 'Tag',
};

// Transaction type colors
export const TRANSACTION_COLORS = {
  income: {
    primary: '#3D8B61',
    background: '#E9F5EF',
  },
  expense: {
    primary: '#E63946',
    background: '#FBEAEC',
  },
  transfer: {
    primary: '#457B9D',
    background: '#EAF2F6',
  },
};

// Budget periods
export const BUDGET_PERIODS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

// Recurring frequencies
export const RECURRING_FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

// Week days
export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Theme colors
export const THEME = {
  light: {
    background: '#F9F8F6',
    surface: '#FFFFFF',
    surfaceHover: '#F2EFEB',
    textPrimary: '#2B2A28',
    textSecondary: '#73716D',
    border: '#E5E2DC',
    brandPrimary: '#4A6D5C',
    brandHover: '#3D594B',
    brandAccent: '#E07A5F',
  },
  dark: {
    background: '#1a1a1a',
    surface: '#2d2d2d',
    surfaceHover: '#3d3d3d',
    textPrimary: '#f5f5f5',
    textSecondary: '#a0a0a0',
    border: '#444444',
    brandPrimary: '#5A8D6C',
    brandHover: '#4D7A5B',
    brandAccent: '#E07A5F',
  },
};

// App metadata
export const APP_CONFIG = {
  name: 'SAVIQ',
  version: '1.0.0',
  description: 'Track expenses, income & budgets',
};

// Category emoji map — single source of truth for mobile and web
export const CATEGORY_EMOJIS: Record<string, string> = {
  'Food & Dining': '🍔', 'Food': '🍔', 'Social Life': '👫', 'Pets': '🐾',
  'Transportation': '🚕', 'Transport': '🚕', 'Culture': '🖼️', 'Household': '🏠',
  'Apparel': '👒', 'Beauty': '💄', 'Healthcare': '🏥', 'Health': '🏥',
  'Education': '📚', 'Gift': '🎁', 'Shopping': '🛒', 'Bills & Utilities': '⚡',
  'Entertainment': '🎬', 'Travel': '✈️', 'Other': '📋',
};

export function getCategoryEmoji(name: string): string {
  return CATEGORY_EMOJIS[name] || '📋';
}
