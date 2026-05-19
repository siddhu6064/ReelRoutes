export function shouldResetDashboardIntelligence(previousProfileId, currentProfileId) {
  return previousProfileId !== currentProfileId;
}

export function isCurrentDashboardRequest(requestId, currentRequestId) {
  return requestId === currentRequestId;
}
