import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// Helper to handle storage across web and native
const getToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem('session_token');
    }
    return await SecureStore.getItemAsync('session_token');
  } catch (error) {
    console.log('Error getting token:', error);
    return null;
  }
};

const removeToken = async (): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem('session_token');
    } else {
      await SecureStore.deleteItemAsync('session_token');
    }
  } catch (error) {
    console.log('Error removing token:', error);
  }
};

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear token on auth error
      await removeToken();
    }
    return Promise.reject(error);
  }
);

// Budget API
export const budgetsAPI = {
  getAll: (params?: { profile_id?: string }) => api.get('/budgets', { params }),
  create: (data: any) => api.post('/budgets', data),
  update: (budgetId: string, data: any) => api.put(`/budgets/${budgetId}`, data),
  delete: (budgetId: string) => api.delete(`/budgets/${budgetId}`),
  getProgress: (profileId: string) => api.get('/budgets/progress', { params: { profile_id: profileId } }),
};

// Settings API
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data: { dark_mode?: boolean; currency?: string }) => api.put('/settings', data),
};

// Export API
export const exportAPI = {
  getCSV: (profileId: string, startDate?: string, endDate?: string) => {
    const params: any = { profile_id: profileId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return api.get('/export/csv', { params });
  },
  getJSON: (profileId: string, startDate?: string, endDate?: string) => {
    const params: any = { profile_id: profileId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return api.get('/export/json', { params });
  },
};

// AI API
export const aiAPI = {
  chatInsights: (data: { profile_id: string; question: string; recent_days?: number }) =>
    api.post('/ai/chat-insights', data),
};

export default api;
