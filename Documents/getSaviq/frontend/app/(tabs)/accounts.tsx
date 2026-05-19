import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { buildNetBalanceSummary } from '../../src/utils/netBalance';

export default function AccountsScreen() {
  const { paymentMethods, expenses, activeProfile, fetchExpenses, fetchPaymentMethods } = useAppStore();

  useEffect(() => {
    if (activeProfile) {
      fetchExpenses(activeProfile.profile_id);
      fetchPaymentMethods();
    }
  }, [activeProfile]);

  const { accountData, totalIncome, totalExpense, totalBalance } = useMemo(
    () => buildNetBalanceSummary(paymentMethods, expenses),
    [paymentMethods, expenses]
  );

  const getAccountIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'cash': return 'cash-outline';
      case 'credit_card': return 'card-outline';
      case 'debit_card': return 'card-outline';
      case 'bank_transfer': return 'business-outline';
      default: return 'wallet-outline';
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Accounts</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Total Balance Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Net Balance</Text>
            <Text style={[styles.balanceAmount, totalBalance < 0 && { color: '#FF3B30' }]}>
              $ {totalBalance.toFixed(2)}
            </Text>
            <View style={styles.balanceRow}>
              <View style={styles.balanceStat}>
                <View style={[styles.dot, { backgroundColor: '#007AFF' }]} />
                <Text style={styles.balanceStatLabel}>Income</Text>
                <Text style={[styles.balanceStatValue, { color: '#007AFF' }]}>$ {totalIncome.toFixed(2)}</Text>
              </View>
              <View style={styles.balanceStat}>
                <View style={[styles.dot, { backgroundColor: '#FF3B30' }]} />
                <Text style={styles.balanceStatLabel}>Expense</Text>
                <Text style={[styles.balanceStatValue, { color: '#FF3B30' }]}>$ {totalExpense.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Account List */}
          <Text style={styles.sectionTitle}>Payment Methods</Text>
          {accountData.map((account, index) => (
            <View key={index} style={styles.accountCard}>
              <View style={styles.accountLeft}>
                <View style={[styles.accountIcon, { backgroundColor: account.type === 'cash' ? '#E8F5E9' : '#E3F2FD' }]}>
                  <Ionicons
                    name={getAccountIcon(account.type)}
                    size={24}
                    color={account.type === 'cash' ? '#2E7D32' : '#1565C0'}
                  />
                </View>
                <View>
                  <Text style={styles.accountName}>{account.name}</Text>
                  {account.lastFour && (
                    <Text style={styles.accountSubtext}>•••• {account.lastFour}</Text>
                  )}
                  <Text style={styles.accountCount}>{account.count} transactions</Text>
                </View>
              </View>
              <View style={styles.accountRight}>
                {account.income > 0 && (
                  <Text style={styles.accountIncome}>+${account.income.toFixed(2)}</Text>
                )}
                {account.expense > 0 && (
                  <Text style={styles.accountExpense}>-${account.expense.toFixed(2)}</Text>
                )}
                {account.income === 0 && account.expense === 0 && (
                  <Text style={styles.accountZero}>$0.00</Text>
                )}
              </View>
            </View>
          ))}

          {accountData.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={40} color="#C7C7CC" />
              <Text style={styles.emptyText}>No accounts set up yet</Text>
              <Text style={styles.emptySubtext}>Add payment methods in More → Settings</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FA' },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  content: { flex: 1, paddingHorizontal: 16 },
  // Balance card
  balanceCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 20, marginBottom: 20, borderWidth: 0.5, borderColor: '#E5E5EA' },
  balanceLabel: { fontSize: 13, color: '#8E8E93', marginBottom: 4 },
  balanceAmount: { fontSize: 32, fontWeight: '800', color: '#000', marginBottom: 16 },
  balanceRow: { flexDirection: 'row', gap: 20 },
  balanceStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  balanceStatLabel: { fontSize: 13, color: '#8E8E93' },
  balanceStatValue: { fontSize: 13, fontWeight: '600' },
  // Section
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 12 },
  // Account card
  accountCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: '#E5E5EA' },
  accountLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  accountIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  accountName: { fontSize: 16, fontWeight: '600', color: '#000' },
  accountSubtext: { fontSize: 13, color: '#8E8E93' },
  accountCount: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  accountRight: { alignItems: 'flex-end' },
  accountIncome: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  accountExpense: { fontSize: 14, fontWeight: '600', color: '#FF3B30' },
  accountZero: { fontSize: 14, color: '#8E8E93' },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
});
