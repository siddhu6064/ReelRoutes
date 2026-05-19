import { create } from 'zustand';
import { Profile, Category, PaymentMethod, Expense, ExpenseSummary, User } from '../types';
import api from '../services/api';
import { guestStorage } from '../services/guestStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizePersistedChatSessions } from '../utils/aiChatSessionState';

const AI_CHAT_SESSIONS_STORAGE_KEY = 'ai_chat_sessions_v1';

interface AppState {
  aiChatSessions: Record<string, { messages: any[]; prompt: string }>;
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuestMode: boolean;
  
  // Profile state
  profiles: Profile[];
  activeProfile: Profile | null;
  
  // Data state
  categories: Category[];
  paymentMethods: PaymentMethod[];
  expenses: Expense[];
  summary: ExpenseSummary | null;
  
  // Actions - Auth
  setUser: (user: User | null) => void;
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setGuestMode: (value: boolean) => void;
  logout: () => void;
  
  // Actions - Profile
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfile: (profile: Profile | null) => void;
  fetchProfiles: () => Promise<void>;
  
  // Actions - Categories
  setCategories: (categories: Category[]) => void;
  fetchCategories: () => Promise<void>;
  createCategory: (data: { name: string; icon?: string; color?: string }) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  
  // Actions - Payment Methods
  setPaymentMethods: (methods: PaymentMethod[]) => void;
  fetchPaymentMethods: () => Promise<void>;
  createPaymentMethod: (data: { name: string; type: string; last_four?: string }) => Promise<void>;
  deletePaymentMethod: (paymentId: string) => Promise<void>;
  
  // Actions - Expenses
  setExpenses: (expenses: Expense[]) => void;
  fetchExpenses: (profileId?: string) => Promise<void>;
  createExpense: (data: any) => Promise<void>;
  updateExpense: (expenseId: string, data: any) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  
  // Actions - Summary
  setSummary: (summary: ExpenseSummary | null) => void;
  fetchSummary: (profileId?: string, period?: string) => Promise<void>;
  setAIChatSession: (profileId: string, session: { messages: any[]; prompt: string }) => void;
  clearAIChatSession: (profileId: string) => void;
  hydrateAIChatSessions: () => Promise<void>;
}

