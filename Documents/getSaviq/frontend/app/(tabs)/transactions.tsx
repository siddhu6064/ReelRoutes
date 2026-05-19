import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { useRouter } from 'expo-router';
import { Expense } from '../../src/types';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { budgetsAPI } from '../../src/services/api';
import {
  buildTransactionRowHandlers,
  deriveTransactionEmptyState,
  deriveVisibleTransactions,
  buildTransactionExportIntentParams,
  shouldCloseDetailModalAfterDelete,
  shouldResetTransactionDetailOnProfileChange,
} from '../../src/utils/transactionFlowState';
import { useTheme } from '../../src/contexts/ThemeContext';

// ============ EMOJI CATEGORY MAP ============
const CATEGORY_EMOJIS: Record<string, string> = {
  'Food & Dining': '🍔', 'Food': '🍔', 'Social Life': '👫', 'Pets': '🐾',
  'Transportation': '🚕', 'Transport': '🚕', 'Culture': '🖼️', 'Household': '🏠',
  'Apparel': '👒', 'Beauty': '💄', 'Healthcare': '🏥', 'Health': '🏥',
  'Education': '📚', 'Gift': '🎁', 'Shopping': '🛒', 'Bills & Utilities': '⚡',
  'Entertainment': '🎬', 'Travel': '✈️', 'Other': '📋',
};

function getCategoryEmoji(name: string): string {
  return CATEGORY_EMOJIS[name] || '📋';
}

// ============ HELPERS ============
function getMonthName(month: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month];
}

function getDayName(dayIndex: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex];
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// ============ SUB-TAB TYPES ============
type SubTab = 'Daily' | 'Calendar' | 'Monthly' | 'Summary' | 'Description';
const SUB_TABS: SubTab[] = ['Daily', 'Calendar', 'Monthly', 'Summary', 'Description'];
type TransactionTypeFilter = 'all' | 'expense' | 'income' | 'transfer';
const TX_TYPE_FILTERS: Array<{ key: TransactionTypeFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
];

