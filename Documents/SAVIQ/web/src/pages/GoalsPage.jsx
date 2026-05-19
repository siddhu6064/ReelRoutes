import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Button, Spinner, Badge } from '../components/ui';
import { Plus, Pencil, Trash2, Target } from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { savingsGoalsAPI } from '../services/api';
import CreateGoalModal from '../components/CreateGoalModal';
import { getProjectedCompletionText } from '../lib/goalsPresentation';
import { GOALS_EMPTY_STATE_COPY, getGoalActionMessage } from '../lib/goalsFeedback';

export default function GoalsPage() {
  const { profiles, activeProfile, setActiveProfile, loading } = useAppData();
  const [goals, setGoals] = useState([]);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadGoals = useCallback(async () => {
    if (!activeProfile?.profile_id) return;

    setIsPageLoading(true);
    try {
      const response = await savingsGoalsAPI.getAll({ profile_id: activeProfile.profile_id });
      if (!isMounted.current) return;
      setGoals(response.data || []);
      setError('');
    } catch (err) {
      if (!isMounted.current) return;
      setError(getGoalActionMessage('load', false));
    } finally {
      if (isMounted.current) setIsPageLoading(false);
    }
  }, [activeProfile?.profile_id]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 2400);
    return () => clearTimeout(timer);
  }, [success]);

  const handleCreateOrEdit = async (payload) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    try {
      if (editingGoal) {
        await savingsGoalsAPI.update(editingGoal.goal_id, payload);
        setSuccess(getGoalActionMessage('update', true));
      } else {
        await savingsGoalsAPI.create(payload);
        setSuccess(getGoalActionMessage('create', true));
      }
      await loadGoals();
      setShowModal(false);
      setEditingGoal(null);
    } catch (err) {
      setError(getGoalActionMessage(editingGoal ? 'update' : 'create', false));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (goalId) => {
    if (!window.confirm('Delete this goal?')) return;

    setError('');
    try {
      await savingsGoalsAPI.delete(goalId);
      await loadGoals();
      setSuccess(getGoalActionMessage('delete', true));
    } catch (err) {
      setError(getGoalActionMessage('delete', false));
    }
  };

  const openCreate = () => {
    setEditingGoal(null);
    setShowModal(true);
  };

  const openEdit = (goal) => {
    setEditingGoal(goal);
    setShowModal(true);
  };

  const statusVariant = useMemo(() => ({
    active: 'income',
    paused: 'warning',
    completed: 'default',
    cancelled: 'expense',
  }), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="goals-page">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm" data-testid="goals-error">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm" data-testid="goals-success">
          {success}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-text-primary">Savings Goals</h1>
          <p className="text-text-secondary mt-1">Track progress toward your financial targets</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={activeProfile?.profile_id || ''}
            onChange={(e) => {
              const profile = profiles.find((p) => p.profile_id === e.target.value);
              setActiveProfile(profile || null);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="goals-profile-select"
          >
            {profiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profile.name}
              </option>
            ))}
          </select>

          <Button onClick={openCreate} className="w-full sm:w-auto" data-testid="open-create-goal-modal">
            <Plus className="w-5 h-5 mr-2" />
            New Goal
          </Button>
        </div>
      </div>

      {isPageLoading ? (
        <div className="flex items-center justify-center h-40" data-testid="goals-loading">
          <Spinner size="lg" />
        </div>
      ) : goals.length === 0 ? (
        <Card className="text-center py-12" data-testid="goals-empty-state">
          <Target className="w-12 h-12 text-brand-primary mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">{GOALS_EMPTY_STATE_COPY.title}</h3>
          <p className="text-text-secondary mb-4">{GOALS_EMPTY_STATE_COPY.description}</p>
          <Button onClick={openCreate}>{GOALS_EMPTY_STATE_COPY.cta}</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="goals-list">
          {goals.map((goal) => (
            <Card key={goal.goal_id} className="space-y-3" data-testid="goal-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{goal.title}</h3>
                  <p className="text-sm text-text-secondary">{goal.category}</p>
                </div>
                <Badge variant={statusVariant[goal.status] || 'default'}>{goal.status}</Badge>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm text-text-secondary">
                  <span>{formatCurrency(goal.current_amount || 0)} saved</span>
                  <span>of {formatCurrency(goal.target_amount || 0)}</span>
                </div>
                <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-primary rounded-full transition-all"
                    style={{ width: `${Math.min(goal.progress_percentage || 0, 100)}%` }}
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-xs text-text-secondary">
                  <span>{(goal.progress_percentage || 0).toFixed(1)}% complete</span>
                  <span>Due {formatDate(goal.deadline)}</span>
                </div>
              </div>

              <div className="text-sm text-text-secondary space-y-1">
                <p>
                  Monthly recommendation:{' '}
                  <span className="font-medium text-text-primary">
                    {goal.monthly_savings_recommendation == null
                      ? 'N/A'
                      : formatCurrency(goal.monthly_savings_recommendation)}
                  </span>
                </p>
                <p>
                  {getProjectedCompletionText(goal)}
                </p>
                <p>
                  Projection basis:{' '}
                  <span className="font-medium text-text-primary">
                    {goal.projected_completion?.basis || 'unavailable'}
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
                <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => openEdit(goal)} data-testid="edit-goal-button">
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button size="sm" variant="danger" className="w-full sm:w-auto" onClick={() => handleDelete(goal.goal_id)} data-testid="delete-goal-button">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateGoalModal
        isOpen={showModal}
        onClose={() => {
          if (isSubmitting) return;
          setShowModal(false);
          setEditingGoal(null);
        }}
        onSubmit={handleCreateOrEdit}
        profileId={activeProfile?.profile_id}
        editingGoal={editingGoal}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
