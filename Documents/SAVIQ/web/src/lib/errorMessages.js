export function getUserFriendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const status = error?.response?.status;
  const code = error?.code;

  if (status === 401) return 'Session expired. Please sign in again.';
  if (status >= 500) return 'Server error. Please try again shortly.';
  if (code === 'ECONNABORTED') return 'Request timed out. Please try again.';
  if (!error?.response) return 'Network error. Check your connection and try again.';

  return fallback;
}