// ============ MAIN COMPONENT ============
export default function TransactionsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { expenses, categories, paymentMethods, activeProfile, fetchExpenses, fetchSummary, summary, deleteExpense } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<SubTab>('Daily');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [txTypeFilter, setTxTypeFilter] = useState<TransactionTypeFilter>('all');
  const previousProfileIdRef = useRef<string | null>(null);

  const activeProfileId = activeProfile?.profile_id;
  const loadTransactions = useCallback(async () => {
    if (!activeProfileId) return;
    await Promise.all([
      fetchExpenses(activeProfileId),
      fetchSummary(activeProfileId, 'month'),
    ]);
  }, [activeProfileId, fetchExpenses, fetchSummary]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const previousProfileId = previousProfileIdRef.current;
    if (shouldResetTransactionDetailOnProfileChange({
      previousProfileId,
      nextProfileId: activeProfileId || null,
      isDetailModalOpen: showDetailModal,
    })) {
      setShowDetailModal(false);
      setSelectedExpense(null);
    }
    previousProfileIdRef.current = activeProfileId || null;
  }, [activeProfileId, showDetailModal]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  // Filter expenses for current month, with optional search
  const monthExpenses = useMemo(() => {
    const categoryNameById = categories.reduce<Record<string, string>>((acc, category) => {
      acc[category.category_id] = category.name;
      return acc;
    }, {});
    return deriveVisibleTransactions({
      expenses,
      month: currentMonth,
      year: currentYear,
      searchQuery,
      txType: txTypeFilter,
      categoryNameById,
    });
  }, [expenses, currentMonth, currentYear, searchQuery, txTypeFilter, categories]);

  const incomeTotal = useMemo(() => {
    return monthExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  }, [monthExpenses]);

  const expenseTotal = useMemo(() => {
    return monthExpenses.filter(e => e.type !== 'income' && e.type !== 'transfer').reduce((s, e) => s + e.amount, 0);
  }, [monthExpenses]);

  const netTotal = incomeTotal - expenseTotal;
  const hasFiltersApplied = showSearch ? Boolean(searchQuery.trim()) || txTypeFilter !== 'all' : txTypeFilter !== 'all';

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const getCategoryInfo = (catId: string) => categories.find(c => c.category_id === catId);
  const getPaymentInfo = (pmId: string) => paymentMethods.find(p => p.payment_id === pmId);

  const handleDeleteExpense = (expense: Expense, onDeleted?: () => void) => {
    Alert.alert('Delete', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteExpense(expense.expense_id);
        if (shouldCloseDetailModalAfterDelete({
          selectedExpenseId: selectedExpense?.expense_id,
          deletedExpenseId: expense.expense_id,
        })) {
          setShowDetailModal(false);
          setSelectedExpense(null);
        }
        onDeleted?.();
      }},
    ]);
  };

  const handleEditExpense = (expense: Expense) => {
    setShowDetailModal(false);
    router.push(`/(tabs)/add?edit=${expense.expense_id}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(''); }}>
            <Ionicons name={showSearch ? 'close-outline' : 'search-outline'} size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Trans.</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIcon} onPress={() => Alert.alert('Favourites', 'Star a transaction to mark it as a favourite (coming soon)')}>
              <Ionicons name="star-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIcon} onPress={() => setActiveTab('Monthly')}>
              <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar (shown when search icon tapped) */}
        {showSearch && (
          <View style={[styles.searchBar, { backgroundColor: colors.surfaceHover }]}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search transactions..."
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeFiltersRow}>
          {TX_TYPE_FILTERS.map((filter) => {
            const active = txTypeFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                testID={`tx-type-filter-${filter.key}`}
                style={[
                  styles.typeFilterChip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  active && { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
                ]}
                onPress={() => setTxTypeFilter(filter.key)}
              >
                <Text style={[styles.typeFilterText, { color: active ? colors.surface : colors.textSecondary }]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Month Navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: colors.textPrimary }]}>{getMonthName(currentMonth)} {currentYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Sub-tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.subTabsScroll, { borderBottomColor: colors.border }]} contentContainerStyle={styles.subTabsContent}>
          {SUB_TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.subTab, activeTab === tab && [styles.subTabActive, { borderBottomColor: colors.textPrimary }]]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.subTabText, { color: colors.textSecondary }, activeTab === tab && [styles.subTabTextActive, { color: colors.textPrimary }]]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Income / Expense / Total Bar */}
        <View style={[styles.summaryBar, { borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Income</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{incomeTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Exp.</Text>
            <Text style={[styles.summaryValue, { color: colors.expense }]}>{expenseTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{netTotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'Daily' && (
            <DailyView
              expenses={monthExpenses}
              hasFiltersApplied={hasFiltersApplied}
              onClearFilters={() => {
                setTxTypeFilter('all');
                setSearchQuery('');
                setShowSearch(false);
              }}
              getCategoryInfo={getCategoryInfo}
              getPaymentInfo={getPaymentInfo}
              onPress={(e) => { setSelectedExpense(e); setShowDetailModal(true); }}
              onEdit={handleEditExpense}
              onDelete={handleDeleteExpense}
            />
          )}
          {activeTab === 'Calendar' && (
            <CalendarView
              expenses={monthExpenses}
              month={currentMonth}
              year={currentYear}
            />
          )}
          {activeTab === 'Monthly' && (
            <MonthlyView expenses={monthExpenses} getCategoryInfo={getCategoryInfo} />
          )}
          {activeTab === 'Summary' && (
            <SummaryView
              expenses={monthExpenses}
              currentMonth={currentMonth}
              currentYear={currentYear}
              paymentMethods={paymentMethods}
              getPaymentInfo={getPaymentInfo}
              activeProfile={activeProfile}
            />
          )}
          {activeTab === 'Description' && (
            <DescriptionView expenses={monthExpenses} getCategoryInfo={getCategoryInfo} />
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.content, { backgroundColor: colors.surface }]}>
            <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />
            {selectedExpense && (
              <ScrollView>
                <View style={modalStyles.header}>
                  <Text style={[modalStyles.title, { color: colors.textPrimary }]}>Transaction</Text>
                  <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={modalStyles.amountSection}>
                  <Text style={[modalStyles.amountLabel, { color: colors.textSecondary }]}>
                    {selectedExpense.type === 'income' ? 'Income' : 'Expense'}
                  </Text>
                  <Text style={[modalStyles.amount, { color: selectedExpense.type === 'income' ? colors.primary : colors.expense }]}>
                    ${selectedExpense.amount.toFixed(2)}
                  </Text>
                </View>
                <View style={modalStyles.details}>
                  <DetailRow label="Category" value={getCategoryInfo(selectedExpense.category_id)?.name || 'Other'} />
                  <DetailRow label="Account" value={getPaymentInfo(selectedExpense.payment_method_id)?.name || 'Unknown'} />
                  <DetailRow label="Date" value={new Date(selectedExpense.date).toLocaleDateString()} />
                  {selectedExpense.merchant && <DetailRow label="Merchant" value={selectedExpense.merchant} />}
                  {selectedExpense.notes && <DetailRow label="Note" value={selectedExpense.notes} />}
                  {selectedExpense.description && <DetailRow label="Description" value={selectedExpense.description} />}
                </View>
                <View style={modalStyles.actions}>
                  <TouchableOpacity testID="tx-detail-edit" style={modalStyles.editBtn} onPress={() => handleEditExpense(selectedExpense)}>
                    <Ionicons name="pencil" size={18} color={colors.surface} />
                    <Text style={modalStyles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="tx-detail-delete" style={modalStyles.deleteBtn} onPress={() => handleDeleteExpense(selectedExpense)}>
                    <Ionicons name="trash" size={18} color={colors.surface} />
                    <Text style={modalStyles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============ DETAIL ROW ============
function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[modalStyles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={[modalStyles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[modalStyles.detailValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ============ DAILY VIEW ============
function DailyView({ expenses, hasFiltersApplied, onClearFilters, getCategoryInfo, getPaymentInfo, onPress, onEdit, onDelete }: any) {
  const { colors } = useTheme();
  const emptyState = deriveTransactionEmptyState({ hasFiltersApplied, filteredCount: expenses.length });
  // Group by day
  const grouped = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    expenses.forEach((e: Expense) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups)
      .map(([key, items]) => {
        const d = new Date(items[0].date);
        return { key, date: d, items: items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [expenses]);

  if (grouped.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📝</Text>
        <Text style={[styles.emptyText, { color: colors.textPrimary }]}>{emptyState.title}</Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>{emptyState.subtitle}</Text>
        {emptyState.showClearFilters && (
          <TouchableOpacity
            testID="tx-clear-filters"
            style={[styles.clearFiltersBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={onClearFilters}
          >
            <Text style={[styles.clearFiltersBtnText, { color: colors.textPrimary }]}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View>
      {grouped.map(group => {
        const dayIncome = group.items.filter((e: any) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
        const dayExpense = group.items.filter((e: any) => e.type !== 'income' && e.type !== 'transfer').reduce((s, e) => s + e.amount, 0);

        return (
          <View key={group.key}>
            {/* Date Header */}
            <View style={[styles.dateHeader, { backgroundColor: colors.surfaceHover, borderBottomColor: colors.border }]}>
              <View style={styles.dateHeaderLeft}>
                <Text style={[styles.dateNumber, { color: colors.textPrimary }]}>{group.date.getDate().toString().padStart(2, '0')}</Text>
                <View style={[styles.dayBadge, { backgroundColor: colors.border }]}>
                  <Text style={[styles.dayBadgeText, { color: colors.textSecondary }]}>{getDayName(group.date.getDay())}</Text>
                </View>
              </View>
              <View style={styles.dateHeaderRight}>
                <Text style={[styles.dayIncome, { color: colors.primary }]}>$ {dayIncome.toFixed(2)}</Text>
                <Text style={[styles.dayExpense, { color: colors.expense }]}>$ {dayExpense.toFixed(2)}</Text>
              </View>
            </View>

            {/* Transactions */}
            {group.items.map((expense: Expense) => {
              const cat = getCategoryInfo(expense.category_id);
              const pm = getPaymentInfo(expense.payment_method_id);
              const isIncome = expense.type === 'income';
              const rowHandlers = buildTransactionRowHandlers({
                expense,
                onPress,
                onEdit,
                onDelete,
              });
              return (
                <TransactionRow
                  key={expense.expense_id}
                  expense={expense}
                  categoryName={cat?.name || 'Other'}
                  paymentName={pm?.name || 'Cash'}
                  isIncome={isIncome}
                  onPress={rowHandlers.onPress}
                  onEdit={rowHandlers.onEdit}
                  onDelete={rowHandlers.onDelete}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function TransactionRow({
  expense,
  categoryName,
  paymentName,
  isIncome,
  onPress,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  categoryName: string;
  paymentName: string;
  isIncome: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const renderRightActions = () => (
    <View style={[styles.swipeActions, { backgroundColor: colors.surface }]} testID={`swipe-actions-${expense.expense_id}`}>
      <TouchableOpacity style={[styles.quickEditBtn, { backgroundColor: colors.primary }]} onPress={onEdit} activeOpacity={0.8}>
        <Ionicons name="pencil" size={16} color={colors.surface} />
        <Text style={styles.quickActionText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.quickDeleteBtn, { backgroundColor: colors.expense }]} onPress={onDelete} activeOpacity={0.8}>
        <Ionicons name="trash" size={16} color={colors.surface} />
        <Text style={styles.quickActionText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={renderRightActions}
    >
      <TouchableOpacity
        style={[styles.txRow, { borderBottomColor: colors.surfaceHover, backgroundColor: colors.surface }]}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={styles.txLeft}>
          <Text style={styles.txEmoji}>{getCategoryEmoji(categoryName)}</Text>
          <Text style={[styles.txCategory, { color: colors.textSecondary }]} numberOfLines={1}>{categoryName}</Text>
        </View>
        <View style={styles.txCenter}>
          <Text style={[styles.txMerchant, { color: colors.textPrimary }]} numberOfLines={1}>{expense.description || expense.merchant || '—'}</Text>
          <Text style={[styles.txPayment, { color: colors.textSecondary }]}>{paymentName}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isIncome ? colors.primary : colors.expense }]}>
          $ {expense.amount.toFixed(2)}
        </Text>
      </TouchableOpacity>
    </Swipeable>
  );
}

// ============ CALENDAR VIEW ============
function CalendarView({ expenses, month, year }: { expenses: Expense[]; month: number; year: number }) {
  const { colors } = useTheme();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Aggregate spending per day
  const dayTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    expenses.forEach(e => {
      if (e.type !== 'income') {
        const d = new Date(e.date).getDate();
        totals[d] = (totals[d] || 0) + e.amount;
      }
    });
    return totals;
  }, [expenses]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) => today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  const isSunday = (idx: number) => idx % 7 === 0;
  const isSaturday = (idx: number) => idx % 7 === 6;

  return (
    <View style={calStyles.container}>
      {/* Day headers */}
      <View style={calStyles.dayHeaderRow}>
        {DAYS.map((d, i) => (
          <View key={d} style={calStyles.dayHeaderCell}>
            <Text style={[calStyles.dayHeaderText, { color: colors.textSecondary }, i === 0 && { color: colors.expense }, i === 6 && { color: colors.primary }]}>{d}</Text>
          </View>
        ))}
      </View>
      {/* Calendar grid */}
      <View style={calStyles.grid}>
        {cells.map((day, idx) => (
          <View key={idx} style={calStyles.cell}>
            {day !== null && (
              <>
                <View style={[calStyles.dateCircle, isToday(day) && [calStyles.todayCircle, { backgroundColor: colors.textPrimary }]]}>
                  <Text style={[
                    calStyles.dateText,
                    { color: colors.textPrimary },
                    isToday(day) && calStyles.todayText,
                    isSunday(idx) && !isToday(day) && { color: colors.expense },
                    isSaturday(idx) && !isToday(day) && { color: colors.primary },
                  ]}>
                    {day}
                  </Text>
                </View>
                {dayTotals[day] && (
                  <Text style={[calStyles.spendText, { color: colors.expense }]}>{dayTotals[day].toFixed(2)}</Text>
                )}
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ============ MONTHLY VIEW ============
function MonthlyView({ expenses, getCategoryInfo }: any) {
  const { colors } = useTheme();
  // Group by category
  const catTotals = useMemo(() => {
    const totals: Record<string, { name: string; amount: number; count: number }> = {};
    expenses.forEach((e: Expense) => {
      if (e.type === 'income') return;
      const cat = getCategoryInfo(e.category_id);
      const name = cat?.name || 'Other';
      if (!totals[name]) totals[name] = { name, amount: 0, count: 0 };
      totals[name].amount += e.amount;
      totals[name].count++;
    });
    return Object.values(totals).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const total = catTotals.reduce((s, c) => s + c.amount, 0);

  return (
    <View style={monthlyStyles.container}>
      <View style={[monthlyStyles.header, { borderBottomColor: colors.border }]}>
        <Text style={[monthlyStyles.headerLabel, { color: colors.textSecondary }]}>Category</Text>
        <Text style={[monthlyStyles.headerLabel, { color: colors.textSecondary }]}>Amount</Text>
      </View>
      {catTotals.map(cat => (
        <View key={cat.name} style={[monthlyStyles.row, { borderBottomColor: colors.surfaceHover }]}>
          <View style={monthlyStyles.rowLeft}>
            <Text style={monthlyStyles.emoji}>{getCategoryEmoji(cat.name)}</Text>
            <Text style={[monthlyStyles.catName, { color: colors.textPrimary }]}>{cat.name}</Text>
          </View>
          <View style={monthlyStyles.rowRight}>
            <View style={[monthlyStyles.progressBg, { backgroundColor: colors.surfaceHover }]}>
              <View style={[monthlyStyles.progressBar, { width: `${total > 0 ? (cat.amount / total * 100) : 0}%`, backgroundColor: colors.expense }]} />
            </View>
            <Text style={[monthlyStyles.catAmount, { color: colors.expense }]}>$ {cat.amount.toFixed(2)}</Text>
          </View>
        </View>
      ))}
      {catTotals.length === 0 && (
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>No expense data this month</Text>
      )}
    </View>
  );
}

// ============ SUMMARY VIEW ============
function SummaryView({ expenses, currentMonth, currentYear, paymentMethods, getPaymentInfo, activeProfile }: any) {
  const { colors } = useTheme();
  const [budgetProgress, setBudgetProgress] = useState<any>({ budgets: [], total_budget: null });
  const router = useRouter();

  useEffect(() => {
    if (!activeProfile) return;
    let cancelled = false;
    budgetsAPI.getProgress(activeProfile.profile_id)
      .then(res => { if (!cancelled) setBudgetProgress(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeProfile?.profile_id]);

  const accountTotals = useMemo(() => {
    const totals: Record<string, { name: string; amount: number; type: string }> = {};
    expenses.forEach((e: Expense) => {
      if (e.type === 'income') return;
      const pm = getPaymentInfo(e.payment_method_id);
      const pmName = pm?.name || 'Unknown';
      const pmType = pm?.type || 'other';
      if (!totals[pmName]) totals[pmName] = { name: pmName, amount: 0, type: pmType };
      totals[pmName].amount += e.amount;
    });
    return Object.values(totals).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const totalBudget = budgetProgress.total_budget;
  const exportIntentParams = buildTransactionExportIntentParams({
    activeProfileId: activeProfile?.profile_id,
    month: currentMonth,
    year: currentYear,
  });

  return (
    <View style={summaryStyles.container}>
      {/* Accounts Section */}
      <View style={summaryStyles.section}>
        <View style={summaryStyles.sectionHeader}>
          <Text style={summaryStyles.sectionIcon}>💰</Text>
          <Text style={[summaryStyles.sectionTitle, { color: colors.textPrimary }]}>Accounts</Text>
        </View>
        <View style={[summaryStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {accountTotals.map(acc => (
            <View key={acc.name} style={summaryStyles.accRow}>
              <Text style={[summaryStyles.accLabel, { color: colors.textSecondary }]}>{acc.name}</Text>
              <Text style={[summaryStyles.accAmount, { color: colors.textPrimary }]}>{acc.amount.toFixed(2)}</Text>
            </View>
          ))}
          {accountTotals.length === 0 && (
            <Text style={[summaryStyles.emptyText, { color: colors.textSecondary }]}>No transactions</Text>
          )}
        </View>
      </View>

      {/* Budget Section */}
      <View style={summaryStyles.section}>
        <View style={summaryStyles.sectionHeader}>
          <Text style={summaryStyles.sectionIcon}>📊</Text>
          <Text style={[summaryStyles.sectionTitle, { color: colors.textPrimary }]}>Budget</Text>
        </View>
        {totalBudget ? (
          <View style={[summaryStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={summaryStyles.budgetRow}>
              <View>
                <Text style={[summaryStyles.budgetLabel, { color: colors.textSecondary }]}>Total Budget</Text>
                <Text style={[summaryStyles.budgetAmount, { color: colors.textPrimary }]}>$ {totalBudget.amount.toFixed(2)}</Text>
              </View>
              <View style={summaryStyles.budgetRight}>
                <Text style={[summaryStyles.budgetPercent, { color: totalBudget.is_over_budget ? colors.expense : colors.textPrimary }]}>
                  {totalBudget.percentage.toFixed(0)}%
                </Text>
              </View>
            </View>
            <View style={summaryStyles.progressContainer}>
              <View style={[summaryStyles.progressBg, { backgroundColor: colors.surfaceHover }]}>
                <View style={[summaryStyles.progressBar, {
                  width: `${Math.min(totalBudget.percentage, 100)}%` as any,
                  backgroundColor: totalBudget.is_over_budget ? colors.expense : colors.income,
                }]} />
              </View>
            </View>
            <View style={summaryStyles.budgetFooter}>
              <Text style={[summaryStyles.budgetFooterText, { color: colors.expense }]}>
                Spent: ${totalBudget.spent.toFixed(2)}
              </Text>
              <Text style={[summaryStyles.budgetFooterText, { color: totalBudget.is_over_budget ? colors.expense : colors.textSecondary }]}>
                {totalBudget.is_over_budget ? 'Over: ' : 'Left: '}${Math.abs(totalBudget.remaining).toFixed(2)}
              </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={[summaryStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/stats')}>
            <Text style={[summaryStyles.emptyText, { color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 }]}>
              No budget set — tap to add one in Stats
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Export Button */}
      <TouchableOpacity
        testID="tx-export-intent"
        style={[summaryStyles.exportBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => {
          const target = exportIntentParams
            ? `/(tabs)/more?intent=${encodeURIComponent(exportIntentParams.intent)}&profile_id=${encodeURIComponent(exportIntentParams.profile_id)}&month=${encodeURIComponent(exportIntentParams.month)}&year=${encodeURIComponent(exportIntentParams.year)}&month_start=${encodeURIComponent(exportIntentParams.month_start)}`
            : '/(tabs)/more';
          router.push(target as any);
        }}
      >
        <Text style={summaryStyles.exportIcon}>📊</Text>
        <Text style={[summaryStyles.exportText, { color: colors.textPrimary }]}>Export data</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============ DESCRIPTION VIEW ============
function DescriptionView({ expenses, getCategoryInfo }: any) {
  const { colors } = useTheme();
  const grouped = useMemo(() => {
    const groups: Record<string, { description: string; count: number; amount: number }> = {};
    expenses.forEach((e: Expense) => {
      const desc = e.description || e.merchant || 'No description';
      if (!groups[desc]) groups[desc] = { description: desc, count: 0, amount: 0 };
      groups[desc].count++;
      groups[desc].amount += e.amount;
    });
    return Object.values(groups).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  return (
    <View style={descStyles.container}>
      <View style={[descStyles.header, { borderBottomColor: colors.border }]}>
        <Text style={[descStyles.headerCol, { color: colors.textSecondary }]}>Description</Text>
        <Text style={[descStyles.headerCol, { color: colors.textSecondary }]}>Count</Text>
        <Text style={[descStyles.headerCol, { color: colors.textSecondary }]}>Amount</Text>
      </View>
      {grouped.map(item => (
        <View key={item.description} style={[descStyles.row, { borderBottomColor: colors.surfaceHover }]}>
          <Text style={[descStyles.desc, { color: colors.textPrimary }]} numberOfLines={1}>{item.description}</Text>
          <Text style={[descStyles.count, { color: colors.textSecondary }]}>{item.count}</Text>
          <Text style={[descStyles.amount, { color: colors.expense }]}>$ {item.amount.toFixed(2)}</Text>
        </View>
      ))}
      {grouped.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>No data</Text>
        </View>
      )}
    </View>
  );
}

// ============ STYLES ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FA' },
  safeArea: { flex: 1 },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8, backgroundColor: '#F0F0F4', marginHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 15, color: '#000' },
  typeFiltersRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 6 },
  typeFilterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, minHeight: 30, justifyContent: 'center' },
  typeFilterText: { fontSize: 12, fontWeight: '600' },
  clearFiltersBtn: { marginTop: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  clearFiltersBtnText: { fontSize: 12, fontWeight: '600' },
  headerIcon: { padding: 6, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  headerRight: { flexDirection: 'row', gap: 8 },
  // Month Nav
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  monthArrow: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 16, fontWeight: '600', color: '#000', minWidth: 120, textAlign: 'center' },
  // Sub-tabs
  subTabsScroll: { borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  subTabsContent: { paddingHorizontal: 8, gap: 0 },
  subTab: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subTabActive: { borderBottomColor: '#000' },
  subTabText: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
  subTabTextActive: { color: '#000', fontWeight: '600' },
  // Summary bar
  summaryBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: '#8E8E93' },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  // Content
  content: { flex: 1 },
  // Daily View
  dateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F0F0F4', borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  dateHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateNumber: { fontSize: 22, fontWeight: '800', color: '#000' },
  dayBadge: { backgroundColor: '#E5E5EA', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  dayBadgeText: { fontSize: 12, fontWeight: '600', color: '#555' },
  dateHeaderRight: { flexDirection: 'row', gap: 20 },
  dayIncome: { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  dayExpense: { fontSize: 13, color: '#FF3B30', fontWeight: '600' },
  // Transaction row
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F4', backgroundColor: '#FFF' },
  txLeft: { width: 80, flexDirection: 'row', alignItems: 'center', gap: 4 },
  txEmoji: { fontSize: 18 },
  txCategory: { fontSize: 13, color: '#555', maxWidth: 55 },
  txCenter: { flex: 1, paddingHorizontal: 8 },
  txMerchant: { fontSize: 15, fontWeight: '600', color: '#000' },
  txPayment: { fontSize: 12, color: '#8E8E93' },
  txAmount: { fontSize: 15, fontWeight: '700', color: '#FF3B30' },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    backgroundColor: '#FFF',
  },
  quickEditBtn: {
    width: 78,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#007AFF',
  },
  quickDeleteBtn: {
    width: 82,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FF3B30',
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555' },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4, textAlign: 'center' },
});

// Calendar styles
const calStyles = StyleSheet.create({
  container: { paddingHorizontal: 4 },
  dayHeaderRow: { flexDirection: 'row' },
  dayHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  dayHeaderText: { fontSize: 12, fontWeight: '600', color: '#555' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 8, minHeight: 60 },
  dateCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  todayCircle: { backgroundColor: '#2C3E50' },
  dateText: { fontSize: 14, color: '#000' },
  todayText: { color: '#FFF', fontWeight: '700' },
  spendText: { fontSize: 10, color: '#FF3B30', fontWeight: '600', marginTop: 2 },
});

// Monthly styles
const monthlyStyles = StyleSheet.create({
  container: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  headerLabel: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F4' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 120 },
  emoji: { fontSize: 18 },
  catName: { fontSize: 14, color: '#000', fontWeight: '500' },
  rowRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' },
  progressBg: { flex: 1, height: 6, backgroundColor: '#F0F0F4', borderRadius: 3 },
  progressBar: { height: '100%', backgroundColor: '#FF3B30', borderRadius: 3 },
  catAmount: { fontSize: 14, fontWeight: '700', color: '#FF3B30', minWidth: 80, textAlign: 'right' },
});

// Summary styles
const summaryStyles = StyleSheet.create({
  container: { padding: 16 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionIcon: { fontSize: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: '#E5E5EA' },
  accRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  accLabel: { fontSize: 14, color: '#555' },
  accAmount: { fontSize: 14, fontWeight: '600', color: '#000' },
  emptyText: { color: '#8E8E93', fontSize: 14 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  budgetLabel: { fontSize: 13, color: '#8E8E93' },
  budgetAmount: { fontSize: 18, fontWeight: '700', color: '#000' },
  budgetRight: { alignItems: 'flex-end' },
  budgetPercent: { fontSize: 16, fontWeight: '700', color: '#000' },
  progressContainer: { marginVertical: 10 },
  todayMarker: { backgroundColor: '#C7C7CC', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  todayMarkerText: { fontSize: 11, color: '#FFF', fontWeight: '600' },
  progressBg: { height: 8, backgroundColor: '#F0F0F4', borderRadius: 4 },
  progressBar: { height: '100%', backgroundColor: '#FF3B30', borderRadius: 4 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  budgetFooterText: { fontSize: 12, color: '#8E8E93' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: '#E5E5EA', gap: 8 },
  exportIcon: { fontSize: 18 },
  exportText: { fontSize: 15, fontWeight: '500', color: '#000' },
});

// Description styles
const descStyles = StyleSheet.create({
  container: { padding: 16 },
  header: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  headerCol: { flex: 1, fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F4' },
  desc: { flex: 2, fontSize: 14, fontWeight: '500', color: '#000' },
  count: { flex: 1, fontSize: 14, color: '#555', textAlign: 'center' },
  amount: { flex: 1, fontSize: 14, fontWeight: '700', color: '#FF3B30', textAlign: 'right' },
});

// Modal styles
const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  content: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  handle: { width: 40, height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#000' },
  amountSection: { alignItems: 'center', paddingVertical: 20 },
  amountLabel: { fontSize: 14, color: '#8E8E93', marginBottom: 4 },
  amount: { fontSize: 36, fontWeight: '800', color: '#FF3B30' },
  details: { marginBottom: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F4' },
  detailLabel: { fontSize: 14, color: '#8E8E93' },
  detailValue: { fontSize: 14, fontWeight: '500', color: '#000', flex: 1, textAlign: 'right', marginLeft: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 12, gap: 8 },
  editBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF3B30', paddingVertical: 14, borderRadius: 12, gap: 8 },
  deleteBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
