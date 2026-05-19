import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Input, Select, Spinner } from './ui';
import { validateGoalForm, toGoalPayload } from '../lib/goalsValidation';

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const emptyForm = {
  title: '',
  target_amount: '',
  current_amount: '',
  deadline: '',
  category: '',
  status: 'active',
};

export default function CreateGoalModal({
  isOpen,
  onClose,
  onSubmit,
  profileId,
  editingGoal = null,
  isSubmitting = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const title = useMemo(() => (editingGoal ? 'Edit Goal' : 'Create Goal'), [editingGoal]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingGoal) {
      const deadline = editingGoal.deadline ? new Date(editingGoal.deadline).toISOString().slice(0, 10) : '';
      setForm({
        title: editingGoal.title || '',
        target_amount: editingGoal.target_amount?.toString() || '',
        current_amount: editingGoal.current_amount?.toString() || '0',
        deadline,
        category: editingGoal.category || '',
        status: editingGoal.status || 'active',
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
  }, [editingGoal, isOpen]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting || !profileId) return;

    const validation = validateGoalForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    await onSubmit(toGoalPayload(form, profileId));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-4" data-testid="goal-form">
        <Input
          label="Title"
          placeholder="Emergency Fund"
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          error={errors.title}
          data-testid="goal-title-input"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Target Amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="5000"
            value={form.target_amount}
            onChange={(e) => handleChange('target_amount', e.target.value)}
            error={errors.target_amount}
            data-testid="goal-target-input"
          />

          <Input
            label="Current Amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={form.current_amount}
            onChange={(e) => handleChange('current_amount', e.target.value)}
            data-testid="goal-current-input"
          />
        </div>

        <Input
          label="Deadline"
          type="date"
          value={form.deadline}
          onChange={(e) => handleChange('deadline', e.target.value)}
          error={errors.deadline}
          data-testid="goal-deadline-input"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Category"
            placeholder="Travel"
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
            data-testid="goal-category-input"
          />

          <Select
            label="Status"
            options={statusOptions}
            value={form.status}
            onChange={(e) => handleChange('status', e.target.value)}
            data-testid="goal-status-select"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !profileId} data-testid="goal-submit-button">
            {isSubmitting ? (
              <>
                <Spinner size="sm" className="mr-2 text-white" />
                Saving...
              </>
            ) : editingGoal ? 'Save Changes' : 'Create Goal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
