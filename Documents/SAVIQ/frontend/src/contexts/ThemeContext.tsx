import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { settingsAPI } from '../services/api';

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
  colors: typeof lightColors;
}

const lightColors = {
  background: '#F8F8FA',
  surface: '#FFFFFF',
  surfaceHover: '#F0F0F4',
  textPrimary: '#000000',
  textSecondary: '#8E8E93',
  border: '#E5E5EA',
  primary: '#007AFF',
  income: '#34C759',
  expense: '#FF3B30',
  transfer: '#5856D6',
  warning: '#FF9500',
};

const darkColors = {
  background: '#1C1C1E',
  surface: '#2C2C2E',
  surfaceHover: '#3A3A3C',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#38383A',
  primary: '#0A84FF',
  income: '#30D158',
  expense: '#FF453A',
  transfer: '#5E5CE6',
  warning: '#FF9F0A',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // First check local storage
      const localDarkMode = await AsyncStorage.getItem('dark_mode');
      if (localDarkMode !== null) {
        setDarkMode(localDarkMode === 'true');
        return;
      }
      
      // Try to load from API
      const response = await settingsAPI.get();
      setDarkMode(response.data.dark_mode || false);
    } catch (error) {
      // Use system preference as fallback
      setDarkMode(systemColorScheme === 'dark');
    }
  };

  const toggleDarkMode = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    await AsyncStorage.setItem('dark_mode', newValue.toString());
    
    try {
      await settingsAPI.update({ dark_mode: newValue });
    } catch (error) {
      console.log('Failed to sync dark mode to server:', error);
    }
  };

  const colors = darkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, colors }}>
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

export { lightColors, darkColors };
