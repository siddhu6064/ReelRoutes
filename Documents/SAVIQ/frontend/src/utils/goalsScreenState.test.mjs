import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultGoalFormState,
  sortGoalsByProgress,
  buildGoalFormFromGoal,
  deriveGoalsViewState,
  deriveGoalSaveMode,
  deriveGoalModalTitle,
  removeGoalById,
  shouldReloadGoalsForProfileChange,
} from './goalsScreenState.js';

test('goals sorting keeps highest progress first', () => {
  const sorted = sortGoalsByProgress([
    { goal_id: 'a', progress_percentage: 10 },
    { goal_id: 'b', progress_percentage: 50 },
    { goal_id: 'c', progress_percentage: 0 },
  ]);
  assert.deepEqual(sorted.map(g => g.goal_id), ['b', 'a', 'c']);
});

test('goal form builder maps existing goal payload and defaults safely', () => {
  const form = buildGoalFormFromGoal({
    title: 'Emergency',
    category: 'Safety',
    target_amount: 1000,
    current_amount: 100,
    deadline: '2026-08-01T10:00:00.000Z',
    status: 'paused',
  });

  assert.equal(form.title, 'Emergency');
  assert.equal(form.status, 'paused');
  assert.equal(form.target_amount, '1000');
  assert.match(form.deadline, /^2026-08-01/);
  assert.equal(defaultGoalFormState.status, 'active');
});

test('goals view state resolves no-profile/loading/error/empty/ready states', () => {
  assert.equal(deriveGoalsViewState({ activeProfile: null, isLoading: false, error: '', goalsCount: 0 }), 'no_profile');
  assert.equal(deriveGoalsViewState({ activeProfile: { profile_id: 'p' }, isLoading: true, error: '', goalsCount: 0 }), 'loading');
  assert.equal(deriveGoalsViewState({ activeProfile: { profile_id: 'p' }, isLoading: false, error: 'err', goalsCount: 0 }), 'error');
  assert.equal(deriveGoalsViewState({ activeProfile: { profile_id: 'p' }, isLoading: false, error: '', goalsCount: 0 }), 'empty');
  assert.equal(deriveGoalsViewState({ activeProfile: { profile_id: 'p' }, isLoading: false, error: '', goalsCount: 2 }), 'ready');
});

test('goals create/edit/delete orchestration helpers remain deterministic', () => {
  assert.equal(deriveGoalSaveMode(null), 'create');
  assert.equal(deriveGoalSaveMode({ goal_id: 'g1' }), 'update');
  assert.equal(deriveGoalModalTitle(null), 'Create Goal');
  assert.equal(deriveGoalModalTitle({ goal_id: 'g1' }), 'Edit Goal');

  const remaining = removeGoalById(
    [
      { goal_id: 'g1', title: 'Emergency' },
      { goal_id: 'g2', title: 'Travel' },
    ],
    'g1'
  );
  assert.deepEqual(remaining.map((goal) => goal.goal_id), ['g2']);
});

test('goals profile-aware refresh helper only triggers when profile changes to a valid profile', () => {
  assert.equal(shouldReloadGoalsForProfileChange(null, 'profile-a'), true);
  assert.equal(shouldReloadGoalsForProfileChange('profile-a', 'profile-a'), false);
  assert.equal(shouldReloadGoalsForProfileChange('profile-a', 'profile-b'), true);
  assert.equal(shouldReloadGoalsForProfileChange('profile-a', null), false);
});
