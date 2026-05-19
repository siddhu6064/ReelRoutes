import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Button, Input, Modal, Spinner, Badge } from '../components/ui';
import {
  Target,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency, cn, getCategoryIcon } from '../lib/utils';
import { budgetsAPI } from '../services/api';

export default function BudgetsPage() {
  const { profiles, categories, activeProfile, setActiveProfile, loading } = useAppData();

  const [budgetProgress, setBudgetProgress] = useState({ budgets: [], total_budget: null });
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [budgetForm, setBudgetForm] = useState({
    category_id: '',
    amount: '',
    period: 'monthly',
  });

  const loadBudgetProgress = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const response = await budgetsAPI.getProgress(activeProfile.profile_id);
      if (isMounted.current) { setBudgetProgress(response.data); setError(null); }
    } catch (error) {
      console.error('budgets.load_failed', { message: error?.message, status: error?.response?.status });
      if (isMounted.current) setError('Failed to load data. Please try again.');
    }
  }, [activeProfile?.profile_id]);

  useEffect(() => {
    loadBudgetProgress();
  }, [loadBudgetProgress]);

  const handleSaveBudget = useCallback(async () => {
    try {
      setIsSubmitting(true);
      const data = {
        profile_id: activeProfile.profile_id,
        category_id: budgetForm.category_id || null,
        amount: parseFloat(budgetForm.amount),
        period: budgetForm.period,
      };

      if (editingBudget) {
        await budgetsAPI.update(editingBudget.budget_id, {
          amount: data.amount,
          period: data.period,
        });
      } else {
        await budgetsAPI.create(data);
      }

      await loadBudgetProgress();
      setShowModal(false);
      setEditingBudget(null);
      setBudgetForm({ category_id: '', amount: '', period: 'monthly' });
    } catch (error) {
      console.error('Failed to save budget:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeProfile?.profile_id, budgetForm, editingBudget, loadBudgetProgress]);

  const handleDeleteBudget = useCallback(async (budgetId) => {
    try {
      await budgetsAPI.delete(budgetId);
      await loadBudgetProgress();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete budget:', error);
    }
  }, [loadBudgetProgress]);

  const openEditModal = useCallback((budget) => {
    setEditingBudget(budget);
    setBudgetForm({
      category_id: budget.category_id || '',
      amount: budget.amount.toString(),
      period: budget.period,
    });
    setShowModal(true);
  }, []);

  const openAddModal = useCallback(() => {
    setEditingBudget(null);
    setBudgetForm({ category_id: '', amount: '', period: 'monthly' });
    setShowModal(true);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-text-primary">
            Budgets
          </h1>
          <p className="text-text-secondary mt-1">Set spending limits and track progress</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={activeProfile?.profile_id || ''}
            onChange={(e) => {
              const profile = profiles.find(p => p.profile_id === e.target.value);
              setActiveProfile(profile);
            }}
            className="px-4 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="profile-select"
          >
            {profiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profile.name}
              </option>
            ))}
          </select>

          <Button onClick={openAddModal} data-testid="add-budget-button">
            <Plus className="w-5 h-5 mr-2" />
            Add Budget
          </Button>
        </div>
      </div>

      {/* Total Budget Card */}
      {budgetProgress.total_budget ? (
        <Card
          className="bg-gradient-to-br from-brand-primary to-brand-hover text-white"
          data-testid="budget-summary-card"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/80 text-sm">Total Monthly Budget</p>
              <p className="text-3xl font-bold font-heading mt-1">
                {formatCurrency(budgetProgress.total_budget.amount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">
                {budgetProgress.total_budget.percentage}%
              </p>
              <p className="text-white/80 text-sm">used</p>
            </div>
          </div>

          <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden mb-4">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                budgetProgress.total_budget.is_over_budget ? "bg-expense" : "bg-white"
              )}
              style={{ width: `${Math.min(budgetProgress.total_budget.percentage, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-sm">
            <span>Spent: {formatCurrency(budgetProgress.total_budget.spent)}</span>
            <span>
              {budgetProgress.total_budget.is_over_budget ? (
                <span className="text-expense-bg">Over by {formatCurrency(Math.abs(budgetProgress.total_budget.remaining))}</span>
              ) : (
                <span>Remaining: {formatCurrency(budgetProgress.total_budget.remaining)}</span>
              )}
            </span>
          </div>

          <button
            onClick={() => openEditModal(budgetProgress.total_budget)}
            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </Card>
      ) : (
        <Card className="text-center py-8">
          <Target className="w-12 h-12 text-brand-primary mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No Total Budget Set</h3>
          <p className="text-text-secondary mb-4">Set a total monthly budget to track your overall spending</p>
          <Button onClick={() => { setBudgetForm({ category_id: '', amount: '', period: 'monthly' }); setShowModal(true); }}>
            Set Total Budget
          </Button>
        </Card>
      )}

      {/* Category Budgets */}
      <div>
        <h2 className="text-lg font-bold font-heading text-text-primary mb-4">
          Category Budgets
        </h2>

        {budgetProgress.budgets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgetProgress.budgets.map((budget) => {
              const category = categories.find(c => c.category_id === budget.category_id);
              const IconComponent = getCategoryIcon(category?.icon);

              return (
                <Card key={budget.budget_id} hover className="relative group">
                  <div className="flex items-start gap-4">
                    <div
                      className="p-3 rounded-xl flex-shrink-0"
                      style={{ backgroundColor: (category?.color || '#6b7280') + '20' }}
                    >
                      <IconComponent className="w-6 h-6" style={{ color: category?.color || '#6b7280' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-text-primary">{category?.name || 'Unknown'}</h3>
                        <div className="flex items-center gap-2">
                          {budget.is_over_budget ? (
                            <Badge variant="expense">Over Budget</Badge>
                          ) : budget.percentage > 80 ? (
                            <Badge variant="warning">Almost Full</Badge>
                          ) : null}
                          <span className="text-sm font-semibold text-text-secondary">
                            {budget.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden mb-2">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            budget.is_over_budget ? "bg-expense" : budget.percentage > 80 ? "bg-warning" : "bg-income"
                          )}
                          style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-sm text-text-secondary">
                        <span>{formatCurrency(budget.spent)} spent</span>
                        <span>of {formatCurrency(budget.amount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      aria-label="Edit budget"
                      onClick={() => openEditModal(budget)}
                      className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button
                      aria-label="Delete budget"
                      onClick={() => setDeleteConfirm(budget)}
                      className="p-2 hover:bg-expense-bg rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-expense" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="text-center py-8">
            <p className="text-text-secondary">No category budgets set yet</p>
            <Button onClick={openAddModal} variant="secondary" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Category Budget
            </Button>
          </Card>
        )}
      </div>

      {/* Add/Edit Budget Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingBudget(null); }}
        title={editingBudget ? 'Edit Budget' : 'Add Budget'}
        size="sm"
      >
        <div className="space-y-4">
          {!editingBudget && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Budget Type</label>
              <select
                value={budgetForm.category_id}
                onChange={(e) => setBudgetForm({ ...budgetForm, category_id: e.target.value })}
                className="w-full px-4 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                data-testid="budget-category-select"
              >
                <option value="">Total Budget (All Categories)</option>
                {categories.map((cat) => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="Budget Amount"
            type="number"
            value={budgetForm.amount}
            onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })}
            placeholder="Enter amount"
            data-testid="budget-amount-input"
          />

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Period</label>
            <div className="grid grid-cols-3 gap-2">
              {['weekly', 'monthly', 'yearly'].map((period) => (
                <button
                  key={period}
                  onClick={() => setBudgetForm({ ...budgetForm, period })}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    budgetForm.period === period
                      ? "bg-brand-primary text-white"
                      : "bg-surface-hover text-text-secondary hover:text-text-primary"
                  )}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => { setShowModal(false); setEditingBudget(null); }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBudget}
              disabled={!budgetForm.amount || isSubmitting}
              className="flex-1"
              data-testid="save-budget-button"
            >
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Save Budget'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Budget"
        size="sm"
      >
        <p className="text-text-secondary mb-6">
          Are you sure you want to delete this budget? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setDeleteConfirm(null)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => handleDeleteBudget(deleteConfirm?.budget_id)}
            className="flex-1"
            data-testid="confirm-delete-budget"
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
