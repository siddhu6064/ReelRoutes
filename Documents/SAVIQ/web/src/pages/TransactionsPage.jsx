import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Button, Badge, Spinner, Modal } from '../components/ui';
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Download,
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { getUserFriendlyError } from '../lib/errorMessages';
import { expensesAPI, exportAPI } from '../services/api';
import AddTransactionModal from '../components/AddTransactionModal';

export default function TransactionsPage() {
  const location = useLocation();
  const { profiles, categories, paymentMethods, activeProfile, setActiveProfile, loading } = useAppData();

  const [transactions, setTransactions] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dateValidationError, setDateValidationError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [viewingTx, setViewingTx] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [exportingType, setExportingType] = useState('');

  const isMounted = useRef(true);
  const initializedFromQuery = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (initializedFromQuery.current) return;
    initializedFromQuery.current = true;

    const params = new URLSearchParams(location.search);
    const profileId = params.get('profile_id');
    const preset = params.get('date_preset');
    const categoryId = params.get('category_id');
    const paymentId = params.get('payment_method_id');
    const startDate = params.get('start_date');
    const endDate = params.get('end_date');
    const validPresets = new Set(['30d', '90d', '6m', '1y']);

    if (preset && validPresets.has(preset)) setDatePreset(preset);
    if (categoryId) setCategoryFilter(categoryId);
    if (paymentId) setPaymentFilter(paymentId);
    if (startDate && endDate) {
      const parsedStart = new Date(startDate);
      const parsedEnd = new Date(endDate);
      if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime()) && parsedEnd >= parsedStart) {
        setDatePreset('custom');
        setCustomStartDate(parsedStart.toISOString().slice(0, 10));
        setCustomEndDate(parsedEnd.toISOString().slice(0, 10));
      }
    }
    if (profileId && profiles.length > 0) {
      const profile = profiles.find((p) => p.profile_id === profileId);
      if (profile) setActiveProfile(profile);
    }
  }, [location.search, profiles, setActiveProfile]);

  useEffect(() => {
    if (datePreset !== 'custom') {
      setDateValidationError('');
      return;
    }
    if (!customStartDate || !customEndDate) {
      setDateValidationError('Select both start and end dates to apply a custom range.');
      return;
    }
    if (new Date(customEndDate) < new Date(customStartDate)) {
      setDateValidationError('End date cannot be earlier than start date.');
      return;
    }
    setDateValidationError('');
  }, [customEndDate, customStartDate, datePreset]);

  const getDateRangeParams = useCallback(() => {
    if (datePreset === 'custom') {
      if (!customStartDate || !customEndDate) return null;
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
      return { start_date: start.toISOString(), end_date: end.toISOString() };
    }
    const end = new Date();
    const start = new Date(end);
    if (datePreset === '30d') start.setDate(end.getDate() - 30);
    if (datePreset === '90d') start.setDate(end.getDate() - 90);
    if (datePreset === '6m') start.setMonth(end.getMonth() - 6);
    if (datePreset === '1y') start.setFullYear(end.getFullYear() - 1);
    return { start_date: start.toISOString(), end_date: end.toISOString() };
  }, [customEndDate, customStartDate, datePreset]);

  const loadTransactions = useCallback(async () => {
    if (!activeProfile) return;
    const range = getDateRangeParams();
    if (!range) {
      if (isMounted.current && datePreset === 'custom') setTransactions([]);
      return;
    }
    try {
      const params = {
        profile_id: activeProfile.profile_id,
        ...range,
        ...(search ? { q: search } : {}),
        ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
        ...(categoryFilter !== 'all' ? { category_id: categoryFilter } : {}),
        ...(paymentFilter !== 'all' ? { payment_method_id: paymentFilter } : {}),
      };
      const response = await expensesAPI.getAll(params);
      if (isMounted.current) { setTransactions(response.data); setError(null); }
    } catch (error) {
      if (isMounted.current) setError(getUserFriendlyError(error, 'Failed to load transactions. Please try again.'));
    }
  }, [activeProfile?.profile_id, categoryFilter, datePreset, getDateRangeParams, paymentFilter, search, typeFilter]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 2400);
    return () => clearTimeout(timer);
  }, [success]);

  const handleDelete = useCallback(async (expenseId) => {
    try {
      await expensesAPI.delete(expenseId);
      setTransactions(prev => prev.filter(t => t.expense_id !== expenseId));
      setDeleteConfirm(null);
      setSuccess('Transaction deleted successfully.');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  }, []);

  const getExportFilterWindow = useCallback(() => {
    const range = getDateRangeParams();
    if (!range) return null;
    return {
      profileId: activeProfile?.profile_id,
      startDate: range.start_date,
      endDate: range.end_date,
    };
  }, [activeProfile?.profile_id, getDateRangeParams]);

  const triggerDownload = useCallback((blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  const handleExportCSV = useCallback(async () => {
    if (!activeProfile?.profile_id || exportingType) return;
    const range = getExportFilterWindow();
    if (!range) {
      setError('Select a valid custom date range before exporting.');
      return;
    }
    const { profileId, startDate, endDate } = range;
    try {
      setExportingType('csv');
      setError(null);
      setSuccess('Preparing CSV export...');
      const response = await exportAPI.getCSV(profileId, startDate, endDate);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const today = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `transactions_${profileId}_${today}.csv`);
      setSuccess('CSV export downloaded.');
    } catch (err) {
      setError(getUserFriendlyError(err, 'Failed to export CSV. Please try again.'));
    } finally {
      setExportingType('');
    }
  }, [activeProfile?.profile_id, exportingType, getExportFilterWindow, triggerDownload]);

  const handleExportJSON = useCallback(async () => {
    if (!activeProfile?.profile_id || exportingType) return;
    const range = getExportFilterWindow();
    if (!range) {
      setError('Select a valid custom date range before exporting.');
      return;
    }
    const { profileId, startDate, endDate } = range;
    try {
      setExportingType('json');
      setError(null);
      setSuccess('Preparing JSON export...');
      const response = await exportAPI.getJSON(profileId, startDate, endDate);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const today = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `transactions_${profileId}_${today}.json`);
      setSuccess('JSON export downloaded.');
    } catch (err) {
      setError(getUserFriendlyError(err, 'Failed to export JSON. Please try again.'));
    } finally {
      setExportingType('');
    }
  }, [activeProfile?.profile_id, exportingType, getExportFilterWindow, triggerDownload]);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.category_id, c])),
    [categories]
  );

  const paymentMethodMap = useMemo(
    () => Object.fromEntries(paymentMethods.map(p => [p.payment_id, p])),
    [paymentMethods]
  );

  const selectedCategory = viewingTx ? categoryMap[viewingTx.category_id] : null;
  const selectedPayment = viewingTx ? paymentMethodMap[viewingTx.payment_method_id] : null;
  const selectedToPayment = viewingTx ? paymentMethodMap[viewingTx.to_payment_method_id] : null;

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
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
          {success}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-text-primary">
            Transactions
          </h1>
          <p className="text-text-secondary mt-1">
            {transactions.length} transactions
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <Button
            variant="secondary"
            onClick={handleExportCSV}
            disabled={!activeProfile?.profile_id || !!exportingType}
            className="w-full sm:w-auto"
            data-testid="export-csv-current-filters"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportingType === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportJSON}
            disabled={!activeProfile?.profile_id || !!exportingType}
            className="w-full sm:w-auto"
            data-testid="export-json-current-filters"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportingType === 'json' ? 'Exporting JSON...' : 'Export JSON'}
          </Button>
          <select
            value={activeProfile?.profile_id || ''}
            onChange={(e) => {
              const profile = profiles.find(p => p.profile_id === e.target.value);
              setActiveProfile(profile);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="profile-filter"
          >
            {profiles.map((profile) => (
              <option key={profile.profile_id} value={profile.profile_id}>
                {profile.name}
              </option>
            ))}
          </select>

          <Button
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto"
            data-testid="add-transaction-button"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-secondary -mt-4">
        Exports currently apply profile and date-range filters. Search/type/category/payment filters are not applied to export yet.
      </p>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
              data-testid="search-input"
            />
          </div>

          {/* Type Filter */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'expense', 'income', 'transfer'].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  typeFilter === type
                    ? 'bg-brand-primary text-white'
                    : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                )}
                data-testid={`filter-${type}`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Payment Method Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-surface-hover border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="category-filter"
          >
            <option value="all">All Payment Methods</option>
            {paymentMethods.map((pm) => (
              <option key={pm.payment_id} value={pm.payment_id}>
                {pm.name}
              </option>
            ))}
          </select>

          {/* Payment Method Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-surface-hover border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="payment-filter"
          >
            <option value="all">All Payment Methods</option>
            {paymentMethods.map((pm) => (
              <option key={pm.payment_id} value={pm.payment_id}>
                {pm.name}
              </option>
            ))}
          </select>

          {/* Date Range Preset */}
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-surface-hover border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            data-testid="date-range-filter"
          >
            <option value="30d">Last 30D</option>
            <option value="90d">Last 90D</option>
              <option value="6m">Last 6M</option>
              <option value="1y">Last 1Y</option>
              <option value="custom">Custom</option>
            </select>
            {datePreset === 'custom' && (
              <>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-surface-hover border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  data-testid="custom-start-date-filter"
                />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-surface-hover border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  data-testid="custom-end-date-filter"
                />
              </>
            )}
          </div>
          {dateValidationError && (
            <p className="text-xs text-expense mt-2">{dateValidationError}</p>
          )}
        </Card>

      {/* Transactions Table */}
      {transactions.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <div className="md:hidden divide-y divide-border-color">
            {transactions.map((tx) => {
              const category = categoryMap[tx.category_id];
              const paymentMethod = paymentMethodMap[tx.payment_method_id];
              return (
                <div
                  key={`mobile-${tx.expense_id}`}
                  className="p-4 space-y-2 cursor-pointer hover:bg-surface-hover/60"
                  onClick={() => setViewingTx(tx)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-text-primary truncate">{tx.description}</p>
                    <Badge variant={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'transfer'}>{tx.type}</Badge>
                  </div>
                  <div className="text-xs text-text-secondary flex flex-wrap gap-x-3 gap-y-1">
                    <span>{formatDate(tx.date)}</span>
                    {category?.name && <span>{category.name}</span>}
                    {paymentMethod?.name && <span>{paymentMethod.name}</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn("font-semibold", tx.type === 'income' && 'text-income', tx.type === 'expense' && 'text-expense', tx.type === 'transfer' && 'text-transfer')}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        aria-label="Edit transaction"
                        onClick={(e) => { e.stopPropagation(); setEditingTx(tx); }}
                        className="p-2 text-text-secondary hover:text-brand-primary hover:bg-surface-hover rounded-lg transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="Delete transaction"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(tx); }}
                        className="p-2 text-text-secondary hover:text-expense hover:bg-expense-bg rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr className="text-left text-text-secondary">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const category = categoryMap[tx.category_id];
                  const paymentMethod = paymentMethodMap[tx.payment_method_id];
                  return (
                    <tr
                      key={tx.expense_id}
                      className="border-t border-border-color hover:bg-surface-hover/60 cursor-pointer"
                      onClick={() => setViewingTx(tx)}
                      data-testid={`view-${tx.expense_id}`}
                    >
                      <td className="px-4 py-3 text-text-secondary">{formatDate(tx.date)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            tx.type === 'income' ? 'income'
                              : tx.type === 'expense' ? 'expense'
                                : 'transfer'
                          }
                        >
                          {tx.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-primary font-medium">{tx.description}</td>
                      <td className="px-4 py-3 text-text-secondary">{category?.name || 'Uncategorized'}</td>
                      <td className="px-4 py-3 text-text-secondary">{paymentMethod?.name || '-'}</td>
                      <td className="px-4 py-3 text-text-secondary">{tx.merchant || '-'}</td>
                      <td className={cn(
                        "px-4 py-3 text-right font-semibold",
                        tx.type === 'income' && 'text-income',
                        tx.type === 'expense' && 'text-expense',
                        tx.type === 'transfer' && 'text-transfer'
                      )}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            aria-label="Edit transaction"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTx(tx);
                            }}
                            className="p-2 text-text-secondary hover:text-brand-primary hover:bg-surface-hover rounded-lg transition-all"
                            data-testid={`edit-${tx.expense_id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            aria-label="Delete transaction"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(tx);
                            }}
                            className="p-2 text-text-secondary hover:text-expense hover:bg-expense-bg rounded-lg transition-all"
                            data-testid={`delete-${tx.expense_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="text-center py-12">
          <div className="text-text-secondary">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No transactions found</p>
              <p className="text-sm mt-1">
              {search || typeFilter !== 'all' || categoryFilter !== 'all' || paymentFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first transaction to get started'}
            </p>
          </div>
          {!search && typeFilter === 'all' && categoryFilter === 'all' && paymentFilter === 'all' && (
            <Button
              onClick={() => setShowAddModal(true)}
              className="mt-6"
              data-testid="add-first-transaction"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Transaction
            </Button>
          )}
        </Card>
      )}

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(message) => {
          setShowAddModal(false);
          if (message) setSuccess(message);
          loadTransactions();
        }}
        mode="edit"
        initialTransaction={editingTx}
        profiles={profiles}
        categories={categories}
        paymentMethods={paymentMethods}
        activeProfile={activeProfile}
      />

      <AddTransactionModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        onSuccess={(message) => {
          setEditingTx(null);
          setViewingTx(null);
          if (message) setSuccess(message);
          loadTransactions();
        }}
        mode="edit"
        initialTransaction={editingTx}
        profiles={profiles}
        categories={categories}
        paymentMethods={paymentMethods}
        activeProfile={activeProfile}
      />

      <Modal
        isOpen={!!viewingTx}
        onClose={() => setViewingTx(null)}
        title="Transaction Details"
        size="md"
      >
        {viewingTx && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-text-secondary">Date:</span> <span className="text-text-primary font-medium">{formatDate(viewingTx.date)}</span></div>
              <div><span className="text-text-secondary">Type:</span> <Badge variant={viewingTx.type === 'income' ? 'income' : viewingTx.type === 'expense' ? 'expense' : 'transfer'} className="ml-2">{viewingTx.type}</Badge></div>
              <div><span className="text-text-secondary">Amount:</span> <span className={cn("font-semibold ml-1", viewingTx.type === 'income' && 'text-income', viewingTx.type === 'expense' && 'text-expense', viewingTx.type === 'transfer' && 'text-transfer')}>{viewingTx.type === 'income' ? '+' : viewingTx.type === 'expense' ? '-' : ''}{formatCurrency(viewingTx.amount)}</span></div>
              {viewingTx.description && <div><span className="text-text-secondary">Description:</span> <span className="text-text-primary font-medium ml-1">{viewingTx.description}</span></div>}
              {viewingTx.merchant && <div><span className="text-text-secondary">Merchant:</span> <span className="text-text-primary ml-1">{viewingTx.merchant}</span></div>}
              {selectedCategory?.name && <div><span className="text-text-secondary">Category:</span> <span className="text-text-primary ml-1">{selectedCategory.name}</span></div>}
              {selectedPayment?.name && <div><span className="text-text-secondary">Payment Method:</span> <span className="text-text-primary ml-1">{selectedPayment.name}</span></div>}
              {selectedToPayment?.name && <div><span className="text-text-secondary">Destination:</span> <span className="text-text-primary ml-1">{selectedToPayment.name}</span></div>}
              {viewingTx.is_pending && <div><span className="text-text-secondary">Status:</span> <Badge variant="warning" className="ml-2">Pending</Badge></div>}
            </div>

            {viewingTx.notes && (
              <div className="p-3 bg-surface-hover rounded-xl text-sm">
                <p className="text-text-secondary mb-1">Notes</p>
                <p className="text-text-primary whitespace-pre-wrap">{viewingTx.notes}</p>
              </div>
            )}

            {viewingTx.is_recurring && (
              <div className="p-3 bg-surface-hover rounded-xl text-sm space-y-1">
                <p className="text-text-secondary">Recurring</p>
                {viewingTx.recurring_frequency && <p className="text-text-primary">Frequency: {viewingTx.recurring_frequency}</p>}
                {viewingTx.recurring_start_date && <p className="text-text-primary">Start: {formatDate(viewingTx.recurring_start_date)}</p>}
                {viewingTx.recurring_end_date && <p className="text-text-primary">End: {formatDate(viewingTx.recurring_end_date)}</p>}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => setViewingTx(null)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setEditingTx(viewingTx);
                  setViewingTx(null);
                }}
                className="flex-1"
              >
                Edit
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDeleteConfirm(viewingTx);
                  setViewingTx(null);
                }}
                className="flex-1"
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Transaction"
        size="sm"
      >
        <p className="text-text-secondary mb-6">
          Are you sure you want to delete "{deleteConfirm?.description}"? This action cannot be undone.
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
            onClick={() => handleDelete(deleteConfirm?.expense_id)}
            className="flex-1"
            data-testid="confirm-delete"
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
