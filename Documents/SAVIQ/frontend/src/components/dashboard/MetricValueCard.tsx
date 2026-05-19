import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';

interface MetricValueCardProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  isLoading: boolean;
  error?: string;
  hasValue: boolean;
  value: number;
  loadingLabel: string;
  emptyLabel: string;
}

export function MetricValueCard({
  title,
  icon,
  accentColor,
  isLoading,
  error,
  hasValue,
  value,
  loadingLabel,
  emptyLabel,
}: MetricValueCardProps) {
  return (
    <NeumorphicCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={icon} size={18} color={accentColor} />
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Text style={styles.helper}>{loadingLabel}</Text>
        ) : error ? (
          <Text style={styles.helper}>{error}</Text>
        ) : !hasValue ? (
          <Text style={styles.helper}>{emptyLabel}</Text>
        ) : (
          <Text style={[styles.amount, { color: accentColor }]}>$ {value.toFixed(2)}</Text>
        )}
      </View>
    </NeumorphicCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: lightTheme.colors.text,
  },
  amount: {
    fontSize: 28,
    fontWeight: '800',
  },
  helper: {
    fontSize: 14,
    color: lightTheme.colors.textTertiary,
  },
  content: {
    minHeight: 48,
    justifyContent: 'center',
  },
});
