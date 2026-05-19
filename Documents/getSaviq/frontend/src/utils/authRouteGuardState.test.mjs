import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAddRouteFromDeepLinkParams,
  deriveAuthRouteAction,
  deriveDeepLinkNavigationTarget,
} from './authRouteGuardState.js';

test('auth route guard: unauthenticated users cannot remain in protected tabs', () => {
  assert.equal(
    deriveAuthRouteAction({ isLoading: false, isAuthenticated: false, segments: ['(tabs)', 'transactions'] }),
    'leave_tabs'
  );
});

test('auth route guard: authenticated users are routed into protected tabs from public routes', () => {
  assert.equal(
    deriveAuthRouteAction({ isLoading: false, isAuthenticated: true, segments: [] }),
    'enter_tabs'
  );
  assert.equal(
    deriveAuthRouteAction({ isLoading: false, isAuthenticated: true, segments: ['(tabs)', 'index'] }),
    'stay'
  );
});

test('auth route guard: loading state defers navigation decisions (guest-mode-safe)', () => {
  assert.equal(
    deriveAuthRouteAction({ isLoading: true, isAuthenticated: false, segments: ['(tabs)'] }),
    'wait'
  );
});

test('deep-link route helpers keep add/stats/home route assumptions deterministic', () => {
  assert.equal(
    buildAddRouteFromDeepLinkParams({ amount: 14.5, merchant: 'Cafe A' }),
    '/(tabs)/add?amount=14.5&merchant=Cafe%20A&fromShortcut=true'
  );

  assert.equal(
    deriveDeepLinkNavigationTarget('add', { amount: 12 }),
    '/(tabs)/add?amount=12&fromShortcut=true'
  );
  assert.equal(deriveDeepLinkNavigationTarget('stats', {}), '/(tabs)/stats');
  assert.equal(deriveDeepLinkNavigationTarget('analytics', {}), '/(tabs)/stats');
  assert.equal(deriveDeepLinkNavigationTarget('home', {}), '/(tabs)');
  assert.equal(deriveDeepLinkNavigationTarget('dashboard', {}), '/(tabs)');
  assert.equal(deriveDeepLinkNavigationTarget('unknown', {}), null);
});
