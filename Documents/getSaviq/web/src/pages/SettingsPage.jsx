import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Button, Input, Modal, Spinner, Avatar } from '../components/ui';
import {
  User,
  CreditCard,
  Tag,
  Shield,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Banknote,
  Building2,
} from 'lucide-react';
import { categoriesAPI, paymentMethodsAPI, profilesAPI } from '../services/api';
import { getUserFriendlyError } from '../lib/errorMessages';

const paymentTypeOptions = [
  { value: 'cash',          label: 'Cash',          icon: Banknote   },
  { value: 'credit_card',   label: 'Credit Card',   icon: CreditCard },
  { value: 'debit_card',    label: 'Debit Card',    icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2  },
];

const categoryColors = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#4A6D5C',
];

export default function SettingsPage() {
  const { user, logout, deleteAccount, isGuest } = useAuth();
  const { profiles, categories, paymentMethods, loading, refresh } = useAppData();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState('account');

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountInput, setDeleteAccountInput] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState('');

  // Form states
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: 'tag', color: '#4A6D5C' });
  const [paymentForm, setPaymentForm] = useState({ name: '', type: 'cash', last_four: '', is_default: false });
  const [profileForm, setProfileForm] = useState({ name: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteAccountInput.trim() !== 'DELETE') {
      setDeleteAccountError('Please type DELETE to confirm.');
      return;
    }
    try {
      setIsSubmitting(true);
      setDeleteAccountError('');
      await deleteAccount();
      setShowDeleteAccountModal(false);
      navigate('/login');
    } catch (error) {
      setDeleteAccountError(getUserFriendlyError(error, 'Failed to delete account. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteAccount, deleteAccountInput, navigate]);

  // Category handlers
  const handleSaveCategory = useCallback(async () => {
    try {
      setIsSubmitting(true);
      if (editingItem) {
        await categoriesAPI.update(editingItem.category_id, categoryForm);
      } else {
        await categoriesAPI.create(categoryForm);
      }
      await refresh();
      setShowCategoryModal(false);
      setEditingItem(null);
      setCategoryForm({ name: '', icon: 'tag', color: '#4A6D5C' });
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingItem, categoryForm, refresh]);

  const handleDeleteCategory = useCallback(async (categoryId) => {
    try {
      await categoriesAPI.delete(categoryId);
      await refresh();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  }, [refresh]);

  // Payment method handlers
  const handleSavePayment = useCallback(async () => {
    try {
      setIsSubmitting(true);
      if (editingItem) {
        await paymentMethodsAPI.update(editingItem.payment_id, paymentForm);
      } else {
        await paymentMethodsAPI.create(paymentForm);
      }
      await refresh();
      setShowPaymentModal(false);
      setEditingItem(null);
      setPaymentForm({ name: '', type: 'cash', last_four: '', is_default: false });
    } catch (error) {
      console.error('Failed to save payment method:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingItem, paymentForm, refresh]);

  const handleDeletePayment = useCallback(async (paymentId) => {
    try {
      await paymentMethodsAPI.delete(paymentId);
      await refresh();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete payment method:', error);
    }
  }, [refresh]);

  // Profile handlers
  const handleSaveProfile = useCallback(async () => {
    try {
      setIsSubmitting(true);
      if (editingItem) {
        await profilesAPI.update(editingItem.profile_id, profileForm);
      } else {
        await profilesAPI.create(profileForm.name);
      }
      await refresh();
      setShowProfileModal(false);
      setEditingItem(null);
      setProfileForm({ name: '' });
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingItem, profileForm, refresh]);

  const handleDeleteProfile = useCallback(async (profileId) => {
    try {
      await profilesAPI.delete(profileId);
      await refresh();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete profile:', error);
    }
  }, [refresh]);

  const sections = [
    { id: 'account',  label: 'Account',         icon: User      },
    { id: 'profiles', label: 'Profiles',         icon: Shield    },
    { id: 'categories', label: 'Categories',     icon: Tag       },
    { id: 'payments', label: 'Payment Methods',  icon: CreditCard },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl sm:text-3xl font-bold font-heading text-text-primary mb-6">
        Settings
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <Card className="lg:col-span-1 p-2 h-fit">
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeSection === section.id
                      ? 'bg-brand-primary text-white'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  data-testid={`settings-nav-${section.id}`}
                >
                  <Icon className="w-5 h-5" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Account Section */}
          {activeSection === 'account' && (
            <Card>
              <h2 className="text-lg font-bold font-heading text-text-primary mb-6">
                Account Information
              </h2>

              <div className="flex items-center gap-4 mb-6">
                <Avatar name={user?.name} size="lg" />
                <div>
                  <p className="text-lg font-semibold text-text-primary">{user?.name}</p>
                  <p className="text-sm text-text-secondary">{user?.email}</p>
                </div>
              </div>

              {isGuest && (
                <div className="p-4 bg-warning/10 rounded-xl mb-6">
                  <p className="text-sm text-warning font-medium">
                    You're using guest mode. Your data is stored locally.
                  </p>
                  <p className="text-sm text-text-secondary mt-1">
                    Create an account to sync your data across devices.
                  </p>
                </div>
              )}

              <div className="border-t border-border-color pt-6">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="danger"
                    onClick={handleLogout}
                    className="w-full sm:w-auto"
                    data-testid="settings-logout"
                  >
                    <LogOut className="w-5 h-5 mr-2" />
                    {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
                  </Button>
                  {!isGuest && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setDeleteAccountInput('');
                        setDeleteAccountError('');
                        setShowDeleteAccountModal(true);
                      }}
                      className="w-full sm:w-auto"
                      data-testid="settings-delete-account"
                    >
                      <Trash2 className="w-5 h-5 mr-2" />
                      Delete Account
                    </Button>
                  )}
                </div>
                {!isGuest && (
                  <p className="text-xs text-text-secondary mt-3">
                    Deleting your account permanently removes your personal data from this app.
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Profiles Section */}
          {activeSection === 'profiles' && (
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold font-heading text-text-primary">
                  Profiles
                </h2>
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setProfileForm({ name: '' });
                    setShowProfileModal(true);
                  }}
                  size="sm"
                  data-testid="add-profile-button"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Profile
                </Button>
              </div>

              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div
                    key={profile.profile_id}
                    className="flex items-center justify-between p-4 bg-surface-hover rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-primary/10 rounded-lg">
                        <Shield className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{profile.name}</p>
                        {profile.is_default && (
                          <span className="text-xs text-brand-primary">Default</span>
                        )}
                      </div>
                    </div>

                    {!['personal', 'business'].includes((profile.profile_type || '').toLowerCase()) && (
                      <div className="flex items-center gap-2">
                        <button
                          aria-label="Edit profile"
                          onClick={() => {
                            setEditingItem(profile);
                            setProfileForm({ name: profile.name });
                            setShowProfileModal(true);
                          }}
                          className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-text-secondary" />
                        </button>
                        <button
                          aria-label="Delete profile"
                          onClick={() => setDeleteConfirm({ type: 'profile', item: profile })}
                          className="p-2 hover:bg-expense-bg rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-expense" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Categories Section */}
          {activeSection === 'categories' && (
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold font-heading text-text-primary">
                  Categories
                </h2>
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setCategoryForm({ name: '', icon: 'tag', color: '#4A6D5C' });
                    setShowCategoryModal(true);
                  }}
                  size="sm"
                  data-testid="add-category-button"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Category
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categories.map((category) => (
                  <div
                    key={category.category_id}
                    className="flex items-center justify-between p-4 bg-surface-hover rounded-xl group"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: category.color + '20' }}
                      >
                        <Tag className="w-5 h-5" style={{ color: category.color }} />
                      </div>
                      <span className="font-medium text-text-primary">{category.name}</span>
                    </div>

                    {!category.is_default && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          aria-label="Edit category"
                          onClick={() => {
                            setEditingItem(category);
                            setCategoryForm({ name: category.name, icon: category.icon, color: category.color });
                            setShowCategoryModal(true);
                          }}
                          className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-text-secondary" />
                        </button>
                        <button
                          aria-label="Delete category"
                          onClick={() => setDeleteConfirm({ type: 'category', item: category })}
                          className="p-2 hover:bg-expense-bg rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-expense" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Payment Methods Section */}
          {activeSection === 'payments' && (
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold font-heading text-text-primary">
                  Payment Methods
                </h2>
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setPaymentForm({ name: '', type: 'cash', last_four: '', is_default: false });
                    setShowPaymentModal(true);
                  }}
                  size="sm"
                  data-testid="add-payment-button"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Method
                </Button>
              </div>

              <div className="space-y-3">
                {paymentMethods.map((payment) => {
                  const TypeIcon = paymentTypeOptions.find(t => t.value === payment.type)?.icon || CreditCard;
                  return (
                    <div
                      key={payment.payment_id}
                      className="flex items-center justify-between p-4 bg-surface-hover rounded-xl group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-primary/10 rounded-lg">
                          <TypeIcon className="w-5 h-5 text-brand-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">{payment.name}</p>
                          <p className="text-sm text-text-secondary">
                            {paymentTypeOptions.find(t => t.value === payment.type)?.label}
                            {payment.last_four && ` •••• ${payment.last_four}`}
                          </p>
                        </div>
                        {payment.is_default && (
                          <span className="px-2 py-0.5 text-xs bg-brand-primary/10 text-brand-primary rounded-full">
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          aria-label="Edit payment method"
                          onClick={() => {
                            setEditingItem(payment);
                            setPaymentForm({
                              name: payment.name,
                              type: payment.type,
                              last_four: payment.last_four || '',
                              is_default: payment.is_default,
                            });
                            setShowPaymentModal(true);
                          }}
                          className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-text-secondary" />
                        </button>
                        <button
                          aria-label="Delete payment method"
                          onClick={() => setDeleteConfirm({ type: 'payment', item: payment })}
                          className="p-2 hover:bg-expense-bg rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-expense" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Category Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setEditingItem(null); }}
        title={editingItem ? 'Edit Category' : 'Add Category'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Category Name"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            placeholder="e.g., Groceries"
            data-testid="category-name-input"
          />

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {categoryColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setCategoryForm({ ...categoryForm, color })}
                  className={`w-8 h-8 rounded-lg transition-transform ${
                    categoryForm.color === color ? 'ring-2 ring-offset-2 ring-brand-primary scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => { setShowCategoryModal(false); setEditingItem(null); }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCategory}
              disabled={!categoryForm.name || isSubmitting}
              className="flex-1"
              data-testid="save-category-button"
            >
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Method Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setEditingItem(null); }}
        title={editingItem ? 'Edit Payment Method' : 'Add Payment Method'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={paymentForm.name}
            onChange={(e) => setPaymentForm({ ...paymentForm, name: e.target.value })}
            placeholder="e.g., My Visa Card"
            data-testid="payment-name-input"
          />

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {paymentTypeOptions.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => setPaymentForm({ ...paymentForm, type: type.value })}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                      paymentForm.type === type.value
                        ? 'border-brand-primary bg-brand-primary/5'
                        : 'border-border-color hover:border-brand-primary/50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${
                      paymentForm.type === type.value ? 'text-brand-primary' : 'text-text-secondary'
                    }`} />
                    <span className={`text-sm font-medium ${
                      paymentForm.type === type.value ? 'text-brand-primary' : 'text-text-primary'
                    }`}>
                      {type.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {(paymentForm.type === 'credit_card' || paymentForm.type === 'debit_card') && (
            <Input
              label="Last 4 Digits (optional)"
              value={paymentForm.last_four}
              onChange={(e) => setPaymentForm({ ...paymentForm, last_four: e.target.value })}
              placeholder="1234"
              maxLength={4}
            />
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={paymentForm.is_default}
              onChange={(e) => setPaymentForm({ ...paymentForm, is_default: e.target.checked })}
              className="w-4 h-4 rounded border-border-color text-brand-primary focus:ring-brand-primary/20"
            />
            <span className="text-sm text-text-primary">Set as default</span>
          </label>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => { setShowPaymentModal(false); setEditingItem(null); }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePayment}
              disabled={!paymentForm.name || isSubmitting}
              className="flex-1"
              data-testid="save-payment-button"
            >
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Profile Modal */}
      <Modal
        isOpen={showProfileModal}
        onClose={() => { setShowProfileModal(false); setEditingItem(null); }}
        title={editingItem ? 'Edit Profile' : 'Add Profile'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Profile Name"
            value={profileForm.name}
            onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
            placeholder="e.g., Side Hustle"
            data-testid="profile-name-input"
          />

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => { setShowProfileModal(false); setEditingItem(null); }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              disabled={!profileForm.name || isSubmitting}
              className="flex-1"
              data-testid="save-profile-button"
            >
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={`Delete ${deleteConfirm?.type}`}
        size="sm"
      >
        <p className="text-text-secondary mb-6">
          Are you sure you want to delete "{deleteConfirm?.item?.name}"? This action cannot be undone.
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
            onClick={() => {
              if (deleteConfirm?.type === 'category') {
                handleDeleteCategory(deleteConfirm.item.category_id);
              } else if (deleteConfirm?.type === 'payment') {
                handleDeletePayment(deleteConfirm.item.payment_id);
              } else if (deleteConfirm?.type === 'profile') {
                handleDeleteProfile(deleteConfirm.item.profile_id);
              }
            }}
            className="flex-1"
            data-testid="confirm-delete"
          >
            Delete
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        title="Delete Account"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This action is permanent and will delete your account and associated data.
          </p>
          <p className="text-sm text-text-secondary">
            Type <span className="font-semibold text-text-primary">DELETE</span> to confirm.
          </p>
          <Input
            value={deleteAccountInput}
            onChange={(e) => setDeleteAccountInput(e.target.value)}
            placeholder="DELETE"
            error={deleteAccountError || undefined}
            data-testid="delete-account-confirm-input"
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteAccountModal(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              className="flex-1"
              disabled={isSubmitting}
              data-testid="confirm-delete-account"
            >
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Delete Account'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
