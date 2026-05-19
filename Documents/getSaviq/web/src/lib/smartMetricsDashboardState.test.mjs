import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSmartMetricsMountedLifecycle,
  getSmartMetricsGridClass,
  shouldApplySmartMetricsResponse,
  shouldRequestSmartMetrics,
} from './smartMetricsDashboardState.js';

test('grid layout helper keeps six smart cards in balanced responsive grid', () => {
  assert.equal(
    getSmartMetricsGridClass(6),
    'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
  );
});

test('responsive layout helper remains safe across small card counts', () => {
  assert.equal(getSmartMetricsGridClass(1), 'grid grid-cols-1 gap-4');
  assert.equal(getSmartMetricsGridClass(2), 'grid grid-cols-1 sm:grid-cols-2 gap-4');
});

test('integration fetch remains isolated by rejecting stale smart metric responses', () => {
  const shouldApply = shouldApplySmartMetricsResponse({
    isMounted: true,
    requestId: 2,
    latestRequestId: 4,
    requestedProfileId: 'profile_a',
    activeProfileId: 'profile_a',
  });

  assert.equal(shouldApply, false);
});

test('latest smart metrics response applies even if active profile context has moved', () => {
  const shouldApply = shouldApplySmartMetricsResponse({
    isMounted: true,
    requestId: 4,
    latestRequestId: 4,
    requestedProfileId: 'profile_a',
    activeProfileId: 'profile_b',
  });

  assert.equal(shouldApply, true);
});

test('mounted lifecycle helper remains strict-mode safe across cleanup/setup cycles', () => {
  const ref = { current: true };

  const firstCleanup = createSmartMetricsMountedLifecycle(ref);
  firstCleanup();
  assert.equal(ref.current, false);

  const secondCleanup = createSmartMetricsMountedLifecycle(ref);
  assert.equal(ref.current, true);

  secondCleanup();
  assert.equal(ref.current, false);
});

test('smart metrics requests only run when profile context is valid', () => {
  const allowed = shouldRequestSmartMetrics({
    isGuest: false,
    activeProfileId: 'profile_a',
    loading: false,
    lastRequestedProfileId: null,
    hasLoadedForProfile: false,
  });
  const blocked = shouldRequestSmartMetrics({
    isGuest: true,
    activeProfileId: 'profile_a',
    loading: false,
    lastRequestedProfileId: null,
  });

  assert.equal(allowed, true);
  assert.equal(blocked, false);
});

test('smart metrics request is skipped after same-profile payload already resolved unless forced', () => {
  const suppressed = shouldRequestSmartMetrics({
    isGuest: false,
    activeProfileId: 'profile_a',
    loading: false,
    lastRequestedProfileId: 'profile_a',
    hasLoadedForProfile: true,
    forceRefresh: false,
  });

  const forced = shouldRequestSmartMetrics({
    isGuest: false,
    activeProfileId: 'profile_a',
    loading: false,
    lastRequestedProfileId: 'profile_a',
    hasLoadedForProfile: true,
    forceRefresh: true,
  });

  assert.equal(suppressed, false);
  assert.equal(forced, true);
});
