import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react';
import { Card, Button, Badge } from './ui';
import { insightsAPI } from '../services/api';
import { formatCurrency, cn } from '../lib/utils';

function severityTone(severity) {
  if (severity === 'critical') return { badge: 'expense', text: 'text-expense', bg: 'bg-expense-bg' };
  if (severity === 'high' || severity === 'warning') return { badge: 'warning', text: 'text-warning', bg: 'bg-warning/10' };
  return { badge: 'default', text: 'text-text-secondary', bg: 'bg-surface-hover' };
}

function formatDeltaPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0.0%';
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(1)}%`;
}

export default function SmartInsightsCard({ profileId }) {
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(null);
  const [payload, setPayload] = useState(null);

  const mapInsightsError = useCallback((err) => {
    const status = Number(err?.response?.status || 0);
    const code = String(err?.response?.data?.error?.code || err?.code || '').toUpperCase();
    const safeCode = code.replace(/[^A-Z0-9_-]/g, '');

    if (status === 401 || status === 403) {
      return {
        message: 'Session expired. Sign in to refresh insights.',
        diagnostics: `auth:${status}`,
      };
    }

    if (status === 404 || !profileId) {
      return {
        message: 'Choose a profile to load insights.',
        diagnostics: `profile:${status || 'missing'}`,
      };
    }

    if (code.includes('ECONNABORTED') || [502, 503, 504].includes(status)) {
      return {
        message: 'Insights are briefly unavailable. Try again soon.',
        diagnostics: `temporary:${status || 'timeout'}`,
      };
    }

    if (!err?.response) {
      return {
        message: 'Connection issue. Check your network and try again.',
        diagnostics: 'network:unreachable',
      };
    }

    return {
      message: 'Insights are temporarily unavailable.',
      diagnostics: `request:${status || 'unknown'}${safeCode ? `:${safeCode}` : ''}`,
    };
  }, [profileId]);

  const load = useCallback(async () => {
    if (!profileId) {
      setPayload(null);
      setLoading(false);
      setErrorState(null);
      return;
    }

    setLoading(true);
    setErrorState(null);
    try {
      const response = await insightsAPI.getV2({ profile_id: profileId });
      setPayload(response.data || null);
    } catch (err) {
      const mapped = mapInsightsError(err);
      setErrorState(mapped);
      console.warn('smart-insights-load-failed', { diagnostics: mapped.diagnostics });
    } finally {
      setLoading(false);
    }
  }, [mapInsightsError, profileId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const weekly = payload?.weekly || {};
    const monthly = payload?.monthly || {};

    const weeklySpike = weekly?.anomalies?.total_spend_spike;
    const monthlySpike = monthly?.anomalies?.total_spend_spike;
    const spike = (monthlySpike?.detected && monthlySpike) || (weeklySpike?.detected && weeklySpike) || null;

    const budgetRisk = monthly?.budget_risk;
    const budgetMeaningful = budgetRisk?.status === 'ok' && ['warning', 'high', 'critical'].includes(budgetRisk?.severity);

    const trendPercent = Number(monthly?.delta_percent || weekly?.delta_percent || 0);
    const trendPeriod = Number(monthly?.delta_percent || 0) !== 0 ? 'month' : 'week';
    const categoryComparisons = Array.isArray(monthly?.category_comparisons) ? monthly.category_comparisons : [];

    const bestCategoryTrend = [...categoryComparisons]
      .filter((item) => item && typeof item.category === 'string')
      .map((item) => ({
        category: item.category,
        deltaPercent: Number(item.delta_percent || 0),
      }))
      .filter((item) => Number.isFinite(item.deltaPercent) && item.deltaPercent !== 0)
      .sort((a, b) => {
        const byAbs = Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent);
        if (byAbs !== 0) return byAbs;
        return a.category.localeCompare(b.category);
      })[0];

    if (spike) {
      return {
        title: 'Spending spike',
        icon: AlertTriangle,
        severity: spike.severity || 'warning',
        body: `Spend is up ${Math.abs(Number(spike.delta_percent || 0)).toFixed(1)}% vs last period.`,
        deltaPercent: Number(spike.delta_percent || 0),
        isOverspendingAlert: true,
      };
    }

    if (budgetMeaningful) {
      return {
        title: 'Budget pressure rising',
        icon: ShieldAlert,
        severity: budgetRisk.severity,
        body: `${formatCurrency(Number(budgetRisk.current_spend || 0))} spent of ${formatCurrency(Number(budgetRisk.budget_amount || 0))} budget.`,
      };
    }

    if (bestCategoryTrend) {
      const isUp = bestCategoryTrend.deltaPercent > 0;
      return {
        title: `${bestCategoryTrend.category} trend ${isUp ? 'up' : 'down'}`,
        icon: TrendingUp,
        severity: isUp ? 'warning' : 'info',
        body: `${formatDeltaPercent(bestCategoryTrend.deltaPercent)} vs last month. ${isUp ? 'Set a cap to stay on track.' : 'Maintain this pace to protect margin.'}`,
        categoryName: bestCategoryTrend.category,
        trendDeltaPercent: bestCategoryTrend.deltaPercent,
        isCategoryTrend: true,
      };
    }

    if (trendPercent !== 0) {
      return {
        title: trendPercent > 0 ? 'Spending is rising' : 'Spending is easing',
        icon: TrendingUp,
        severity: trendPercent > 10 ? 'warning' : 'info',
        body: `${Math.abs(trendPercent).toFixed(1)}% ${trendPercent > 0 ? 'higher' : 'lower'} vs last ${trendPeriod}.`,
      };
    }

    return null;
  }, [payload]);

  if (loading) {
    return (
      <Card className="p-5" data-testid="smart-insights-card-loading">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 bg-surface-hover rounded" />
          <div className="h-6 w-2/3 bg-surface-hover rounded" />
          <div className="h-4 w-1/2 bg-surface-hover rounded" />
        </div>
      </Card>
    );
  }

  if (errorState) {
    return (
      <Card className="p-5" data-testid="smart-insights-card-error">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-expense">{errorState.message}</p>
            <p className="text-xs text-text-secondary mt-1" data-testid="smart-insights-error-diagnostics">
              Ref: {errorState.diagnostics}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={load} data-testid="smart-insights-retry">
            <RefreshCw className="w-4 h-4 mr-1" /> Try again
          </Button>
        </div>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="p-5" data-testid="smart-insights-card-empty">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Smart Insights</p>
            <p className="text-sm text-text-secondary">No standout signals yet. Keep logging to sharpen guidance.</p>
          </div>
        </div>
      </Card>
    );
  }

  const tone = severityTone(summary.severity);
  const Icon = summary.icon;

  return (
    <Card className="p-5" data-testid="smart-insights-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn('p-2 rounded-lg', tone.bg, tone.text)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Smart Insights</p>
            <p className="text-base font-semibold text-text-primary truncate">{summary.title}</p>
            <p className="text-sm text-text-secondary mt-1">{summary.body}</p>
            {summary.isOverspendingAlert && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 bg-expense-bg text-expense text-xs font-semibold" data-testid="smart-insights-overspending-delta">
                Overspending
                <span>{formatDeltaPercent(summary.deltaPercent)}</span>
              </div>
            )}
            {summary.isCategoryTrend && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 bg-brand-primary/10 text-brand-primary text-xs font-semibold" data-testid="smart-insights-category-trend-delta">
                {summary.categoryName}
                <span>{formatDeltaPercent(summary.trendDeltaPercent)}</span>
              </div>
            )}
          </div>
        </div>
        <Badge variant={tone.badge} data-testid="smart-insights-severity-badge">{summary.severity}</Badge>
      </div>
    </Card>
  );
}
