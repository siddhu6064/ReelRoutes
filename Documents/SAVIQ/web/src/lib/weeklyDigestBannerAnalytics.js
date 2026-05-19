function getWeekFromBannerResponse(bannerResponse) {
  const latest = bannerResponse?.latest || {};
  if (latest.week_start || latest.week_end) {
    return {
      week_start: latest.week_start || null,
      week_end: latest.week_end || null,
    };
  }

  const week = bannerResponse?.digest?.week || {};
  return {
    week_start: week.start_date || null,
    week_end: week.end_date || null,
  };
}

export function getWeeklyDigestBannerViewKey({ profileId, bannerResponse }) {
  const week = getWeekFromBannerResponse(bannerResponse);
  if (!profileId || !week.week_start || !week.week_end) return null;
  return `${profileId}:${week.week_start}:${week.week_end}`;
}

export function buildWeeklyDigestBannerEventPayload({ profileId, bannerResponse, sourceSurface = 'banner' }) {
  const week = getWeekFromBannerResponse(bannerResponse);
  return {
    profile_id: profileId || null,
    week_start: week.week_start,
    week_end: week.week_end,
    source_surface: sourceSurface,
  };
}

export function trackWeeklyDigestViewed({ profileId, bannerResponse, viewedKeys, emit }) {
  const digest = bannerResponse?.digest;
  if (!digest || typeof emit !== 'function' || !viewedKeys) return false;

  const key = getWeeklyDigestBannerViewKey({ profileId, bannerResponse });
  if (!key || viewedKeys.has(key)) return false;

  const payload = buildWeeklyDigestBannerEventPayload({ profileId, bannerResponse });
  try {
    emit('weekly_digest_viewed', payload);
  } catch (_error) {
    viewedKeys.add(key);
    return false;
  }

  viewedKeys.add(key);
  return true;
}

export function trackWeeklyDigestDismissed({ profileId, bannerResponse, emit }) {
  const digest = bannerResponse?.digest;
  if (!digest || typeof emit !== 'function') return false;

  const payload = buildWeeklyDigestBannerEventPayload({ profileId, bannerResponse });
  try {
    emit('weekly_digest_dismissed', payload);
  } catch (_error) {
    return false;
  }

  return true;
}
