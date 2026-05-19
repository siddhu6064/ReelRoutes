function safeCurrency(value) {
  const amount = Number(value || 0);
  const normalized = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(normalized);
}

export function formatCadence(interval) {
  const key = String(interval || '').toLowerCase();
  if (key === 'weekly') return 'Weekly';
  if (key === 'monthly') return 'Monthly';
  if (key === 'quarterly') return 'Quarterly';
  if (key === 'annual') return 'Annual';
  return 'Unknown';
}

export function formatConfidence(confidence) {
  const value = Number(confidence || 0);
  if (!Number.isFinite(value) || value <= 0) return '0%';
  return `${Math.round(value * 100)}%`;
}

export function mapSubscriptionsSummary(summary) {
  const candidates = Array.isArray(summary?.candidates) ? summary.candidates : [];

  const items = candidates
    .map((candidate) => {
      const merchant = candidate?.merchant_display || candidate?.merchant_normalized || 'Unknown merchant';
      const amountValue = Number(candidate?.average_amount || 0);
      const amount = safeCurrency(Number.isFinite(amountValue) ? amountValue : 0);

      return {
        merchant,
        amount,
        cadence: formatCadence(candidate?.interval),
        confidence: formatConfidence(candidate?.confidence),
      };
    })
    .filter((item) => item.cadence !== 'Unknown');

  return {
    items,
    hasItems: items.length > 0,
    monthlyRecurringTotal: Number(summary?.totals?.monthly_recurring_total || 0),
    annualRecurringTotal: Number(summary?.totals?.annual_recurring_estimate || 0),
  };
}
