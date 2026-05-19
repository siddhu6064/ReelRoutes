export const SUBSCRIPTIONS_AI_ASSISTED_TEXT = 'AI-assisted estimate based on your recent transactions.';

export function resolveSubscriptionsCardState({ loading, error, summary }) {
  if (loading) return 'loading';
  if (error) return 'error';

  const candidates = Array.isArray(summary?.candidates) ? summary.candidates : [];
  if (candidates.length === 0) return 'empty';
  return 'ready';
}

export function triggerSubscriptionsRefresh({ loading, onRefresh }) {
  if (loading || typeof onRefresh !== 'function') return false;
  onRefresh();
  return true;
}
