export const defaultGoalFormState = {
  title: '',
  category: 'General',
  target_amount: '',
  current_amount: '0',
  deadline: '',
  status: 'active',
};

export function sortGoalsByProgress(goals) {
  return [...(Array.isArray(goals) ? goals : [])].sort((a, b) => (b?.progress_percentage || 0) - (a?.progress_percentage || 0));
}

export function buildGoalFormFromGoal(goal) {
  return {
    title: goal?.title || '',
    category: goal?.category || 'General',
    target_amount: String(goal?.target_amount || ''),
    current_amount: String(goal?.current_amount || 0),
    deadline: goal?.deadline ? new Date(goal.deadline).toISOString().slice(0, 10) : '',
    status: goal?.status || 'active',
  };
}

export function deriveGoalsViewState({ activeProfile, isLoading, error, goalsCount }) {
  if (!activeProfile) return 'no_profile';
  if (isLoading) return 'loading';
  if (error) return 'error';
  if (!goalsCount) return 'empty';
  return 'ready';
}

export function deriveGoalSaveMode(editingGoal) {
  return editingGoal?.goal_id ? 'update' : 'create';
}

export function deriveGoalModalTitle(editingGoal) {
  return deriveGoalSaveMode(editingGoal) === 'update' ? 'Edit Goal' : 'Create Goal';
}

export function removeGoalById(goals, goalId) {
  return (Array.isArray(goals) ? goals : []).filter((goal) => goal?.goal_id !== goalId);
}

export function shouldReloadGoalsForProfileChange(previousProfileId, nextProfileId) {
  return Boolean(nextProfileId) && previousProfileId !== nextProfileId;
}
