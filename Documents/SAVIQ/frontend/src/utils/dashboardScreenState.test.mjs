import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldResetDashboardIntelligence, isCurrentDashboardRequest } from './dashboardScreenState.js';

test('dashboard profile switch helper resets only when profile id changes', () => {
  assert.equal(shouldResetDashboardIntelligence('p1', 'p1'), false);
  assert.equal(shouldResetDashboardIntelligence('p1', 'p2'), true);
  assert.equal(shouldResetDashboardIntelligence(null, 'p2'), true);
});

test('dashboard request guard allows only latest request id', () => {
  assert.equal(isCurrentDashboardRequest(2, 2), true);
  assert.equal(isCurrentDashboardRequest(1, 2), false);
});
