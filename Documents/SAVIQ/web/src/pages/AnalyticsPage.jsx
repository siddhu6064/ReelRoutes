import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Spinner, Tabs } from '../components/ui';
import {
  TrendingUp,
  TrendingDown,
  PieChart as PieChartIcon,
  BarChart3,
} from 'lucide-react';
import { formatCurrency, cn, getCategoryIcon } from '../lib/utils';
import { statsAPI } from '../services/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

export default function AnalyticsPage() {
  const { profiles, activeProfile, setActiveProfile, loading } = useAppData();

  const [summary, setSummary] = useState(null);
  const [insights, setInsights] = useState({ stats: {}, insights: [] });
  const [period, setPeriod] = useState('month');
  const [error, setError] = useState(null);

  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadStats = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const [summaryRes, insightsRes] = await Promise.all([
        statsAPI.getSummary({ profile_id: activeProfile.profile_id, period }),
        statsAPI.getInsights({ profile_id: activeProfile.profile_id }),
      ]);
      if (isMounted.current) { setSummary(summaryRes.data); setInsights(insightsRes.data); setError(null); }
    } catch (error) {
      console.error('analytics.load_failed', { message: error?.message, status: error?.response?.status });
      if (isMounted.current) setError('Failed to load data. Please try again.');
    }
  }, [activeProfile?.profile_id, period]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const pieChartData = useMemo(() =>
    summary?.by_category?.map(cat => ({
      name: cat.name,
      value: cat.amount,
      color: cat.color,
    })) || [],
  [summary]);

  const comparisonData = useMemo(() => insights.stats ? [
    {
      name: 'Last Week',
      Income: insights.stats.last_week_income || 0,
      Expenses: insights.stats.last_week_total || 0,
    },
    {
      name: 'This Week',
      Income: insights.stats.this_week_income || 0,
      Expenses: insights.stats.this_week_total || 0,
    },
    {
      name: 'Last Month',
      Income: insights.stats.last_month_income || 0,
      Expenses: insights.stats.last_month_total || 0,
    },
    {
      name: 'This Month',
      Income: insights.stats.this_month_income || 0,
      Expenses: insights.stats.this_month_total || 0,
    },
  ] : [], [insights.stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
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
            Analytics
          </h1>
          <p className="text-text-secondary mt-1">Your spending insights and trends</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={activeProfile?.profile_id || ''}
            onChange={(e) => {
              const profile = profiles.find(p => p.profile_id === e.target.value);
              setActiveProfile(profile);
            }}
            className="px-4 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="profile-select"
          >
            {profiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profile.name}
              </option>
            ))}
          </select>

          <Tabs
            tabs={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
            activeTab={period}
            onChange={setPeriod}
          />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card hover className="text-center" data-testid="stats-total-income">
          <div className="inline-flex p-3 bg-income-bg rounded-xl mb-3">
            <TrendingUp className="w-6 h-6 text-income" />
          </div>
          <p className="text-sm text-text-secondary">Total Income</p>
          <p className="text-2xl font-bold font-heading text-income mt-1">
            {formatCurrency(insights.stats?.this_month_income || 0)}
          </p>
        </Card>

        <Card hover className="text-center" data-testid="stats-total-expenses">
          <div className="inline-flex p-3 bg-expense-bg rounded-xl mb-3">
            <TrendingDown className="w-6 h-6 text-expense" />
          </div>
          <p className="text-sm text-text-secondary">Total Expenses</p>
          <p className="text-2xl font-bold font-heading text-expense mt-1">
            {formatCurrency(summary?.total || 0)}
          </p>
        </Card>

        <Card hover className="text-center" data-testid="stats-transactions">
          <div className="inline-flex p-3 bg-brand-primary/10 rounded-xl mb-3">
            <BarChart3 className="w-6 h-6 text-brand-primary" />
          </div>
          <p className="text-sm text-text-secondary">Transactions</p>
          <p className="text-2xl font-bold font-heading text-text-primary mt-1">
            {summary?.count || 0}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Avg: {formatCurrency(summary?.average || 0)}
          </p>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Category Pie Chart */}
        <Card>
          <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-brand-primary" />
            Spending by Category
          </h2>

          {pieChartData.length > 0 ? (
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 space-y-2">
                {pieChartData.slice(0, 5).map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm text-text-primary">{cat.name}</span>
                    </div>
                    <span className="text-sm font-medium text-text-secondary">
                      {formatCurrency(cat.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-text-secondary py-8">No data available</p>
          )}
        </Card>

        {/* Period Comparison Bar Chart */}
        <Card>
          <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            Income vs Expenses
          </h2>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <XAxis
                  dataKey="name"
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
                <Legend />
                <Bar dataKey="Income" fill="#3D8B61" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#E63946" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Category Details */}
      <Card>
        <h2 className="text-lg font-bold font-heading text-text-primary mb-4">
          Category Breakdown
        </h2>

        {summary?.by_category?.length > 0 ? (
          <div className="space-y-4">
            {summary.by_category.map((cat) => {
              const IconComponent = getCategoryIcon(cat.icon);
              return (
                <div key={cat.category_id} className="flex items-center gap-4">
                  <div
                    className="p-3 rounded-xl flex-shrink-0"
                    style={{ backgroundColor: cat.color + '20' }}
                  >
                    <IconComponent className="w-5 h-5" style={{ color: cat.color }} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-text-primary">{cat.name}</span>
                      <span className="font-semibold text-text-primary">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${cat.percentage}%`,
                            backgroundColor: cat.color
                          }}
                        />
                      </div>
                      <span className="text-sm text-text-secondary w-12 text-right">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-text-secondary py-8">
            No expense data available for this period
          </p>
        )}
      </Card>
    </div>
  );
}
