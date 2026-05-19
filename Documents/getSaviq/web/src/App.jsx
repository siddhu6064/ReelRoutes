import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppDataProvider } from './contexts/AppDataContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import BudgetsPage from './pages/BudgetsPage';
import ExportPage from './pages/ExportPage';
import GoalsPage from './pages/GoalsPage';
import { Spinner } from './components/ui';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } 
      />
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <ErrorBoundary><DashboardPage /></ErrorBoundary>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/transactions" 
        element={
          <ProtectedRoute>
            <ErrorBoundary><TransactionsPage /></ErrorBoundary>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/analytics" 
        element={
          <ProtectedRoute>
            <ErrorBoundary><AnalyticsPage /></ErrorBoundary>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/settings" 
        element={
          <ProtectedRoute>
            <ErrorBoundary><SettingsPage /></ErrorBoundary>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/budgets" 
        element={
          <ProtectedRoute>
            <ErrorBoundary><BudgetsPage /></ErrorBoundary>
          </ProtectedRoute>
        } 
      />
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <ErrorBoundary><GoalsPage /></ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/export" 
        element={
          <ProtectedRoute>
            <ExportPage />
          </ProtectedRoute>
        } 
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppDataProvider>
            <AppRoutes />
          </AppDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
