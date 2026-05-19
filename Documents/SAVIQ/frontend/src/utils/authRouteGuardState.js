export function deriveAuthRouteAction({ isLoading, isAuthenticated, segments }) {
  if (isLoading) return 'wait';
  const inProtectedTabs = segments?.[0] === '(tabs)';

  if (isAuthenticated && !inProtectedTabs) return 'enter_tabs';
  if (!isAuthenticated && inProtectedTabs) return 'leave_tabs';
  return 'stay';
}

export function buildAddRouteFromDeepLinkParams(params = {}) {
  const queryString = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');

  return queryString
    ? `/(tabs)/add?${queryString}&fromShortcut=true`
    : '/(tabs)/add?fromShortcut=true';
}

export function deriveDeepLinkNavigationTarget(path, queryParams = {}) {
  const normalizedPath = String(path || '').replace(/^\/+/, '').toLowerCase();

  if (normalizedPath === 'add') {
    return buildAddRouteFromDeepLinkParams(queryParams);
  }

  if (normalizedPath === 'stats' || normalizedPath === 'analytics') {
    return '/(tabs)/stats';
  }

  if (normalizedPath === 'home' || normalizedPath === 'dashboard' || normalizedPath === 'index') {
    return '/(tabs)';
  }

  return null;
}
