import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { budgetsAPI } from '../../src/services/api';
import { buildBudgetPayload, validateBudgetAmount, validateBudgetCategory } from '../../src/utils/budgetFormState';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  createCategoryBudgetModalState,
  createTotalBudgetModalState,
  deriveBudgetsViewState,
  deriveBudgetModalTitle,
  deriveBudgetSaveMode,
  editBudgetModalState,
  removeBudgetFromProgress,
  shouldReloadBudgetsForProfileChange,
} from '../../src/utils/budgetsScreenState';

export default function BudgetsScreen() {
  const { colors } = useTheme();
  const { activeProfile, categories } = useAppStore();
  const [budgetProgress, setBudgetProgress] = useState<any>({ budgets: [], total_budget: null });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [isCategoryBudgetForm, setIsCategoryBudgetForm] = useState(false);
  const previousProfileIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextProfileId = activeProfile?.profile_id || null;
    if (shouldReloadBudgetsForProfileChange(previousProfileIdRef.current, nextProfileId)) {
      loadBudgets();
    } else if (!nextProfileId) {
      setLoading(false);
      setShowBudgetModal(false);
      setBudgetProgress({ budgets: [], total_budget: null });
    }
    previousProfileIdRef.current = nextProfileId;
  }, [activeProfile?.profile_id]);

  const loadBudgets = async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const response = await budgetsAPI.getProgress(activeProfile.profile_id);
      setBudgetProgress(response.data);
    } catch {
      Alert.alert('Error', 'Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  const openCreateTotalBudgetModal = () => {
    const modal = createTotalBudgetModalState();
    setEditingBudgetId(modal.editingBudgetId);
    setIsCategoryBudgetForm(modal.isCategoryBudgetForm);
    setSelectedCategory(modal.selectedCategory);
    setBudgetAmount(modal.budgetAmount);
    setShowBudgetModal(modal.showBudgetModal);
  };

  const openCreateCategoryBudgetModal = () => {
    const modal = createCategoryBudgetModalState();
    setEditingBudgetId(modal.editingBudgetId);
    setIsCategoryBudgetForm(modal.isCategoryBudgetForm);
    setSelectedCategory(modal.selectedCategory);
    setBudgetAmount(modal.budgetAmount);
    setShowBudgetModal(modal.showBudgetModal);
  };

  const openEditBudgetModal = (budget: any) => {
    const modal = editBudgetModalState(budget);
    setEditingBudgetId(modal.editingBudgetId);
    setIsCategoryBudgetForm(modal.isCategoryBudgetForm);
    setSelectedCategory(modal.selectedCategory);
    setBudgetAmount(modal.budgetAmount);
    setShowBudgetModal(modal.showBudgetModal);
  };

  const resetModalState = () => {
    setShowBudgetModal(false);
    setBudgetAmount('');
    setSelectedCategory(null);
    setEditingBudgetId(null);
    setIsCategoryBudgetForm(false);
  };

  const handleSaveBudget = async () => {
    if (!activeProfile || submitting) return;

    const amountValidation = validateBudgetAmount(budgetAmount);
    if (!amountValidation.valid || amountValidation.amount === null) {
      Alert.alert('Error', amountValidation.error || 'Please enter a valid amount');
      return;
    }

    if (isCategoryBudgetForm) {
      const categoryValidation = validateBudgetCategory(selectedCategory);
      if (!categoryValidation.valid) {
        Alert.alert('Error', categoryValidation.error || 'Please select a category');
        return;
      }
    }

    const payload = buildBudgetPayload({
      profileId: activeProfile.profile_id,
      amount: amountValidation.amount,
      categoryId: isCategoryBudgetForm ? selectedCategory : null,
    });

    try {
      setSubmitting(true);
      const saveMode = deriveBudgetSaveMode(editingBudgetId);
      if (saveMode === 'update' && editingBudgetId) {
        await budgetsAPI.update(editingBudgetId, payload);
      } else {
        await budgetsAPI.create(payload);
      }
      resetModalState();
      await loadBudgets();
    } catch {
      Alert.alert('Error', editingBudgetId ? 'Failed to update budget' : 'Failed to save budget');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBudget = (budgetId: string) => {
    Alert.alert('Delete Budget', 'Are you sure you want to delete this budget?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await budgetsAPI.delete(budgetId);
            setBudgetProgress((current: any) => removeBudgetFromProgress(current, budgetId));
            await loadBudgets();
          } catch {
            Alert.alert('Error', 'Failed to delete budget');
          }
        },
      },
    ]);
  };

  const handleDeleteTotalBudget = () => {
    const totalBudget = budgetProgress.total_budget;
    if (!totalBudget?.budget_id) return;

    Alert.alert('Delete Total Budget', 'Are you sure you want to delete the total monthly budget?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await budgetsAPI.delete(totalBudget.budget_id);
            setBudgetProgress((current: any) => removeBudgetFromProgress(current, totalBudget.budget_id));
            await loadBudgets();
          } catch {
            Alert.alert('Error', 'Failed to delete total budget');
          }
        },
      },
    ]);
  };

  const viewState = deriveBudgetsViewState({ activeProfile, isLoading: loading });

  if (viewState === 'no_profile') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No active profile</Text>
      </View>
    );
  }

  if (viewState === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const totalBudget = budgetProgress.total_budget;
  const categoryBudgets = budgetProgress.budgets || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Budgets</Text>

          {totalBudget ? (
            <TouchableOpacity
              style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.9}
              onPress={() => openEditBudgetModal(totalBudget)}
              onLongPress={handleDeleteTotalBudget}
            >
              <View style={styles.totalHeader}>
                <View>
                  <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total Budget</Text>
                  <Text style={[styles.totalAmount, { color: colors.textPrimary }]}>$ {totalBudget.amount.toFixed(2)}</Text>
                </View>
                <Text style={[styles.totalPct, { color: totalBudget.is_over_budget ? colors.expense : colors.primary }]}>
                  {totalBudget.percentage.toFixed(0)}%
                </Text>
              </View>
              <View style={[styles.progressBg, { backgroundColor: colors.surfaceHover }]}>
                <View style={[styles.progressBar, { width: `${Math.min(totalBudget.percentage, 100)}%`, backgroundColor: colors.expense }]} />
              </View>
              <View style={styles.totalFooter}>
                <Text style={[styles.totalMeta, { color: colors.textSecondary }]}>Spent: ${totalBudget.spent.toFixed(2)}</Text>
                <Text style={[styles.totalMeta, { color: totalBudget.is_over_budget ? colors.expense : colors.textSecondary }]}>
                  {totalBudget.is_over_budget ? 'Over by' : 'Remaining'}: ${Math.abs(totalBudget.remaining).toFixed(2)}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.emptyBudgetCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={openCreateTotalBudgetModal}>
              <Ionicons name="add-circle-outline" size={30} color={colors.primary} />
              <Text style={[styles.emptyBudgetText, { color: colors.primary }]}>Set Total Budget</Text>
            </TouchableOpacity>
          )}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Category Budgets</Text>
            <TouchableOpacity style={styles.iconButton} onPress={openCreateCategoryBudgetModal}>
              <Ionicons name="add-circle" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {categoryBudgets.length > 0 ? (
            categoryBudgets.map((budget: any) => {
              const category = categories.find((c) => c.category_id === budget.category_id);
              return (
                <TouchableOpacity
                  key={budget.budget_id}
                  style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => openEditBudgetModal(budget)}
                  onLongPress={() => handleDeleteBudget(budget.budget_id)}
                >
                  <View style={styles.categoryHeader}>
                    <View style={[styles.dot, { backgroundColor: category?.color || '#6b7280' }]} />
                    <Text style={[styles.categoryName, { color: colors.textPrimary }]}>{category?.name || 'Unknown'}</Text>
                    <Text style={[styles.categoryPct, { color: budget.is_over_budget ? colors.expense : colors.primary }]}>
                      {budget.percentage.toFixed(0)}%
                    </Text>
                  </View>
                  <View style={[styles.categoryProgressBg, { backgroundColor: colors.surfaceHover }]}>
                    <View
                      style={[
                        styles.categoryProgressBar,
                        {
                          width: `${Math.min(budget.percentage, 100)}%`,
                          backgroundColor: budget.is_over_budget ? colors.expense : budget.percentage > 80 ? colors.warning : colors.income,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.categoryFooter}>
                    <Text style={[styles.categoryMeta, { color: colors.textSecondary }]}>${budget.spent.toFixed(0)}</Text>
                    <Text style={[styles.categoryMeta, { color: colors.textSecondary }]}>of ${budget.amount.toFixed(0)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>No category budgets yet. Tap + to add one.</Text>
          )}

          <Text style={[styles.secondaryHint, { color: colors.textSecondary }]}>Tap a budget to edit. Long press to delete.</Text>
          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showBudgetModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {deriveBudgetModalTitle({ editingBudgetId, isCategoryBudgetForm })}
              </Text>
              <TouchableOpacity style={styles.iconButton} onPress={resetModalState} disabled={submitting}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {isCategoryBudgetForm && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryPicker}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.category_id}
                    style={[
                      styles.categoryChip,
                      { backgroundColor: colors.surfaceHover },
                      selectedCategory === cat.category_id && [styles.categoryChipActive, { backgroundColor: colors.primary }],
                    ]}
                    onPress={() => setSelectedCategory(cat.category_id)}
                    disabled={submitting}
                  >
                    <View style={[styles.dot, { backgroundColor: cat.color }]} />
                    <Text style={[styles.categoryChipText, { color: selectedCategory === cat.category_id ? colors.surface : colors.textPrimary }]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Budget Amount</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={budgetAmount}
              onChangeText={setBudgetAmount}
              placeholder="Enter amount"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              editable={!submitting}
            />

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }, submitting && styles.saveButtonDisabled]}
              onPress={handleSaveBudget}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>{editingBudgetId ? 'Update Budget' : 'Save Budget'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 16 },
  emptyTitle: { fontSize: 16 },
  totalCard: { borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 0.5 },
  totalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13 },
  totalAmount: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  totalPct: { fontSize: 22, fontWeight: '700' },
  progressBg: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressBar: { height: '100%' },
  totalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  totalMeta: { fontSize: 13 },
  emptyBudgetCard: { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 18, borderWidth: 0.5 },
  emptyBudgetText: { marginTop: 8, fontSize: 15, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  categoryCard: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  categoryName: { flex: 1, fontSize: 15, fontWeight: '600' },
  categoryPct: { fontSize: 14, fontWeight: '700' },
  categoryProgressBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  categoryProgressBar: { height: '100%' },
  categoryFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  categoryMeta: { fontSize: 13 },
  hint: { fontSize: 14, marginVertical: 8 },
  secondaryHint: { fontSize: 12, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  categoryPicker: { marginTop: 12, marginBottom: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  categoryChipActive: {},
  categoryChipText: { fontSize: 13 },
  inputLabel: { marginTop: 10, marginBottom: 8, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  saveButton: { marginTop: 14, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
