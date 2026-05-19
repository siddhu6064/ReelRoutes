import React, { useState, useEffect, useCallback } from 'react';
import { useAppData } from '../contexts/AppDataContext';
import { Card, Button, Spinner } from '../components/ui';
import {
  Download,
  FileText,
  FileSpreadsheet,
  Calendar,
  Filter,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { getUserFriendlyError } from '../lib/errorMessages';
import { exportAPI } from '../services/api';

export default function ExportPage() {
  const { profiles, activeProfile, setActiveProfile, loading } = useAppData();

  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState(null);
  const [error, setError] = useState(null);

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  const loadExportPreview = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const response = await exportAPI.getJSON(
        activeProfile.profile_id,
        dateRange.start,
        dateRange.end,
      );
      setExportData(response.data);
      setError(null);
    } catch (error) {
      console.error('Failed to load export preview:', error);
      setError(getUserFriendlyError(error, 'Failed to load data. Please try again.'));
    }
  }, [activeProfile?.profile_id, dateRange.start, dateRange.end]);

  useEffect(() => {
    loadExportPreview();
  }, [loadExportPreview]);

  const handleExportCSV = useCallback(async () => {
    try {
      setExporting(true);
      const response = await exportAPI.getCSV(
        activeProfile.profile_id,
        dateRange.start,
        dateRange.end,
      );

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses_${activeProfile.name.toLowerCase()}_${dateRange.start}_${dateRange.end}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      setError(getUserFriendlyError(error, 'Failed to export CSV. Please try again.'));
    } finally {
      setExporting(false);
    }
  }, [activeProfile, dateRange]);

  const handleExportPDF = useCallback(async () => {
    try {
      setExporting(true);

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      const data = exportData;
      if (!data) return;

      // Header
      doc.setFontSize(20);
      doc.setTextColor(74, 109, 92);
      doc.text('Expense Report', 20, 20);

      doc.setFontSize(10);
      doc.setTextColor(115, 113, 109);
      doc.text(`Profile: ${activeProfile.name}`, 20, 30);
      doc.text(`Period: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`, 20, 36);
      doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 20, 42);

      // Summary
      doc.setFontSize(14);
      doc.setTextColor(43, 42, 40);
      doc.text('Summary', 20, 55);

      doc.setFontSize(10);
      let y = 65;
      doc.text(`Total Income: ${formatCurrency(data.summary.total_income)}`, 20, y);
      doc.text(`Total Expenses: ${formatCurrency(data.summary.total_expense)}`, 20, y + 6);
      doc.text(`Balance: ${formatCurrency(data.summary.balance)}`, 20, y + 12);
      doc.text(`Transactions: ${data.summary.transaction_count}`, 20, y + 18);

      // Category Breakdown
      y = 95;
      doc.setFontSize(14);
      doc.text('Category Breakdown', 20, y);

      doc.setFontSize(10);
      y += 10;
      data.category_breakdown.forEach((cat) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`${cat.name}: ${formatCurrency(cat.amount)}`, 25, y);
        y += 6;
      });

      // Transactions
      y += 10;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.text('Recent Transactions', 20, y);

      doc.setFontSize(9);
      y += 10;

      doc.setTextColor(115, 113, 109);
      doc.text('Date', 20, y);
      doc.text('Description', 45, y);
      doc.text('Category', 110, y);
      doc.text('Amount', 160, y);
      y += 6;

      doc.setTextColor(43, 42, 40);
      data.expenses.slice(0, 50).forEach((exp) => {
        if (y > 280) { doc.addPage(); y = 20; }
        const date = new Date(exp.date).toLocaleDateString();
        const desc = exp.description?.substring(0, 25) || '';
        const cat = exp.category_name?.substring(0, 20) || '';
        const amount = exp.type === 'income' ? `+${formatCurrency(exp.amount)}` :
                       exp.type === 'expense' ? `-${formatCurrency(exp.amount)}` :
                       formatCurrency(exp.amount);

        doc.text(date, 20, y);
        doc.text(desc, 45, y);
        doc.text(cat, 110, y);
        doc.text(amount, 160, y);
        y += 5;
      });

      doc.save(`expenses_${activeProfile.name.toLowerCase()}_${dateRange.start}_${dateRange.end}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      setError(getUserFriendlyError(error, 'Failed to export PDF. Please try again.'));
    } finally {
      setExporting(false);
    }
  }, [activeProfile, dateRange, exportData]);

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
            Export Data
          </h1>
          <p className="text-text-secondary mt-1">Download your financial data</p>
        </div>

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
      </div>

      {/* Date Range */}
      <Card>
        <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-primary" />
          Date Range
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full px-4 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              data-testid="start-date"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full px-4 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              data-testid="end-date"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const now = new Date();
              setDateRange({
                start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
                end: now.toISOString().split('T')[0],
              });
            }}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border-color transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setDateRange({
                start: new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0],
                end: now.toISOString().split('T')[0],
              });
            }}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border-color transition-colors"
          >
            This Year
          </button>
          <button
            onClick={() => {
              const now = new Date();
              const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              setDateRange({
                start: lastMonth.toISOString().split('T')[0],
                end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0],
              });
            }}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border-color transition-colors"
          >
            Last Month
          </button>
        </div>
      </Card>

      {/* Export Preview */}
      {exportData && (
        <Card>
          <h2 className="text-lg font-bold font-heading text-text-primary mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5 text-brand-primary" />
            Export Preview
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-income-bg rounded-xl">
              <p className="text-sm text-income">Total Income</p>
              <p className="text-xl font-bold text-income">{formatCurrency(exportData.summary.total_income)}</p>
            </div>
            <div className="p-4 bg-expense-bg rounded-xl">
              <p className="text-sm text-expense">Total Expenses</p>
              <p className="text-xl font-bold text-expense">{formatCurrency(exportData.summary.total_expense)}</p>
            </div>
            <div className="p-4 bg-brand-primary/10 rounded-xl">
              <p className="text-sm text-brand-primary">Balance</p>
              <p className="text-xl font-bold text-brand-primary">{formatCurrency(exportData.summary.balance)}</p>
            </div>
            <div className="p-4 bg-surface-hover rounded-xl">
              <p className="text-sm text-text-secondary">Transactions</p>
              <p className="text-xl font-bold text-text-primary">{exportData.summary.transaction_count}</p>
            </div>
          </div>

          {exportData.category_breakdown.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-text-secondary mb-3">Top Categories</h3>
              <div className="space-y-2">
                {exportData.category_breakdown.slice(0, 5).map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-text-primary">{cat.name}</span>
                    <span className="font-semibold text-text-primary">{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card hover className="cursor-pointer" onClick={handleExportCSV}>
          <div className="flex items-center gap-4">
            <div className="p-4 bg-income-bg rounded-xl">
              <FileSpreadsheet className="w-8 h-8 text-income" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary">Export as CSV</h3>
              <p className="text-sm text-text-secondary">Spreadsheet format for Excel, Google Sheets</p>
            </div>
            <Button disabled={exporting} data-testid="export-csv-button">
              {exporting ? <Spinner size="sm" /> : <Download className="w-5 h-5" />}
            </Button>
          </div>
        </Card>

        <Card hover className="cursor-pointer" onClick={handleExportPDF}>
          <div className="flex items-center gap-4">
            <div className="p-4 bg-expense-bg rounded-xl">
              <FileText className="w-8 h-8 text-expense" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary">Export as PDF</h3>
              <p className="text-sm text-text-secondary">Formatted report for printing or sharing</p>
            </div>
            <Button disabled={exporting} data-testid="export-pdf-button">
              {exporting ? <Spinner size="sm" /> : <Download className="w-5 h-5" />}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
