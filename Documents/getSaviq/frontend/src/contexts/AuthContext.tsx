import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useAppStore } from '../store/appStore';
import api from '../services/api';
import { User } from '../types';

// Helper to handle storage across web and native
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuestMode: boolean;
  user: User | null;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (credential: any) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Guest user template
const GUEST_USER: User = {
  user_id: 'guest_user',
  email: 'guest@local',
  name: 'Guest User',
  auth_provider: 'guest',
  created_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const { 
    user, isAuthenticated, setUser, setAuthenticated, logout, 
    fetchProfiles, fetchCategories, fetchPaymentMethods,
    setProfiles, setCategories, setPaymentMethods, setActiveProfile, hydrateAIChatSessions
  } = useAppStore();

  const loadUserData = async () => {
    await Promise.all([
      fetchProfiles(),
      fetchCategories(),
      fetchPaymentMethods(),
    ]);
  };

  const loadGuestData = async () => {
    // Load guest data from local storage or create defaults
    try {
      const storedProfiles = await storage.getItem('guest_profiles');
      const storedCategories = await storage.getItem('guest_categories');
      const storedPaymentMethods = await storage.getItem('guest_payment_methods');
      
      if (storedProfiles) {
        const profiles = JSON.parse(storedProfiles);
        setProfiles(profiles);
        setActiveProfile(profiles.find((p: any) => p.is_default) || profiles[0]);
      } else {
        // Create default profiles for guest
        const defaultProfiles = [
          { profile_id: 'guest_personal', user_id: 'guest_user', name: 'Personal', profile_type: 'personal', is_default: true, created_at: new Date().toISOString() },
          { profile_id: 'guest_business', user_id: 'guest_user', name: 'Business', profile_type: 'business', is_default: false, created_at: new Date().toISOString() },
        ];
        setProfiles(defaultProfiles);
        setActiveProfile(defaultProfiles[0]);
        await storage.setItem('guest_profiles', JSON.stringify(defaultProfiles));
      }

      if (storedCategories) {
        setCategories(JSON.parse(storedCategories));
      } else {
        const defaultCategories = [
          { category_id: 'guest_cat_1', user_id: 'guest_user', name: 'Food & Dining', icon: 'restaurant', color: '#ef4444', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_2', user_id: 'guest_user', name: 'Transportation', icon: 'car', color: '#f97316', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_3', user_id: 'guest_user', name: 'Shopping', icon: 'cart', color: '#eab308', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_4', user_id: 'guest_user', name: 'Bills & Utilities', icon: 'flash', color: '#22c55e', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_5', user_id: 'guest_user', name: 'Entertainment', icon: 'film', color: '#06b6d4', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_6', user_id: 'guest_user', name: 'Healthcare', icon: 'medical', color: '#3b82f6', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_7', user_id: 'guest_user', name: 'Travel', icon: 'airplane', color: '#8b5cf6', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_8', user_id: 'guest_user', name: 'Education', icon: 'school', color: '#ec4899', is_default: true, created_at: new Date().toISOString() },
          { category_id: 'guest_cat_9', user_id: 'guest_user', name: 'Other', icon: 'ellipsis-horizontal', color: '#6b7280', is_default: true, created_at: new Date().toISOString() },
        ];
        setCategories(defaultCategories);
        await storage.setItem('guest_categories', JSON.stringify(defaultCategories));
      }

      if (storedPaymentMethods) {
        setPaymentMethods(JSON.parse(storedPaymentMethods));
      } else {
        const defaultPaymentMethods = [
          { payment_id: 'guest_pm_1', user_id: 'guest_user', name: 'Cash', type: 'cash', is_default: true, created_at: new Date().toISOString() },
          { payment_id: 'guest_pm_2', user_id: 'guest_user', name: 'Credit Card', type: 'credit_card', is_default: false, created_at: new Date().toISOString() },
          { payment_id: 'guest_pm_3', user_id: 'guest_user', name: 'Debit Card', type: 'debit_card', is_default: false, created_at: new Date().toISOString() },
          { payment_id: 'guest_pm_4', user_id: 'guest_user', name: 'Bank Transfer', type: 'bank_transfer', is_default: false, created_at: new Date().toISOString() },
        ];
        setPaymentMethods(defaultPaymentMethods);
        await storage.setItem('guest_payment_methods', JSON.stringify(defaultPaymentMethods));
      }
    } catch (error) {
      console.error('Error loading guest data:', error);
    }
  };

  const checkAuth = useCallback(async () => {
    try {
      await hydrateAIChatSessions();

      // Check if in guest mode
      const guestMode = await storage.getItem('guest_mode');
      if (guestMode === 'true') {
        setIsGuestMode(true);
        setUser(GUEST_USER as any);
        setAuthenticated(true);
        await loadGuestData();
        setIsLoading(false);
        return;
      }

      const token = await storage.getItem('session_token');
      if (!token) {
        setIsLoading(false);
        setAuthenticated(false);
        return;
      }

      const response = await api.get('/auth/me');
      setUser(response.data);
      setAuthenticated(true);
      await loadUserData();
    } catch (error) {
      console.log('Auth check failed:', error);
      await storage.removeItem('session_token');
      setUser(null);
      setAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, [hydrateAIChatSessions]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);


  const handleSessionExpired = useCallback(async () => {
    await storage.removeItem('session_token');
    await storage.removeItem('guest_mode');
    setIsGuestMode(false);
    logout();
  }, [logout]);

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error?.response?.status === 401) {
          await handleSessionExpired();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [handleSessionExpired]);

  const signInWithGoogle = async (idToken: string) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/google', { id_token: idToken });
      const { user, session_token } = response.data;
      
      await storage.setItem('session_token', session_token);
      await storage.removeItem('guest_mode');
      setIsGuestMode(false);
      setUser(user);
      setAuthenticated(true);
      await loadUserData();
    } catch (error) {
      console.error('Google sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithApple = async (credential: any) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/apple/login', {
        identity_token: credential.identityToken,
        user: credential.user,
        email: credential.email,
        full_name: credential.fullName,
      });
      const { user, session_token } = response.data;
      
      await storage.setItem('session_token', session_token);
      await storage.removeItem('guest_mode');
      setIsGuestMode(false);
      setUser(user);
      setAuthenticated(true);
      await loadUserData();
    } catch (error) {
      console.error('Apple sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/login', { email, password });
      const { user, session_token } = response.data;
      
      await storage.setItem('session_token', session_token);
      await storage.removeItem('guest_mode');
      setIsGuestMode(false);
      setUser(user);
      setAuthenticated(true);
      await loadUserData();
    } catch (error: any) {
      console.error('Email sign in error:', error);
      throw new Error(error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (email: string, password: string, name: string) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/register', { email, password, name });
      const { user, session_token } = response.data;
      
      await storage.setItem('session_token', session_token);
      await storage.removeItem('guest_mode');
      setIsGuestMode(false);
      setUser(user);
      setAuthenticated(true);
      await loadUserData();
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const continueAsGuest = async () => {
    try {
      setIsLoading(true);
      await storage.setItem('guest_mode', 'true');
      setIsGuestMode(true);
      setUser(GUEST_USER as any);
      setAuthenticated(true);
      await loadGuestData();
    } catch (error) {
      console.error('Guest mode error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      if (!isGuestMode) {
        await api.post('/auth/logout');
      }
    } catch (error) {
      console.log('Logout API error:', error);
    } finally {
      await storage.removeItem('session_token');
      await storage.removeItem('guest_mode');
      setIsGuestMode(false);
      logout();
    }
  };

  return (
    <AuthContext.Provider value={{
      isLoading,
      isAuthenticated,
      isGuestMode,
      user,
      signInWithGoogle,
      signInWithApple,
      signInWithEmail,
      registerWithEmail,
      continueAsGuest,
      signOut,
      checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
