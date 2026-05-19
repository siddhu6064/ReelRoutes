import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldApplyWeeklyDigestResponse,
  shouldRequestWeeklyDigest,
} from './weeklyDigestDashboardState.js';

test('dashboard integration fetches digest for active profile', () => {
  const shouldRequest = shouldRequestWeeklyDigest({
    isGuest: false,
    activeProfileId: 'profile_1',
    loading: false,
    lastRequestedProfileId: null,
  });

  assert.equal(shouldRequest, true);
});

test('profile change causes digest reload with updated scope', () => {
  const shouldRequest = shouldRequestWeeklyDigest({
    isGuest: false,
    activeProfileId: 'profile_2',
    loading: true,
    lastRequestedProfileId: 'profile_1',
  });

  assert.equal(shouldRequest, true);
});

test('digest API failure leaves the rest of dashboard stable by rejecting stale responses', () => {
  const shouldApply = shouldApplyWeeklyDigestResponse({
    isMounted: true,
    requestId: 2,
    latestRequestId: 3,
    requestedProfileId: 'profile_1',
    activeProfileId: 'profile_1',
  });

  assert.equal(shouldApply, false);
});

test('refresh action re-fetches digest safely under repeated clicks', () => {
  const suppressedDuplicate = shouldRequestWeeklyDigest({
    isGuest: false,
    activeProfileId: 'profile_1',
    loading: true,
    lastRequestedProfileId: 'profile_1',
  });

  const suppressedAutomaticReload = shouldRequestWeeklyDigest({
    isGuest: false,
    activeProfileId: 'profile_1',
    loading: false,
    lastRequestedProfileId: 'profile_1',
  });

  const allowedManualReload = shouldRequestWeeklyDigest({
    isGuest: false,
    activeProfileId: 'profile_1',
    loading: false,
    lastRequestedProfileId: 'profile_1',
    forceRefresh: true,
  });

  assert.equal(suppressedDuplicate, false);
  assert.equal(suppressedAutomaticReload, false);
  assert.equal(allowedManualReload, true);
});
