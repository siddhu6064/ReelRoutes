import React from 'react';
import { Repeat, RefreshCw } from 'lucide-react';
import { Card, Button, Spinner } from './ui';
import { mapSubscriptionsSummary } from '../lib/subscriptionsPresentation';
import {
  resolveSubscriptionsCardState,
  SUBSCRIPTIONS_AI_ASSISTED_TEXT,
  triggerSubscriptionsRefresh,
} from '../lib/subscriptionsCardState';

function formatUsd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function SubscriptionsCard({ summary, loading = false, error = null, onRetry = () => {} }) {
  const viewState = resolveSubscriptionsCardState({ loading, error, summary });

  if (viewState === 'loading') {
    return (
      <Card data-testid="subscriptions-card-loading" aria-busy="true" className="relative overflow-hidden border border-border-color">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
        <div className="relative flex items-center justify-center h-28">
          <Spinner size="md" />
        </div>
      </Card>
    );
  }

  if (viewState === 'error') {
    return (
      <Card data-testid="subscriptions-card-error" className="relative overflow-hidden border border-border-color">
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
        <div className="relative space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold font-heading text-text-primary">Recurring Expenses</h2>
            <div className="p-1.5 rounded-lg bg-surface-hover text-text-secondary">
              <Repeat className="w-4 h-4" />
            </div>
          </div>
          <p className="text-sm text-text-secondary" role="alert">Subscriptions are unavailable right now.</p>
          <Button variant="secondary" size="sm" onClick={onRetry} data-testid="subscriptions-error-retry">
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </div>
      </Card>
    );
  }

  const view = mapSubscriptionsSummary(summary);

  return (
    <Card data-testid="subscriptions-card" className="relative overflow-hidden border border-border-color">
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-secondary font-semibold">SAVIQ Subscriptions</p>
            <h2 className="text-base font-semibold font-heading text-text-primary">Recurring Expenses</h2>
            <p className="text-xs text-text-secondary mt-1" data-testid="subscriptions-helper-text">
              {SUBSCRIPTIONS_AI_ASSISTED_TEXT}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="subscriptions-refresh-button"
              onClick={() => triggerSubscriptionsRefresh({ loading, onRefresh: onRetry })}
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Recalculate
            </Button>
            <div className="p-1.5 rounded-lg bg-surface-hover text-text-secondary">
              <Repeat className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2" data-testid="subscriptions-totals">
          <div className="rounded-xl border border-border-color/80 bg-surface-hover/60 px-3 py-2">
            <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Monthly total</p>
            <p className="text-sm font-semibold text-text-primary" data-testid="subscriptions-monthly-total">
              {formatUsd(view.monthlyRecurringTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-border-color/80 bg-surface-hover/60 px-3 py-2">
            <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Annual total</p>
            <p className="text-sm font-semibold text-text-primary" data-testid="subscriptions-annual-total">
              {formatUsd(view.annualRecurringTotal)}
            </p>
          </div>
        </div>

        {view.hasItems ? (
          <ul className="space-y-2" data-testid="subscriptions-list">
            {view.items.slice(0, 3).map((item, index) => (
              <li
                key={`${item.merchant}-${item.cadence}-${item.amount}`}
                className="rounded-xl border border-border-color/80 bg-white/60 px-3 py-2"
                data-testid={`subscriptions-item-${index}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-text-primary truncate">{item.merchant}</p>
                  <p className="text-sm font-semibold text-text-primary whitespace-nowrap">{item.amount}</p>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {item.cadence} · Confidence {item.confidence}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary" data-testid="subscriptions-empty-state" role="status">
            No recurring subscriptions detected for this profile yet.
          </p>
        )}
      </div>
    </Card>
  );
}