// Check if user is in guest mode
const checkGuestMode = async (): Promise<boolean> => {
  try {
    const guestMode = await AsyncStorage.getItem('guest_mode');
    return guestMode === 'true';
  } catch {
    return false;
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isGuestMode: false,
  profiles: [],
  activeProfile: null,
  categories: [],
  paymentMethods: [],
  expenses: [],
  summary: null,
  aiChatSessions: {},
  
  // Auth actions
  setUser: (user) => set({ user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setLoading: (value) => set({ isLoading: value }),
  setGuestMode: (value) => set({ isGuestMode: value }),
  logout: () => {
    AsyncStorage.removeItem(AI_CHAT_SESSIONS_STORAGE_KEY).catch((error) =>
      console.error('Error clearing AI chat sessions:', error)
    );
    set({
      user: null,
      isAuthenticated: false,
      isGuestMode: false,
      profiles: [],
      activeProfile: null,
      categories: [],
      paymentMethods: [],
      expenses: [],
      summary: null,
      aiChatSessions: {},
    });
  },
  
  // Profile actions
  setProfiles: (profiles) => set({ profiles }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  fetchProfiles: async () => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      const profiles = await guestStorage.getProfiles();
      set({ profiles, isGuestMode: true });
      if (!get().activeProfile && profiles.length > 0) {
        set({ activeProfile: profiles.find(p => p.is_default) || profiles[0] });
      }
      return;
    }
    
    try {
      const response = await api.get('/profiles');
      const profiles = response.data;
      set({ profiles });
      
      if (!get().activeProfile && profiles.length > 0) {
        const defaultProfile = profiles.find((p: Profile) => p.is_default) || profiles[0];
        set({ activeProfile: defaultProfile });
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
    }
  },
  
  // Category actions
  setCategories: (categories) => set({ categories }),
  fetchCategories: async () => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      const categories = await guestStorage.getCategories();
      set({ categories });
      return;
    }
    
    try {
      const response = await api.get('/categories');
      set({ categories: response.data });
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  },
  createCategory: async (data) => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      await guestStorage.createCategory(data);
      const categories = await guestStorage.getCategories();
      set({ categories });
      return;
    }
    
    try {
      await api.post('/categories', data);
      await get().fetchCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  },
  deleteCategory: async (categoryId) => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      await guestStorage.deleteCategory(categoryId);
      const categories = await guestStorage.getCategories();
      set({ categories });
      return;
    }
    
    try {
      await api.delete(`/categories/${categoryId}`);
      await get().fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  },
  
  // Payment Method actions
  setPaymentMethods: (methods) => set({ paymentMethods: methods }),
  fetchPaymentMethods: async () => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      const methods = await guestStorage.getPaymentMethods();
      set({ paymentMethods: methods });
      return;
    }
    
    try {
      const response = await api.get('/payment-methods');
      set({ paymentMethods: response.data });
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    }
  },
  createPaymentMethod: async (data) => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      await guestStorage.createPaymentMethod(data);
      const methods = await guestStorage.getPaymentMethods();
      set({ paymentMethods: methods });
      return;
    }
    
    try {
      await api.post('/payment-methods', data);
      await get().fetchPaymentMethods();
    } catch (error) {
      console.error('Error creating payment method:', error);
      throw error;
    }
  },
  deletePaymentMethod: async (paymentId) => {
    const isGuest = get().isGuestMode;
    if (isGuest) {
      await guestStorage.deletePaymentMethod(paymentId);
      const methods = await guestStorage.getPaymentMethods();
      set({ paymentMethods: methods });
      return;
    }
    
    try {
      await api.delete(`/payment-methods/${paymentId}`);
      await get().fetchPaymentMethods();
    } catch (error) {
      console.error('Error deleting payment method:', error);
      throw error;
    }
  },
  
  // Expense actions
  setExpenses: (expenses) => set({ expenses }),
  fetchExpenses: async (profileId) => {
    const isGuest = get().isGuestMode;
    const pid = profileId || get().activeProfile?.profile_id;
    
    if (isGuest) {
      const expenses = await guestStorage.getExpenses(pid);
      set({ expenses });
      return;
    }
    
    try {
      const params = pid ? { profile_id: pid } : {};
      const response = await api.get('/expenses', { params });
      set({ expenses: response.data });
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  },
  createExpense: async (data) => {
    const isGuest = get().isGuestMode;
    
    if (isGuest) {
      await guestStorage.createExpense(data);
      await Promise.all([get().fetchExpenses(), get().fetchSummary()]);
      return;
    }
    
    try {
      await api.post('/expenses', data);
      await Promise.all([get().fetchExpenses(), get().fetchSummary()]);
    } catch (error) {
      console.error('Error creating expense:', error);
      throw error;
    }
  },
  updateExpense: async (expenseId, data) => {
    const isGuest = get().isGuestMode;
    
    if (isGuest) {
      await guestStorage.updateExpense(expenseId, data);
      await Promise.all([get().fetchExpenses(), get().fetchSummary()]);
      return;
    }
    
    try {
      await api.put(`/expenses/${expenseId}`, data);
      await Promise.all([get().fetchExpenses(), get().fetchSummary()]);
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  },
  deleteExpense: async (expenseId) => {
    const isGuest = get().isGuestMode;
    
    if (isGuest) {
      await guestStorage.deleteExpense(expenseId);
      await Promise.all([get().fetchExpenses(), get().fetchSummary()]);
      return;
    }
    
    try {
      await api.delete(`/expenses/${expenseId}`);
      await Promise.all([get().fetchExpenses(), get().fetchSummary()]);
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  },
  
  // Summary actions
  setSummary: (summary) => set({ summary }),
  fetchSummary: async (profileId, period = 'month') => {
    const isGuest = get().isGuestMode;
    const pid = profileId || get().activeProfile?.profile_id;
    
    if (isGuest) {
      const summary = await guestStorage.getSummary(pid, period);
      set({ summary });
      return;
    }
    
    try {
      const params: any = { period };
      if (pid) params.profile_id = pid;
      const response = await api.get('/stats/summary', { params });
      set({ summary: response.data });
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  },
  setAIChatSession: (profileId, session) =>
    set((state) => {
      const nextSessions = {
        ...state.aiChatSessions,
        [profileId]: {
          messages: Array.isArray(session.messages) ? session.messages : [],
          prompt: String(session.prompt || ''),
        },
      };
      AsyncStorage.setItem(AI_CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(nextSessions)).catch((error) =>
        console.error('Error persisting AI chat sessions:', error)
      );
      return { aiChatSessions: nextSessions };
    }),
  clearAIChatSession: (profileId) =>
    set((state) => {
      const next = { ...state.aiChatSessions };
      delete next[profileId];
      AsyncStorage.setItem(AI_CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(next)).catch((error) =>
        console.error('Error persisting AI chat sessions:', error)
      );
      return { aiChatSessions: next };
    }),
  hydrateAIChatSessions: async () => {
    try {
      const serialized = await AsyncStorage.getItem(AI_CHAT_SESSIONS_STORAGE_KEY);
      if (!serialized) {
        set({ aiChatSessions: {} });
        return;
      }

      const parsed = JSON.parse(serialized);
      const sanitized = sanitizePersistedChatSessions(parsed);
      set({ aiChatSessions: sanitized });
    } catch (error) {
      console.error('Error hydrating AI chat sessions:', error);
      set({ aiChatSessions: {} });
    }
  },
}));
