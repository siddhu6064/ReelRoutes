export function validateGoalForm(
  form: {
    title?: string;
    target_amount?: string | number;
    current_amount?: string | number;
    deadline?: string;
  },
  now?: Date
): Record<string, string>;

export function toGoalPayload(
  form: {
    title?: string;
    target_amount?: string | number;
    current_amount?: string | number;
    deadline?: string;
    category?: string;
    status?: string;
  },
  profileId: string
): {
  profile_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  category: string;
  status: string;
};
