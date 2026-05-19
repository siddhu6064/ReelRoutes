export function sanitizeExportFileStem(profileName) {
  const safeName = String(profileName || '').trim();
  if (!safeName) return 'expenses_profile';
  const normalized = safeName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized ? `expenses_${normalized}` : 'expenses_profile';
}

export function buildExportFileName(profileName, extension) {
  const safeExt = String(extension || '').trim().toLowerCase() || 'txt';
  return `${sanitizeExportFileStem(profileName)}.${safeExt}`;
}

export function shouldStartExport({ isExporting, profileId }) {
  if (isExporting) return false;
  return String(profileId || '').trim().length > 0;
}

export function shouldCloseExportModalOnProfileSwitch({
  previousProfileId,
  nextProfileId,
  isExportModalOpen,
}) {
  if (!isExportModalOpen) return false;
  const safePreviousProfileId = String(previousProfileId || '').trim();
  const safeNextProfileId = String(nextProfileId || '').trim();
  if (!safePreviousProfileId || !safeNextProfileId) return false;
  return safePreviousProfileId !== safeNextProfileId;
}

export function getExportErrorMessage(error, format) {
  const safeFormat = String(format || 'data').trim().toUpperCase();
  if (!error?.response) {
    return `Could not export ${safeFormat} right now. Check your connection and try again.`;
  }
  if (error.response?.status >= 500) {
    return `Could not export ${safeFormat} due to a server issue. Try again shortly.`;
  }
  return `Failed to export ${safeFormat}.`;
}
