import React from 'react';
import { Card, Badge, Spinner } from './ui';
import { TrendingUp } from 'lucide-react';
import { mapForecastToCardData, riskBadgeVariant } from '../lib/forecastPresentation';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { resolveForecastCardState, triggerForecastRetry } from '../lib/forecastCardState';

function currencyTick(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(0)}`;
}

export default function ForecastCard({ forecast, loading = false, error = null, onRetry = () => {} }) {
  const viewState = resolveForecastCardState({ loading, error, forecast });

  if (viewState === 'loading') {
    return (
      <Card data-testid="forecast-card-loading" className="relative overflow-hidden border border-brand-primary/20">
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-brand-primary/10 via-brand-primary/5 to-transparent" />
        <div className="relative flex items-center justify-center h-28">
          <Spinner size="md" />
        </div>
      </Card>
    );
  }

  const data = mapForecastToCardData(forecast);

  if (viewState === 'error') {
    return (
      <Card data-testid="forecast-card-error" className="relative overflow-hidden border border-brand-primary/20">
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-brand-primary/10 via-brand-primary/5 to-transparent" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading text-text-primary">Spend Forecast</h2>
            <div className="p-2 rounded-lg bg-brand-primary/10">
              <TrendingUp className="w-5 h-5 text-brand-primary" />
            </div>
          </div>
          <p className="text-sm text-text-secondary">
            Forecast unavailable right now. Please try again.
          </p>
          <button
            type="button"
            onClick={() => triggerForecastRetry(viewState, onRetry)}
            className="text-sm text-brand-primary hover:underline text-left"
            data-testid="forecast-retry-button"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (viewState === 'empty') {
    return (
      <Card data-testid="forecast-card-empty" className="relative overflow-hidden border border-brand-primary/20">
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-brand-primary/10 via-brand-primary/5 to-transparent" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading text-text-primary">Spend Forecast</h2>
            <div className="p-2 rounded-lg bg-brand-primary/10">
              <TrendingUp className="w-5 h-5 text-brand-primary" />
            </div>
          </div>
          <p className="text-sm text-text-secondary">
            We need a little more recent spending activity before showing a forecast for this profile.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="forecast-card" className="relative overflow-hidden border border-brand-primary/20">
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-brand-primary/10 via-brand-primary/5 to-transparent" />
      <div className="relative flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-primary font-semibold">SAVIQ Forecast</p>
          <h2 className="text-lg font-bold font-heading text-text-primary">Spend Forecast</h2>
        </div>
        <div className="p-2.5 rounded-xl bg-brand-primary/10">
          <TrendingUp className="w-5 h-5 text-brand-primary" />
        </div>
      </div>

      <div className="relative space-y-4">
        <div className="rounded-xl bg-white/80 border border-border-color p-3">
          <p className="text-xs text-text-secondary uppercase tracking-wide">Projected monthly spend</p>
          <p className="text-3xl font-bold font-heading text-text-primary mt-1" data-testid="forecast-monthly-spend">
            {data.projectedMonthlySpend}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border-color bg-white/70 px-3 py-2">
            <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Exceed risk</p>
            <Badge variant={riskBadgeVariant(data.riskBadge.badge)} data-testid="forecast-risk-badge">
              {data.riskBadge.label}
            </Badge>
          </div>
          <div className="rounded-xl border border-border-color bg-white/70 px-3 py-2">
            <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Confidence</p>
            <span className="text-sm font-semibold text-text-primary" data-testid="forecast-confidence">
              {data.confidencePercent}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border-color bg-white/70 px-3 py-2">
          <p className="text-xs text-text-secondary uppercase tracking-wide mb-2">Daily spend trend</p>
          {data.trendSeries.length > 0 ? (
            <div className="h-24" data-testid="forecast-trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trendSeries} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="forecastTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#247BA0" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#247BA0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#73716D', fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => currencyTick(value)}
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #E5E2DC',
                      borderRadius: '10px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#247BA0"
                    strokeWidth={2}
                    fill="url(#forecastTrendGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-text-secondary" data-testid="forecast-trend-fallback">
              Trend appears after a bit more spending history.
            </p>
          )}
        </div>

        <p className="text-xs text-text-secondary leading-relaxed bg-surface-hover/60 rounded-xl p-3" data-testid="forecast-explanation">
          {data.explanation}
        </p>

      </div>
    </Card>
  );
}
