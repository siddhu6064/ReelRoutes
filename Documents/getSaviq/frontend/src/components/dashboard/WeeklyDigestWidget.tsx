import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';
import { deriveWeeklyDigestState } from '../../utils/aiIntelligenceState';
import { useTheme } from '../../contexts/ThemeContext';

interface WeeklyDigestWidgetProps {
  isLoading: boolean;
  error?: string;
  digest: any;
}

function formatCurrency(value: unknown) {
  const safe = Number(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number.isFinite(safe) ? safe : 0
  );
}

function formatWeekRange(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    return 'This week';
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(start)
    + ` - ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(end)}`;
}

export function WeeklyDigestWidget({ isLoading, error, digest }: WeeklyDigestWidgetProps) {
  const { colors } = useTheme();
  const state = deriveWeeklyDigestState({ isLoading, error, digest });
  const weekLabel = formatWeekRange(state.weekStart, state.weekEnd);

  return (
    <NeumorphicCard style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Weekly Digest</Text>
        </View>
        <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>{weekLabel}</Text>
      </View>

      {state.viewState === 'loading' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Loading weekly digest…</Text>
      ) : state.viewState === 'error' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>{error}</Text>
      ) : state.viewState === 'empty' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Weekly digest is waiting for data.</Text>
      ) : (
        <View style={styles.content}>
          <View style={[styles.valueBlock, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.valueLabel, { color: colors.textSecondary }]}>Net this week</Text>
            <Text style={[styles.valueText, { color: colors.textPrimary }]}>{formatCurrency(state.summary.netTotal)}</Text>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              Income {formatCurrency(state.summary.incomeTotal)} • Expense {formatCurrency(state.summary.expenseTotal)}
            </Text>
          </View>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Vs last week: {Number(state.netDelta) >= 0 ? '+' : '-'}
            {formatCurrency(Math.abs(Number(state.netDelta) || 0))}
          </Text>
          <Text style={[styles.narrativeText, { color: colors.textSecondary }]}>{state.narrative || 'Weekly summary ready.'}</Text>
        </View>
      )}
    </NeumorphicCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8 },
  header: { marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: lightTheme.colors.text },
  weekLabel: { marginTop: 4, fontSize: 12, color: lightTheme.colors.textSecondary },
  helper: { fontSize: 14, color: lightTheme.colors.textTertiary },
  content: { gap: 8 },
  valueBlock: {
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  valueLabel: { fontSize: 11, color: lightTheme.colors.textSecondary, textTransform: 'uppercase' },
  valueText: { marginTop: 2, fontSize: 22, fontWeight: '800', color: lightTheme.colors.text },
  metaText: { marginTop: 2, fontSize: 12, color: lightTheme.colors.textSecondary },
  narrativeText: { fontSize: 13, lineHeight: 19, color: lightTheme.colors.textSecondary },
});
