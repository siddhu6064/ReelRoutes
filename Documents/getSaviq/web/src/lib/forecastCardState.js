export function hasUsableForecastData(forecast) {
  return Boolean(forecast?.forecast_summary);
}

export function resolveForecastCardState({ loading = false, error = null, forecast = null }) {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!hasUsableForecastData(forecast)) return 'empty';
  return 'ready';
}

export function triggerForecastRetry(state, onRetry) {
  if (state !== 'error' || typeof onRetry !== 'function') return false;
  onRetry();
  return true;
}

export function shouldApplyForecastResponse({
  isMounted,
  requestId,
  latestRequestId,
  requestedProfileId,
  activeProfileId,
}) {
  return Boolean(
    isMounted
      && requestId === latestRequestId
      && requestedProfileId
      && activeProfileId
      && requestedProfileId === activeProfileId
  );
}
