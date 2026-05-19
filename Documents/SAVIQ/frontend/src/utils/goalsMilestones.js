export function getGoalMilestone(progressPercent, status) {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') return null;

  const progress = Number(progressPercent || 0);
  if (!Number.isFinite(progress) || progress <= 0) return null;

  if (progress >= 90) return 'Near Goal';
  if (progress >= 50) return 'Halfway';
  return 'Started';
}
