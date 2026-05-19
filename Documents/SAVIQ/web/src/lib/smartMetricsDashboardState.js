export function shouldRequestSmartMetrics({
  isGuest,
  activeProfileId,
  loading,
  lastRequestedProfileId,
  hasLoadedForProfile = false,
  forceRefresh = false,
}) {
  if (isGuest || !activeProfileId) return false;
  if (!forceRefresh && hasLoadedForProfile) return false;
  if (loading && lastRequestedProfileId === activeProfileId) return false;
  return true;
}

export function createSmartMetricsMountedLifecycle(isMountedRef) {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}

export function shouldApplySmartMetricsResponse({
  isMounted,
  requestId,
  latestRequestId,
  requestedProfileId,
}) {
  return Boolean(
    isMounted
      && requestId === latestRequestId
      && requestedProfileId
  );
}

export function getSmartMetricsGridClass(cardCount = 6) {
  if (cardCount <= 1) return 'grid grid-cols-1 gap-4';
  if (cardCount <= 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-4';
  return 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';
}
