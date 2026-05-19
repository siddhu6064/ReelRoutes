export function validateGoalForm(form, now = new Date()) {
  const errors = {};

  const title = (form.title || '').trim();
  if (!title) {
    errors.title = 'Title is required';
  }

  const target = Number(form.target_amount);
  if (!Number.isFinite(target) || target <= 0) {
    errors.target_amount = 'Target amount must be greater than 0';
  }

  const deadlineValue = form.deadline ? new Date(form.deadline) : null;
  if (!deadlineValue || Number.isNaN(deadlineValue.getTime())) {
    errors.deadline = 'Deadline is required';
  } else {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    if (deadlineValue < startOfToday) {
      errors.deadline = 'Deadline cannot be in the past';
    }
  }

  return errors;
}

export function toGoalPayload(form, profileId) {
  return {
    profile_id: profileId,
    title: (form.title || '').trim(),
    target_amount: Number(form.target_amount),
    current_amount: Number(form.current_amount || 0),
    deadline: new Date(form.deadline).toISOString(),
    category: (form.category || '').trim() || 'General',
    status: form.status || 'active',
  };
}
