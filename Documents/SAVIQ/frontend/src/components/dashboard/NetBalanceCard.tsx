import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme, NeumorphicCard } from '../NeumorphicUI';

interface NetBalanceCardProps {
  isLoading: boolean;
  error?: string;
  hasData: boolean;
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  onPressAccounts?: () => void;
}

export function NetBalanceCard({
  isLoading,
  error,
  hasData,
  totalBalance,
  totalIncome,
  totalExpense,
  onPressAccounts,
}: NetBalanceCardProps) {
  return (
    <NeumorphicCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="wallet-outline" size={18} color={lightTheme.colors.primary} />
          <Text style={styles.title}>Net Balance</Text>
        </View>
        {onPressAccounts ? (
          <TouchableOpacity onPress={onPressAccounts} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.link}>Accounts</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Text style={styles.helper}>Loading balance...</Text>
        ) : error ? (
          <Text style={styles.helper}>{error}</Text>
        ) : !hasData ? (
          <Text style={styles.helper}>No transactions yet for this profile.</Text>
        ) : (
          <>
            <Text style={[styles.amount, totalBalance < 0 && styles.amountNegative]}>$ {totalBalance.toFixed(2)}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaIncome}>Income $ {totalIncome.toFixed(2)}</Text>
              <Text style={styles.metaExpense}>Expense $ {totalExpense.toFixed(2)}</Text>
            </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  amount: {
    fontSize: 30,
    fontWeight: '800',
    color: lightTheme.colors.text,
    marginBottom: 6,
  },
  amountNegative: {
    color: lightTheme.colors.danger,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaIncome: {
    fontSize: 13,
    color: lightTheme.colors.blue,
    fontWeight: '600',
  },
  metaExpense: {
    fontSize: 13,
    color: lightTheme.colors.danger,
    fontWeight: '600',
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
