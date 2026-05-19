function formatCurrencyValue(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function formatDateValue(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getProjectedCompletionText(goal) {
  const projection = goal?.projected_completion;
  if (!projection) return 'Projection unavailable';

  if (projection.basis === 'already_completed') {
    return 'Projected completion: Completed';
  }

  if (projection.projected_completion_date) {
    return `Projected completion: ${formatDateValue(projection.projected_completion_date)}`;
  }

  if (typeof projection.months_remaining === 'number') {
    const months = projection.months_remaining.toFixed(1);
    return `Projected completion: ~${months} months`;
  }

  return 'Projection unavailable';
}

export function buildGoalDisplayModel(goal) {
  return {
    goalId: goal.goal_id,
    title: goal.title,
    progressPercent: Number(goal.progress_percentage || 0),
    currentSavedText: formatCurrencyValue(goal.current_amount || 0),
    targetAmountText: formatCurrencyValue(goal.target_amount || 0),
    projectionText: getProjectedCompletionText(goal),
  };
}

export function selectTopPriorityGoal(goals = []) {
  const candidates = goals.filter((goal) => {
    const remaining = Number(goal.target_amount || 0) - Number(goal.current_amount || 0);
    return remaining > 0 && !['completed', 'cancelled'].includes(goal.status);
  });

  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const aDeadline = new Date(a.deadline || 0).getTime();
    const bDeadline = new Date(b.deadline || 0).getTime();
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;

    const aProgress = Number(a.progress_percentage || 0);
    const bProgress = Number(b.progress_percentage || 0);
    return bProgress - aProgress;
  })[0];
}
