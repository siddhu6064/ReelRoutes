export function resolveWeeklyDigestBannerState({ loading = false, error = null, digest = null }) {
  if (loading) return 'loading';
  if (error) return 'hidden';
  if (!digest) return 'hidden';
  return 'ready';
}

export function mapWeeklyDigestBannerData(payload) {
  const digest = payload?.digest || null;
  const summary = digest?.narrative?.summary || null;
  const recommendations = Array.isArray(digest?.recommendations)
    ? digest.recommendations.slice(0, 3).map((item) => ({
      id: item?.id || 'recommendation',
      text: item?.text || 'Recommendation unavailable.',
      polarity: item?.polarity || 'neutral',
    }))
    : [];

  return {
    latestLabel: 'Latest weekly digest',
    summary,
    recommendations,
  };
}

export function applyDigestBannerDismiss(currentState) {
  return {
    ...currentState,
    digest: null,
  };
}
