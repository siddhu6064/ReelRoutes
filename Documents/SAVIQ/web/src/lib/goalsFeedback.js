export const GOALS_EMPTY_STATE_COPY = {
  title: 'Start your first savings goal',
  description: 'Set a goal, track progress, and stay motivated as your savings grow.',
  cta: 'Create Your First Goal',
};

export function getGoalActionMessage(action, isSuccess) {
  const safeMessages = {
    create: {
      success: 'Goal created successfully.',
      failure: 'Could not create goal. Please try again.',
    },
    update: {
      success: 'Goal updated successfully.',
      failure: 'Could not update goal. Please try again.',
    },
    delete: {
      success: 'Goal deleted successfully.',
      failure: 'Could not delete goal. Please try again.',
    },
    load: {
      success: '',
      failure: 'Could not load goals right now. Please refresh and try again.',
    },
  };

  const actionMessages = safeMessages[action] || safeMessages.load;
  return isSuccess ? actionMessages.success : actionMessages.failure;
}
