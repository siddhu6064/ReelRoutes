export interface SavingsGoal {
  goal_id: string;
  title: string;
  status?: string;
  deadline?: string;
  target_amount?: number;
  current_amount?: number;
  progress_percentage?: number;
  projected_completion?: {
    basis?: string;
    projected_completion_date?: string;
    projected_date?: string;
    months_remaining?: number;
  };
}

export function selectTopPriorityGoal(goals: SavingsGoal[] = []): SavingsGoal | null {
  const candidates = goals.filter((goal) => {
    const remaining = Number(goal.target_amount || 0) - Number(goal.current_amount || 0);
    return remaining > 0 && !['completed', 'cancelled'].includes((goal.status || '').toLowerCase());
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

export function getGoalProjectionText(goal: SavingsGoal | null): string {
  if (!goal?.projected_completion) return 'Projection unavailable';

  const projection = goal.projected_completion;
  if (projection.basis === 'already_completed') {
    return 'Completed';
  }

  const projectedDate = projection.projected_completion_date || projection.projected_date;
  if (projectedDate) {
    const date = new Date(projectedDate);
    if (!Number.isNaN(date.getTime())) {
      return `Projected ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
  }

  if (typeof projection.months_remaining === 'number') {
    return `Projected in ~${projection.months_remaining.toFixed(1)} months`;
  }

  return 'Projection unavailable';
}
