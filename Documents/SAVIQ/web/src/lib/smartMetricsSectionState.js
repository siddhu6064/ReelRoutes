export function resolveSmartMetricsMode({
  loading,
  error,
  metricsPayload,
}) {
  if (loading) return 'loading';
  if (error) return 'error';

  const payload = metricsPayload || null;
  const hasPayload = Boolean(payload && typeof payload === 'object' && Object.keys(payload).length > 0);

  if (!hasPayload) {
    return 'empty';
  }

  return 'success';
}

export function deriveSmartMetricsSectionState({
  loading,
  error,
  metricsPayload,
}) {
  const mode = resolveSmartMetricsMode({ loading, error, metricsPayload });
  if (mode === 'error') return { mode, message: error };
  return { mode };
}

export function getSmartMetricsModeRoots(mode) {
  return {
    loading: mode === 'loading',
    error: mode === 'error',
    success: mode === 'success',
    empty: mode === 'empty',
  };
}
