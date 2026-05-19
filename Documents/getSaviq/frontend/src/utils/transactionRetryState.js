function getStatus(error) {
  return error?.response?.status;
}

export function isRetryableTransactionSaveError(error) {
  const status = getStatus(error);
  if (typeof status === 'number') {
    return status >= 500 || status === 429;
  }

  return !error?.response;
}

export function getTransactionSaveErrorMessage(error, isEdit = false) {
  const fallback = isEdit
    ? 'Could not update transaction. Check your connection and try again.'
    : 'Could not add transaction. Check your connection and try again.';

  const status = getStatus(error);
  if (!status) return fallback;

  if (status === 400) return 'Please review this transaction and try again.';
  if (status === 401) return 'Your session expired. Sign in again and retry.';
  if (status === 403) return 'You do not have permission to save this transaction.';
  if (status === 404 && isEdit) return 'This transaction no longer exists.';
  if (status >= 500) return 'Server error while saving. Please retry.';

  return fallback;
}

export function canSubmitTransaction({ isSubmitting, amount, hasActiveProfile }) {
  if (isSubmitting) return false;
  if (!hasActiveProfile) return false;
  return Boolean(amount) && Number.parseFloat(String(amount)) > 0;
}
