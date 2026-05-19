import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';
import { MoMSummary } from '../../utils/monthSpend';

interface MoMChangeCardProps {
  isLoading: boolean;
  error?: string;
  summary: MoMSummary;
}

export function MoMChangeCard({ isLoading, error, summary }: MoMChangeCardProps) {
  const {
    currentMonthSpend,
    previousMonthSpend,
    deltaAmount,
    deltaPercent,
    hasCurrentData,
    hasPreviousData,
    direction,
  } = summary;

  const noData = !hasCurrentData && !hasPreviousData;
  const noBaseline = previousMonthSpend <= 0 && currentMonthSpend > 0;

  const accentColor =
    direction === 'up'
      ? lightTheme.colors.danger
      : direction === 'down'
        ? lightTheme.colors.success
        : lightTheme.colors.textTertiary;

  const iconName: keyof typeof Ionicons.glyphMap =
    direction === 'up'
      ? 'arrow-up-circle-outline'
      : direction === 'down'
        ? 'arrow-down-circle-outline'
        : 'remove-circle-outline';

  const headline = (() => {
    if (noData) return 'No month-over-month data yet.';
    if (noBaseline) return 'Spending started this month; no last-month baseline.';
    if (direction === 'flat') return 'Spending is in line with last month.';

    const absPercent = Math.abs(deltaPercent || 0);
    if (direction === 'up') {
      return `Up ${absPercent.toFixed(1)}% vs last month`;
    }
    return `Down ${absPercent.toFixed(1)}% vs last month`;
  })();

  return (
    <NeumorphicCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="swap-vertical-outline" size={18} color={lightTheme.colors.primary} />
          <Text style={styles.title}>MoM Change</Text>
        </View>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Text style={styles.helper}>Loading month comparison...</Text>
        ) : error ? (
          <Text style={styles.helper}>{error}</Text>
        ) : (
          <>
            <View style={styles.primaryRow}>
              <Ionicons name={iconName} size={20} color={accentColor} />
              <Text style={[styles.primaryText, { color: accentColor }]}>
                $ {Math.abs(deltaAmount).toFixed(2)}
              </Text>
            </View>

            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.subline}>
              This month $ {currentMonthSpend.toFixed(2)} · Last month $ {previousMonthSpend.toFixed(2)}
            </Text>
          </>
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
  helper: {
    fontSize: 14,
    color: lightTheme.colors.textTertiary,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryText: {
    fontSize: 26,
    fontWeight: '800',
  },
  headline: {
    marginTop: 6,
    fontSize: 13,
    color: lightTheme.colors.textSecondary,
  },
  subline: {
    marginTop: 4,
    fontSize: 12,
    color: lightTheme.colors.textTertiary,
  },
  content: {
    minHeight: 68,
    justifyContent: 'center',
  },
});
