export function getGoalMilestone(
  progressPercent: number | string | null | undefined,
  status?: string | null
): 'Started' | 'Halfway' | 'Near Goal' | null;
