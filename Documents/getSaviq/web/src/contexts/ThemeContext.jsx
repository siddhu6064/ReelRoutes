import React, { createContext, useContext, useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    // Apply dark mode class to document
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadSettings = async () => {
    try {
      // First check localStorage for guest mode
      const localDarkMode = localStorage.getItem('dark_mode');
      if (localDarkMode !== null) {
        setDarkMode(localDarkMode === 'true');
      }
      
      // Try to load from API if authenticated
      const token = localStorage.getItem('session_token');
      if (token) {
        const response = await settingsAPI.get();
        setDarkMode(response.data.dark_mode || false);
      }
    } catch (error) {
      console.log('Settings load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    localStorage.setItem('dark_mode', newValue.toString());
    
    try {
      const token = localStorage.getItem('session_token');
      if (token) {
        await settingsAPI.update({ dark_mode: newValue });
      }
    } catch (error) {
      console.error('Failed to save dark mode setting:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
