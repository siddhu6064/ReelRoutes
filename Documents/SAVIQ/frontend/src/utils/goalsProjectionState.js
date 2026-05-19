function formatDateValue(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getProjectedCompletionSummary(goal) {
  const projection = goal?.projected_completion;
  if (!projection) return 'Projection unavailable';

  if (projection.basis === 'already_completed') {
    return 'Projected completion: Completed';
  }

  const projectedDate = projection.projected_completion_date || projection.projected_date;
  if (projectedDate) {
    return `Projected completion: ${formatDateValue(projectedDate)}`;
  }

  if (typeof projection.months_remaining === 'number') {
    return `Projected completion: ~${projection.months_remaining.toFixed(1)} months`;
  }

  return 'Projection unavailable';
}

export function getGoalDeadlineStatus(goal, now = new Date()) {
  if (!goal?.deadline) return null;

  const deadline = new Date(goal.deadline);
  if (Number.isNaN(deadline.getTime())) return null;

  const status = String(goal.status || '').toLowerCase();
  const current = Number(goal.current_amount || 0);
  const target = Number(goal.target_amount || 0);
  const isCompleted = status === 'completed' || (target > 0 && current >= target);
  if (isCompleted) return null;

  if (deadline < now) {
    return 'Past deadline';
  }

  return null;
}
