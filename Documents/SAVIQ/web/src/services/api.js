import axios from 'axios';

const rawBackendUrl = import.meta.env.VITE_BACKEND_URL;
const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const isLocalHost = host === 'localhost' || host === '127.0.0.1';
const isProdBuild = import.meta.env.PROD;

if (!rawBackendUrl && isProdBuild && !isLocalHost) {
  throw new Error('Missing VITE_BACKEND_URL for production build.');
}

const API_BASE_URL = rawBackendUrl || 'http://localhost:8001';

if (!rawBackendUrl && typeof window !== 'undefined' && !isLocalHost) {
  console.warn('[SAVIQ] VITE_BACKEND_URL is not set; falling back to http://localhost:8001');
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});


api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('session_token');
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
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('session_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, name) => api.post('/auth/register', { email, password, name }),
  googleAuth: (idToken) => api.post('/auth/google', { id_token: idToken }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  deleteAccount: (confirmation) => api.delete('/auth/account', { data: { confirmation } }),
};

// Profiles API
export const profilesAPI = {
  getAll: () => api.get('/profiles'),
  create: (name) => api.post('/profiles', { name }),
  update: (profileId, data) => api.put(`/profiles/${profileId}`, data),
  delete: (profileId) => api.delete(`/profiles/${profileId}`),
};

// Categories API
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (categoryId, data) => api.put(`/categories/${categoryId}`, data),
  delete: (categoryId) => api.delete(`/categories/${categoryId}`),
};

// Payment Methods API
export const paymentMethodsAPI = {
  getAll: () => api.get('/payment-methods'),
  create: (data) => api.post('/payment-methods', data),
  update: (paymentId, data) => api.put(`/payment-methods/${paymentId}`, data),
  delete: (paymentId) => api.delete(`/payment-methods/${paymentId}`),
};

// Expenses/Transactions API
export const expensesAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  getOne: (expenseId) => api.get(`/expenses/${expenseId}`),
  create: (data) => api.post('/expenses', data),
  update: (expenseId, data) => api.put(`/expenses/${expenseId}`, data),
  delete: (expenseId) => api.delete(`/expenses/${expenseId}`),
};

// Stats API
export const statsAPI = {
  getSummary: (params) => api.get('/stats/summary', { params }),
  getWeeklySummary: (params) => api.get('/stats/weekly-summary', { params }),
  getInsights: (params) => api.get('/insights', { params }),
};

// Analytics API
export const analyticsAPI = {
  getSummary: (params) => api.get('/analytics/summary', { params }),
  getCategoryBreakdown: (params) => api.get('/analytics/category-breakdown', { params }),
  getPaymentMethodBreakdown: (params) => api.get('/analytics/payment-method-breakdown', { params }),
  getMonthlyTrend: (params) => api.get('/analytics/monthly-trend', { params }),
};

// Deterministic Insights API
export const insightsAPI = {
  getOverview: (params) => api.get('/insights/overview', { params }),
  getRecommendations: (params) => api.get('/insights/recommendations', { params }),
  getV2: (params) => api.get('/insights/v2', { params }),
};

// AI API
export const aiAPI = {
  scanReceipt: (image) => api.post('/scan-receipt', { image }),
  chatInsights: (data) => api.post('/ai/chat-insights', data),
};

// Budget API
export const budgetsAPI = {
  getAll: (params) => api.get('/budgets', { params }),
  create: (data) => api.post('/budgets', data),
  update: (budgetId, data) => api.put(`/budgets/${budgetId}`, data),
  delete: (budgetId) => api.delete(`/budgets/${budgetId}`),
  getProgress: (profileId) => api.get('/budgets/progress', { params: { profile_id: profileId } }),
};

// Forecast API
export const forecastAPI = {
  getOverview: (params) => api.get('/forecast', { params }),
};

// Subscriptions API
export const subscriptionsAPI = {
  getSummary: (params) => api.get('/subscriptions/summary', { params }),
};


// Dashboard Metrics API
export const dashboardMetricsAPI = {
  get: (params) => api.get('/dashboard/metrics', { params }),
  getUrl: (params) => api.getUri({ url: '/dashboard/metrics', params }),
};

// Weekly Digest API
export const weeklyDigestAPI = {
  get: (params) => api.get('/weekly-digest', { params }),
  getLatest: (params) => api.get('/weekly-digest/latest', { params }),
  dismissLatest: (params) => api.post('/weekly-digest/latest/dismiss', null, { params }),
};

// Savings Goals API
export const savingsGoalsAPI = {
  getAll: (params) => api.get('/savings-goals', { params }),
  getOne: (goalId, params) => api.get(`/savings-goals/${goalId}`, { params }),
  create: (data) => api.post('/savings-goals', data),
  update: (goalId, data) => api.put(`/savings-goals/${goalId}`, data),
  delete: (goalId) => api.delete(`/savings-goals/${goalId}`),
};

// Settings API
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

// Export API
export const exportAPI = {
  getCSV: (profileId, startDate, endDate) => {
    const params = { profile_id: profileId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return api.get('/export/csv', { params, responseType: 'blob' });
  },
  getJSON: (profileId, startDate, endDate) => {
    const params = { profile_id: profileId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return api.get('/export/json', { params });
  },
};

export default api;
