import React, { useEffect, useRef } from 'react';
import { Slot, useRouter, useSegments, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { View, ActivityIndicator, StyleSheet, StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../src/components/NeumorphicUI';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import notificationService from '../src/services/notificationService';
import { deriveAuthRouteAction, deriveDeepLinkNavigationTarget } from '../src/utils/authRouteGuardState';

function RootLayoutNav() {
  const { isLoading, isAuthenticated, signInWithGoogle } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const hasProcessedCallback = useRef(false);
  const pendingDeepLink = useRef<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Handle notification tap → navigate to Add Expense screen
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Listener: notification received while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener(_notification => {
      // Optionally show in-app banner — currently handled by setNotificationHandler
    });

    // Listener: user tapped on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const navPath = notificationService.extractNavigationFromNotification(response.notification);
      if (navPath && isAuthenticated) {
        setTimeout(() => router.push(navPath as any), 500);
      } else if (navPath && !isAuthenticated) {
        pendingDeepLink.current = navPath;
      }
    });

    // Check if app was launched from notification
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        const navPath = notificationService.extractNavigationFromNotification(response.notification);
        if (navPath) {
          if (isAuthenticated) {
            setTimeout(() => router.push(navPath as any), 800);
          } else {
            pendingDeepLink.current = navPath;
          }
        }
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated]);

  // Handle deep links for Apple Shortcuts / Automation
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (!url) return;
      
      try {
        const parsed = Linking.parse(url);
        const navPath = deriveDeepLinkNavigationTarget(parsed.path || '', parsed.queryParams || {});
        if (navPath) {
          if (isAuthenticated) {
            router.push(navPath as any);
          } else {
            // Store for after auth
            pendingDeepLink.current = navPath;
          }
        }
      } catch (e) {
        console.error('Deep link error:', e);
      }
    };

    // Listen for incoming deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription?.remove();
  }, [isAuthenticated]);

  // Handle OAuth callback from web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.includes('session_id=') && !hasProcessedCallback.current) {
        hasProcessedCallback.current = true;
        const sessionId = hash.split('session_id=')[1]?.split('&')[0];
        if (sessionId) {
          signInWithGoogle(sessionId)
            .then(() => {
              window.history.replaceState(null, '', window.location.pathname);
              router.replace('/(tabs)');
            })
            .catch((err) => {
              console.error('Auth callback error:', err);
              hasProcessedCallback.current = false;
            });
        }
      }
    }
  }, []);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isLoading) return;
    
    const routeAction = deriveAuthRouteAction({
      isLoading,
      isAuthenticated,
      segments,
    });

    if (routeAction === 'enter_tabs') {
      router.replace('/(tabs)');
      // Process pending deep link
      if (pendingDeepLink.current) {
        setTimeout(() => {
          router.push(pendingDeepLink.current as any);
          pendingDeepLink.current = null;
        }, 500);
      }
    } else if (routeAction === 'leave_tabs') {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={lightTheme.colors.primary} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar barStyle="dark-content" backgroundColor={lightTheme.colors.background} />
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.background,
  },
});
