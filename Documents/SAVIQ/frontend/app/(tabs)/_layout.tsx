import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { lightTheme } from '../../src/components/NeumorphicUI';

export default function TabLayout() {
  const router = useRouter();

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={lightTheme.colors.background} />
      <Tabs
        screenOptions={{
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#FF3B30',
          tabBarInactiveTintColor: '#8E8E93',
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <View style={styles.tabIconContainer}>
                <Ionicons name="home-outline" size={20} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Trans.',
            tabBarIcon: ({ color }) => (
              <View style={styles.tabIconContainer}>
                <Ionicons name="document-text-outline" size={20} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color }) => (
              <Ionicons name="bar-chart-outline" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="budgets"
          options={{
            title: 'Budgets',
            tabBarIcon: ({ color }) => (
              <Ionicons name="wallet-outline" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Goals',
            tabBarIcon: ({ color }) => (
              <Ionicons name="flag-outline" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color }) => (
              <Ionicons name="ellipsis-horizontal" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="accounts"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            href: null,
          }}
        />
      </Tabs>

      {/* Floating Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/add')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E5EA',
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    height: Platform.OS === 'ios' ? 84 : 64,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  tabIconContainer: {
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 76,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
});
