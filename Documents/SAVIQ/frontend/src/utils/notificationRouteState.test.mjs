import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRouteFromNotificationData,
  resolveNextHandledNotificationId,
  shouldSuppressDuplicateNotification,
} from './notificationRouteState.js';

test('notification route mapping keeps add/stats/home assumptions deterministic', () => {
  assert.equal(
    deriveRouteFromNotificationData({ screen: 'add', amount: '25.90' }),
    '/(tabs)/add?amount=25.90&fromShortcut=true'
  );
  assert.equal(
    deriveRouteFromNotificationData({ screen: 'add' }),
    '/(tabs)/add'
  );
  assert.equal(deriveRouteFromNotificationData({ screen: 'stats' }), '/(tabs)/stats');
  assert.equal(deriveRouteFromNotificationData({ screen: 'analytics' }), '/(tabs)/stats');
  assert.equal(deriveRouteFromNotificationData({ screen: 'home' }), '/(tabs)');
  assert.equal(deriveRouteFromNotificationData({ screen: 'dashboard' }), '/(tabs)');
  assert.equal(deriveRouteFromNotificationData({ screen: 'other' }), null);
  assert.equal(deriveRouteFromNotificationData({ screen: ' Stats ' }), '/(tabs)/stats');
  assert.equal(deriveRouteFromNotificationData({ screen: 'ADD', amount: ' 10.00 ' }), '/(tabs)/add?amount=10.00&fromShortcut=true');
  assert.equal(
    deriveRouteFromNotificationData({ screen: 'add', amount: '12.50 & tax' }),
    '/(tabs)/add'
  );
  assert.equal(deriveRouteFromNotificationData({ screen: 'add', amount: '   ' }), '/(tabs)/add');
  assert.equal(deriveRouteFromNotificationData('add'), null);
  assert.equal(deriveRouteFromNotificationData(['add']), null);
  assert.equal(deriveRouteFromNotificationData(null), null);
});

test('duplicate notification suppression helper is deterministic for trimmed ids', () => {
  assert.equal(
    shouldSuppressDuplicateNotification({ lastHandledId: 'notif-1', notificationId: 'notif-1' }),
    true
  );
  assert.equal(
    shouldSuppressDuplicateNotification({ lastHandledId: ' notif-1 ', notificationId: 'notif-1' }),
    true
  );
  assert.equal(
    shouldSuppressDuplicateNotification({ lastHandledId: 'notif-1', notificationId: 'notif-2' }),
    false
  );
  assert.equal(
    shouldSuppressDuplicateNotification({ lastHandledId: 'notif-1', notificationId: '   ' }),
    false
  );
});

test('handled-notification id only advances when a valid route is derived', () => {
  assert.equal(
    resolveNextHandledNotificationId({ lastHandledId: 'notif-1', notificationId: 'notif-2', route: null }),
    'notif-1'
  );
  assert.equal(
    resolveNextHandledNotificationId({ lastHandledId: 'notif-1', notificationId: '   ', route: '/(tabs)/add' }),
    'notif-1'
  );
  assert.equal(
    resolveNextHandledNotificationId({ lastHandledId: 'notif-1', notificationId: ' notif-2 ', route: '/(tabs)/stats' }),
    'notif-2'
  );
});
