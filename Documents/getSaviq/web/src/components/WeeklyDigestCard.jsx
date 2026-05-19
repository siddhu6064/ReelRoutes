import React from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Card, Button, Spinner } from './ui';
import { mapWeeklyDigestToCardData } from '../lib/weeklyDigestPresentation';
import { resolveWeeklyDigestCardState, triggerWeeklyDigestRefresh } from '../lib/weeklyDigestCardState';

export default function WeeklyDigestCard({ digest, loading = false, error = null, onRetry = () => {} }) {
  const viewState = resolveWeeklyDigestCardState({ loading, error, digest });

  if (viewState === 'loading') {
    return (
      <Card
        data-testid="weekly-digest-card-loading"
        aria-busy="true"
        className="relative overflow-hidden border border-border-color"
      >
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
        <div className="relative flex flex-col items-center justify-center gap-2 h-28">
          <Spinner size="md" />
          <p className="text-xs text-text-secondary" data-testid="weekly-digest-card-loading-message">
            Loading weekly digest...
          </p>
        </div>
      </Card>
    );
  }

  if (viewState === 'error') {
    return (
      <Card data-testid="weekly-digest-card-error" className="relative overflow-hidden border border-border-color">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold font-heading text-text-primary">Weekly Digest</h2>
            <div className="p-1.5 rounded-lg bg-surface-hover text-text-secondary">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <p className="text-sm text-text-secondary" data-testid="weekly-digest-card-error-message">
            Weekly digest is unavailable right now.
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (viewState === 'empty') {
    return (
      <Card data-testid="weekly-digest-card-empty" className="relative overflow-hidden border border-border-color">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
        <div className="relative space-y-2">
          <h2 className="text-base font-semibold font-heading text-text-primary">Weekly Digest</h2>
          <p className="text-sm text-text-secondary">Not enough activity this week for a detailed digest yet.</p>
        </div>
      </Card>
    );
  }

  const data = mapWeeklyDigestToCardData(digest);

  return (
    <Card data-testid="weekly-digest-card" className="relative overflow-hidden border border-border-color">
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
      <div className="relative space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-secondary font-semibold">SAVIQ Digest</p>
            <h2 className="text-base font-semibold font-heading text-text-primary">Weekly Digest</h2>
            <p className="text-xs text-text-secondary mt-0.5" data-testid="weekly-digest-week-label">{data.weekLabel}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            data-testid="weekly-digest-refresh-button"
            onClick={() => triggerWeeklyDigestRefresh({ loading, onRefresh: onRetry })}
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        <div className="rounded-xl border border-border-color/80 bg-surface-hover/60 px-3 py-3">
          <p className="text-xs text-text-secondary uppercase tracking-wide">Net total</p>
          <p className="text-xl font-semibold text-text-primary" data-testid="weekly-digest-net-total">{data.netTotal}</p>
          <p className="text-xs text-text-secondary mt-1" data-testid="weekly-digest-net-delta">{data.netDeltaCue}</p>
          <p className="text-xs text-text-secondary mt-1" data-testid="weekly-digest-supporting-line">
            Income {data.incomeTotal} • Expense {data.expenseTotal}
          </p>
        </div>
      </div>
    </Card>
  );
}
