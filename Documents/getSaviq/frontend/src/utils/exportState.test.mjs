import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExportFileName,
  sanitizeExportFileStem,
  shouldCloseExportModalOnProfileSwitch,
  getExportErrorMessage,
  shouldStartExport,
} from './exportState.js';

test('export filename helpers sanitize malformed profile names deterministically', () => {
  assert.equal(sanitizeExportFileStem('Family Budget'), 'expenses_Family_Budget');
  assert.equal(sanitizeExportFileStem('  /Team:Alpha*  '), 'expenses_TeamAlpha');
  assert.equal(sanitizeExportFileStem('   '), 'expenses_profile');
  assert.equal(buildExportFileName('  /Team:Alpha*  ', 'CSV'), 'expenses_TeamAlpha.csv');
});

test('export start guard blocks concurrent/blank-profile attempts deterministically', () => {
  assert.equal(shouldStartExport({ isExporting: true, profileId: 'p1' }), false);
  assert.equal(shouldStartExport({ isExporting: false, profileId: '   ' }), false);
  assert.equal(shouldStartExport({ isExporting: false, profileId: ' p1 ' }), true);
});

test('export modal cleanup helper closes only on active profile switch while open', () => {
  assert.equal(
    shouldCloseExportModalOnProfileSwitch({ previousProfileId: 'p1', nextProfileId: 'p2', isExportModalOpen: true }),
    true
  );
  assert.equal(
    shouldCloseExportModalOnProfileSwitch({ previousProfileId: 'p1', nextProfileId: 'p1', isExportModalOpen: true }),
    false
  );
  assert.equal(
    shouldCloseExportModalOnProfileSwitch({ previousProfileId: 'p1', nextProfileId: 'p2', isExportModalOpen: false }),
    false
  );
});

test('export error messaging is deterministic for network/server/client cases', () => {
  assert.match(getExportErrorMessage({}, 'csv'), /check your connection/i);
  assert.match(getExportErrorMessage({ response: { status: 503 } }, 'json'), /server issue/i);
  assert.equal(getExportErrorMessage({ response: { status: 400 } }, 'csv'), 'Failed to export CSV.');
});
