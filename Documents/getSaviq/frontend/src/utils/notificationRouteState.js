export function deriveRouteFromNotificationData(data) {
  if (!data) return null;
  if (typeof data !== 'object' || Array.isArray(data)) return null;
  const screen = String(data.screen || '').trim().toLowerCase();

  if (screen === 'add') {
    const amount = String(data.amount || '').trim();
    const normalizedAmount = /^-?\d+(\.\d+)?$/.test(amount) ? amount : '';
    const encodedAmount = normalizedAmount ? encodeURIComponent(normalizedAmount) : '';
    const params = encodedAmount ? `?amount=${encodedAmount}&fromShortcut=true` : '';
    return `/(tabs)/add${params}`;
  }

  if (screen === 'stats' || screen === 'analytics') {
    return '/(tabs)/stats';
  }

  if (screen === 'home' || screen === 'dashboard') {
    return '/(tabs)';
  }

  return null;
}

export function shouldSuppressDuplicateNotification({ lastHandledId, notificationId }) {
  const safeLastHandledId = String(lastHandledId || '').trim();
  const safeNotificationId = String(notificationId || '').trim();
  if (!safeNotificationId) return false;
  return safeLastHandledId.length > 0 && safeLastHandledId === safeNotificationId;
}

export function resolveNextHandledNotificationId({ lastHandledId, notificationId, route }) {
  const safeLastHandledId = String(lastHandledId || '').trim();
  const safeNotificationId = String(notificationId || '').trim();
  if (!route || safeNotificationId.length === 0) return safeLastHandledId;
  return safeNotificationId;
}
