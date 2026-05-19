import React from 'react';
import { Bell, X } from 'lucide-react';
import { Card, Button, Spinner } from './ui';
import { mapWeeklyDigestBannerData, resolveWeeklyDigestBannerState } from '../lib/weeklyDigestBannerState';

const POLARITY_STYLE = {
  positive: 'text-income',
  negative: 'text-expense',
  neutral: 'text-text-secondary',
};

export default function WeeklyDigestBanner({ digest, loading = false, error = null, onDismiss = () => {} }) {
  const state = resolveWeeklyDigestBannerState({ loading, error, digest });

  if (state === 'loading') {
    return (
      <Card data-testid="weekly-digest-banner-loading" className="border border-border-color/70 py-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" /> Loading latest weekly digest...
        </div>
      </Card>
    );
  }

  if (state !== 'ready') return null;

  const data = mapWeeklyDigestBannerData(digest);

  return (
    <Card data-testid="weekly-digest-banner" className="border border-border-color/70 bg-surface-hover/40 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-text-secondary font-semibold flex items-center gap-1">
            <Bell className="w-3.5 h-3.5" /> {data.latestLabel}
          </p>
          {data.summary && (
            <p className="text-sm text-text-primary mt-1" data-testid="weekly-digest-banner-summary">{data.summary}</p>
          )}

          {data.recommendations.length > 0 && (
            <ul className="mt-2 space-y-1" data-testid="weekly-digest-banner-recommendations">
              {data.recommendations.map((item) => (
                <li key={item.id} className={`text-xs leading-relaxed ${POLARITY_STYLE[item.polarity] || POLARITY_STYLE.neutral}`}>
                  • {item.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          data-testid="weekly-digest-banner-dismiss"
          onClick={onDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
