import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { profilesAPI, categoriesAPI, paymentMethodsAPI } from '../services/api';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const { user, isGuest } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!user || isGuest) return;

    setLoading(true);
    try {
      const [profilesRes, categoriesRes, paymentMethodsRes] = await Promise.all([
        profilesAPI.getAll(),
        categoriesAPI.getAll(),
        paymentMethodsAPI.getAll(),
      ]);

      const fetchedProfiles = profilesRes.data || [];
      if (!isMounted.current) return;
      setProfiles(fetchedProfiles);
      setCategories(categoriesRes.data || []);
      setPaymentMethods(paymentMethodsRes.data || []);

      // Keep activeProfile in sync: preserve selection if still valid, else default
      setActiveProfile(prev => {
        const stillValid = prev && fetchedProfiles.some(p => p.profile_id === prev.profile_id);
        if (stillValid) return prev;
        return fetchedProfiles.find(p => p.is_default) || fetchedProfiles[0] || null;
      });
    } catch (error) {
      if (isMounted.current) console.error('AppDataContext: failed to load shared data', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [user, isGuest]);

  // Re-fetch whenever the authenticated user changes
  useEffect(() => {
    if (user && !isGuest) {
      refresh();
    } else {
      setProfiles([]);
      setCategories([]);
      setPaymentMethods([]);
      setActiveProfile(null);
    }
  }, [user, isGuest, refresh]);

  const getCategoryById = useCallback(
    (id) => categories.find(c => c.category_id === id) || null,
    [categories],
  );

  const getPaymentMethodById = useCallback(
    (id) => paymentMethods.find(p => p.payment_id === id) || null,
    [paymentMethods],
  );

  return (
    <AppDataContext.Provider value={{
      profiles,
      categories,
      paymentMethods,
      activeProfile,
      setActiveProfile,
      loading,
      refresh,
      getCategoryById,
      getPaymentMethodById,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
