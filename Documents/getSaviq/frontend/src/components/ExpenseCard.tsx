import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Expense, Category, PaymentMethod } from '../types';
import { formatCurrency, formatShortDate } from '../utils/format';
import { lightTheme } from './NeumorphicUI';

interface ExpenseCardProps {
  expense: Expense;
  category?: Category;
  paymentMethod?: PaymentMethod;
  onPress?: () => void;
}

export function ExpenseCard({ expense, category, paymentMethod, onPress }: ExpenseCardProps) {
  const getPaymentIcon = (type?: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'credit_card': return 'card';
      case 'debit_card': return 'card-outline';
      case 'bank_transfer': return 'business';
      case 'cash': return 'cash';
      default: return 'wallet';
    }
  };

  const txType = (expense as any).type || 'expense';
  const isIncome = txType === 'income';
  const isTransfer = txType === 'transfer';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconContainer, { backgroundColor: category?.color ? category.color + '20' : lightTheme.colors.background }]}>
        <Ionicons
          name={isTransfer ? 'swap-horizontal' : (category?.icon as keyof typeof Ionicons.glyphMap) || 'receipt'}
          size={20}
          color={category?.color || lightTheme.colors.textTertiary}
        />
      </View>
      
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.description} numberOfLines={1}>
            {expense.description}
          </Text>
          <Text style={[
            styles.amount,
            isIncome && { color: lightTheme.colors.success },
            isTransfer && { color: lightTheme.colors.blue },
          ]}>
            {isIncome ? '+' : isTransfer ? '' : '-'}{formatCurrency(expense.amount)}
          </Text>
        </View>
        
        <View style={styles.bottomRow}>
          <View style={styles.metaContainer}>
            <Text style={styles.category}>{category?.name || 'Uncategorized'}</Text>
            {expense.merchant && (
              <Text style={styles.merchant}>· {expense.merchant}</Text>
            )}
          </View>
          <View style={styles.datePayment}>
            <Ionicons
              name={getPaymentIcon(paymentMethod?.type)}
              size={12}
              color={lightTheme.colors.textTertiary}
            />
            <Text style={styles.date}>{formatShortDate(expense.date)}</Text>
          </View>
        </View>
        
        {expense.receipt_image && (
          <View style={styles.receiptIndicator}>
            <Ionicons name="image" size={12} color={lightTheme.colors.primary} />
            <Text style={styles.receiptText}>Receipt attached</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: lightTheme.colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: lightTheme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: lightTheme.colors.danger,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  category: {
    fontSize: 13,
    color: lightTheme.colors.textTertiary,
  },
  merchant: {
    fontSize: 13,
    color: lightTheme.colors.textTertiary,
    marginLeft: 4,
  },
  datePayment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: 12,
    color: lightTheme.colors.textTertiary,
  },
  receiptIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  receiptText: {
    fontSize: 12,
    color: lightTheme.colors.primary,
  },
});
