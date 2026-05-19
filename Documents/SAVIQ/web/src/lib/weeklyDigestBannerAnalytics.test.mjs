import test from 'node:test';
import assert from 'node:assert/strict';

import {
  trackWeeklyDigestDismissed,
  trackWeeklyDigestViewed,
} from './weeklyDigestBannerAnalytics.js';

const sampleBanner = {
  digest: {
    narrative: { summary: 'Digest summary' },
  },
  latest: {
    week_start: '2026-04-06T00:00:00+00:00',
    week_end: '2026-04-12T23:59:59+00:00',
  },
};

test('viewed event fires when banner renders with a digest', () => {
  const calls = [];
  const viewedKeys = new Set();

  const tracked = trackWeeklyDigestViewed({
    profileId: 'profile_1',
    bannerResponse: sampleBanner,
    viewedKeys,
    emit: (name, payload) => calls.push({ name, payload }),
  });

  assert.equal(tracked, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'weekly_digest_viewed');
});

test('viewed event does not fire when no digest is available', () => {
  const calls = [];
  const viewedKeys = new Set();

  const tracked = trackWeeklyDigestViewed({
    profileId: 'profile_1',
    bannerResponse: { digest: null, latest: null },
    viewedKeys,
    emit: (name, payload) => calls.push({ name, payload }),
  });

  assert.equal(tracked, false);
  assert.equal(calls.length, 0);
});

test('dismissed event fires on successful dismiss', () => {
  const calls = [];

  const tracked = trackWeeklyDigestDismissed({
    profileId: 'profile_1',
    bannerResponse: sampleBanner,
    emit: (name, payload) => calls.push({ name, payload }),
  });

  assert.equal(tracked, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'weekly_digest_dismissed');
});

test('analytics failure does not break view/dismiss tracking flow', () => {
  const viewedKeys = new Set();

  const viewedTracked = trackWeeklyDigestViewed({
    profileId: 'profile_1',
    bannerResponse: sampleBanner,
    viewedKeys,
    emit: () => {
      throw new Error('analytics down');
    },
  });

  const dismissedTracked = trackWeeklyDigestDismissed({
    profileId: 'profile_1',
    bannerResponse: sampleBanner,
    emit: () => {
      throw new Error('analytics down');
    },
  });

  assert.equal(viewedTracked, false);
  assert.equal(dismissedTracked, false);
});

test('duplicate noisy firing is prevented for same shown digest in current lifecycle', () => {
  const calls = [];
  const viewedKeys = new Set();

  const first = trackWeeklyDigestViewed({
    profileId: 'profile_1',
    bannerResponse: sampleBanner,
    viewedKeys,
    emit: (name, payload) => calls.push({ name, payload }),
  });

  const second = trackWeeklyDigestViewed({
    profileId: 'profile_1',
    bannerResponse: sampleBanner,
    viewedKeys,
    emit: (name, payload) => calls.push({ name, payload }),
  });

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(calls.length, 1);
});
