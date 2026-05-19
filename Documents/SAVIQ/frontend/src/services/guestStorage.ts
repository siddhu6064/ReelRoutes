import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, ExpenseSummary, Category, PaymentMethod, Profile } from '../types';

const GUEST_EXPENSES_KEY = 'guest_expenses';
const GUEST_CATEGORIES_KEY = 'guest_categories';
const GUEST_PAYMENT_METHODS_KEY = 'guest_payment_methods';
const GUEST_PROFILES_KEY = 'guest_profiles';

// Helper to generate unique IDs
const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const guestStorage = {
  // Expenses
  async getExpenses(profileId?: string): Promise<Expense[]> {
    try {
      const data = await AsyncStorage.getItem(GUEST_EXPENSES_KEY);
      let expenses: Expense[] = data ? JSON.parse(data) : [];
      if (profileId) {
        expenses = expenses.filter(e => e.profile_id === profileId);
      }
      return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      console.error('Error getting guest expenses:', error);
      return [];
    }
  },

  async createExpense(data: Omit<Expense, 'expense_id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Expense> {
    try {
      const expenses = await this.getExpenses();
      const newExpense: Expense = {
        ...data,
        expense_id: generateId('exp'),
        user_id: 'guest_user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expenses.unshift(newExpense);
      await AsyncStorage.setItem(GUEST_EXPENSES_KEY, JSON.stringify(expenses));
      return newExpense;
    } catch (error) {
      console.error('Error creating guest expense:', error);
      throw error;
    }
  },

  async updateExpense(expenseId: string, data: Partial<Expense>): Promise<Expense> {
    try {
      const expenses = await this.getExpenses();
      const index = expenses.findIndex(e => e.expense_id === expenseId);
      if (index === -1) throw new Error('Expense not found');
      
      expenses[index] = {
        ...expenses[index],
        ...data,
        updated_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem(GUEST_EXPENSES_KEY, JSON.stringify(expenses));
      return expenses[index];
    } catch (error) {
      console.error('Error updating guest expense:', error);
      throw error;
    }
  },

  async deleteExpense(expenseId: string): Promise<void> {
    try {
      let expenses = await this.getExpenses();
      expenses = expenses.filter(e => e.expense_id !== expenseId);
      await AsyncStorage.setItem(GUEST_EXPENSES_KEY, JSON.stringify(expenses));
    } catch (error) {
      console.error('Error deleting guest expense:', error);
      throw error;
    }
  },

  // Summary calculation
  async getSummary(profileId?: string, period: string = 'month'): Promise<ExpenseSummary> {
    try {
      const expenses = await this.getExpenses(profileId);
      const categories = await this.getCategories();
      
      const now = new Date();
      let startDate: Date;
      
      if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === 'year') {
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const filteredExpenses = expenses.filter(e => new Date(e.date) >= startDate);
      
      const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
      const count = filteredExpenses.length;
      
      // Group by category
      const byCategory: Record<string, number> = {};
      filteredExpenses.forEach(e => {
        const catId = e.category_id || 'uncategorized';
        byCategory[catId] = (byCategory[catId] || 0) + e.amount;
      });

      const categoryMap = new Map(categories.map(c => [c.category_id, c]));
      
      const categoryBreakdown = Object.entries(byCategory)
        .map(([categoryId, amount]) => {
          const cat = categoryMap.get(categoryId);
          return {
            category_id: categoryId,
            name: cat?.name || 'Unknown',
            color: cat?.color || '#6b7280',
            icon: cat?.icon || 'help',
            amount,
            percentage: total > 0 ? (amount / total) * 100 : 0,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      return {
        total,
        count,
        average: count > 0 ? total / count : 0,
        period,
        start_date: startDate.toISOString(),
        end_date: now.toISOString(),
        by_category: categoryBreakdown,
      };
    } catch (error) {
      console.error('Error getting guest summary:', error);
      return {
        total: 0,
        count: 0,
        average: 0,
        period,
        start_date: new Date().toISOString(),
        end_date: new Date().toISOString(),
        by_category: [],
      };
    }
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    try {
      const data = await AsyncStorage.getItem(GUEST_CATEGORIES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting guest categories:', error);
      return [];
    }
  },

  async createCategory(data: { name: string; icon?: string; color?: string }): Promise<Category> {
    try {
      const categories = await this.getCategories();
      const newCategory: Category = {
        category_id: generateId('cat'),
        user_id: 'guest_user',
        name: data.name,
        icon: data.icon || 'pricetag',
        color: data.color || '#6366f1',
        is_default: false,
        created_at: new Date().toISOString(),
      };
      categories.push(newCategory);
      await AsyncStorage.setItem(GUEST_CATEGORIES_KEY, JSON.stringify(categories));
      return newCategory;
    } catch (error) {
      console.error('Error creating guest category:', error);
      throw error;
    }
  },

  async deleteCategory(categoryId: string): Promise<void> {
    try {
      let categories = await this.getCategories();
      const category = categories.find(c => c.category_id === categoryId);
      if (category?.is_default) {
        throw new Error('Cannot delete default categories');
      }
      categories = categories.filter(c => c.category_id !== categoryId);
      await AsyncStorage.setItem(GUEST_CATEGORIES_KEY, JSON.stringify(categories));
    } catch (error) {
      console.error('Error deleting guest category:', error);
      throw error;
    }
  },

  // Payment Methods
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      const data = await AsyncStorage.getItem(GUEST_PAYMENT_METHODS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting guest payment methods:', error);
      return [];
    }
  },

  async createPaymentMethod(data: { name: string; type: string; last_four?: string }): Promise<PaymentMethod> {
    try {
      const methods = await this.getPaymentMethods();
      const newMethod: PaymentMethod = {
        payment_id: generateId('pm'),
        user_id: 'guest_user',
        name: data.name,
        type: data.type as any,
        last_four: data.last_four,
        is_default: false,
        created_at: new Date().toISOString(),
      };
      methods.push(newMethod);
      await AsyncStorage.setItem(GUEST_PAYMENT_METHODS_KEY, JSON.stringify(methods));
      return newMethod;
    } catch (error) {
      console.error('Error creating guest payment method:', error);
      throw error;
    }
  },

  async deletePaymentMethod(paymentId: string): Promise<void> {
    try {
      let methods = await this.getPaymentMethods();
      methods = methods.filter(m => m.payment_id !== paymentId);
      await AsyncStorage.setItem(GUEST_PAYMENT_METHODS_KEY, JSON.stringify(methods));
    } catch (error) {
      console.error('Error deleting guest payment method:', error);
      throw error;
    }
  },

  // Profiles
  async getProfiles(): Promise<Profile[]> {
    try {
      const data = await AsyncStorage.getItem(GUEST_PROFILES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting guest profiles:', error);
      return [];
    }
  },

  // Clear all guest data
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        GUEST_EXPENSES_KEY,
        GUEST_CATEGORIES_KEY,
        GUEST_PAYMENT_METHODS_KEY,
        GUEST_PROFILES_KEY,
        'guest_mode',
      ]);
    } catch (error) {
      console.error('Error clearing guest data:', error);
    }
  },
};
