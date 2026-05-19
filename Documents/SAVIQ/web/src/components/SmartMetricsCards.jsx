import React, { useMemo } from 'react';
import { Card } from './ui';
import { Button } from './ui';
import { cn } from '../lib/utils';
import { mapSmartMetricsToCards } from '../lib/smartMetricsPresentation';
import { getSmartMetricsGridClass } from '../lib/smartMetricsDashboardState';
import { deriveSmartMetricsSectionState, getSmartMetricsModeRoots } from '../lib/smartMetricsSectionState';
import { Info, RefreshCw } from 'lucide-react';

function SmartMetricCard({ card }) {
  return (
    <Card
      className="relative overflow-hidden border-[#D6D1C7] bg-gradient-to-b from-white to-[#F8F6F1] p-5 shadow-sm"
      data-testid={`smart-metric-card-${card.id}`}
    >
      <div aria-hidden="true" className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-primary/5" />
      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-text-secondary">Smart Metric</p>
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-text-secondary border border-border-color/70">
            {card.badge}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-text-primary">{card.title}</p>
            {card.helperText && (
              <button
                type="button"
                title={card.helperText}
                aria-label={`${card.title} help: ${card.helperText}`}
                className="rounded-full p-0.5 text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                data-testid={`smart-metric-helper-${card.id}`}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className={cn('mt-1 text-2xl font-bold font-heading', card.accent)}>{card.value}</p>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">{card.context}</p>
      </div>
    </Card>
  );
}

function LoadingSmartMetrics() {
  return (
    <div className={cn(getSmartMetricsGridClass(6), 'gap-5')} data-testid="smart-metrics-loading-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="border-[#D6D1C7] bg-gradient-to-b from-white to-[#F8F6F1] p-5 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-20 rounded bg-surface-hover" />
            <div className="h-4 w-2/3 rounded bg-surface-hover" />
            <div className="h-8 w-1/2 rounded bg-surface-hover" />
            <div className="h-3 w-4/5 rounded bg-surface-hover" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function SmartMetricsCards({
  metricsPayload,
  loading = false,
  error = null,
  requestState = 'idle',
  requestUrl = '',
  debugLastStage = 'idle',
  onRetry,
}) {
  const cards = useMemo(() => mapSmartMetricsToCards(metricsPayload), [metricsPayload]);
  const sectionState = useMemo(
    () => deriveSmartMetricsSectionState({ loading, error, metricsPayload }),
    [error, loading, metricsPayload]
  );
  const mode = useMemo(() => {
    if (sectionState?.mode === 'loading') return 'loading';
    if (sectionState?.mode === 'error') return 'error';
    if (sectionState?.mode === 'success') return 'success';
    return 'empty';
  }, [sectionState?.mode]);
  const roots = useMemo(() => getSmartMetricsModeRoots(mode), [mode]);

  return (
    <section
      data-testid="smart-metrics-grid-section"
      className="space-y-4 rounded-2xl border border-brand-primary/15 bg-gradient-to-b from-brand-primary/[0.03] to-transparent p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-brand-primary/80 font-semibold">SAVIQ V2</p>
          <h2 className="text-lg font-bold font-heading text-text-primary">Smart Metrics</h2>
        </div>
      </div>
      <p className="sr-only" data-testid="smart-metrics-mode">{mode}</p>
      <p className="sr-only" data-testid="smart-metrics-request-state">{requestState}</p>
      <p className="sr-only" data-testid="smart-metrics-request-url">{requestUrl}</p>
      <p className="sr-only" data-testid="smart-metrics-debug-last-stage">{debugLastStage}</p>

      {roots.loading ? (
        <LoadingSmartMetrics />
      ) : roots.error ? (
        <Card className="border-[#D6D1C7] bg-gradient-to-b from-white to-[#F8F6F1] p-5 shadow-sm" data-testid="smart-metrics-error-state">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">Smart metrics are temporarily unavailable</p>
              <p className="mt-1 text-sm text-text-secondary">{sectionState.message}</p>
            </div>
            {typeof onRetry === 'function' && (
              <Button variant="secondary" size="sm" onClick={onRetry} data-testid="smart-metrics-retry">
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
            )}
          </div>
        </Card>
      ) : roots.success ? (
        <div className={cn(getSmartMetricsGridClass(cards.length), 'gap-5')} data-testid="smart-metrics-grid">
          {cards.map((card) => <SmartMetricCard key={card.id} card={card} />)}
        </div>
      ) : (
        <Card className="border-[#D6D1C7] bg-gradient-to-b from-white to-[#F8F6F1] p-5 shadow-sm" data-testid="smart-metrics-empty-state">
          <p className="text-sm font-semibold text-text-primary">Smart metrics are warming up</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add more recent activity to populate this section.
          </p>
        </Card>
      )}
    </section>
  );
}
