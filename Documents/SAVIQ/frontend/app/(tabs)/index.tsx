import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { NeumorphicCard, lightTheme } from '../../src/components/NeumorphicUI';
import { useAppStore } from '../../src/store/appStore';
import api from '../../src/services/api';
import { buildNetBalanceSummary } from '../../src/utils/netBalance';
import { NetBalanceCard } from '../../src/components/dashboard/NetBalanceCard';
import { MetricValueCard } from '../../src/components/dashboard/MetricValueCard';
import { MoMChangeCard } from '../../src/components/dashboard/MoMChangeCard';
import { buildMonthSpendSummary } from '../../src/utils/monthSpend';
import { getGoalProjectionText, SavingsGoal, selectTopPriorityGoal } from '../../src/utils/goals';
import { TopSavingsGoalCard } from '../../src/components/dashboard/TopSavingsGoalCard';
import { mapDashboardSmartMetricCards } from '../../src/utils/smartMetricsCards';
import { deriveSmartMetricsViewState } from '../../src/utils/smartMetricsSectionState';
import { SmartMetricInsightCard } from '../../src/components/dashboard/SmartMetricInsightCard';
import { SmartInsightsWidget } from '../../src/components/dashboard/SmartInsightsWidget';
import { ForecastWidget } from '../../src/components/dashboard/ForecastWidget';
import { WeeklyDigestWidget } from '../../src/components/dashboard/WeeklyDigestWidget';
import { SubscriptionDetectionWidget } from '../../src/components/dashboard/SubscriptionDetectionWidget';
import { AIInsightsChatModal } from '../../src/components/dashboard/AIInsightsChatModal';
import { useTheme } from '../../src/contexts/ThemeContext';
import { isCurrentDashboardRequest, shouldResetDashboardIntelligence } from '../../src/utils/dashboardScreenState';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    activeProfile,
    paymentMethods,
    expenses,
    fetchExpenses,
    fetchPaymentMethods,
    fetchSummary,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [goalsError, setGoalsError] = useState('');
  const [smartMetricsPayload, setSmartMetricsPayload] = useState<any>(null);
  const [smartMetricsError, setSmartMetricsError] = useState('');
  const [smartInsights, setSmartInsights] = useState<any[]>([]);
  const [smartInsightsError, setSmartInsightsError] = useState('');
  const [forecastPayload, setForecastPayload] = useState<any>(null);
  const [forecastError, setForecastError] = useState('');
  const [weeklyDigestPayload, setWeeklyDigestPayload] = useState<any>(null);
  const [weeklyDigestError, setWeeklyDigestError] = useState('');
  const [subscriptionsPayload, setSubscriptionsPayload] = useState<any>(null);
  const [subscriptionsError, setSubscriptionsError] = useState('');
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const dashboardRequestIdRef = useRef(0);
  const previousProfileIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentProfileId = activeProfile?.profile_id ?? null;
    if (shouldResetDashboardIntelligence(previousProfileIdRef.current, currentProfileId)) {
      setError('');
      setGoals([]);
      setGoalsError('');
      setSmartMetricsPayload(null);
      setSmartMetricsError('');
      setSmartInsights([]);
      setSmartInsightsError('');
      setForecastPayload(null);
      setForecastError('');
      setWeeklyDigestPayload(null);
      setWeeklyDigestError('');
      setSubscriptionsPayload(null);
      setSubscriptionsError('');
      setIsAIChatOpen(false);
      previousProfileIdRef.current = currentProfileId;
    }
  }, [activeProfile?.profile_id]);

  const loadDashboardData = useCallback(
    async (refresh = false) => {
      const requestId = ++dashboardRequestIdRef.current;

      if (!activeProfile?.profile_id) {
        setError('');
        setGoals([]);
        setGoalsError('');
        setSmartMetricsPayload(null);
        setSmartMetricsError('');
        setSmartInsights([]);
        setSmartInsightsError('');
        setForecastPayload(null);
        setForecastError('');
        setWeeklyDigestPayload(null);
        setWeeklyDigestError('');
        setSubscriptionsPayload(null);
        setSubscriptionsError('');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        if (refresh) setIsRefreshing(true);
        else {
          setIsLoading(true);
          setGoals([]);
          setSmartMetricsPayload(null);
          setSmartInsights([]);
          setForecastPayload(null);
          setWeeklyDigestPayload(null);
          setSubscriptionsPayload(null);
        }
        setError('');
        setGoalsError('');
        setSmartMetricsError('');
        setSmartInsightsError('');
        setForecastError('');
        setWeeklyDigestError('');
        setSubscriptionsError('');

        await Promise.all([
          fetchExpenses(activeProfile.profile_id),
          fetchPaymentMethods(),
          fetchSummary(activeProfile.profile_id, 'month'),
        ]);

        try {
          const goalsResponse = await api.get('/savings-goals', {
            params: { profile_id: activeProfile.profile_id },
          });
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            setGoals(Array.isArray(goalsResponse.data) ? goalsResponse.data : []);
            setGoalsError('');
          }
        } catch {
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            setGoals([]);
            setGoalsError('Could not load top goal right now.');
          }
        }

        try {
          const smartMetricsResponse = await api.get('/dashboard/metrics', {
            params: { profile_id: activeProfile.profile_id },
          });
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            const payload = smartMetricsResponse?.data;
            setSmartMetricsPayload(payload && typeof payload === 'object' ? payload : null);
            setSmartMetricsError('');
          }
        } catch {
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            setSmartMetricsPayload(null);
            setSmartMetricsError('Could not load smart metrics right now.');
          }
        }

        try {
          const insightsResponse = await api.get('/insights/overview', {
            params: { profile_id: activeProfile.profile_id },
          });
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            setSmartInsights(Array.isArray(insightsResponse?.data?.insights) ? insightsResponse.data.insights : []);
            setSmartInsightsError('');
          }
        } catch {
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            setSmartInsights([]);
            setSmartInsightsError('Could not load smart insights right now.');
          }
        }

        try {
          const forecastResponse = await api.get('/forecast', {
            params: { profile_id: activeProfile.profile_id, recent_days: 30 },
          });
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            const payload = forecastResponse?.data;
            setForecastPayload(payload && typeof payload === 'object' ? payload : null);
            setForecastError('');
          }
        } catch {
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            setForecastPayload(null);
            setForecastError('Could not load forecast right now.');
          }
        }

        try {
          const digestResponse = await api.get('/weekly-digest/latest', {
            params: { profile_id: activeProfile.profile_id },
          });
          if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
            const payload = digestResponse?.data?.digest;
            setWeeklyDigestPayload(payload && typeof payload === 'object' ? payload : null);
            setWeeklyDigestError('');
          }
        } catch {
          if (requestId === dashboardRequestIdRef.current) {
            setWeeklyDigestPayload(null);
            setWeeklyDigestError('Could not load weekly digest right now.');
          }
        }

        try {
          const subscriptionsResponse = await api.get('/subscriptions/summary', {
            params: { profile_id: activeProfile.profile_id },
          });
          if (requestId === dashboardRequestIdRef.current) {
            const payload = subscriptionsResponse?.data;
            setSubscriptionsPayload(payload && typeof payload === 'object' ? payload : null);
            setSubscriptionsError('');
          }
        } catch {
          if (requestId === dashboardRequestIdRef.current) {
            setSubscriptionsPayload(null);
            setSubscriptionsError('Could not load subscription detection right now.');
          }
        }
      } catch (e) {
        if (isCurrentDashboardRequest(requestId, dashboardRequestIdRef.current)) {
          setError('Could not load dashboard cards right now.');
          setGoals([]);
          setSmartMetricsPayload(null);
          setSmartInsights([]);
          setForecastPayload(null);
          setWeeklyDigestPayload(null);
          setSubscriptionsPayload(null);
        }
      } finally {
        if (requestId === dashboardRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [activeProfile?.profile_id, fetchExpenses, fetchPaymentMethods, fetchSummary]
  );

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const netBalance = useMemo(
    () => buildNetBalanceSummary(paymentMethods, expenses),
    [paymentMethods, expenses]
  );

  const hasNetBalanceData = netBalance.accountData.length > 0 || expenses.length > 0;
  const hasIncomeData = netBalance.totalIncome > 0;
  const hasSpendData = netBalance.totalExpense > 0;

  const monthSpendSummary = useMemo(() => buildMonthSpendSummary(expenses), [expenses]);
  const hasCurrentMonthSpendData = monthSpendSummary.currentMonthSpend > 0;

  const topGoal = useMemo(() => selectTopPriorityGoal(goals), [goals]);
  const topGoalProjection = useMemo(() => getGoalProjectionText(topGoal), [topGoal]);
  const smartMetricCards = useMemo(() => mapDashboardSmartMetricCards(smartMetricsPayload), [smartMetricsPayload]);
  const smartMetricsViewState = useMemo(
    () => deriveSmartMetricsViewState({ isLoading, isRefreshing, error: smartMetricsError, cards: smartMetricCards }),
    [isLoading, isRefreshing, smartMetricsError, smartMetricCards]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadDashboardData(true)} />}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Dashboard</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {activeProfile ? activeProfile.name : 'No profile selected'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/more')}
              style={[styles.profileBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
              <Text style={[styles.profileBtnText, { color: colors.primary }]}>Switch</Text>
            </TouchableOpacity>
          </View>

          {!activeProfile ? (
            <NeumorphicCard>
              <Text style={styles.emptyTitle}>No active profile</Text>
              <Text style={styles.emptyBody}>Dashboard is waiting for an active profile. Select or create one in More.</Text>
            </NeumorphicCard>
          ) : (
            <>
              <NetBalanceCard
                isLoading={isLoading || isRefreshing}
                error={error}
                hasData={hasNetBalanceData}
                totalBalance={netBalance.totalBalance}
                totalIncome={netBalance.totalIncome}
                totalExpense={netBalance.totalExpense}
                onPressAccounts={() => router.push('/(tabs)/accounts')}
              />


              <MetricValueCard
                title="Income"
                icon="trending-up-outline"
                accentColor={lightTheme.colors.success}
                isLoading={isLoading || isRefreshing}
                error={error}
                hasValue={hasIncomeData}
                value={netBalance.totalIncome}
                loadingLabel="Loading income..."
                emptyLabel="No income recorded yet."
              />

              <MetricValueCard
                title="Total Spend"
                icon="trending-down-outline"
                accentColor={lightTheme.colors.danger}
                isLoading={isLoading || isRefreshing}
                error={error}
                hasValue={hasSpendData}
                value={netBalance.totalExpense}
                loadingLabel="Loading spend..."
                emptyLabel="No spending recorded yet."
              />

              <MetricValueCard
                title="Current Month Spend"
                icon="calendar-outline"
                accentColor={lightTheme.colors.warning}
                isLoading={isLoading || isRefreshing}
                error={error}
                hasValue={hasCurrentMonthSpendData}
                value={monthSpendSummary.currentMonthSpend}
                loadingLabel="Loading current month..."
                emptyLabel="No spending yet this month."
              />

              <MoMChangeCard
                isLoading={isLoading || isRefreshing}
                error={error}
                summary={monthSpendSummary}
              />

              <TopSavingsGoalCard
                isLoading={isLoading || isRefreshing}
                error={goalsError || error}
                goal={topGoal}
                projectionText={topGoalProjection}
                onPressGoals={() => router.push('/(tabs)/goals')}
              />

              <SmartMetricInsightCard
                title="Savings Score"
                icon="trophy-outline"
                accentColor={colors.primary}
                isLoading={smartMetricsViewState === 'loading'}
                error={smartMetricsViewState === 'error' ? smartMetricsError : ''}
                metric={smartMetricCards.savingsScore}
                loadingLabel="Loading savings score..."
                emptyLabel="Savings score is waiting for data."
              />

              <SmartMetricInsightCard
                title="Spend Velocity"
                icon="speedometer-outline"
                accentColor={colors.warning}
                isLoading={smartMetricsViewState === 'loading'}
                error={smartMetricsViewState === 'error' ? smartMetricsError : ''}
                metric={smartMetricCards.spendVelocity}
                loadingLabel="Loading spend velocity..."
                emptyLabel="Spend velocity is waiting for data."
              />

              <SmartMetricInsightCard
                title="Financial Health"
                icon="pulse-outline"
                accentColor={colors.income}
                isLoading={smartMetricsViewState === 'loading'}
                error={smartMetricsViewState === 'error' ? smartMetricsError : ''}
                metric={smartMetricCards.financialHealth}
                loadingLabel="Loading financial health..."
                emptyLabel="Financial health is waiting for data."
              />

              <SmartMetricInsightCard
                title="Top Category"
                icon="pie-chart-outline"
                accentColor={colors.textPrimary}
                isLoading={smartMetricsViewState === 'loading'}
                error={smartMetricsViewState === 'error' ? smartMetricsError : ''}
                metric={smartMetricCards.topCategorySummary}
                loadingLabel="Loading top category..."
                emptyLabel="Top category is waiting for data."
              />

              <SmartMetricInsightCard
                title="Budget Confidence"
                icon="shield-checkmark-outline"
                accentColor={colors.primary}
                isLoading={smartMetricsViewState === 'loading'}
                error={smartMetricsViewState === 'error' ? smartMetricsError : ''}
                metric={smartMetricCards.budgetConfidence}
                loadingLabel="Loading budget confidence..."
                emptyLabel="Budget confidence is waiting for data."
              />

              <SmartMetricInsightCard
                title="Projected Savings"
                icon="trending-up-outline"
                accentColor={colors.income}
                isLoading={smartMetricsViewState === 'loading'}
                error={smartMetricsViewState === 'error' ? smartMetricsError : ''}
                metric={smartMetricCards.projectedSavingsSummary}
                loadingLabel="Loading projected savings..."
                emptyLabel="Projected savings is waiting for data."
              />

              <SmartInsightsWidget
                isLoading={isLoading || isRefreshing}
                error={smartInsightsError || error}
                insights={smartInsights}
                onPressAskAI={() => setIsAIChatOpen(true)}
              />

              <ForecastWidget
                isLoading={isLoading || isRefreshing}
                error={forecastError || error}
                forecast={forecastPayload}
              />

              <WeeklyDigestWidget
                isLoading={isLoading || isRefreshing}
                error={weeklyDigestError || error}
                digest={weeklyDigestPayload}
              />

              <SubscriptionDetectionWidget
                isLoading={isLoading || isRefreshing}
                error={subscriptionsError || error}
                summary={subscriptionsPayload}
              />
            </>
          )}

          <View style={styles.quickActions}>
            <ActionButton label="Transactions" icon="document-text-outline" onPress={() => router.push('/(tabs)/transactions')} />
            <ActionButton label="Budgets" icon="wallet-outline" onPress={() => router.push('/(tabs)/budgets')} />
            <ActionButton label="Goals" icon="flag-outline" onPress={() => router.push('/(tabs)/goals')} />
            <ActionButton label="Analytics" icon="bar-chart-outline" onPress={() => router.push('/(tabs)/stats')} />
          </View>
        </ScrollView>
      </SafeAreaView>

      <AIInsightsChatModal
        visible={isAIChatOpen}
        profileId={activeProfile?.profile_id}
        profileName={activeProfile?.name}
        onClose={() => setIsAIChatOpen(false)}
      />
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={18} color={lightTheme.colors.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightTheme.colors.background },
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: lightTheme.colors.text },
  subtitle: { fontSize: 13, color: lightTheme.colors.textSecondary, marginTop: 2 },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 16,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  profileBtnText: { fontSize: 12, color: lightTheme.colors.primary, fontWeight: '600' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: lightTheme.colors.text },
  emptyBody: { marginTop: 6, fontSize: 14, lineHeight: 20, color: lightTheme.colors.textSecondary },
  quickActions: { gap: 10, marginTop: 8 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightTheme.colors.cardBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: lightTheme.colors.text },
});
