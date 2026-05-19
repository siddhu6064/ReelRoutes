export function resolveWeeklyDigestCardState({ loading, error, digest }) {
  if (loading) return 'loading';
  if (error) return 'error';

  const summary = digest?.summary || {};
  const count = Number(summary.transaction_count || 0);
  if (!digest || !Number.isFinite(count) || count <= 0) return 'empty';
  return 'ready';
}

export function triggerWeeklyDigestRefresh({ loading, onRefresh }) {
  if (loading || typeof onRefresh !== 'function') return false;
  onRefresh();
  return true;
}
