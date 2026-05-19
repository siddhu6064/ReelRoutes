export function emitAnalyticsEvent(eventName, payload = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('saviq_analytics_event', {
        detail: {
          event: eventName,
          payload,
        },
      }));
    }
  } catch (_error) {
    // non-blocking best-effort analytics dispatch
  }

  try {
    console.info('[analytics]', eventName, payload);
  } catch (_error) {
    // keep analytics non-blocking
  }
}
