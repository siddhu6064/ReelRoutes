export function shouldRequestWeeklyDigest({
  isGuest,
  activeProfileId,
  loading,
  lastRequestedProfileId,
  forceRefresh = false,
}) {
  if (isGuest || !activeProfileId) return false;
  if (forceRefresh) return true;
  if (loading && lastRequestedProfileId === activeProfileId) return false;
  if (loading) return true;
  if (lastRequestedProfileId === activeProfileId) return false;
  return true;
}

export function shouldApplyWeeklyDigestResponse({
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
