import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import api from '../../src/services/api';
import { toGoalPayload, validateGoalForm } from '../../src/utils/goalsFormState';
import { getGoalDeadlineStatus, getProjectedCompletionSummary } from '../../src/utils/goalsProjectionState';
import { getGoalMilestone } from '../../src/utils/goalsMilestones';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  buildGoalFormFromGoal,
  defaultGoalFormState,
  deriveGoalModalTitle,
  deriveGoalsViewState,
  deriveGoalSaveMode,
  removeGoalById,
  shouldReloadGoalsForProfileChange,
  sortGoalsByProgress,
} from '../../src/utils/goalsScreenState';

interface SavingsGoalItem {
  goal_id: string;
  title: string;
  category?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | string;
  current_amount: number;
  target_amount: number;
  progress_percentage?: number;
  deadline?: string;
  projected_completion?: {
    basis?: string;
    projected_completion_date?: string;
    projected_date?: string;
    months_remaining?: number;
  };
}

const STATUS_OPTIONS = ['active', 'paused', 'completed', 'cancelled'];

export default function GoalsScreen() {
  const { colors } = useTheme();
  const { activeProfile } = useAppStore();
  const [goals, setGoals] = useState<SavingsGoalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalItem | null>(null);
  const [goalForm, setGoalForm] = useState(defaultGoalFormState);
  const previousProfileIdRef = useRef<string | null>(null);

  const resetGoalModal = () => {
    if (isSubmitting) return;
    setShowGoalModal(false);
    setEditingGoal(null);
    setGoalForm(defaultGoalFormState);
  };

  const loadGoals = useCallback(async (refresh = false) => {
    if (!activeProfile?.profile_id) {
      setGoals([]);
      setError('');
      setSuccess('');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);

      setError('');
      const response = await api.get('/savings-goals', {
        params: { profile_id: activeProfile.profile_id },
      });
      setGoals(Array.isArray(response.data) ? response.data : []);
    } catch {
      setGoals([]);
      setError('Failed to load goals. Pull to retry.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeProfile?.profile_id]);

  useEffect(() => {
    const nextProfileId = activeProfile?.profile_id || null;
    if (!nextProfileId) {
      setGoals([]);
      setError('');
      setSuccess('');
      setIsLoading(false);
      setIsRefreshing(false);
    }
    previousProfileIdRef.current = nextProfileId;
  }, [activeProfile?.profile_id]);

  useEffect(() => {
    const nextProfileId = activeProfile?.profile_id || null;
    if (!nextProfileId) return;
    if (shouldReloadGoalsForProfileChange(previousProfileIdRef.current, nextProfileId)) {
      loadGoals();
      return;
    }
    loadGoals();
  }, [loadGoals, activeProfile?.profile_id]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 2500);
    return () => clearTimeout(timer);
  }, [success]);

  const sortedGoals = useMemo(() => {
    return sortGoalsByProgress(goals);
  }, [goals]);

  const openCreateModal = () => {
    setEditingGoal(null);
    setGoalForm(defaultGoalFormState);
    setShowGoalModal(true);
  };

  const openEditModal = (goal: SavingsGoalItem) => {
    setEditingGoal(goal);
    setGoalForm(buildGoalFormFromGoal(goal));
    setShowGoalModal(true);
  };

  const handleSubmitGoal = async () => {
    if (!activeProfile?.profile_id || isSubmitting) return;

    const errors = validateGoalForm(goalForm);
    if (Object.keys(errors).length > 0) {
      Alert.alert('Invalid goal', Object.values(errors)[0]);
      return;
    }

    const payload = toGoalPayload(goalForm, activeProfile.profile_id);

    try {
      setIsSubmitting(true);
      setError('');
      const saveMode = deriveGoalSaveMode(editingGoal);
      if (saveMode === 'update' && editingGoal) {
        await api.put(`/savings-goals/${editingGoal.goal_id}`, payload);
        setSuccess('Goal updated.');
      } else {
        await api.post('/savings-goals', payload);
        setSuccess('Goal created.');
      }
      resetGoalModal();
      await loadGoals();
    } catch {
      Alert.alert('Error', editingGoal ? 'Failed to update goal' : 'Failed to create goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGoal = (goal: SavingsGoalItem) => {
    Alert.alert('Delete Goal', `Delete "${goal.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/savings-goals/${goal.goal_id}`);
            setGoals((current) => removeGoalById(current, goal.goal_id));
            setSuccess('Goal deleted.');
            await loadGoals();
          } catch {
            Alert.alert('Error', 'Failed to delete goal');
          }
        },
      },
    ]);
  };

  const viewState = deriveGoalsViewState({
    activeProfile,
    isLoading,
    error,
    goalsCount: sortedGoals.length,
  });

  if (viewState === 'no_profile') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No active profile selected.</Text>
      </View>
    );
  }

  if (viewState === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading goals...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Goals</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Track and manage your savings targets.</Text>
          </View>
          <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openCreateModal}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addButtonText}>New</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <TouchableOpacity style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.expense }]} onPress={() => loadGoals()} activeOpacity={0.8}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.expense} />
            <Text style={[styles.errorText, { color: colors.expense }]}>{error}</Text>
            <Text style={[styles.retryText, { color: colors.expense }]}>Tap to retry</Text>
          </TouchableOpacity>
        ) : null}

        {success ? (
          <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.income }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.income} />
            <Text style={[styles.successText, { color: colors.income }]}>{success}</Text>
          </View>
        ) : null}

        {viewState === 'empty' ? (
          <View style={styles.emptyState}>
            <Ionicons name="flag-outline" size={42} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No goals yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Create your first savings goal to start tracking progress.</Text>
            <TouchableOpacity style={[styles.emptyCta, { backgroundColor: colors.primary }]} onPress={openCreateModal}>
              <Text style={styles.emptyCtaText}>Create Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={sortedGoals}
            keyExtractor={(item) => item.goal_id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadGoals(true)} />}
            renderItem={({ item }) => (
              <GoalCard
                item={item}
                onEdit={() => openEditModal(item)}
                onDelete={() => handleDeleteGoal(item)}
              />
            )}
          />
        )}
      </SafeAreaView>

      <Modal visible={showGoalModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{deriveGoalModalTitle(editingGoal)}</Text>
              <TouchableOpacity style={styles.iconButton} onPress={resetGoalModal} disabled={isSubmitting}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={goalForm.title}
              onChangeText={(title) => setGoalForm((prev) => ({ ...prev, title }))}
              placeholder="Emergency Fund"
              placeholderTextColor={colors.textSecondary}
              editable={!isSubmitting}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Category</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={goalForm.category}
              onChangeText={(category) => setGoalForm((prev) => ({ ...prev, category }))}
              placeholder="General"
              placeholderTextColor={colors.textSecondary}
              editable={!isSubmitting}
            />

            <View style={styles.amountRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Target Amount</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
                  value={goalForm.target_amount}
                  onChangeText={(target_amount) => setGoalForm((prev) => ({ ...prev, target_amount }))}
                  placeholder="5000"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textSecondary}
                  editable={!isSubmitting}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Current Amount</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
                  value={goalForm.current_amount}
                  onChangeText={(current_amount) => setGoalForm((prev) => ({ ...prev, current_amount }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textSecondary}
                  editable={!isSubmitting}
                />
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Deadline (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              value={goalForm.deadline}
              onChangeText={(deadline) => setGoalForm((prev) => ({ ...prev, deadline }))}
              placeholder="2026-12-31"
              autoCapitalize="none"
              placeholderTextColor={colors.textSecondary}
              editable={!isSubmitting}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusChip,
                    { backgroundColor: colors.surfaceHover },
                    goalForm.status === status && [styles.statusChipActive, { backgroundColor: colors.primary }],
                  ]}
                  onPress={() => setGoalForm((prev) => ({ ...prev, status }))}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.statusChipText, { color: colors.textPrimary }, goalForm.status === status && styles.statusChipTextActive]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }, isSubmitting && styles.saveButtonDisabled]}
              onPress={handleSubmitGoal}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>{editingGoal ? 'Update Goal' : 'Create Goal'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function GoalCard({ item, onEdit, onDelete }: { item: SavingsGoalItem; onEdit: () => void; onDelete: () => void }) {
  const { colors } = useTheme();
  const progress = Math.max(0, Math.min(100, item.progress_percentage || 0));
  const remaining = Math.max(0, (item.target_amount || 0) - (item.current_amount || 0));
  const deadlineText = item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline';
  const projectionText = getProjectedCompletionSummary(item);
  const deadlineStatus = getGoalDeadlineStatus(item);
  const milestone = getGoalMilestone(progress, item.status);
  const animatedProgress = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [progress, animatedProgress]);

  const animatedWidth = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.9} onPress={onEdit}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.goalTitle, { color: colors.textPrimary }]}>{item.title}</Text>
          <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>{item.category || 'General'} · Due {deadlineText}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: colors.surfaceHover }]}>
          <Text style={[styles.badgeText, { color: colors.primary }]}>{item.status}</Text>
        </View>
      </View>

      <View style={[styles.progressBg, { backgroundColor: colors.surfaceHover }]}>
        <Animated.View style={[styles.progressBar, { width: animatedWidth, backgroundColor: colors.primary }]} />
      </View>

      <View style={styles.cardFooter}>
        <Text style={[styles.goalMoney, { color: colors.textPrimary }]}>$ {Number(item.current_amount || 0).toFixed(2)} / $ {Number(item.target_amount || 0).toFixed(2)}</Text>
        <Text style={[styles.goalRemaining, { color: colors.textSecondary }]}>{progress.toFixed(0)}% · Remaining $ {remaining.toFixed(2)}</Text>
        <View style={styles.projectionRow}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <Text style={[styles.projectionText, { color: colors.textSecondary }]}>{projectionText}</Text>
        </View>
        {deadlineStatus ? <Text style={[styles.deadlineWarning, { color: colors.expense }]}>{deadlineStatus}</Text> : null}
      </View>

      <View style={styles.actionsRow}>
        {milestone ? (
          <View style={[styles.milestoneBadge, { backgroundColor: colors.surfaceHover }]}>
            <Text style={[styles.milestoneText, { color: colors.primary }]}>{milestone}</Text>
          </View>
        ) : (
          <View />
        )}
        <TouchableOpacity style={[styles.editButton, { backgroundColor: colors.surfaceHover }]} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={14} color={colors.primary} />
          <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.deleteButton, { backgroundColor: colors.surfaceHover }]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={14} color={colors.expense} />
          <Text style={[styles.deleteButtonText, { color: colors.expense }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 18, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 13 },
  errorCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  errorText: { marginTop: 4, fontSize: 14, fontWeight: '600' },
  retryText: { marginTop: 4, fontSize: 12 },
  successCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  successText: { marginTop: 4, fontSize: 14, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { marginTop: 6, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  emptyCta: { marginTop: 14, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  emptyCtaText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
  card: { borderRadius: 12, padding: 14, borderWidth: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  goalTitle: { fontSize: 16, fontWeight: '700' },
  goalMeta: { marginTop: 2, fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%' },
  cardFooter: { marginTop: 10 },
  goalMoney: { fontSize: 13, fontWeight: '600' },
  goalRemaining: { marginTop: 2, fontSize: 12 },
  projectionRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  projectionText: { fontSize: 12, fontWeight: '500' },
  deadlineWarning: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  actionsRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  milestoneBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  milestoneText: { fontSize: 11, fontWeight: '700' },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  editButtonText: { fontSize: 12, fontWeight: '700' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  deleteButtonText: { fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  inputLabel: { marginTop: 10, marginBottom: 8, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { minHeight: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, justifyContent: 'center' },
  statusChipActive: {},
  statusChipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  statusChipTextActive: { color: '#FFF' },
  saveButton: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
