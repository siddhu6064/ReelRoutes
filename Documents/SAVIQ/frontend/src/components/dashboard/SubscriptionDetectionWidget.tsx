import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';
import { deriveSubscriptionState } from '../../utils/aiIntelligenceState';
import { useTheme } from '../../contexts/ThemeContext';

interface SubscriptionDetectionWidgetProps {
  isLoading: boolean;
  error?: string;
  summary: any;
}

function formatCurrency(value: unknown) {
  const safe = Number(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number.isFinite(safe) ? safe : 0
  );
}

function formatCadence(label?: string) {
  if (label === 'annual') return 'Yearly';
  if (label === 'quarterly') return 'Quarterly';
  if (label === 'weekly') return 'Weekly';
  return 'Monthly';
}

export function SubscriptionDetectionWidget({ isLoading, error, summary }: SubscriptionDetectionWidgetProps) {
  const { colors } = useTheme();
  const state = deriveSubscriptionState({ isLoading, error, summary });

  return (
    <NeumorphicCard style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="repeat-outline" size={18} color={colors.warning} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Subscription Detection</Text>
        </View>
      </View>

      {state.viewState === 'loading' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Scanning recurring charges…</Text>
      ) : state.viewState === 'error' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>{error}</Text>
      ) : state.viewState === 'empty' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Subscription detection is waiting for data.</Text>
      ) : (
        <View style={styles.content}>
          <View style={styles.totalsRow}>
            <View style={[styles.totalBlock, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Recurring total</Text>
              <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatCurrency(state.monthlyTotal)}/mo</Text>
            </View>
            <View style={[styles.totalBlock, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Subscriptions</Text>
              <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{state.candidateCount}</Text>
            </View>
          </View>

          <View style={styles.list}>
            {state.candidates.map((candidate: any, index: number) => (
              <View
                key={`${candidate?.merchant || 'subscription'}-${index}`}
                style={[styles.listItem, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Text style={[styles.itemMerchant, { color: colors.textPrimary }]} numberOfLines={1}>
                  {candidate?.merchant || 'Recurring charge'}
                </Text>
                <Text style={[styles.itemAmount, { color: colors.textSecondary }]}>
                  {formatCurrency(candidate?.amount)} · {formatCadence(candidate?.interval)}
                </Text>
              </View>
            ))}
          </View>
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
  helper: { fontSize: 14, color: lightTheme.colors.textTertiary },
  content: { gap: 10 },
  totalsRow: { flexDirection: 'row', gap: 8 },
  totalBlock: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  totalLabel: { fontSize: 11, color: lightTheme.colors.textSecondary, textTransform: 'uppercase' },
  totalValue: { marginTop: 2, fontSize: 17, fontWeight: '700', color: lightTheme.colors.text },
  list: { gap: 8 },
  listItem: {
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  itemMerchant: { fontSize: 13, fontWeight: '700', color: lightTheme.colors.text },
  itemAmount: { marginTop: 2, fontSize: 12, color: lightTheme.colors.textSecondary },
});
