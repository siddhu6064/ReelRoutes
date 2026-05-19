export function getProjectedCompletionSummary(goal: {
  projected_completion?: {
    basis?: string;
    projected_completion_date?: string;
    projected_date?: string;
    months_remaining?: number;
  };
} | null): string;

export function getGoalDeadlineStatus(goal: {
  status?: string;
  current_amount?: number;
  target_amount?: number;
  deadline?: string;
} | null, now?: Date): 'Past deadline' | null;
