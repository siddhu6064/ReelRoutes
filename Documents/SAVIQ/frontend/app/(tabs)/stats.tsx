import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard } from '../../src/components/NeumorphicUI';
import { useAppStore } from '../../src/store/appStore';
import api from '../../src/services/api';
import { deriveAnalyticsViewState, sanitizeAnalyticsPayload } from '../../src/utils/analyticsScreenState';
import { useTheme } from '../../src/contexts/ThemeContext';

function formatCurrency(value: unknown) {
  const safe = Number(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number.isFinite(safe) ? safe : 0
  );
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { activeProfile } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const requestIdRef = useRef(0);

  const loadAnalytics = useCallback(
    async (refresh = false) => {
      const requestId = ++requestIdRef.current;

      if (!activeProfile?.profile_id) {
        setSummary(null);
        setCategoryBreakdown([]);
        setPaymentBreakdown([]);
        setMonthlyTrend([]);
        setError('');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        if (refresh) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
          setSummary(null);
          setCategoryBreakdown([]);
          setPaymentBreakdown([]);
          setMonthlyTrend([]);
        }
        setError('');

        const params = { profile_id: activeProfile.profile_id };
        const [summaryResponse, categoryResponse, paymentResponse, trendResponse] = await Promise.all([
          api.get('/analytics/summary', { params }),
          api.get('/analytics/category-breakdown', { params }),
          api.get('/analytics/payment-method-breakdown', { params }),
          api.get('/analytics/monthly-trend', { params }),
        ]);

        if (requestId === requestIdRef.current) {
          setSummary(summaryResponse?.data && typeof summaryResponse.data === 'object' ? summaryResponse.data : null);
          setCategoryBreakdown(Array.isArray(categoryResponse?.data?.items) ? categoryResponse.data.items : []);
          setPaymentBreakdown(Array.isArray(paymentResponse?.data?.items) ? paymentResponse.data.items : []);
          setMonthlyTrend(Array.isArray(trendResponse?.data?.items) ? trendResponse.data.items : []);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setError('Could not load analytics right now.');
          setSummary(null);
          setCategoryBreakdown([]);
          setPaymentBreakdown([]);
          setMonthlyTrend([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [activeProfile?.profile_id]
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const safePayload = useMemo(
    () => sanitizeAnalyticsPayload({ summary, categoryItems: categoryBreakdown, paymentItems: paymentBreakdown, trendItems: monthlyTrend }),
    [summary, categoryBreakdown, paymentBreakdown, monthlyTrend]
  );
  const analyticsViewState = useMemo(
    () => deriveAnalyticsViewState({
      isLoading,
      error,
      summary: safePayload.summary,
      categoryItems: safePayload.categoryItems,
      paymentItems: safePayload.paymentItems,
      trendItems: safePayload.trendItems,
    }),
    [isLoading, error, safePayload]
  );
  const isCompactWidth = width < 360;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadAnalytics(true)} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Analytics</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{activeProfile ? activeProfile.name : 'No profile selected'}</Text>
          </View>

          {!activeProfile ? (
            <NeumorphicCard style={{ backgroundColor: colors.surface }}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No active profile</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Select a profile in More to load analytics.</Text>
            </NeumorphicCard>
          ) : analyticsViewState === 'loading' ? (
            <NeumorphicCard style={{ backgroundColor: colors.surface }}>
              <Text style={[styles.helper, { color: colors.textSecondary }]}>Loading analytics...</Text>
            </NeumorphicCard>
          ) : analyticsViewState === 'error' ? (
            <NeumorphicCard style={{ backgroundColor: colors.surface }}>
              <Text style={[styles.helper, { color: colors.textSecondary }]}>{error}</Text>
            </NeumorphicCard>
          ) : analyticsViewState === 'empty' ? (
            <NeumorphicCard style={{ backgroundColor: colors.surface }}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No analytics data yet</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Add a few expenses and income records to unlock trends and breakdowns.</Text>
            </NeumorphicCard>
          ) : (
            <>
              <NeumorphicCard style={{ backgroundColor: colors.surface }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Overview</Text>
                <View style={styles.summaryGrid}>
                  <SummaryItem label="Net Balance" value={formatCurrency(safePayload.summary.net_balance)} icon="wallet-outline" />
                  <SummaryItem label="Total Income" value={formatCurrency(safePayload.summary.total_income)} icon="trending-up-outline" />
                  <SummaryItem label="Total Spend" value={formatCurrency(safePayload.summary.total_spend)} icon="trending-down-outline" />
                  <SummaryItem
                    label="MoM Change"
                    value={`${Number(safePayload.summary.month_over_month_change_pct || 0).toFixed(1)}%`}
                    icon="swap-vertical-outline"
                  />
                </View>
              </NeumorphicCard>

              <NeumorphicCard style={{ backgroundColor: colors.surface }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top Categories</Text>
                {safePayload.categoryItems.length === 0 ? (
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>No category expense breakdown available.</Text>
                ) : (
                  <>
                    <ResponsiveCategoryBars items={safePayload.categoryItems.slice(0, 5)} compact={isCompactWidth} />
                    {safePayload.categoryItems.slice(0, 5).map((item) => (
                      <View key={item.id} style={[styles.rowItem, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>{item.fullLabel}</Text>
                        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{formatCurrency(item.amount)} • {item.percentage.toFixed(1)}%</Text>
                      </View>
                    ))}
                  </>
                )}
              </NeumorphicCard>

              <NeumorphicCard style={{ backgroundColor: colors.surface }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Payment Methods</Text>
                {safePayload.paymentItems.length === 0 ? (
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>No payment method breakdown available.</Text>
                ) : (
                  safePayload.paymentItems.slice(0, 5).map((item) => (
                    <View key={item.id} style={[styles.rowItem, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>{item.fullLabel}</Text>
                      <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{formatCurrency(item.amount)}</Text>
                    </View>
                  ))
                )}
              </NeumorphicCard>

              <NeumorphicCard style={{ backgroundColor: colors.surface }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Monthly Trend</Text>
                {safePayload.trendItems.length === 0 ? (
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>No monthly trend data available.</Text>
                ) : (
                  <>
                    <ResponsiveTrendBars items={safePayload.trendItems} compact={isCompactWidth} />
                    {safePayload.trendItems.map((point) => (
                      <View key={point.id} style={[styles.rowItem, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{point.month}</Text>
                        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{formatCurrency(point.amount)}</Text>
                      </View>
                    ))}
                  </>
                )}
              </NeumorphicCard>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SummaryItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.summaryItem, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function ResponsiveCategoryBars({ items, compact }: { items: any[]; compact: boolean }) {
  const { colors } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const maxAmount = Math.max(...items.map((item) => item.amount), 1);

  return (
    <View style={[styles.chartBlock, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.chartHint, { color: colors.textSecondary }]}>Tap a bar for details</Text>
      {items.map((item) => {
        const widthPercent = Math.max(8, Math.round((item.amount / maxAmount) * 100));
        return (
          <Pressable key={item.id} hitSlop={6} onPress={() => setSelectedId(item.id)} style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.textSecondary }, compact && styles.barLabelCompact]} numberOfLines={1}>{item.label}</Text>
            <View style={[styles.barTrack, { backgroundColor: colors.surfaceHover }]}>
              <View style={[styles.barFill, { width: `${widthPercent}%`, backgroundColor: colors.primary }]} />
            </View>
          </Pressable>
        );
      })}
      {selectedItem ? (
        <View style={[styles.tooltipCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.tooltipTitle, { color: colors.textPrimary }]}>{selectedItem.fullLabel}</Text>
          <Text style={[styles.tooltipBody, { color: colors.textSecondary }]}>{formatCurrency(selectedItem.amount)} • {selectedItem.percentage.toFixed(1)}%</Text>
        </View>
      ) : null}
    </View>
  );
}

function ResponsiveTrendBars({ items, compact }: { items: any[]; compact: boolean }) {
  const { colors } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPoint = items.find((item) => item.id === selectedId) || null;
  const maxAmount = Math.max(...items.map((item) => item.amount), 1);

  return (
    <View style={[styles.chartBlock, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.chartHint, { color: colors.textSecondary }]}>Tap a month for amount</Text>
      <View style={styles.trendRow}>
        {items.map((item) => {
          const height = Math.max(12, Math.round((item.amount / maxAmount) * (compact ? 58 : 70)));
          const shortLabel = item.month.length > 7 ? item.month.slice(2) : item.month;
          return (
            <Pressable key={item.id} hitSlop={6} style={styles.trendBarWrap} onPress={() => setSelectedId(item.id)}>
              <View style={[styles.trendTrack, { backgroundColor: colors.surfaceHover }]}>
                <View style={[styles.trendFill, { height, backgroundColor: colors.income }]} />
              </View>
              <Text style={[styles.trendLabel, { color: colors.textSecondary }]} numberOfLines={1}>{shortLabel}</Text>
            </Pressable>
          );
        })}
      </View>
      {selectedPoint ? (
        <View style={[styles.tooltipCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.tooltipTitle, { color: colors.textPrimary }]}>{selectedPoint.month}</Text>
          <Text style={[styles.tooltipBody, { color: colors.textSecondary }]}>{formatCurrency(selectedPoint.amount)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  header: { marginBottom: 2 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { marginTop: 2, fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  helper: { fontSize: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { marginTop: 6, fontSize: 14, lineHeight: 20 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: {
    width: '48%',
    borderWidth: 0.5,

    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,

  },
  summaryLabel: { marginTop: 6, fontSize: 12 },
  summaryValue: { marginTop: 2, fontSize: 16, fontWeight: '700' },
  rowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 0.5,

  },
  rowLabel: { flex: 1, fontSize: 14 },
  rowValue: { fontSize: 13 },
  chartBlock: {
    borderWidth: 0.5,

    borderRadius: 10,
    padding: 10,
    marginBottom: 8,

    gap: 8,
  },
  chartHint: { fontSize: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 110, fontSize: 12 },
  barLabelCompact: { width: 86 },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 8,
    backgroundColor: '#ECECEC',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 8,

  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  trendBarWrap: { flex: 1, alignItems: 'center', gap: 4 },
  trendTrack: {
    width: '100%',
    maxWidth: 22,
    height: 72,
    justifyContent: 'flex-end',
    borderRadius: 8,
    backgroundColor: '#ECECEC',
    overflow: 'hidden',
  },
  trendFill: {
    width: '100%',

    borderRadius: 8,
  },
  trendLabel: { fontSize: 10 },
  tooltipCard: {
    marginTop: 2,
    padding: 8,
    borderRadius: 8,
    borderWidth: 0.5,


  },
  tooltipTitle: { fontSize: 12, fontWeight: '700' },
  tooltipBody: { marginTop: 2, fontSize: 12 },
});
