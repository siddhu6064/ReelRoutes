import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const guestMode = localStorage.getItem('guest_mode');
      
      if (guestMode === 'true') {
        setIsGuest(true);
        setUser({ name: 'Guest', email: 'guest@local', user_id: 'guest' });
        setLoading(false);
        return;
      }
      
      if (token) {
        const response = await authAPI.getMe();
        setUser(response.data);
      }
    } catch (error) {
      localStorage.removeItem('session_token');
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await authAPI.login(email, password);
    const { user, session_token } = response.data;
    localStorage.setItem('session_token', session_token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('guest_mode');
    setUser(user);
    setIsGuest(false);
    return user;
  };

  const register = async (email, password, name) => {
    const response = await authAPI.register(email, password, name);
    const { user, session_token } = response.data;
    localStorage.setItem('session_token', session_token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('guest_mode');
    setUser(user);
    setIsGuest(false);
    return user;
  };

  const googleAuth = async (idToken) => {
    const response = await authAPI.googleAuth(idToken);
    const { user, session_token } = response.data;
    localStorage.setItem('session_token', session_token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('guest_mode');
    setUser(user);
    setIsGuest(false);
    return user;
  };

  const continueAsGuest = () => {
    localStorage.setItem('guest_mode', 'true');
    localStorage.removeItem('session_token');
    setUser({ name: 'Guest', email: 'guest@local', user_id: 'guest' });
    setIsGuest(true);
  };

  const logout = async () => {
    try {
      if (!isGuest) {
        await authAPI.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('session_token');
      localStorage.removeItem('user');
      localStorage.removeItem('guest_mode');
      setUser(null);
      setIsGuest(false);
    }
  };

  const deleteAccount = async () => {
    await authAPI.deleteAccount('DELETE');
    localStorage.removeItem('session_token');
    localStorage.removeItem('user');
    localStorage.removeItem('guest_mode');
    setUser(null);
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isGuest,
      login, 
      register, 
      googleAuth,
      continueAsGuest,
      logout,
      deleteAccount,
      checkAuth 
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
