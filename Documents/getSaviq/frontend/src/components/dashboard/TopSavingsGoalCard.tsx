import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';
import { SavingsGoal } from '../../utils/goals';

interface TopSavingsGoalCardProps {
  isLoading: boolean;
  error?: string;
  goal: SavingsGoal | null;
  projectionText: string;
  onPressGoals: () => void;
}

export function TopSavingsGoalCard({
  isLoading,
  error,
  goal,
  projectionText,
  onPressGoals,
}: TopSavingsGoalCardProps) {
  const progress = Math.max(0, Math.min(100, Number(goal?.progress_percentage || 0)));
  const currentAmount = Number(goal?.current_amount || 0);
  const targetAmount = Number(goal?.target_amount || 0);

  return (
    <NeumorphicCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flag-outline" size={18} color={lightTheme.colors.primary} />
          <Text style={styles.title}>Top Savings Goal</Text>
        </View>
        <TouchableOpacity onPress={onPressGoals} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>Goals</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Text style={styles.helper}>Loading top goal...</Text>
        ) : error ? (
          <Text style={styles.helper}>{error}</Text>
        ) : !goal ? (
          <Text style={styles.helper}>No actionable goals yet.</Text>
        ) : (
          <>
            <Text style={styles.goalTitle} numberOfLines={1}>{goal.title}</Text>
            <Text style={styles.goalMeta}>{progress.toFixed(0)}% complete</Text>

            <View style={styles.progressBg}>
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>

            <Text style={styles.amounts}>$ {currentAmount.toFixed(2)} of $ {targetAmount.toFixed(2)}</Text>
            <Text style={styles.projection}>{projectionText}</Text>
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
  link: {
    fontSize: 13,
    color: lightTheme.colors.primary,
    fontWeight: '600',
  },
  helper: {
    fontSize: 14,
    color: lightTheme.colors.textTertiary,
  },
  goalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: lightTheme.colors.text,
  },
  goalMeta: {
    marginTop: 2,
    fontSize: 13,
    color: lightTheme.colors.textSecondary,
  },
  progressBg: {
    marginTop: 8,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.border,
  },
  progressBar: {
    height: '100%',
    backgroundColor: lightTheme.colors.primary,
  },
  amounts: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.colors.text,
  },
  projection: {
    marginTop: 3,
    fontSize: 12,
    color: lightTheme.colors.textTertiary,
  },
  content: {
    minHeight: 72,
    justifyContent: 'center',
  },
});
