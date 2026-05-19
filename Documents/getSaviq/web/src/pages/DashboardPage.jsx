import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Button, Spinner } from '../components/ui';
import {
  Plus,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Wallet,
  ChevronRight,
  Lightbulb,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  CreditCard,
  PieChart,
  MessageCircle,
} from 'lucide-react';
import { formatCurrency, formatShortDate, cn, getCategoryIcon, getPaymentIcon } from '../lib/utils';
import { analyticsAPI, budgetsAPI, dashboardMetricsAPI, expensesAPI, insightsAPI, savingsGoalsAPI, forecastAPI, subscriptionsAPI, weeklyDigestAPI } from '../services/api';
import { getUserFriendlyError } from '../lib/errorMessages';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import AddTransactionModal from '../components/AddTransactionModal';
import SmartInsightsCard from '../components/SmartInsightsCard';
import { buildGoalDisplayModel, selectTopPriorityGoal } from '../lib/goalsPresentation';
import ForecastCard from '../components/ForecastCard';
import SubscriptionsCard from '../components/SubscriptionsCard';
import WeeklyDigestCard from '../components/WeeklyDigestCard';
import WeeklyDigestBanner from '../components/WeeklyDigestBanner';
import SmartMetricsCards from '../components/SmartMetricsCards';
import AIInsightsChat from '../components/AIInsightsChat';
import { shouldApplyForecastResponse } from '../lib/forecastCardState';
import { shouldApplyWeeklyDigestResponse, shouldRequestWeeklyDigest } from '../lib/weeklyDigestDashboardState';
import { createSmartMetricsMountedLifecycle, shouldApplySmartMetricsResponse, shouldRequestSmartMetrics } from '../lib/smartMetricsDashboardState';
import { deriveCurrentMonthSpendCardState, deriveIncomeCardState, deriveMonthOverMonthChangeCardState, deriveNetBalanceCardState, deriveTopSavingsGoalCardState, deriveTotalSpendCardState } from '../lib/smartDashboardKickoffState';
import { emitAnalyticsEvent } from '../lib/analyticsEvents';
import { trackWeeklyDigestDismissed, trackWeeklyDigestViewed } from '../lib/weeklyDigestBannerAnalytics';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { profiles, categories, paymentMethods, activeProfile, setActiveProfile, loading } = useAppData();

  const [transactions, setTransactions] = useState([]);
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [overviewInsights, setOverviewInsights] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [budgetProgress, setBudgetProgress] = useState({ budgets: [], total_budget: null });
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [savingsGoalsLoading, setSavingsGoalsLoading] = useState(false);
  const [savingsGoalsError, setSavingsGoalsError] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);
  const [subscriptionsSummary, setSubscriptionsSummary] = useState(null);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState(null);
  const [weeklyDigest, setWeeklyDigest] = useState(null);
  const [weeklyDigestLoading, setWeeklyDigestLoading] = useState(false);
  const [weeklyDigestError, setWeeklyDigestError] = useState(null);
  const [weeklyDigestBanner, setWeeklyDigestBanner] = useState(null);
  const [weeklyDigestBannerLoading, setWeeklyDigestBannerLoading] = useState(false);
  const [weeklyDigestBannerError, setWeeklyDigestBannerError] = useState(null);
  const [smartMetrics, setSmartMetrics] = useState(null);
  const [smartMetricsLoading, setSmartMetricsLoading] = useState(false);
  const [smartMetricsError, setSmartMetricsError] = useState(null);
  const [smartMetricsRequestState, setSmartMetricsRequestState] = useState('idle');
  const [smartMetricsRequestUrl, setSmartMetricsRequestUrl] = useState('');
  const [smartMetricsDebugLastStage, setSmartMetricsDebugLastStage] = useState('idle');
  const [showAIInsightsChat, setShowAIInsightsChat] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [datePreset, setDatePreset] = useState('6m');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dateValidationError, setDateValidationError] = useState('');
  const [error, setError] = useState(null);
  const [netBalanceCardLoading, setNetBalanceCardLoading] = useState(false);
  const [netBalanceCardError, setNetBalanceCardError] = useState(null);

  const isMounted = useRef(true);
  const forecastRequestRef = useRef(0);
  const weeklyDigestRequestRef = useRef(0);
  const weeklyDigestRequestedProfileRef = useRef(null);
  const weeklyDigestBannerViewedKeysRef = useRef(new Set());
  const smartMetricsRequestRef = useRef(0);
  const smartMetricsRequestedProfileRef = useRef(null);
  const smartMetricsLoadedProfileRef = useRef(null);
  useEffect(() => createSmartMetricsMountedLifecycle(isMounted), []);

  useEffect(() => {
    if (datePreset !== 'custom') {
      setDateValidationError('');
      return;
    }
    if (!customStartDate || !customEndDate) {
      setDateValidationError('Select both start and end dates to apply a custom range.');
      return;
    }
    if (new Date(customEndDate) < new Date(customStartDate)) {
      setDateValidationError('End date cannot be earlier than start date.');
      return;
    }
    setDateValidationError('');
  }, [customEndDate, customStartDate, datePreset]);

  const getDateRangeParams = useCallback(() => {
    if (datePreset === 'custom') {
      if (!customStartDate || !customEndDate) return null;
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
      return {
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      };
    }
    const end = new Date();
    const start = new Date(end);
    if (datePreset === '30d') start.setDate(end.getDate() - 30);
    if (datePreset === '90d') start.setDate(end.getDate() - 90);
    if (datePreset === '6m') start.setMonth(end.getMonth() - 6);
    if (datePreset === '1y') start.setFullYear(end.getFullYear() - 1);
    return {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    };
  }, [customEndDate, customStartDate, datePreset]);

  const loadTransactions = useCallback(async () => {
    if (!activeProfile || isGuest) return;
    try {
      const response = await expensesAPI.getAll({ profile_id: activeProfile.profile_id });
      if (isMounted.current) { setTransactions(response.data); setError(null); }
    } catch (error) {
      if (isMounted.current) console.error('Failed to load transactions:', error);
      if (isMounted.current) setError('Failed to load data. Please try again.');
    }
  }, [activeProfile?.profile_id, isGuest]);

  const loadStats = useCallback(async () => {
    if (!activeProfile || isGuest) return;
    const range = getDateRangeParams();
    if (!range) {
      if (isMounted.current && datePreset === 'custom') {
        setNetBalanceCardLoading(false);
        setNetBalanceCardError(null);
        setAnalyticsSummary(null);
        setCategoryBreakdown([]);
        setPaymentBreakdown([]);
        setMonthlyTrend([]);
        setOverviewInsights([]);
        setRecommendations([]);
      }
      return;
    }
    try {
      setNetBalanceCardLoading(true);
      setNetBalanceCardError(null);
      const params = { profile_id: activeProfile.profile_id, ...range };
      const [summaryRes, categoryRes, paymentRes, trendRes, overviewRes, recommendationsRes, budgetProgressRes] = await Promise.all([
        analyticsAPI.getSummary(params),
        analyticsAPI.getCategoryBreakdown(params),
        analyticsAPI.getPaymentMethodBreakdown(params),
        analyticsAPI.getMonthlyTrend(params),
        insightsAPI.getOverview(params),
        insightsAPI.getRecommendations(params),
        budgetsAPI.getProgress(activeProfile.profile_id),
      ]);
      if (isMounted.current) {
        setAnalyticsSummary(summaryRes.data);
        setCategoryBreakdown(categoryRes.data?.items || []);
        setPaymentBreakdown(paymentRes.data?.items || []);
        setMonthlyTrend(trendRes.data?.items || []);
        setOverviewInsights(overviewRes.data?.insights || []);
        setRecommendations(recommendationsRes.data?.insights || []);
        setBudgetProgress(budgetProgressRes.data || { budgets: [], total_budget: null });
        setError(null);
      }
    } catch (error) {
      if (isMounted.current) {
        const friendlyError = getUserFriendlyError(error, 'Failed to load dashboard insights. Please try again.');
        setError(friendlyError);
        setNetBalanceCardError(friendlyError);
      }
    } finally {
      if (isMounted.current) setNetBalanceCardLoading(false);
    }
  }, [activeProfile?.profile_id, getDateRangeParams, isGuest]);

  const netBalanceCardState = useMemo(
    () => deriveNetBalanceCardState({
      loading: netBalanceCardLoading,
      error: netBalanceCardError,
      summary: analyticsSummary,
    }),
    [analyticsSummary, netBalanceCardError, netBalanceCardLoading],
  );


  const incomeCardState = useMemo(
    () => deriveIncomeCardState({
      loading: netBalanceCardLoading,
      error: netBalanceCardError,
      summary: analyticsSummary,
    }),
    [analyticsSummary, netBalanceCardError, netBalanceCardLoading],
  );


  const totalSpendCardState = useMemo(
    () => deriveTotalSpendCardState({
      loading: netBalanceCardLoading,
      error: netBalanceCardError,
      summary: analyticsSummary,
    }),
    [analyticsSummary, netBalanceCardError, netBalanceCardLoading],
  );


  const currentMonthSpendCardState = useMemo(
    () => deriveCurrentMonthSpendCardState({
      loading: netBalanceCardLoading,
      error: netBalanceCardError,
      summary: analyticsSummary,
    }),
    [analyticsSummary, netBalanceCardError, netBalanceCardLoading],
  );


  const monthOverMonthChangeCardState = useMemo(
    () => deriveMonthOverMonthChangeCardState({
      loading: netBalanceCardLoading,
      error: netBalanceCardError,
      summary: analyticsSummary,
    }),
    [analyticsSummary, netBalanceCardError, netBalanceCardLoading],
  );

  const loadSavingsGoals = useCallback(async () => {
    if (!activeProfile || isGuest) return;
    setSavingsGoalsLoading(true);
    setSavingsGoalsError(null);
    try {
      const response = await savingsGoalsAPI.getAll({ profile_id: activeProfile.profile_id });
      if (isMounted.current) setSavingsGoals(response.data || []);
    } catch (error) {
      if (isMounted.current) {
        console.error('Failed to load savings goals:', error);
        setSavingsGoals([]);
        setSavingsGoalsError('Savings goal is unavailable right now.');
      }
    } finally {
      if (isMounted.current) setSavingsGoalsLoading(false);
    }
  }, [activeProfile?.profile_id, isGuest]);

  const loadForecast = useCallback(async () => {
    if (!activeProfile || isGuest) return;

    const requestId = forecastRequestRef.current + 1;
    forecastRequestRef.current = requestId;
    const profileId = activeProfile.profile_id;

    setForecastLoading(true);
    setForecastError(null);
    setForecast(null);
    try {
      const response = await forecastAPI.getOverview({ profile_id: profileId });
      if (shouldApplyForecastResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: forecastRequestRef.current,
        requestedProfileId: profileId,
        activeProfileId: activeProfile?.profile_id,
      })) {
        setForecast(response.data || null);
      }
    } catch (error) {
      if (shouldApplyForecastResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: forecastRequestRef.current,
        requestedProfileId: profileId,
        activeProfileId: activeProfile?.profile_id,
      })) {
        console.error('Failed to load forecast:', error);
        setForecast(null);
        setForecastError('Forecast unavailable right now. Please try again.');
      }
    } finally {
      if (shouldApplyForecastResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: forecastRequestRef.current,
        requestedProfileId: profileId,
        activeProfileId: activeProfile?.profile_id,
      })) {
        setForecastLoading(false);
      }
    }
  }, [activeProfile?.profile_id, isGuest]);

  const loadSubscriptionsSummary = useCallback(async () => {
    if (!activeProfile || isGuest) return;
    setSubscriptionsLoading(true);
    setSubscriptionsError(null);
    try {
      const response = await subscriptionsAPI.getSummary({ profile_id: activeProfile.profile_id });
      if (isMounted.current) setSubscriptionsSummary(response.data || null);
    } catch (error) {
      if (isMounted.current) {
        console.error('Failed to load subscriptions summary:', error);
        setSubscriptionsSummary(null);
        setSubscriptionsError('Subscriptions unavailable right now. Please try again.');
      }
    } finally {
      if (isMounted.current) setSubscriptionsLoading(false);
    }
  }, [activeProfile?.profile_id, isGuest]);

  const loadWeeklyDigest = useCallback(async (forceRefresh = false) => {
    const activeProfileId = activeProfile?.profile_id;
    const shouldRequest = shouldRequestWeeklyDigest({
      isGuest,
      activeProfileId,
      loading: weeklyDigestLoading,
      lastRequestedProfileId: weeklyDigestRequestedProfileRef.current,
      forceRefresh,
    });
    if (!shouldRequest) return;

    weeklyDigestRequestedProfileRef.current = activeProfileId;
    const requestId = weeklyDigestRequestRef.current + 1;
    weeklyDigestRequestRef.current = requestId;

    setWeeklyDigestLoading(true);
    setWeeklyDigestError(null);
    try {
      const response = await weeklyDigestAPI.get({ profile_id: activeProfileId });
      if (shouldApplyWeeklyDigestResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: weeklyDigestRequestRef.current,
        requestedProfileId: activeProfileId,
        activeProfileId: activeProfile?.profile_id,
      })) {
        setWeeklyDigest(response.data || null);
      }
    } catch (error) {
      if (shouldApplyWeeklyDigestResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: weeklyDigestRequestRef.current,
        requestedProfileId: activeProfileId,
        activeProfileId: activeProfile?.profile_id,
      })) {
        console.error('Failed to load weekly digest:', error);
        setWeeklyDigest(null);
        setWeeklyDigestError('Weekly digest unavailable right now. Please try again.');
      }
    } finally {
      if (shouldApplyWeeklyDigestResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: weeklyDigestRequestRef.current,
        requestedProfileId: activeProfileId,
        activeProfileId: activeProfile?.profile_id,
      })) {
        setWeeklyDigestLoading(false);
      }
    }
  }, [activeProfile?.profile_id, isGuest, weeklyDigestLoading]);


  const loadWeeklyDigestBanner = useCallback(async () => {
    if (!activeProfile || isGuest) return;
    setWeeklyDigestBannerLoading(true);
    setWeeklyDigestBannerError(null);
    try {
      const response = await weeklyDigestAPI.getLatest({ profile_id: activeProfile.profile_id });
      if (isMounted.current) setWeeklyDigestBanner(response.data || null);
    } catch (error) {
      if (isMounted.current) {
        console.error('Failed to load weekly digest banner:', error);
        setWeeklyDigestBanner(null);
        setWeeklyDigestBannerError('Latest digest banner unavailable right now.');
      }
    } finally {
      if (isMounted.current) setWeeklyDigestBannerLoading(false);
    }
  }, [activeProfile?.profile_id, isGuest]);

  const loadSmartMetrics = useCallback(async (forceRefresh = false) => {
    const activeProfileId = activeProfile?.profile_id;
    const shouldRequest = shouldRequestSmartMetrics({
      isGuest,
      activeProfileId,
      loading: false,
      lastRequestedProfileId: smartMetricsRequestedProfileRef.current,
      hasLoadedForProfile: smartMetricsLoadedProfileRef.current === activeProfileId,
      forceRefresh,
    });
    if (!shouldRequest) return;

    smartMetricsRequestedProfileRef.current = activeProfileId;
    const requestId = smartMetricsRequestRef.current + 1;
    smartMetricsRequestRef.current = requestId;
    const requestUrl = dashboardMetricsAPI.getUrl({ profile_id: activeProfileId });
    setSmartMetricsLoading(true);
    setSmartMetricsError(null);
    setSmartMetricsRequestState('requested');
    setSmartMetricsDebugLastStage('requested');
    setSmartMetricsRequestUrl(requestUrl);
    try {
      const response = await dashboardMetricsAPI.get({ profile_id: activeProfileId });
      console.log(`[smart-metrics-flow] response-received requestId=${requestId} profile=${activeProfileId} status=${response?.status ?? 'unknown'} payloadType=${typeof response?.data}`);
      setSmartMetricsDebugLastStage('response-received');
      const shouldApply = shouldApplySmartMetricsResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: smartMetricsRequestRef.current,
        requestedProfileId: activeProfileId,
        activeProfileId: activeProfile?.profile_id,
      });
      console.log(`[smart-metrics-flow] response-guard requestId=${requestId} latest=${smartMetricsRequestRef.current} requestedProfile=${activeProfileId} activeProfile=${activeProfile?.profile_id} shouldApply=${String(shouldApply)}`);
      if (shouldApply) {
        const payload = response.data || null;
        console.log(`[smart-metrics-flow] payload-parsed requestId=${requestId} keys=${payload && typeof payload === 'object' ? Object.keys(payload).join(',') : 'none'}`);
        setSmartMetrics(payload);
        smartMetricsLoadedProfileRef.current = activeProfileId;
        const hasPayload = Boolean(payload && typeof payload === 'object' && Object.keys(payload).length > 0);
        setSmartMetricsDebugLastStage(hasPayload ? 'parsed-success' : 'parsed-empty');
        console.log(`[smart-metrics-flow] terminal-set requestId=${requestId} state=${hasPayload ? 'settled-success' : 'settled-empty'}`);
        setSmartMetricsDebugLastStage(hasPayload ? 'terminal-success' : 'terminal-empty');
        setSmartMetricsRequestState(hasPayload ? 'settled-success' : 'settled-empty');
      } else {
        setSmartMetricsDebugLastStage('guard-blocked');
        console.log(`[smart-metrics-flow] terminal-skipped requestId=${requestId} reason=guard-false`);
      }
    } catch (fetchError) {
      console.log(`[smart-metrics-flow] catch requestId=${requestId} profile=${activeProfileId} error=${fetchError?.message || fetchError}`);
      setSmartMetricsDebugLastStage('catch-error');
      const shouldApply = shouldApplySmartMetricsResponse({
        isMounted: isMounted.current,
        requestId,
        latestRequestId: smartMetricsRequestRef.current,
        requestedProfileId: activeProfileId,
        activeProfileId: activeProfile?.profile_id,
      });
      console.log(`[smart-metrics-flow] catch-guard requestId=${requestId} latest=${smartMetricsRequestRef.current} requestedProfile=${activeProfileId} activeProfile=${activeProfile?.profile_id} shouldApply=${String(shouldApply)}`);
      if (shouldApply) {
        console.error('Failed to load dashboard smart metrics:', fetchError);
        setSmartMetrics(null);
        setSmartMetricsError('Please try again in a moment.');
        smartMetricsLoadedProfileRef.current = activeProfileId;
        console.log(`[smart-metrics-flow] terminal-set requestId=${requestId} state=settled-error`);
        setSmartMetricsDebugLastStage('terminal-error');
        setSmartMetricsRequestState('settled-error');
      } else {
        setSmartMetricsDebugLastStage('guard-blocked');
        console.log(`[smart-metrics-flow] terminal-skipped requestId=${requestId} reason=catch-guard-false`);
      }
    } finally {
      const isLatestRequest = requestId === smartMetricsRequestRef.current;
      console.log(`[smart-metrics-flow] finally requestId=${requestId} latest=${smartMetricsRequestRef.current} isLatest=${String(isLatestRequest)} mounted=${String(isMounted.current)}`);
      setSmartMetricsDebugLastStage((previous) => (
        previous === 'requested' || previous === 'response-received' ? 'finally' : previous
      ));
      if (isMounted.current && isLatestRequest) {
        setSmartMetricsLoading(false);
      }
    }
  }, [activeProfile?.profile_id, isGuest]);

  const dismissWeeklyDigestBanner = useCallback(async () => {
    if (!activeProfile || isGuest) return;
    try {
      await weeklyDigestAPI.dismissLatest({ profile_id: activeProfile.profile_id });
      trackWeeklyDigestDismissed({
        profileId: activeProfile.profile_id,
        bannerResponse: weeklyDigestBanner,
        emit: emitAnalyticsEvent,
      });
      if (isMounted.current) {
        setWeeklyDigestBanner(null);
        setWeeklyDigestBannerError(null);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error('Failed to dismiss weekly digest banner:', error);
      }
    }
  }, [activeProfile?.profile_id, isGuest, weeklyDigestBanner]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadSavingsGoals();
  }, [loadSavingsGoals]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  useEffect(() => {
    loadSubscriptionsSummary();
  }, [loadSubscriptionsSummary]);

  useEffect(() => {
    loadWeeklyDigest();
  }, [loadWeeklyDigest]);

  useEffect(() => {
    loadWeeklyDigestBanner();
  }, [loadWeeklyDigestBanner]);

  useEffect(() => {
    loadSmartMetrics();
  }, [loadSmartMetrics]);

  useEffect(() => {
    if (weeklyDigest) {
      loadWeeklyDigestBanner();
    }
  }, [weeklyDigest, loadWeeklyDigestBanner]);

  useEffect(() => {
    const profileId = activeProfile?.profile_id;
    trackWeeklyDigestViewed({
      profileId,
      bannerResponse: weeklyDigestBanner,
      viewedKeys: weeklyDigestBannerViewedKeysRef.current,
      emit: emitAnalyticsEvent,
    });
  }, [activeProfile?.profile_id, weeklyDigestBanner]);

  const handleTransactionAdded = useCallback(() => {
    setShowAddModal(false);
    loadTransactions();
    loadStats();
  }, [loadTransactions, loadStats]);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.category_id, c])),
    [categories]
  );

  const paymentMethodMap = useMemo(
    () => Object.fromEntries(paymentMethods.map(p => [p.payment_id, p])),
    [paymentMethods]
  );

  const chartData = useMemo(() => monthlyTrend.map((item) => ({
    month: item.month,
    amount: item.amount,
  })), [monthlyTrend]);

  const topPriorityGoal = useMemo(
    () => selectTopPriorityGoal(savingsGoals),
    [savingsGoals]
  );
  const topPriorityGoalDisplay = useMemo(
    () => (topPriorityGoal ? buildGoalDisplayModel(topPriorityGoal) : null),
    [topPriorityGoal]
  );

  const topSavingsGoalCardState = useMemo(
    () => deriveTopSavingsGoalCardState({
      loading: savingsGoalsLoading,
      error: savingsGoalsError,
      goalDisplay: topPriorityGoalDisplay,
    }),
    [savingsGoalsError, savingsGoalsLoading, topPriorityGoalDisplay],
  );

  const renderSeverityIcon = (severity) => {
    if (severity === 'warning') return <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />;
    if (severity === 'positive') return <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />;
    return <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />;
  };

  const severityClasses = (severity) => cn(
    "p-3 rounded-xl text-sm",
    severity === 'warning' && 'bg-expense-bg text-expense',
    severity === 'positive' && 'bg-income-bg text-income',
    severity === 'info' && 'bg-brand-primary/10 text-brand-primary'
  );

  const allBudgetItems = useMemo(() => {
    const items = [...(budgetProgress?.budgets || [])];
    if (budgetProgress?.total_budget) items.unshift(budgetProgress.total_budget);
    return items;
  }, [budgetProgress]);

  const budgetSummary = useMemo(() => {
    const total = allBudgetItems.length;
    const over = allBudgetItems.filter((b) => b.is_over_budget).length;
    const near = allBudgetItems.filter((b) => !b.is_over_budget && (b.percentage || 0) >= 80).length;
    const topRisk = [...allBudgetItems]
      .filter((b) => (b.percentage || 0) >= 80)
      .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
      .slice(0, 3);
    return { total, over, near, topRisk };
  }, [allBudgetItems]);

  const navigateToTransactions = useCallback((extraParams = {}) => {
    const params = new URLSearchParams();
    if (activeProfile?.profile_id) params.set('profile_id', activeProfile.profile_id);
    const range = getDateRangeParams();
    if (datePreset === 'custom' && range) {
      params.set('start_date', range.start_date);
      params.set('end_date', range.end_date);
    } else if (datePreset) {
      params.set('date_preset', datePreset);
    }
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    navigate(`/transactions?${params.toString()}`);
  }, [activeProfile?.profile_id, datePreset, getDateRangeParams, navigate]);

  const getInsightDrilldownParams = useCallback((item) => {
    if (!item || !item.type) return null;

    if (item.type === 'trend') {
      return {};
    }

    if (item.type === 'payment_concentration') {
      const topPayment = paymentBreakdown?.[0];
      if (topPayment?.payment_method_id) {
        return { payment_method_id: topPayment.payment_method_id };
      }
      return null;
    }

    if (['top_category', 'concentration', 'category_control'].includes(item.type)) {
      const categoryName = item?.metric?.category;
      if (!categoryName) return null;
      const category = categories.find(
        (c) => (c?.name || '').toLowerCase() === String(categoryName).toLowerCase()
      );
      return category?.category_id ? { category_id: category.category_id } : null;
    }

    return null;
  }, [categories, paymentBreakdown]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center py-12">
          <Wallet className="w-16 h-16 text-brand-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold font-heading text-text-primary mb-2">
            Guest Mode
          </h2>
          <p className="text-text-secondary max-w-md mx-auto">
            You're using the app in guest mode. Sign in or create an account to sync your data across devices.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-text-primary">
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-text-secondary mt-1">Here's your financial overview</p>
        </div>

        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <select
            value={activeProfile?.profile_id || ''}
            onChange={(e) => {
              const profile = profiles.find(p => p.profile_id === e.target.value);
              setActiveProfile(profile);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="profile-switch"
          >
            {profiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profile.name}
              </option>
            ))}
          </select>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="date-range-preset"
          >
            <option value="30d">Last 30D</option>
            <option value="90d">Last 90D</option>
            <option value="6m">Last 6M</option>
            <option value="1y">Last 1Y</option>
            <option value="custom">Custom</option>
          </select>
          {datePreset === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                data-testid="dashboard-custom-start-date"
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                data-testid="dashboard-custom-end-date"
              />
            </>
          )}

          <Button
            onClick={() => setShowAddModal(true)}
            size="lg"
            data-testid="add-transaction-button"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>
      {dateValidationError && (
        <div className="text-xs text-expense -mt-2">
          {dateValidationError}
        </div>
      )}

      <WeeklyDigestBanner
        digest={weeklyDigestBanner}
        loading={weeklyDigestBannerLoading}
        error={weeklyDigestBannerError}
        onDismiss={dismissWeeklyDigestBanner}
      />

      <SmartInsightsCard profileId={activeProfile?.profile_id} />

      <SmartMetricsCards
        metricsPayload={smartMetrics}
        loading={smartMetricsLoading}
        error={smartMetricsError}
        requestState={smartMetricsRequestState}
        requestUrl={smartMetricsRequestUrl}
        debugLastStage={smartMetricsDebugLastStage}
        onRetry={() => loadSmartMetrics(true)}
      />

      <Card data-testid="dashboard-goal-widget">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold font-heading text-text-primary">Top Savings Goal</h2>
          <button
            onClick={() => navigate('/goals')}
            className="text-sm text-brand-primary hover:underline"
          >
            View goals
          </button>
        </div>

        {topSavingsGoalCardState.mode === 'loading' && (
          <p
            className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
            data-testid="smart-dashboard-top-savings-goal-loading"
            aria-busy="true"
          >
            <Spinner size="sm" />
            Loading top savings goal...
          </p>
        )}
        {topSavingsGoalCardState.mode === 'error' && (
          <p
            className="mt-1 text-sm text-expense"
            data-testid="smart-dashboard-top-savings-goal-error"
            role="alert"
          >
            {topSavingsGoalCardState.message}
          </p>
        )}
        {topSavingsGoalCardState.mode === 'empty' && (
          <p
            className="text-text-secondary text-sm"
            data-testid="smart-dashboard-top-savings-goal-empty"
          >
            {topSavingsGoalCardState.message}
          </p>
        )}
        {topSavingsGoalCardState.mode === 'success' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-text-primary" data-testid="smart-dashboard-top-savings-goal-title">{topSavingsGoalCardState.goalDisplay.title}</p>
                <p className="text-sm text-text-secondary">{topSavingsGoalCardState.goalDisplay.projectionText}</p>
              </div>
              <span className="text-sm font-semibold text-text-secondary" data-testid="smart-dashboard-top-savings-goal-progress">
                {topSavingsGoalCardState.goalDisplay.progressPercent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary rounded-full transition-all"
                style={{ width: `${Math.min(topSavingsGoalCardState.goalDisplay.progressPercent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-text-secondary">
              <span>{topSavingsGoalCardState.goalDisplay.currentSavedText} saved</span>
              <span>{topSavingsGoalCardState.goalDisplay.targetAmountText} target</span>
            </div>
          </div>
        )}
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card hover className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Net Balance</p>
              {netBalanceCardState.mode === 'loading' && (
                <p
                  className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
                  data-testid="smart-dashboard-net-balance-loading"
                  aria-busy="true"
                >
                  <Spinner size="sm" />
                  Loading net balance...
                </p>
              )}
              {netBalanceCardState.mode === 'error' && (
                <p
                  className="mt-1 text-sm text-expense"
                  data-testid="smart-dashboard-net-balance-error"
                  role="alert"
                >
                  {netBalanceCardState.message}
                </p>
              )}
              {netBalanceCardState.mode === 'empty' && (
                <p
                  className="mt-1 text-sm text-text-secondary"
                  data-testid="smart-dashboard-net-balance-empty"
                >
                  {netBalanceCardState.message}
                </p>
              )}
              {netBalanceCardState.mode === 'success' && (
                <p
                  className={cn(
                    'text-2xl font-bold font-heading mt-1',
                    netBalanceCardState.netBalance >= 0 ? 'text-income' : 'text-expense',
                  )}
                  data-testid="smart-dashboard-net-balance-value"
                >
                  {formatCurrency(netBalanceCardState.netBalance)}
                </p>
              )}
            </div>
            <div className="p-3 bg-brand-primary/10 rounded-xl">
              <Wallet className="w-6 h-6 text-brand-primary" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-primary/5 rounded-full" />
        </Card>

        <Card hover className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Income</p>
              {incomeCardState.mode === 'loading' && (
                <p
                  className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
                  data-testid="smart-dashboard-income-loading"
                  aria-busy="true"
                >
                  <Spinner size="sm" />
                  Loading income...
                </p>
              )}
              {incomeCardState.mode === 'error' && (
                <p
                  className="mt-1 text-sm text-expense"
                  data-testid="smart-dashboard-income-error"
                  role="alert"
                >
                  {incomeCardState.message}
                </p>
              )}
              {incomeCardState.mode === 'empty' && (
                <p
                  className="mt-1 text-sm text-text-secondary"
                  data-testid="smart-dashboard-income-empty"
                >
                  {incomeCardState.message}
                </p>
              )}
              {incomeCardState.mode === 'success' && (
                <p
                  className="text-2xl font-bold font-heading text-income mt-1"
                  data-testid="smart-dashboard-income-value"
                >
                  {formatCurrency(incomeCardState.totalIncome)}
                </p>
              )}
            </div>
            <div className="p-3 bg-income-bg rounded-xl">
              <TrendingUpIcon className="w-6 h-6 text-income" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-income/5 rounded-full" />
        </Card>

        <Card hover className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Total Spend</p>
              {totalSpendCardState.mode === 'loading' && (
                <p
                  className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
                  data-testid="smart-dashboard-total-spend-loading"
                  aria-busy="true"
                >
                  <Spinner size="sm" />
                  Loading total spend...
                </p>
              )}
              {totalSpendCardState.mode === 'error' && (
                <p
                  className="mt-1 text-sm text-expense"
                  data-testid="smart-dashboard-total-spend-error"
                  role="alert"
                >
                  {totalSpendCardState.message}
                </p>
              )}
              {totalSpendCardState.mode === 'empty' && (
                <p
                  className="mt-1 text-sm text-text-secondary"
                  data-testid="smart-dashboard-total-spend-empty"
                >
                  {totalSpendCardState.message}
                </p>
              )}
              {totalSpendCardState.mode === 'success' && (
                <p
                  className="text-2xl font-bold font-heading text-expense mt-1"
                  data-testid="smart-dashboard-total-spend-value"
                >
                  {formatCurrency(totalSpendCardState.totalSpend)}
                </p>
              )}
            </div>
            <div className="p-3 bg-expense-bg rounded-xl">
              <TrendingDownIcon className="w-6 h-6 text-expense" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-expense/5 rounded-full" />
        </Card>

        <Card hover className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">Current Month Spend</p>
              {currentMonthSpendCardState.mode === 'loading' && (
                <p
                  className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
                  data-testid="smart-dashboard-current-month-spend-loading"
                  aria-busy="true"
                >
                  <Spinner size="sm" />
                  Loading current month spend...
                </p>
              )}
              {currentMonthSpendCardState.mode === 'error' && (
                <p
                  className="mt-1 text-sm text-expense"
                  data-testid="smart-dashboard-current-month-spend-error"
                  role="alert"
                >
                  {currentMonthSpendCardState.message}
                </p>
              )}
              {currentMonthSpendCardState.mode === 'empty' && (
                <p
                  className="mt-1 text-sm text-text-secondary"
                  data-testid="smart-dashboard-current-month-spend-empty"
                >
                  {currentMonthSpendCardState.message}
                </p>
              )}
              {currentMonthSpendCardState.mode === 'success' && (
                <p
                  className="text-2xl font-bold font-heading text-text-primary mt-1"
                  data-testid="smart-dashboard-current-month-spend-value"
                >
                  {formatCurrency(currentMonthSpendCardState.currentMonthSpend)}
                </p>
              )}
            </div>
            <div className="p-3 bg-brand-primary/10 rounded-xl">
              <PieChart className="w-6 h-6 text-brand-primary" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-brand-primary/5 rounded-full" />
        </Card>

        <Card hover className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">MoM Change</p>
              {monthOverMonthChangeCardState.mode === 'loading' && (
                <p
                  className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
                  data-testid="smart-dashboard-mom-change-loading"
                  aria-busy="true"
                >
                  <Spinner size="sm" />
                  Loading MoM change...
                </p>
              )}
              {monthOverMonthChangeCardState.mode === 'error' && (
                <p
                  className="mt-1 text-sm text-expense"
                  data-testid="smart-dashboard-mom-change-error"
                  role="alert"
                >
                  {monthOverMonthChangeCardState.message}
                </p>
              )}
              {monthOverMonthChangeCardState.mode === 'empty' && (
                <p
                  className="mt-1 text-sm text-text-secondary"
                  data-testid="smart-dashboard-mom-change-empty"
                >
                  {monthOverMonthChangeCardState.message}
                </p>
              )}
              {monthOverMonthChangeCardState.mode === 'success' && (
                <p
                  className={cn(
                    'text-2xl font-bold font-heading mt-1',
                    monthOverMonthChangeCardState.monthOverMonthChange <= 0 ? 'text-income' : 'text-expense'
                  )}
                  data-testid="smart-dashboard-mom-change-value"
                >
                  {monthOverMonthChangeCardState.monthOverMonthChange.toFixed(1)}%
                </p>
              )}
            </div>
            <div className="p-3 bg-surface-hover rounded-xl">
              {monthOverMonthChangeCardState.mode === 'success' && monthOverMonthChangeCardState.monthOverMonthChange <= 0 ? (
                <TrendingDownIcon className="w-6 h-6 text-income" />
              ) : (
                <TrendingUpIcon className="w-6 h-6 text-expense" />
              )}
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-surface-hover rounded-full" />
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Section */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold font-heading text-text-primary">
              Monthly Trend (Last 6 Months)
            </h2>
          </div>

          <div className="h-64">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#247BA0" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#247BA0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#73716D', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#73716D', fontSize: 12 }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E5E2DC',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  formatter={(value) => formatCurrency(value)}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#247BA0"
                  strokeWidth={2}
                  fill="url(#trendGradient)"
                />
              </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-text-secondary text-sm">
                No trend data yet. Add transactions to view monthly trend.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <WeeklyDigestCard
            digest={weeklyDigest}
            loading={weeklyDigestLoading}
            error={weeklyDigestError}
            onRetry={() => loadWeeklyDigest(true)}
          />

          <ForecastCard
            forecast={forecast}
            loading={forecastLoading}
            error={forecastError}
            onRetry={loadForecast}
          />

          <SubscriptionsCard
            summary={subscriptionsSummary}
            loading={subscriptionsLoading}
            error={subscriptionsError}
            onRetry={loadSubscriptionsSummary}
          />

          <Card data-testid="dashboard-goal-widget">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h2 className="text-lg font-bold font-heading text-text-primary">Top Savings Goal</h2>
              <button
                onClick={() => navigate('/goals')}
                className="text-sm text-brand-primary hover:underline text-left sm:text-right"
              >
                View goals
              </button>
            </div>

            {topSavingsGoalCardState.mode === 'loading' && (
              <p
                className="mt-1 inline-flex items-center gap-2 text-sm text-text-secondary"
                data-testid="smart-dashboard-top-savings-goal-loading-secondary"
                aria-busy="true"
              >
                <Spinner size="sm" />
                Loading top savings goal...
              </p>
            )}
            {topSavingsGoalCardState.mode === 'error' && (
              <p
                className="mt-1 text-sm text-expense"
                data-testid="smart-dashboard-top-savings-goal-error-secondary"
                role="alert"
              >
                {topSavingsGoalCardState.message}
              </p>
            )}
            {topSavingsGoalCardState.mode === 'empty' && (
              <p className="text-text-secondary text-sm" data-testid="smart-dashboard-top-savings-goal-empty-secondary">
                {topSavingsGoalCardState.message}
              </p>
            )}
            {topSavingsGoalCardState.mode === 'success' && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary break-words">{topSavingsGoalCardState.goalDisplay.title}</p>
                    <p className="text-sm text-text-secondary">{topSavingsGoalCardState.goalDisplay.projectionText}</p>
                  </div>
                  <span className="text-sm font-semibold text-text-secondary whitespace-nowrap">
                    {topSavingsGoalCardState.goalDisplay.progressPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-primary rounded-full transition-all"
                    style={{ width: `${Math.min(topSavingsGoalCardState.goalDisplay.progressPercent, 100)}%` }}
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm text-text-secondary">
                  <span>{topSavingsGoalCardState.goalDisplay.currentSavedText} saved</span>
                  <span>{topSavingsGoalCardState.goalDisplay.targetAmountText} target</span>
                </div>
              </div>
            )}
          </Card>

          {/* Category Breakdown */}
          <Card>
            <h2 className="text-lg font-bold font-heading text-text-primary mb-4">
              Category Breakdown
            </h2>

            {categoryBreakdown.length > 0 ? (
              <div className="space-y-3">
                {categoryBreakdown.slice(0, 5).map((cat) => {
                  const categoryObj = categories.find(c => c.category_id === cat.category_id);
                  const IconComponent = getCategoryIcon(categoryObj?.icon);
                  const barColor = categoryObj?.color || '#247BA0';
                  return (
                    <button
                      key={cat.category_id}
                      type="button"
                      onClick={() => navigateToTransactions({ category_id: cat.category_id })}
                      className="w-full flex items-center gap-3 text-left hover:bg-surface-hover rounded-xl p-1.5 transition-colors"
                      data-testid={`drilldown-category-${cat.category_id}`}
                    >
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: barColor + '20' }}
                      >
                        <IconComponent className="w-4 h-4" style={{ color: barColor }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-text-primary">{cat.category_name}</span>
                          <span className="text-sm text-text-secondary">{formatCurrency(cat.amount)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${cat.percentage}%`,
                              backgroundColor: barColor
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-text-secondary text-sm">No category spend data yet.</p>
            )}
          </Card>

          {/* Payment Method Breakdown */}
          <Card>
            <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand-primary" />
              Payment Methods
            </h2>
            {paymentBreakdown.length > 0 ? (
              <div className="space-y-3">
                {paymentBreakdown.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    key={item.payment_method_id}
                    onClick={() => navigateToTransactions({ payment_method_id: item.payment_method_id })}
                    className="w-full flex items-center justify-between hover:bg-surface-hover rounded-xl p-1.5 transition-colors"
                    data-testid={`drilldown-payment-${item.payment_method_id}`}
                  >
                    <span className="text-sm text-text-primary">{item.payment_method_name}</span>
                    <span className="text-sm font-medium text-text-secondary">{formatCurrency(item.amount)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-text-secondary text-sm">No payment method spend data yet.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Insights & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overview Insights */}
        <Card>
          <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-warning" />
            Overview Insights
          </h2>

          {overviewInsights.length > 0 ? (
            <div className="space-y-3">
              {overviewInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className={cn(
                    severityClasses(insight.severity),
                    getInsightDrilldownParams(insight) && 'cursor-pointer hover:shadow-sm transition-shadow'
                  )}
                  onClick={() => {
                    const params = getInsightDrilldownParams(insight);
                    if (params) navigateToTransactions(params);
                  }}
                  role={getInsightDrilldownParams(insight) ? 'button' : undefined}
                  tabIndex={getInsightDrilldownParams(insight) ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    const params = getInsightDrilldownParams(insight);
                    if (params) navigateToTransactions(params);
                  }}
                >
                  <div className="flex items-start gap-2">
                    {renderSeverityIcon(insight.severity)}
                    <div>
                      <p className="font-medium">{insight.title}</p>
                      <p>{insight.message}</p>
                      {getInsightDrilldownParams(insight) && (
                        <p className="text-xs mt-1 opacity-80">View related transactions →</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary text-sm">No insights yet. Add transactions to unlock insights.</p>
          )}
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold font-heading text-text-primary">
              Recent Transactions
            </h2>
            <a href="/transactions" className="text-sm text-brand-primary hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          {transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => {
                const category = categoryMap[tx.category_id];
                const paymentMethod = paymentMethodMap[tx.payment_method_id];
                const CategoryIcon = getCategoryIcon(category?.icon);
                const PaymentIcon = getPaymentIcon(paymentMethod?.type);

                return (
                  <div
                    key={tx.expense_id}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer"
                    data-testid={`transaction-${tx.expense_id}`}
                  >
                    <div
                      className="p-2.5 rounded-xl"
                      style={{ backgroundColor: (category?.color || '#6b7280') + '20' }}
                    >
                      <CategoryIcon className="w-5 h-5" style={{ color: category?.color || '#6b7280' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{tx.description}</p>
                      <p className="text-sm text-text-secondary">
                        {category?.name || 'Uncategorized'} • {formatShortDate(tx.date)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className={cn(
                        "font-semibold",
                        tx.type === 'income' && 'text-income',
                        tx.type === 'expense' && 'text-expense',
                        tx.type === 'transfer' && 'text-transfer'
                      )}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                        {formatCurrency(tx.amount)}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-text-secondary">
                        <PaymentIcon className="w-3 h-3" />
                        <span className="text-xs">{paymentMethod?.name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-text-secondary">No transactions yet</p>
              <Button
                onClick={() => setShowAddModal(true)}
                className="mt-4"
                data-testid="add-first-transaction"
              >
                Add your first transaction
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-brand-primary" />
          Recommendations
        </h2>
        {recommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations.map((item, idx) => (
              <div
                key={idx}
                className={cn(
                  severityClasses(item.severity),
                  getInsightDrilldownParams(item) && 'cursor-pointer hover:shadow-sm transition-shadow'
                )}
                onClick={() => {
                  const params = getInsightDrilldownParams(item);
                  if (params) navigateToTransactions(params);
                }}
                role={getInsightDrilldownParams(item) ? 'button' : undefined}
                tabIndex={getInsightDrilldownParams(item) ? 0 : undefined}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  const params = getInsightDrilldownParams(item);
                  if (params) navigateToTransactions(params);
                }}
              >
                <div className="flex items-start gap-2">
                  {renderSeverityIcon(item.severity)}
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p>{item.message}</p>
                    {getInsightDrilldownParams(item) && (
                      <p className="text-xs mt-1 opacity-80">View related transactions →</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-secondary text-sm">No recommendations available yet.</p>
        )}
      </Card>

      {/* Budget Progress */}
      <Card>
        <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Budget Progress
        </h2>

        {budgetSummary.total > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-surface-hover">
                <p className="text-xs text-text-secondary">Tracked Budgets</p>
                <p className="text-xl font-bold text-text-primary">{budgetSummary.total}</p>
              </div>
              <div className="p-3 rounded-xl bg-warning/10">
                <p className="text-xs text-text-secondary">Near Limit</p>
                <p className="text-xl font-bold text-warning">{budgetSummary.near}</p>
              </div>
              <div className="p-3 rounded-xl bg-expense-bg">
                <p className="text-xs text-text-secondary">Over Budget</p>
                <p className="text-xl font-bold text-expense">{budgetSummary.over}</p>
              </div>
            </div>

            {budgetSummary.topRisk.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Top at-risk categories</p>
                {budgetSummary.topRisk.map((item, idx) => (
                  <div
                    key={`${item.budget_id}-${idx}`}
                    className={cn(
                      "p-3 rounded-xl text-sm",
                      item.is_over_budget ? "bg-expense-bg text-expense" : "bg-warning/10 text-warning"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{item.category_id ? (categoryMap[item.category_id]?.name || 'Category') : 'Total Budget'}</span>
                      <span className="font-semibold">{(item.percentage || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {allBudgetItems.map((item) => {
                const label = item.category_id ? (categoryMap[item.category_id]?.name || 'Category') : 'Total Budget';
                const percent = Math.max(0, Math.min(100, item.percentage || 0));
                const barClass = item.is_over_budget ? 'bg-expense' : percent >= 80 ? 'bg-warning' : 'bg-income';
                return (
                  <div key={item.budget_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-primary">{label}</span>
                      <span className="text-text-secondary">
                        {formatCurrency(item.spent)} / {formatCurrency(item.amount)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", barClass)} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-text-secondary text-sm">
            No budgets configured for this profile yet. Create a budget to track spending pressure.
          </p>
        )}
      </Card>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleTransactionAdded}
        profiles={profiles}
        categories={categories}
        paymentMethods={paymentMethods}
        activeProfile={activeProfile}
      />

      <AIInsightsChat
        isOpen={showAIInsightsChat}
        onClose={() => setShowAIInsightsChat(false)}
        profileId={activeProfile?.profile_id}
      />

      <button
        type="button"
        onClick={() => setShowAIInsightsChat(true)}
        className="fixed bottom-6 right-6 z-40 bg-brand-primary text-white px-4 py-3 rounded-full shadow-lg hover:bg-brand-hover transition-colors flex items-center gap-2"
        data-testid="open-ai-insights-chat"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-semibold">AI Insights</span>
      </button>
    </div>
  );
}
