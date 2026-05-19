import { expect, test, type Page } from '@playwright/test';

type Tx = {
  expense_id: string;
  user_id?: string;
  profile_id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  category_id: string | null;
  payment_method_id: string;
  to_payment_method_id: string | null;
  description: string;
  merchant: string | null;
  notes: string | null;
  date: string;
  is_pending?: boolean;
  is_recurring?: boolean;
  created_at: string;
  updated_at: string;
};

async function installMockApi(page: Page) {
  const now = new Date().toISOString();
  const state = {
    user: null as null | { user_id: string; name: string; email: string },
    token: 'smoke-token',
    deleted: false,
    profile: {
      profile_id: 'profile_personal',
      user_id: 'user_smoke',
      name: 'Personal',
      profile_type: 'personal',
      is_default: true,
      created_at: now,
      updated_at: now,
    },
    profiles: [
      {
        profile_id: 'profile_personal',
        user_id: 'user_smoke',
        name: 'Personal',
        profile_type: 'personal',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
      {
        profile_id: 'profile_shared',
        user_id: 'user_smoke',
        name: 'Shared',
        profile_type: 'shared',
        is_default: false,
        created_at: now,
        updated_at: now,
      },
      {
        profile_id: 'profile_empty',
        user_id: 'user_smoke',
        name: 'Travel',
        profile_type: 'personal',
        is_default: false,
        created_at: now,
        updated_at: now,
      },
    ],
    categories: [
      {
        category_id: 'cat_food',
        profile_id: 'profile_personal',
        name: 'Food & Dining',
        color: '#ef4444',
        icon: 'restaurant',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
    ],
    paymentMethods: [
      {
        payment_id: 'pm_cash',
        profile_id: 'profile_personal',
        name: 'Cash',
        type: 'cash',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
    ],
    expenses: [] as Tx[],
    budgets: [] as Array<{
      budget_id: string;
      profile_id: string;
      category_id: string | null;
      amount: number;
      period: string;
    }>,
    insightsV2Mode: 'normal' as 'normal' | 'empty' | 'error' | 'no_budget' | 'no_spike' | 'category_trend',
    smartMetricsMode: 'normal' as 'normal' | 'loading' | 'empty' | 'error',
    aiChatMode: 'success' as 'success' | 'error',
    subscriptionsMode: 'ready' as 'ready' | 'loading' | 'empty' | 'error',
    weeklyDigestMode: 'success' as 'success' | 'loading' | 'empty' | 'error',
    savingsGoalsMode: 'success' as 'success' | 'loading' | 'empty' | 'error',
    apiLog: [] as Array<{ method: string; path: string; status: number; matched: boolean }>,
    smartMetricsIntercept: {
      requests: [] as Array<{
        requestId: number;
        url: string;
        method: string;
        matched: boolean;
        action: 'fulfilled' | 'continued' | 'aborted' | 'unhandled';
        status: number | null;
        finished: boolean;
        failed: boolean;
        failureText: string | null;
      }>,
      nextRequestId: 1,
      hitCount: 0,
      fulfilledCount: 0,
      continuedCount: 0,
      abortedCount: 0,
    },
  };

  const normalizeCategoryId = (categoryId: string | null | undefined) =>
    !categoryId || categoryId === 'all' || categoryId === 'total' ? null : categoryId;

  const normalizePeriod = (period: string | null | undefined) =>
    period === 'weekly' || period === 'monthly' || period === 'yearly' ? period : 'monthly';

  const normalizeProfileId = (profileId: string | null | undefined) => {
    if (!profileId || profileId === 'undefined' || profileId === 'null') {
      return state.profile.profile_id;
    }
    return profileId;
  };

  const buildBudgetProgress = (profileId: string) => {
    const expenseTx = state.expenses.filter(
      (tx) => tx.type === 'expense' && tx.profile_id === profileId,
    );

    const asProgress = (budget: {
      budget_id: string;
      category_id: string | null;
      amount: number;
      period: string;
    }) => {
      const spent = expenseTx
        .filter((tx) =>
          normalizeCategoryId(budget.category_id)
            ? tx.category_id === normalizeCategoryId(budget.category_id)
            : true
        )
        .reduce((sum, tx) => sum + tx.amount, 0);

      const percentage = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;

      return {
        budget_id: budget.budget_id,
        category_id: normalizeCategoryId(budget.category_id),
        amount: budget.amount,
        period: budget.period,
        spent,
        percentage,
        remaining: budget.amount - spent,
        is_over_budget: spent > budget.amount,
      };
    };

    const total =
      state.budgets.find(
        (budget) => budget.profile_id === profileId && normalizeCategoryId(budget.category_id) === null,
      ) || null;

    const categories = state.budgets
      .filter((budget) => budget.profile_id === profileId && normalizeCategoryId(budget.category_id) !== null)
      .map(asProgress);

    return {
      budgets: categories,
      total_budget: total ? asProgress(total) : null,
    };
  };

  const isSmartMetricsRequest = (url: string) => {
    try {
      const pathname = new URL(url).pathname.replace(/\/+$/, '');
      return pathname.endsWith('/dashboard/metrics');
    } catch {
      return /\/dashboard\/metrics(?:\/|\?|$)/.test(url);
    }
  };

  const logSmartMetricsDiag = (tag: string, payload: {
    method?: string;
    url: string;
    pathname?: string;
    search?: string;
    status?: number;
    mode?: string;
    action?: string;
  }) => {
    const pathname = payload.pathname ?? 'unknown';
    const search = payload.search ?? '';
    const method = payload.method ?? 'unknown';
    const status = typeof payload.status === 'number' ? ` status=${payload.status}` : '';
    const mode = payload.mode ? ` mode=${payload.mode}` : '';
    const action = payload.action ? ` action=${payload.action}` : '';
    console.log(`[smart-metrics-diag] ${tag} method=${method} url=${payload.url} path=${pathname} search=${search}${status}${mode}${action}`);
  };

  const findLastTrackedRequest = (url: string, method: string) =>
    [...state.smartMetricsIntercept.requests]
      .reverse()
      .find((entry) => entry.url === url && entry.method === method && !entry.finished && !entry.failed);

  page.on('request', (request) => {
    const url = request.url();
    if (!isSmartMetricsRequest(url)) return;
    const parsedUrl = new URL(url);
    logSmartMetricsDiag('event.request', {
      method: request.method(),
      url,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
    });
    state.smartMetricsIntercept.requests.push({
      requestId: state.smartMetricsIntercept.nextRequestId,
      url,
      method: request.method(),
      matched: false,
      action: 'unhandled',
      status: null,
      finished: false,
      failed: false,
      failureText: null,
    });
    state.smartMetricsIntercept.nextRequestId += 1;
  });

  page.on('response', (response) => {
    const url = response.url();
    if (!isSmartMetricsRequest(url)) return;
    const parsedUrl = new URL(url);
    logSmartMetricsDiag('event.response', {
      method: response.request().method(),
      url,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      status: response.status(),
    });
  });

  page.on('console', (message) => {
    const text = message.text();
    if (
      !text.includes('[smart-metrics-flow]')
      && !text.includes('smart-metrics-request-state')
      && !text.includes('smart-metrics-mode')
    ) {
      return;
    }
    console.log(`[browser-console] ${text}`);
  });

  page.on('requestfinished', (request) => {
    const url = request.url();
    if (!isSmartMetricsRequest(url)) return;
    const tracked = findLastTrackedRequest(url, request.method());
    if (tracked) {
      tracked.finished = true;
    }
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!isSmartMetricsRequest(url)) return;
    const tracked = findLastTrackedRequest(url, request.method());
    if (tracked) {
      tracked.failed = true;
      tracked.failureText = request.failure()?.errorText || 'unknown';
    }
  });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const isDashboardMetricsPath = /\/dashboard\/metrics\/?$/.test(path);
    if (isDashboardMetricsPath) {
      logSmartMetricsDiag('route.api.seen', {
        method,
        url: req.url(),
        pathname: path,
        search: url.search,
      });
    }

    const json = (body: unknown, status = 200, matched = true) => {
      state.apiLog.push({ method, path, status, matched });
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    };

    if (method === 'OPTIONS' && path.startsWith('/api/')) {
      state.apiLog.push({ method, path, status: 204, matched: true });
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'Content-Type, Authorization',
        },
      });
    }

    if (isDashboardMetricsPath && method === 'GET') {
      const trackedRequest = findLastTrackedRequest(req.url(), method);
      const trackedEntry = trackedRequest || (() => {
        const synthetic = {
          requestId: state.smartMetricsIntercept.nextRequestId,
          url: req.url(),
          method,
          matched: false,
          action: 'unhandled' as const,
          status: null as number | null,
          finished: false,
          failed: false,
          failureText: null as string | null,
        };
        state.smartMetricsIntercept.requests.push(synthetic);
        state.smartMetricsIntercept.nextRequestId += 1;
        return synthetic;
      })();

      state.smartMetricsIntercept.hitCount += 1;

      const fulfill = async (body: unknown, status = 200) => {
        state.smartMetricsIntercept.fulfilledCount += 1;
        trackedEntry.matched = true;
        trackedEntry.action = 'fulfilled';
        trackedEntry.status = status;
        logSmartMetricsDiag('route.api.fulfill', {
          method,
          url: req.url(),
          pathname: path,
          search: url.search,
          status,
          mode: state.smartMetricsMode,
          action: 'fulfilled',
        });
        return route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      };

      if (state.smartMetricsMode === 'error') {
        return fulfill({ error: { code: 'SERVER_ERROR', message: 'failed' } }, 503);
      }

      if (state.smartMetricsMode === 'empty') {
        return fulfill(null);
      }

      if (state.smartMetricsMode === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return fulfill({
        savings_score: {
          value: 74,
          has_sufficient_data: true,
          components: {
            goals_progress: 70,
            budget_adherence: 72,
            discretionary_trend: 80,
          },
        },
        spend_velocity: {
          value: 210.5,
          recent_daily_average: 30.07,
          recent_weekly_average: 210.5,
          transaction_cadence: 0.85,
          has_sufficient_data: true,
        },
        financial_health_score: {
          value: 69,
          has_sufficient_data: true,
          components: {
            net_position: 65,
            savings_behavior: 71,
            budget_pressure: 54,
            goal_progress: 68,
          },
        },
        budget_confidence: {
          value: 73,
          has_sufficient_data: true,
          components: {
            forecast_alignment: 70,
            remaining_budget_ratio: 76,
            historical_consistency: 72,
          },
        },
        top_category_summary: {
          category_name: 'Food & Dining',
          amount: 120.5,
          share_of_expenses: 0.34,
          has_sufficient_data: true,
        },
        projected_savings_summary: {
          projected_savings: 430.75,
          basis: 'net_minus_velocity_remaining_spend',
          has_sufficient_data: true,
        },
      });
    }

    if (path === '/api/auth/register' && method === 'POST') {
      const body = req.postDataJSON() as { email: string; name: string };
      state.user = {
        user_id: 'user_smoke',
        name: body.name,
        email: body.email,
      };

      return json({
        user: {
          ...state.user,
          auth_provider: 'email',
          picture: null,
          created_at: now,
        },
        session_token: state.token,
      });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      if (!state.user) {
        state.user = {
          user_id: 'user_smoke',
          name: 'Smoke User',
          email: 'smoke@example.com',
        };
      }

      return json({
        user: {
          ...state.user,
          auth_provider: 'email',
          picture: null,
          created_at: now,
        },
        session_token: state.token,
      });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      if (state.deleted || !state.user) {
        return json(
          { error: { code: 'UNAUTHORIZED', message: 'Invalid session' } },
          401,
        );
      }

      return json({
        ...state.user,
        auth_provider: 'email',
        picture: null,
        created_at: now,
      });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      return json({ message: 'Logged out successfully' });
    }

    if (path === '/api/auth/account' && method === 'DELETE') {
      state.deleted = true;
      state.user = null;
      state.expenses = [];
      return json({ message: 'Account deleted successfully' });
    }

    if (path === '/api/profiles' && method === 'GET') {
      return json(state.profiles);
    }

    if (path === '/api/categories' && method === 'GET') {
      return json(state.categories);
    }

    if (path === '/api/payment-methods' && method === 'GET') {
      return json(state.paymentMethods);
    }

    if (path === '/api/expenses' && method === 'POST') {
      const body = req.postDataJSON() as Omit<Tx, 'expense_id' | 'created_at' | 'updated_at'>;
      const timestamp = new Date().toISOString();

      const expense: Tx = {
        ...body,
        expense_id: `exp_${state.expenses.length + 1}`,
        user_id: state.user?.user_id,
        created_at: timestamp,
        updated_at: timestamp,
      };

      state.expenses.unshift(expense);
      return json(expense);
    }

    if (path.startsWith('/api/expenses/') && method === 'PUT') {
      const expenseId = path.split('/').pop();
      const body = req.postDataJSON() as Partial<Tx>;
      const existing = state.expenses.find((expense) => expense.expense_id === expenseId);

      if (!existing) {
        return json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } }, 404);
      }

      const updated: Tx = {
        ...existing,
        ...body,
        expense_id: existing.expense_id,
        user_id: existing.user_id || state.user?.user_id,
        updated_at: new Date().toISOString(),
      };

      state.expenses = state.expenses.map((expense) =>
        expense.expense_id === expenseId ? updated : expense,
      );
      return json(updated);
    }

    if (path.startsWith('/api/expenses/') && method === 'DELETE') {
      const expenseId = path.split('/').pop();
      const existing = state.expenses.find((expense) => expense.expense_id === expenseId);

      if (!existing) {
        return json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } }, 404);
      }

      state.expenses = state.expenses.filter((expense) => expense.expense_id !== expenseId);
      return json({ message: 'Transaction deleted successfully.' });
    }

    if (path === '/api/expenses' && method === 'GET') {
      const type = url.searchParams.get('type');
      const profileId = url.searchParams.get('profile_id');
      const categoryId = url.searchParams.get('category_id');
      const paymentMethodId = url.searchParams.get('payment_method_id');
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();

      const filteredExpenses = state.expenses.filter((expense) => {
        if (profileId && expense.profile_id !== profileId) return false;
        if (type && type !== 'all' && expense.type !== type) return false;
        if (categoryId && categoryId !== 'all' && expense.category_id !== categoryId) return false;
        if (paymentMethodId && paymentMethodId !== 'all' && expense.payment_method_id !== paymentMethodId) return false;

        if (query) {
          const haystack =
            `${expense.description || ''} ${expense.notes || ''} ${expense.merchant || ''}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }

        return true;
      });

      return json(
        filteredExpenses.map((expense) => ({
          ...expense,
          user_id: expense.user_id || state.user?.user_id,
          created_at: expense.created_at || new Date().toISOString(),
          updated_at: expense.updated_at || new Date().toISOString(),
        })),
      );
    }

    if (path === '/api/export/json' && method === 'GET') {
      return json({
        expenses: state.expenses,
        summary: {
          total_income: 0,
          total_expense: state.expenses.reduce((sum, expense) => sum + expense.amount, 0),
          total_transfer: 0,
          balance: 0,
          transaction_count: state.expenses.length,
        },
        category_breakdown: [],
        period: { start: now, end: now },
      });
    }

    if (path === '/api/export/csv' && method === 'GET') {
      state.apiLog.push({ method, path, status: 200, matched: true });
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'Date,Type,Description,Amount\n2026-01-01,expense,Coffee,4.5\n',
      });
    }

    if (path === '/api/stats/summary' && method === 'GET') {
      const profileId = normalizeProfileId(url.searchParams.get('profile_id'));
      const allExpenseTx = state.expenses.filter((expense) => expense.type === 'expense');
      const profileExpenses = allExpenseTx.filter((expense) => expense.profile_id === profileId);
      const effectiveExpenses = profileExpenses.length > 0 ? profileExpenses : allExpenseTx;

      const total = effectiveExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      const count = effectiveExpenses.length;
      const average = count > 0 ? total / count : 0;

      const byCategoryMap = new Map<string, { amount: number; category_id: string; name: string; color: string; icon: string }>();
      for (const expense of effectiveExpenses) {
        const categoryId = expense.category_id || 'uncategorized';
        const category = state.categories.find((item) => item.category_id === expense.category_id);
        const existing = byCategoryMap.get(categoryId);

        if (existing) {
          existing.amount += expense.amount;
        } else {
          byCategoryMap.set(categoryId, {
            category_id: categoryId,
            name: category?.name || 'Uncategorized',
            color: category?.color || '#73716D',
            icon: category?.icon || 'circle',
            amount: Number(expense.amount),
          });
        }
      }

      const by_category = Array.from(byCategoryMap.values()).map((item) => ({
        ...item,
        percentage: total > 0 ? Number(((item.amount / total) * 100).toFixed(1)) : 0,
      }));

      return json({ total, count, average, by_category });
    }

    if (path === '/api/insights' && method === 'GET') {
      const profileId = normalizeProfileId(url.searchParams.get('profile_id'));
      const profileTx = state.expenses.filter((expense) => expense.profile_id === profileId);
      const effectiveTx = profileTx.length > 0 ? profileTx : state.expenses;

      const thisMonthExpense = effectiveTx
        .filter((expense) => expense.type === 'expense')
        .reduce((sum, expense) => sum + Number(expense.amount), 0);
      const thisMonthIncome = effectiveTx
        .filter((expense) => expense.type === 'income')
        .reduce((sum, expense) => sum + Number(expense.amount), 0);

      return json({
        stats: {
          this_week_income: thisMonthIncome,
          this_week_total: thisMonthExpense,
          last_week_income: 0,
          last_week_total: 0,
          this_month_income: thisMonthIncome,
          this_month_total: thisMonthExpense,
          last_month_income: 0,
          last_month_total: 0,
        },
        insights: [],
      });
    }

    if (path === '/api/insights/v2' && method === 'GET') {
      if (state.insightsV2Mode === 'error') {
        return json({ error: { code: 'SERVER_ERROR', message: 'failed' } }, 500);
      }

      if (state.insightsV2Mode === 'empty' || state.insightsV2Mode === 'no_budget') {
        if (state.insightsV2Mode === 'empty') {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return json({
          profile_id: state.profile.profile_id,
          weekly: {
            period_type: 'weekly',
            current_total: 0,
            previous_total: 0,
            delta_amount: 0,
            delta_percent: 0,
            category_comparisons: [],
            anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 0, severity: 'info' }, category_spend_spikes: [] },
            budget_risk: { period_type: 'weekly', status: 'no_budget', budget_amount: 0, current_spend: 0, progress_percent: 0, remaining_days: 0, risk_score: 0, severity: 'info' },
            insight_metadata: { schema_version: 'v2', period_type: 'weekly', total_comparison: { period_type: 'weekly', current_total: 0, previous_total: 0, delta_amount: 0, delta_percent: 0 }, category_comparisons: [], anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 0, severity: 'info' }, category_spend_spikes: [] }, budget_risk: { period_type: 'weekly', status: 'no_budget', budget_amount: 0, current_spend: 0, progress_percent: 0, remaining_days: 0, risk_score: 0, severity: 'info' } },
          },
          monthly: {
            period_type: 'monthly',
            current_total: 0,
            previous_total: 0,
            delta_amount: 0,
            delta_percent: 0,
            category_comparisons: [],
            anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 0, severity: 'info' }, category_spend_spikes: [] },
            budget_risk: { period_type: 'monthly', status: state.insightsV2Mode === 'no_budget' ? 'no_budget' : 'ok', budget_amount: 0, current_spend: 0, progress_percent: 0, remaining_days: 0, risk_score: 0, severity: 'info' },
            insight_metadata: { schema_version: 'v2', period_type: 'monthly', total_comparison: { period_type: 'monthly', current_total: 0, previous_total: 0, delta_amount: 0, delta_percent: 0 }, category_comparisons: [], anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 0, severity: 'info' }, category_spend_spikes: [] }, budget_risk: { period_type: 'monthly', status: state.insightsV2Mode === 'no_budget' ? 'no_budget' : 'ok', budget_amount: 0, current_spend: 0, progress_percent: 0, remaining_days: 0, risk_score: 0, severity: 'info' } },
          },
        });
      }

      if (state.insightsV2Mode === 'no_spike') {
        return json({
          profile_id: state.profile.profile_id,
          weekly: {
            period_type: 'weekly',
            current_total: 90,
            previous_total: 100,
            delta_amount: -10,
            delta_percent: -10,
            category_comparisons: [],
            anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: -10, severity: 'info' }, category_spend_spikes: [] },
            budget_risk: { period_type: 'weekly', status: 'ok', budget_amount: 400, current_spend: 90, progress_percent: 22.5, remaining_days: 3, risk_score: 5, severity: 'info' },
            insight_metadata: {},
          },
          monthly: {
            period_type: 'monthly',
            current_total: 300,
            previous_total: 280,
            delta_amount: 20,
            delta_percent: 7.14,
            category_comparisons: [],
            anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 7.14, severity: 'info' }, category_spend_spikes: [] },
            budget_risk: { period_type: 'monthly', status: 'ok', budget_amount: 700, current_spend: 300, progress_percent: 42.8, remaining_days: 12, risk_score: 20, severity: 'info' },
            insight_metadata: {},
          },
        });
      }

      if (state.insightsV2Mode === 'category_trend') {
        return json({
          profile_id: state.profile.profile_id,
          weekly: {
            period_type: 'weekly',
            current_total: 110,
            previous_total: 105,
            delta_amount: 5,
            delta_percent: 4.76,
            category_comparisons: [],
            anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 4.76, severity: 'info' }, category_spend_spikes: [] },
            budget_risk: { period_type: 'weekly', status: 'ok', budget_amount: 500, current_spend: 110, progress_percent: 22, remaining_days: 3, risk_score: 10, severity: 'info' },
            insight_metadata: {},
          },
          monthly: {
            period_type: 'monthly',
            current_total: 320,
            previous_total: 310,
            delta_amount: 10,
            delta_percent: 3.22,
            category_comparisons: [
              { category: 'Food & Dining', current_total: 180, previous_total: 120, delta_amount: 60, delta_percent: 50 },
              { category: 'Transport', current_total: 40, previous_total: 80, delta_amount: -40, delta_percent: -50 },
            ],
            anomalies: { total_spend_spike: { detected: false, threshold_percent: 50, delta_percent: 3.22, severity: 'info' }, category_spend_spikes: [] },
            budget_risk: { period_type: 'monthly', status: 'ok', budget_amount: 900, current_spend: 320, progress_percent: 35.5, remaining_days: 12, risk_score: 12, severity: 'info' },
            insight_metadata: {},
          },
        });
      }

      return json({
        profile_id: state.profile.profile_id,
        weekly: {
          period_type: 'weekly',
          current_total: 140,
          previous_total: 90,
          delta_amount: 50,
          delta_percent: 55.56,
          category_comparisons: [],
          anomalies: { total_spend_spike: { detected: true, threshold_percent: 50, delta_percent: 55.56, severity: 'warning' }, category_spend_spikes: [] },
          budget_risk: { period_type: 'weekly', status: 'ok', budget_amount: 300, current_spend: 140, progress_percent: 46.7, remaining_days: 2, risk_score: 45, severity: 'warning' },
          insight_metadata: {},
        },
        monthly: {
          period_type: 'monthly',
          current_total: 480,
          previous_total: 300,
          delta_amount: 180,
          delta_percent: 60,
          category_comparisons: [],
          anomalies: { total_spend_spike: { detected: true, threshold_percent: 50, delta_percent: 60, severity: 'warning' }, category_spend_spikes: [] },
          budget_risk: { period_type: 'monthly', status: 'ok', budget_amount: 800, current_spend: 480, progress_percent: 60, remaining_days: 11, risk_score: 52, severity: 'warning' },
          insight_metadata: {},
        },
      });
    }

    if (path.startsWith('/api/analytics/') && method === 'GET') {
      if (path.endsWith('/summary')) {
        return json({
          total_spend: 12.5,
          total_income: 0,
          net_balance: -12.5,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        });
      }

      if (path.endsWith('/category-breakdown')) {
        return json({
          items: [
            {
              category_id: 'cat_food',
              category_name: 'Food & Dining',
              amount: 12.5,
              percentage: 100,
            },
          ],
        });
      }

      if (path.endsWith('/payment-method-breakdown')) {
        return json({
          items: [
            {
              payment_method_id: 'pm_cash',
              payment_method_name: 'Cash',
              amount: 12.5,
            },
          ],
        });
      }

      if (path.endsWith('/monthly-trend')) {
        return json({ items: [{ month: '2026-01', amount: 12.5 }] });
      }
    }

    if (path.startsWith('/api/insights/') && method === 'GET') {
      return json({
        insights: [
          {
            type: 'top_category',
            severity: 'info',
            title: 'Top spending category',
            message: 'Food & Dining is your largest expense category.',
            metric: { category: 'Food & Dining', share_pct: 100 },
          },
        ],
      });
    }

    if (path === '/api/subscriptions/summary' && method === 'GET') {
      const requestedProfileId = url.searchParams.get('profile_id');
      const profileId = normalizeProfileId(requestedProfileId);
      if (state.subscriptionsMode === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (state.subscriptionsMode === 'error') {
        return json({ error: { code: 'SUBSCRIPTIONS_UNAVAILABLE', message: 'failed' } }, 503);
      }

      if (state.subscriptionsMode === 'empty' || profileId === 'profile_empty') {
        return json({
          user_id: state.user?.user_id || 'user_smoke',
          profile_id: profileId,
          totals: {
            monthly_recurring_total: 0,
            annual_recurring_estimate: 0,
            candidate_count: 0,
          },
          candidates: [],
        });
      }

      return json({
        user_id: state.user?.user_id || 'user_smoke',
        profile_id: profileId,
        totals: {
          monthly_recurring_total: profileId === 'profile_shared' ? 41.5 : 22.49,
          annual_recurring_estimate: profileId === 'profile_shared' ? 498 : 269.88,
          candidate_count: 2,
        },
        candidates: profileId === 'profile_shared'
          ? [
            {
              merchant_display: 'YouTube Premium',
              merchant_normalized: 'youtube',
              average_amount: 13.5,
              interval: 'monthly',
              confidence: 0.89,
            },
            {
              merchant_display: 'Hulu',
              merchant_normalized: 'hulu',
              average_amount: 28,
              interval: 'monthly',
              confidence: 0.84,
            },
          ]
          : [
            {
              merchant_display: 'Netflix',
              merchant_normalized: 'netflix',
              average_amount: 12.99,
              interval: 'monthly',
              confidence: 0.91,
            },
            {
              merchant_display: 'Spotify',
              merchant_normalized: 'spotify',
              average_amount: 9.5,
              interval: 'monthly',
              confidence: 0.87,
            },
          ],
      });
    }

    if (path === '/api/savings-goals' && method === 'GET') {
      const requestedProfileId = url.searchParams.get('profile_id');
      const profileId = normalizeProfileId(requestedProfileId);

      if (state.savingsGoalsMode === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (state.savingsGoalsMode === 'error') {
        return json({ error: { code: 'SAVINGS_GOALS_UNAVAILABLE', message: 'failed' } }, 503);
      }

      if (state.savingsGoalsMode === 'empty' || profileId === 'profile_empty') {
        return json([]);
      }

      return json([
        {
          goal_id: profileId === 'profile_shared' ? 'goal_house' : 'goal_emergency',
          title: profileId === 'profile_shared' ? 'Home Upgrade Fund' : 'Emergency Fund',
          target_amount: profileId === 'profile_shared' ? 5000 : 1000,
          current_amount: profileId === 'profile_shared' ? 1250 : 400,
          status: 'active',
          deadline: profileId === 'profile_shared' ? '2026-12-31' : '2026-10-15',
          progress_percentage: profileId === 'profile_shared' ? 25 : 40,
          projected_completion: {
            months_remaining: profileId === 'profile_shared' ? 10.2 : 6,
            basis: 'monthly_savings_rate',
          },
        },
      ]);
    }

    if (path === '/api/ai/chat-insights' && method === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (state.aiChatMode === 'error') {
        return json({ error: { code: 'AI_UNAVAILABLE', message: 'failed' } }, 503);
      }
      return json({
        recommendation: {
          title: 'Focus on dining this week',
          summary: 'Dining spend is elevated versus your recent baseline.',
          actions: ['Set a dining cap for the next 7 days.'],
        },
      });
    }

    if (path === '/api/weekly-digest' && method === 'GET') {
      const requestedProfileId = url.searchParams.get('profile_id');
      const profileId = normalizeProfileId(requestedProfileId);

      if (state.weeklyDigestMode === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (state.weeklyDigestMode === 'error') {
        return json({ error: { code: 'WEEKLY_DIGEST_UNAVAILABLE', message: 'failed' } }, 503);
      }

      if (state.weeklyDigestMode === 'empty' || profileId === 'profile_empty') {
        return json({
          week: { start_date: '2026-04-06', end_date: '2026-04-12' },
          summary: { income_total: 0, expense_total: 0, net_total: 0, transaction_count: 0 },
          comparisons: { previous_week_net_delta: 0 },
          highlights: { top_category_name: null, top_category_amount: 0, savings_rate: null },
          signals: { unusual_spending_detected: false, largest_expense: null },
          breakdown: { top_expense_categories: [] },
          state: 'empty',
          profile_id: profileId,
        });
      }

      return json({
        week: { start_date: '2026-04-06', end_date: '2026-04-12' },
        summary: profileId === 'profile_shared'
          ? { income_total: 920, expense_total: 410, net_total: 510, transaction_count: 4 }
          : { income_total: 500, expense_total: 120, net_total: 380, transaction_count: 2 },
        comparisons: { previous_week_net_delta: profileId === 'profile_shared' ? 80 : 50 },
        highlights: profileId === 'profile_shared'
          ? { top_category_name: 'Home', top_category_amount: 260, savings_rate: 0.55 }
          : { top_category_name: 'Food & Dining', top_category_amount: 120, savings_rate: 0.76 },
        signals: {
          unusual_spending_detected: false,
          largest_expense: profileId === 'profile_shared'
            ? { amount: 260, merchant: 'Home Depot', description: 'Home supplies', category_id: 'cat_home' }
            : { amount: 120, merchant: 'Grocery Mart', description: 'Groceries', category_id: 'cat_food' },
        },
        breakdown: profileId === 'profile_shared'
          ? { top_expense_categories: [{ category_id: 'cat_home', total_amount: 260 }] }
          : { top_expense_categories: [{ category_id: 'cat_food', total_amount: 120 }] },
        state: 'success',
        profile_id: profileId,
      });
    }

    if (path === '/api/weekly-digest/latest' && method === 'GET') {
      return json({ digest: null, latest: null });
    }

    if (path === '/api/weekly-digest/latest/dismiss' && method === 'POST') {
      return json({ dismissed: true });
    }

    if (path === '/api/budgets/progress' && method === 'GET') {
      const requestedProfileId = url.searchParams.get('profile_id');
      const profileId = normalizeProfileId(requestedProfileId);
      const progress = buildBudgetProgress(profileId);

      if (!progress.total_budget && profileId !== state.profile.profile_id) {
        const fallbackProgress = buildBudgetProgress(state.profile.profile_id);
        return json(fallbackProgress);
      }

      return json(progress);
    }

    if (path === '/api/budgets' && method === 'POST') {
      const body = req.postDataJSON() as {
        profile_id: string;
        category_id: string | null;
        amount: number;
        period: string;
      };

      console.log('budget-create-request', body);

      const budget = {
        budget_id: `budget_${state.budgets.length + 1}`,
        profile_id: normalizeProfileId(body.profile_id),
        category_id: normalizeCategoryId(body.category_id),
        amount: Number(body.amount),
        period: normalizePeriod(body.period),
      };

      state.budgets.push(budget);
      return json(budget, 201);
    }

    return json(
      { error: { code: 'NOT_FOUND', message: `${method} ${path} not mocked` } },
      404,
      false,
    );
  });

  return {
    getApiLog: () => [...state.apiLog],
    getSmartMetricsInterceptDiagnostics: () => {
      const requests = state.smartMetricsIntercept.requests.map((entry) => ({ ...entry }));
      return {
        ...state.smartMetricsIntercept,
        requests,
        hangingRequests: requests.filter((entry) => !entry.finished && !entry.failed),
      };
    },
    setInsightsV2Mode: (mode: 'normal' | 'empty' | 'error' | 'no_budget' | 'no_spike' | 'category_trend') => { state.insightsV2Mode = mode; },
    setSmartMetricsMode: (mode: 'normal' | 'loading' | 'empty' | 'error') => { state.smartMetricsMode = mode; },
    setAiChatMode: (mode: 'success' | 'error') => { state.aiChatMode = mode; },
    setSubscriptionsMode: (mode: 'ready' | 'loading' | 'empty' | 'error') => { state.subscriptionsMode = mode; },
    setWeeklyDigestMode: (mode: 'success' | 'loading' | 'empty' | 'error') => { state.weeklyDigestMode = mode; },
    setSavingsGoalsMode: (mode: 'success' | 'loading' | 'empty' | 'error') => { state.savingsGoalsMode = mode; },
  };
}

async function registerAndOpenDashboard(page: Page) {
  await page.goto('/login');
  await page.getByTestId('create-account-button').click();
  await page.getByTestId('name-input').fill('Smoke User');
  await page.getByTestId('register-email-input').fill('smoke@example.com');
  await page.getByTestId('register-password-input').fill('secret123');
  await page.getByTestId('register-submit-button').click();
  await expect(page).toHaveURL('/');
}

async function logSmartMetricsDomDebug(page: Page, label: string) {
  const [stage, mode, requestState] = await Promise.all([
    page.getByTestId('smart-metrics-debug-last-stage').textContent().catch(() => null),
    page.getByTestId('smart-metrics-mode').textContent().catch(() => null),
    page.getByTestId('smart-metrics-request-state').textContent().catch(() => null),
  ]);
  console.log(`[smart-metrics-dom] ${label} stage=${stage || ''} mode=${mode || ''} requestState=${requestState || ''}`);
}

function assertDeterministicSmartMetricsIntercept(intercept: {
  requests: Array<{
    url: string;
    method: string;
    matched: boolean;
    action: 'fulfilled' | 'continued' | 'aborted' | 'unhandled';
    finished: boolean;
    failed: boolean;
    status: number | null;
  }>;
  hitCount: number;
  fulfilledCount: number;
  hangingRequests: Array<unknown>;
}, requestUrlFromDom: string) {
  const requestUrls = intercept.requests.map((request) => request.url);
  const summary = {
    requestCount: intercept.requests.length,
    urls: requestUrls,
    methods: intercept.requests.map((request) => request.method),
    actions: intercept.requests.map((request) => request.action),
    statuses: intercept.requests.map((request) => request.status),
    hangingCount: intercept.hangingRequests.length,
  };
  const summaryText = JSON.stringify(summary);

  expect(intercept.requests.length, `smart metrics request count/urls: ${summaryText}`).toBeGreaterThan(0);
  expect(intercept.hitCount, `smart metrics intercept hits: ${summaryText}`).toBe(intercept.requests.length);
  expect(intercept.fulfilledCount, `smart metrics fulfilled count: ${summaryText}`).toBe(intercept.requests.length);
  expect(intercept.requests.every((request) => request.method === 'GET'), `smart metrics method mismatch: ${summaryText}`).toBeTruthy();
  expect(intercept.requests.every((request) => request.matched), `smart metrics route-match mismatch: ${summaryText}`).toBeTruthy();
  expect(intercept.requests.every((request) => request.action === 'fulfilled'), `smart metrics route-action mismatch: ${summaryText}`).toBeTruthy();
  expect(intercept.requests.every((request) => /\/dashboard\/metrics(\?|$)/.test(request.url)), `smart metrics request URL mismatch: ${summaryText}`).toBeTruthy();
  expect(intercept.requests.some((request) => request.url === requestUrlFromDom), `smart metrics request URL marker mismatch: ${summaryText}`).toBeTruthy();
  expect(intercept.hangingRequests, `smart metrics hanging requests: ${summaryText}`).toHaveLength(0);
}

test.describe('e2e smoke', () => {
  test('register/login, create tx, dashboard load, export, delete account', async ({ page }) => {
    const mockApi = await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');

    await expect
      .poll(async () => {
        return await page.evaluate(() => window.localStorage.getItem('session_token'));
      })
      .not.toBeNull();

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    const transactionsHeading = page.getByRole('heading', {
      name: /transactions/i,
    });
    const addButton = page.getByTestId('add-transaction-button');
    const emptyStateAddButton = page.getByTestId('add-first-transaction');

    try {
      await expect(transactionsHeading).toBeVisible({ timeout: 15000 });

      const hasPrimaryAddButton = await addButton.isVisible().catch(() => false);
      const hasEmptyStateAddButton = await emptyStateAddButton.isVisible().catch(() => false);

      expect(hasPrimaryAddButton || hasEmptyStateAddButton).toBeTruthy();
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const visibleText = (document.body?.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .map((el) => el.textContent?.trim())
          .filter(Boolean);
        return {
          url: window.location.href,
          title: document.title,
          headings,
          visibleText,
          hasLoginField: !!document.querySelector('[data-testid="login-email-input"]'),
          hasLoadingSpinner: !!document.querySelector('svg.animate-spin'),
          hasErrorBanner: /failed|error|unauthorized|invalid session/i.test(
            document.body?.innerText || '',
          ),
        };
      });

      const apiLog = mockApi.getApiLog();
      console.log('transactions-route-diagnostics', {
        ...diagnostics,
        nonOkApiCalls: apiLog.filter((entry) => entry.status >= 400),
        recentApiCalls: apiLog.slice(-20),
      });
      throw error;
    }

    if (await addButton.isVisible().catch(() => false)) {
      await expect(addButton).toBeEnabled();
      await addButton.click();
    } else {
      await expect(emptyStateAddButton).toBeVisible({ timeout: 15000 });
      await expect(emptyStateAddButton).toBeEnabled();
      await emptyStateAddButton.click();
    }

    await page.getByTestId('amount-input').fill('4.50');
    await page.getByTestId('description-input').fill('Coffee');

    const refreshExpensesResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'GET',
    );
    const createExpenseResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );

    await page.getByTestId('submit-transaction').click();

    let createdExpenseId: string | null = null;

    try {
      const createResponse = await createExpenseResponse;
      expect(createResponse.ok()).toBeTruthy();
      const createdExpense = (await createResponse.json()) as Tx;
      createdExpenseId = createdExpense.expense_id;

      const refreshResponse = await refreshExpensesResponse;
      expect(refreshResponse.ok()).toBeTruthy();
      const refreshBody = (await refreshResponse.json()) as Tx[];
      expect(refreshBody.some((tx) => tx.expense_id === createdExpense.expense_id)).toBeTruthy();

      await expect(page.getByTestId('submit-transaction')).toHaveCount(0);
      await expect(page.getByTestId(`view-${createdExpense.expense_id}`)).toBeVisible();
      await expect(page.getByText('No transactions found')).toHaveCount(0);
    } catch (error) {
      const apiLog = mockApi.getApiLog();
      const submitDiagnostics = await page.evaluate(() => {
        const visibleText = (document.body?.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 700);
        const validationErrors = Array.from(document.querySelectorAll('.text-expense'))
          .map((el) => el.textContent?.trim())
          .filter(Boolean);
        const visibleRows = Array.from(document.querySelectorAll('tbody tr, .md\\:hidden > div'))
          .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 5);

        return {
          visibleText,
          validationErrors,
          modalStillOpen: !!document.querySelector('[data-testid="submit-transaction"]'),
          visibleRows,
        };
      });

      console.log('transactions-submit-diagnostics', {
        ...submitDiagnostics,
        postExpensesCalled: apiLog.some(
          (entry) => entry.path === '/api/expenses' && entry.method === 'POST',
        ),
        getExpensesCalledAfterSubmit: apiLog.some(
          (entry) => entry.path === '/api/expenses' && entry.method === 'GET',
        ),
        nonOkApiCalls: apiLog.filter((entry) => entry.status >= 400),
        recentApiCalls: apiLog.slice(-20),
      });
      throw error;
    }

    await page.goto('/');
    await expect(page.getByText('Monthly Trend').first()).toBeVisible();

    await page.goto('/transactions');
    expect(createdExpenseId).toBeTruthy();
    await expect(page.getByTestId(`view-${createdExpenseId!}`)).toBeVisible();
    await expect(page.getByText('No transactions found')).toHaveCount(0);

    const downloadPromise1 = page.waitForEvent('download');
    await page.getByTestId('export-json-current-filters').click();
    await downloadPromise1;
    await expect(page.getByText('JSON export downloaded.')).toBeVisible();

    const downloadPromise2 = page.waitForEvent('download');
    await page.getByTestId('export-csv-current-filters').click();
    await downloadPromise2;
    await expect(page.getByText('CSV export downloaded.')).toBeVisible();

    await page.goto('/settings');
    await page.getByTestId('settings-delete-account').click();
    await page.getByTestId('delete-account-confirm-input').fill('DELETE');
    await page.getByTestId('confirm-delete-account').click();

    await expect(page).toHaveURL('/login');
  });

  test('edit transaction updates row values', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();
    await expect(page).toHaveURL('/');

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    const addButton = page.getByTestId('add-transaction-button');
    const emptyStateAddButton = page.getByTestId('add-first-transaction');

    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
    } else {
      await emptyStateAddButton.click();
    }

    await page.getByTestId('amount-input').fill('4.50');
    await page.getByTestId('description-input').fill('Coffee');

    const createExpenseResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );
    await page.getByTestId('submit-transaction').click();

    const createdExpense = (await (await createExpenseResponse).json()) as Tx;
    const createdRow = page.getByTestId(`view-${createdExpense.expense_id}`);
    await expect(createdRow).toBeVisible();

    await createdRow.getByLabel('Edit transaction').click();
    await expect(page.getByTestId('submit-transaction')).toBeVisible();
    await page.getByTestId('amount-input').fill('5.75');
    await page.getByTestId('description-input').fill('Matcha');

    const updateExpenseResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/expenses/${createdExpense.expense_id}`) &&
        resp.request().method() === 'PUT',
    );
    const refreshExpensesResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'GET',
    );

    await page.getByTestId('submit-transaction').click();

    const updateResponse = await updateExpenseResponse;
    expect(updateResponse.ok()).toBeTruthy();

    const refreshResponse = await refreshExpensesResponse;
    expect(refreshResponse.ok()).toBeTruthy();

    await expect(page.getByTestId('submit-transaction')).toHaveCount(0);
    await expect(createdRow).toContainText('Matcha');
    await expect(createdRow).toContainText('5.75');
    await expect(createdRow).not.toContainText('Coffee');
  });

  test('delete transaction removes row and restores empty state', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();
    await expect(page).toHaveURL('/');

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    const addButton = page.getByTestId('add-transaction-button');
    const emptyStateAddButton = page.getByTestId('add-first-transaction');

    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
    } else {
      await emptyStateAddButton.click();
    }

    await page.getByTestId('amount-input').fill('4.50');
    await page.getByTestId('description-input').fill('Coffee');

    const createExpenseResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );
    await page.getByTestId('submit-transaction').click();

    const createdExpense = (await (await createExpenseResponse).json()) as Tx;
    const createdRow = page.getByTestId(`view-${createdExpense.expense_id}`);
    await expect(createdRow).toBeVisible();

    await createdRow.getByLabel('Delete transaction').click();
    await expect(page.getByRole('heading', { name: 'Delete Transaction' })).toBeVisible();

    const deleteExpenseResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/expenses/${createdExpense.expense_id}`) &&
        resp.request().method() === 'DELETE',
    );

    await page.getByTestId('confirm-delete').click();

    const deleteResponse = await deleteExpenseResponse;
    expect(deleteResponse.ok()).toBeTruthy();

    await expect(createdRow).toHaveCount(0);
    await expect(page.getByText('No transactions found')).toBeVisible();
  });

  test('transactions type filter isolates and restores rows', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();
    await expect(page).toHaveURL('/');

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    const openAddTransaction = async () => {
      const addButton = page.getByTestId('add-transaction-button');
      const emptyStateAddButton = page.getByTestId('add-first-transaction');

      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
      } else {
        await emptyStateAddButton.click();
      }
    };

    await openAddTransaction();
    await page.getByTestId('amount-input').fill('4.50');
    await page.getByTestId('description-input').fill('Coffee');

    const createExpenseResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );
    await page.getByTestId('submit-transaction').click();

    const expenseTx = (await (await createExpenseResponse).json()) as Tx;
    const expenseRow = page.getByTestId(`view-${expenseTx.expense_id}`);
    await expect(expenseRow).toBeVisible();

    await openAddTransaction();
    await page.getByTestId('tab-income').click();
    await page.getByTestId('amount-input').fill('1000');
    await page.getByTestId('description-input').fill('Salary');

    const createIncomeResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );
    await page.getByTestId('submit-transaction').click();

    const incomeTx = (await (await createIncomeResponse).json()) as Tx;
    const incomeRow = page.getByTestId(`view-${incomeTx.expense_id}`);
    await expect(incomeRow).toBeVisible();

    await expect(expenseRow).toBeVisible();
    await expect(incomeRow).toBeVisible();

    await page.getByTestId('filter-income').click();
    await expect(incomeRow).toBeVisible();
    await expect(expenseRow).toHaveCount(0);

    await page.getByTestId('filter-all').click();
    await expect(expenseRow).toBeVisible();
    await expect(incomeRow).toBeVisible();
  });

  test('analytics renders non-empty data after creating a transaction', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();
    await expect(page).toHaveURL('/');

    await page.getByTestId('add-transaction-button').click();
    await page.getByTestId('amount-input').fill('45');
    await page.getByTestId('description-input').fill('Analytics groceries');
    await page.getByTestId('category-select').selectOption('cat_food');

    const createExpenseResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );
    await page.getByTestId('submit-transaction').click();
    await expect((await createExpenseResponse).ok()).toBeTruthy();

    const analyticsSummaryResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/stats/summary') && resp.request().method() === 'GET',
    );
    await page.getByTestId('nav-analytics').click();

    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
    await expect((await analyticsSummaryResponse).ok()).toBeTruthy();

    await expect(page.getByText('Total Expenses')).toBeVisible();
    await expect(page.getByTestId('stats-transactions')).toBeVisible();

    const totalExpensesCard = page.getByText('Total Expenses').locator('..');
    await expect(totalExpensesCard).not.toContainText('$0');

    const categoryBreakdownCard = page
      .getByRole('heading', { name: 'Category Breakdown', exact: true })
      .locator('..');
    await expect(categoryBreakdownCard).toBeVisible();
    await expect(categoryBreakdownCard.getByText('Food & Dining', { exact: true })).toBeVisible();

    await expect(page.getByText('Income vs Expenses')).toBeVisible();
    await expect(page.getByText('No data available')).toHaveCount(0);
    await expect(page.getByText('No expense data available for this period')).toHaveCount(0);
    await expect(page.getByText('Failed to load data. Please try again.')).toHaveCount(0);
  });

  test('analytics shows error banner on summary API failure', async ({ page }) => {
    await installMockApi(page);

    await page.route('**/api/stats/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'boom' } }),
      });
    });

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await page.getByTestId('nav-analytics').click();
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByText('Failed to load data. Please try again.')).toBeVisible();
  });

  test('transactions empty state shows for fresh account', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText('No transactions found')).toBeVisible();
    await expect(page.getByText('Add your first transaction to get started')).toBeVisible();
  });

  test('add transaction modal closes with Escape key', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await page.getByTestId('add-transaction-button').click();
    await expect(page.getByTestId('submit-transaction')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('submit-transaction')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: /add transaction/i })).toHaveCount(0);
  });

  test('error boundary fallback renders and retry action is available', async ({ page }) => {
    await installMockApi(page);

    await page.route('**/api/stats/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 45,
          count: 1,
          average: 45,
          by_category: [{
            category_id: 'cat_food',
            name: 'Food & Dining',
            amount: 45,
            color: '#ef4444',
            icon: 'restaurant',
          }],
        }),
      });
    });

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await page.getByTestId('nav-analytics').click();
    await expect(page.getByText('Something went wrong. Please refresh.')).toBeVisible();

    const retryButton = page.getByRole('button', { name: 'Retry' });
    await expect(retryButton).toBeVisible();
    await retryButton.click();
  });

  test('export failure shows friendly error state', async ({ page }) => {
    await installMockApi(page);

    await page.route('**/api/export/csv**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'boom' } }),
      });
    });

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await page.getByTestId('nav-export').click();
    await expect(page).toHaveURL(/\/export/);
    await page.getByTestId('export-csv-button').click();
    await expect(page.getByText('Server error. Please try again shortly.')).toBeVisible();
  });

  test('settings delete-account failure shows friendly mapped message', async ({ page }) => {
    await installMockApi(page);

    await page.route('**/api/auth/account**', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'boom' } }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL(/\/settings/);
    await page.getByTestId('settings-delete-account').click();
    await page.getByTestId('delete-account-confirm-input').fill('DELETE');
    await page.getByTestId('confirm-delete-account').click();
    await expect(page.getByText('Server error. Please try again shortly.')).toBeVisible();
  });

  test('budget happy path creates and renders progress summary', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();
    await expect(page).toHaveURL('/');

    await page.getByTestId('nav-budgets').click();
    await expect(page).toHaveURL(/\/budgets/);
    await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Set Total Budget' }).click();
    await page.getByTestId('budget-category-select').selectOption('');
    await page.getByTestId('budget-amount-input').fill('100');

    const createBudgetResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/budgets') && resp.request().method() === 'POST',
    );
    const refreshBudgetProgressResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/budgets/progress') && resp.request().method() === 'GET',
    );

    await page.getByTestId('save-budget-button').click();

    const createResponse = await createBudgetResponse;
    expect(createResponse.ok()).toBeTruthy();

    const refreshResponse = await refreshBudgetProgressResponse;
    expect(refreshResponse.ok()).toBeTruthy();

    const progressPayload = (await refreshResponse.json()) as {
      total_budget: null | { amount: number; category_id: string | null; period: string };
    };
    expect(progressPayload.total_budget).toBeTruthy();
    expect(progressPayload.total_budget?.category_id ?? null).toBeNull();
    expect(progressPayload.total_budget?.period).toBe('monthly');
    expect(progressPayload.total_budget?.amount).toBe(100);

    await expect(page.getByTestId('save-budget-button')).toHaveCount(0);

    const totalBudgetLabel = page.getByText('Total Monthly Budget');
    await expect(totalBudgetLabel).toBeVisible();

    const budgetSummary = totalBudgetLabel.locator('..').locator('..');
    await expect(budgetSummary).toContainText(/\$100(?:\.00)?/);
    await expect(budgetSummary).toContainText(/used/i);
    await expect(page.getByText('No Total Budget Set')).toHaveCount(0);
  });

  test('dashboard Smart Insights card renders meaningful signal', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setInsightsV2Mode('normal');

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
    await expect(page.getByText('Spending spike')).toBeVisible();
    await expect(page.getByTestId('smart-insights-severity-badge')).toHaveText('warning');
    await expect(page.getByTestId('smart-insights-overspending-delta')).toContainText('+60.0%');
  });

  test('dashboard Smart Insights shows loading then empty state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setInsightsV2Mode('empty');

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-insights-card-loading')).toBeVisible();
    await expect(page.getByTestId('smart-insights-card-empty')).toBeVisible();
  });

  test('dashboard Smart Insights shows retry on failure', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setInsightsV2Mode('error');

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-insights-card-error')).toBeVisible();
    await expect(page.getByText('Insights are temporarily unavailable.')).toBeVisible();
    await expect(page.getByTestId('smart-insights-error-diagnostics')).toContainText('Ref: request:500:SERVER_ERROR');
    await expect(page.getByText('failed')).toHaveCount(0);
    await expect(page.getByTestId('smart-insights-retry')).toBeVisible();
  });

  test('dashboard Smart Insights handles no-budget payload deterministically', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setInsightsV2Mode('no_budget');

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-insights-card-empty')).toBeVisible();
  });

  test('dashboard Smart Insights falls back cleanly when no overspending alert exists', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setInsightsV2Mode('no_spike');

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
    await expect(page.getByText('Spending is rising')).toBeVisible();
    await expect(page.getByTestId('smart-insights-overspending-delta')).toHaveCount(0);
  });

  test('dashboard Smart Insights renders category trend insight when selected signal', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setInsightsV2Mode('category_trend');

    await page.goto('/login');
    await page.getByTestId('create-account-button').click();
    await page.getByTestId('name-input').fill('Smoke User');
    await page.getByTestId('register-email-input').fill('smoke@example.com');
    await page.getByTestId('register-password-input').fill('secret123');
    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
    await expect(page.getByText('Food & Dining trend up')).toBeVisible();
    await expect(page.getByText(/Set a cap to stay on track/i)).toBeVisible();
    await expect(page.getByTestId('smart-insights-category-trend-delta')).toContainText('+50.0%');
  });

  test('dashboard Smart Dashboard Net Balance card renders deterministic success state', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance card renders deterministic error state when summary request fails', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveText('Net balance is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance card renders deterministic loading state', async ({ page }) => {
    await installMockApi(page);
    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 0,
          net_balance: -12.5,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toBeVisible();
    releaseSummaryResponse?.();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance card renders deterministic empty state when summary has no net balance', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 0,
          total_income: 0,
          current_month_spend: 0,
          previous_month_spend: 0,
          month_over_month_change_pct: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toHaveText('No balance data yet.');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance error state coexists deterministically with Smart Insights visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
  });

  test('dashboard Smart Dashboard Net Balance remains deterministic after dashboard re-entry in same session', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance reloads deterministically from success state', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);

    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 0,
          net_balance: -12.5,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toBeVisible();
    releaseSummaryResponse?.();

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance switches deterministically from populated profile to empty profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_empty') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 0,
            total_income: 0,
            current_month_spend: 0,
            previous_month_spend: 0,
            month_over_month_change_pct: 0,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 45.25,
          total_income: 0,
          net_balance: -45.25,
          current_month_spend: 45.25,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/45\.25/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_empty');
    await expect(profileSwitch).toHaveValue('profile_empty');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-net-balance-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toHaveText('No balance data yet.');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance switches deterministically from populated profile to error profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 45.25,
          total_income: 0,
          net_balance: -45.25,
          current_month_spend: 45.25,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/45\.25/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-net-balance-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveText('Net balance is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toHaveCount(0);
  });


  test('dashboard Smart Dashboard Net Balance recovers deterministically from error profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 88.8,
            total_income: 0,
            net_balance: -88.8,
            current_month_spend: 88.8,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-net-balance-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/88\.80/);
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Net Balance recovers deterministically from empty profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 67.4,
            total_income: 0,
            net_balance: -67.4,
            current_month_spend: 67.4,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 0,
          total_income: 0,
          current_month_spend: 0,
          previous_month_spend: 0,
          month_over_month_change_pct: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-net-balance-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/67\.40/);
    await expect(page.getByTestId('smart-dashboard-net-balance-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-net-balance-loading')).toHaveCount(0);
  });


  test('dashboard Smart Dashboard Income card renders deterministic loading state', async ({ page }) => {
    await installMockApi(page);
    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 123.45,
          net_balance: 110.95,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    releaseSummaryResponse?.();
    await expect(page.getByTestId('smart-dashboard-income-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income card renders deterministic error state when summary request fails', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-error')).toHaveText('Income is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income card renders deterministic empty state when summary has no income', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          net_balance: -12.5,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-empty')).toHaveText('No income data yet.');
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income card renders deterministic kickoff success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 123.45,
          net_balance: 110.95,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);
  });


  test('dashboard Smart Dashboard Income error state coexists deterministically with Net Balance visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();
  });

  test('dashboard Smart Dashboard Income empty state coexists deterministically with Net Balance success visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          net_balance: -12.5,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);
  });

  test('dashboard Smart Dashboard Income reloads deterministically from success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 123.45,
          net_balance: 110.95,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);

    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 123.45,
          net_balance: 110.95,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    releaseSummaryResponse?.();

    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income switches deterministically from populated profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: profileId === 'profile_shared' ? 222.22 : 111.11,
          net_balance: 100,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    const incomeValue = page.getByTestId('smart-dashboard-income-value');
    await expect(incomeValue).toHaveText(/111\.11/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-income-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    }

    await expect(incomeValue).toHaveText(/222\.22/);
    await expect(incomeValue).not.toHaveText(/111\.11/);
    await expect(page.getByTestId('smart-dashboard-income-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income switches deterministically from populated profile to empty profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 12.5,
            net_balance: 100,
            current_month_spend: 12.5,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 333.33,
          net_balance: 100,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/333\.33/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-income-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-income-empty')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income switches deterministically from populated profile to error profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          total_income: 444.44,
          net_balance: 100,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/444\.44/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-income-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-income-error')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income switches deterministically from error profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 12.5,
            total_income: 555.55,
            net_balance: 100,
            current_month_spend: 12.5,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-error')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-income-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/555\.55/);
    await expect(page.getByTestId('smart-dashboard-income-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Income switches deterministically from empty profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 12.5,
            total_income: 666.66,
            net_balance: 100,
            current_month_spend: 12.5,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 12.5,
          net_balance: 100,
          current_month_spend: 12.5,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-income-empty')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-income-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-income-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/666\.66/);
    await expect(page.getByTestId('smart-dashboard-income-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-income-loading')).toHaveCount(0);
  });


  test('dashboard Smart Dashboard Total Spend card renders deterministic loading state', async ({ page }) => {
    await installMockApi(page);
    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 456.78,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    releaseSummaryResponse?.();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend card renders deterministic error state when summary request fails', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toHaveText('Total spend is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend card renders deterministic empty state when summary has no total spend', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_income: 123.45,
          net_balance: 123.45,
          current_month_spend: 0,
          previous_month_spend: 0,
          month_over_month_change_pct: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toHaveText('No spend data yet.');
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend card renders deterministic kickoff success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 456.78,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/456\.78/);
  });


  test('dashboard Smart Dashboard Total Spend error state coexists deterministically with Net Balance and Income visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-error')).toBeVisible();
  });

  test('dashboard Smart Dashboard Total Spend empty state coexists deterministically with Net Balance and Income success visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_income: 123.45,
          net_balance: 123.45,
          current_month_spend: 0,
          previous_month_spend: 0,
          month_over_month_change_pct: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/123\.45/);
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);
  });

  test('dashboard Smart Dashboard Total Spend reloads deterministically from success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 456.78,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/456\.78/);

    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 456.78,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    releaseSummaryResponse?.();

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/456\.78/);
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend switches deterministically from populated profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: profileId === 'profile_shared' ? 888.88 : 777.77,
          total_income: 123.45,
          net_balance: -654.32,
          current_month_spend: profileId === 'profile_shared' ? 888.88 : 777.77,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    const totalSpendValue = page.getByTestId('smart-dashboard-total-spend-value');
    await expect(totalSpendValue).toHaveText(/777\.77/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-total-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    }

    await expect(totalSpendValue).toHaveText(/888\.88/);
    await expect(totalSpendValue).not.toHaveText(/777\.77/);
    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend switches deterministically from populated profile to empty profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_income: 123.45,
            net_balance: 123.45,
            current_month_spend: 0,
            previous_month_spend: 0,
            month_over_month_change_pct: 0,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 999.99,
          total_income: 123.45,
          net_balance: -876.54,
          current_month_spend: 999.99,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/999\.99/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-total-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend switches deterministically from populated profile to error profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 654.32,
          total_income: 123.45,
          net_balance: -530.87,
          current_month_spend: 654.32,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/654\.32/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-total-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend switches deterministically from error profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 321.09,
            total_income: 123.45,
            net_balance: -197.64,
            current_month_spend: 321.09,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-total-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/321\.09/);
    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Total Spend switches deterministically from empty profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 210.12,
            total_income: 123.45,
            net_balance: -86.67,
            current_month_spend: 210.12,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_income: 123.45,
          net_balance: 123.45,
          current_month_spend: 0,
          previous_month_spend: 0,
          month_over_month_change_pct: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-total-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/210\.12/);
    await expect(page.getByTestId('smart-dashboard-total-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-total-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend card renders deterministic loading state', async ({ page }) => {
    await installMockApi(page);
    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    releaseSummaryResponse?.();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend card renders deterministic error state when summary request fails', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toHaveText('Current month spend is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend card renders deterministic empty state when summary has no current month spend', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toHaveText('No current month spend data yet.');
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend card renders deterministic kickoff success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/321\.09/);
  });

  test('dashboard Smart Dashboard Current Month Spend error state coexists deterministically with Net Balance, Income, and Total Spend visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-error')).toBeVisible();
  });

  test('dashboard Smart Dashboard Current Month Spend empty state coexists deterministically with Net Balance, Income, and Total Spend success visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/456\.78/);
  });

  test('dashboard Smart Dashboard Current Month Spend reloads deterministically from success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/321\.09/);

    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    releaseSummaryResponse?.();

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/321\.09/);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend switches deterministically from populated profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: profileId === 'profile_shared' ? 654.32 : 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    const currentMonthSpendValue = page.getByTestId('smart-dashboard-current-month-spend-value');
    await expect(currentMonthSpendValue).toHaveText(/321\.09/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-current-month-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    }

    await expect(currentMonthSpendValue).toHaveText(/654\.32/);
    await expect(currentMonthSpendValue).not.toHaveText(/321\.09/);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend switches deterministically from populated profile to empty profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 456.78,
            total_income: 123.45,
            net_balance: -333.33,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 987.65,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/987\.65/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-current-month-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend switches deterministically from populated profile to error profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 543.21,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/543\.21/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-current-month-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend switches deterministically from error profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 456.78,
            total_income: 123.45,
            net_balance: -333.33,
            current_month_spend: 210.98,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-current-month-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/210\.98/);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Current Month Spend switches deterministically from empty profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 456.78,
            total_income: 123.45,
            net_balance: -333.33,
            current_month_spend: 135.79,
            previous_month_spend: 0,
            month_over_month_change_pct: 100,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          previous_month_spend: 0,
          month_over_month_change_pct: 100,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-current-month-spend-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/135\.79/);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change card renders deterministic loading state', async ({ page }) => {
    await installMockApi(page);
    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 12.3,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    releaseSummaryResponse?.();
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change card renders deterministic error state when summary request fails', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toHaveText('MoM change is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change card renders deterministic empty state when summary has no MoM change', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toHaveText('No month-over-month trend yet.');
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change card renders deterministic kickoff success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 12.3,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/12\.3%/);
  });

  test('dashboard Smart Dashboard MoM Change error state coexists deterministically with Net Balance visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-error')).toBeVisible();
  });

  test('dashboard Smart Dashboard MoM Change empty state coexists deterministically with Income success visibility', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);
  });

  test('dashboard Smart Dashboard MoM Change empty state keeps Total Spend and Current Month Spend explicitly visible and stable', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/456\.78/);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/321\.09/);
  });

  test('dashboard Smart Dashboard MoM Change reloads deterministically from success state', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 12.3,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/12\.3%/);

    let releaseSummaryResponse: (() => void) | null = null;
    await page.route('**/api/analytics/summary**', async (route) => {
      await new Promise<void>((resolve) => { releaseSummaryResponse = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 12.3,
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    releaseSummaryResponse?.();

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/12\.3%/);
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change switches deterministically from populated profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: profileId === 'profile_shared' ? -8.2 : 12.3,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    const momValue = page.getByTestId('smart-dashboard-mom-change-value');
    await expect(momValue).toHaveText(/12\.3%/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-mom-change-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    }

    await expect(momValue).toHaveText(/-8\.2%/);
    await expect(momValue).not.toHaveText(/12\.3%/);
    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change switches deterministically from populated profile to empty profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 456.78,
            total_income: 123.45,
            net_balance: -333.33,
            current_month_spend: 321.09,
            previous_month_spend: 0,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 15.6,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/15\.6%/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-mom-change-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change switches deterministically from populated profile to error profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: -4.4,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/-4\.4%/);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-mom-change-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change switches deterministically from error profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 456.78,
            total_income: 123.45,
            net_balance: -333.33,
            current_month_spend: 321.09,
            previous_month_spend: 0,
            month_over_month_change_pct: 6.7,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'INTERNAL_SERVER_ERROR', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-mom-change-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/6\.7%/);
    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard MoM Change switches deterministically from empty profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/analytics/summary**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');

      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total_spend: 456.78,
            total_income: 123.45,
            net_balance: -333.33,
            current_month_spend: 321.09,
            previous_month_spend: 0,
            month_over_month_change_pct: -3.2,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-mom-change-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/-3\.2%/);
    await expect(page.getByTestId('smart-dashboard-mom-change-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-mom-change-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Top Savings Goal card renders deterministic loading state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSavingsGoalsMode('loading');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading-secondary')).toBeVisible();
  });

  test('dashboard Smart Dashboard Top Savings Goal card renders deterministic error state when savings goals request fails', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSavingsGoalsMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveText('Savings goal is unavailable right now.');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error-secondary')).toHaveText('Savings goal is unavailable right now.');
  });

  test('dashboard Smart Dashboard Top Savings Goal card renders deterministic empty state without active goals', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSavingsGoalsMode('empty');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveText('No active savings goals yet.');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty-secondary')).toHaveText('No active savings goals yet.');
  });

  test('dashboard Smart Dashboard Top Savings Goal card renders deterministic kickoff success state', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Emergency Fund');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-progress')).toHaveText('40.0%');
  });

  test('dashboard Smart Dashboard Top Savings Goal error state coexists deterministically with Net Balance visibility', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSavingsGoalsMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toHaveText(/12\.50/);
  });

  test('dashboard Smart Dashboard Top Savings Goal empty state coexists deterministically with Income success visibility', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSavingsGoalsMode('empty');
    await page.route('**/api/analytics/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_spend: 456.78,
          total_income: 123.45,
          net_balance: -333.33,
          current_month_spend: 321.09,
          previous_month_spend: 0,
          month_over_month_change_pct: 15.6,
        }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-income-value')).toHaveText(/123\.45/);
  });

  test('dashboard Smart Dashboard Top Savings Goal empty state keeps Total Spend, Current Month Spend, and MoM Change explicitly visible and stable', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSavingsGoalsMode('empty');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-total-spend-value')).toHaveText(/12\.50/);
    await expect(page.getByTestId('smart-dashboard-current-month-spend-value')).toHaveText(/12\.50/);
    await expect(page.getByTestId('smart-dashboard-mom-change-value')).toHaveText(/100\.0%/);
  });

  test('dashboard Smart Dashboard Top Savings Goal reloads deterministically from success state', async ({ page }) => {
    await installMockApi(page);
    let requestCount = 0;
    let releaseResponse: (() => void) | null = null;
    let markReloadRequestSeen: (() => void) | null = null;
    const reloadRequestSeen = new Promise<void>((resolve) => {
      markReloadRequestSeen = resolve;
    });
    await page.route('**/api/savings-goals**', async (route) => {
      requestCount += 1;
      if (requestCount > 1) {
        markReloadRequestSeen?.();
        await new Promise<void>((resolve) => { releaseResponse = resolve; });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            goal_id: requestCount > 1 ? 'goal_vacation' : 'goal_emergency',
            title: requestCount > 1 ? 'Vacation Fund' : 'Emergency Fund',
            target_amount: 2000,
            current_amount: requestCount > 1 ? 900 : 400,
            status: 'active',
            deadline: '2026-12-31',
            progress_percentage: requestCount > 1 ? 45 : 20,
            projected_completion: { months_remaining: 5.5, basis: 'monthly_savings_rate' },
          },
        ]),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Emergency Fund');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).not.toHaveText('Vacation Fund');

    await page.goto('/');
    await reloadRequestSeen;
    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-top-savings-goal-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    }
    releaseResponse?.();

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Vacation Fund');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).not.toHaveText('Emergency Fund');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Top Savings Goal switches deterministically from populated profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/savings-goals**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            goal_id: profileId === 'profile_shared' ? 'goal_house' : 'goal_emergency',
            title: profileId === 'profile_shared' ? 'Home Upgrade Fund' : 'Emergency Fund',
            target_amount: 5000,
            current_amount: profileId === 'profile_shared' ? 1250 : 400,
            status: 'active',
            deadline: '2026-12-31',
            progress_percentage: profileId === 'profile_shared' ? 25 : 40,
            projected_completion: { months_remaining: 8.4, basis: 'monthly_savings_rate' },
          },
        ]),
      });
    });
    await registerAndOpenDashboard(page);

    const goalTitle = page.getByTestId('smart-dashboard-top-savings-goal-title');
    await expect(goalTitle).toHaveText('Emergency Fund');
    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-top-savings-goal-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    }

    await expect(goalTitle).toHaveText('Home Upgrade Fund');
    await expect(goalTitle).not.toHaveText('Emergency Fund');
    await expect(goalTitle).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Top Savings Goal switches deterministically from populated profile to empty profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/savings-goals**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');
      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            goal_id: 'goal_emergency',
            title: 'Emergency Fund',
            target_amount: 1000,
            current_amount: 400,
            status: 'active',
            deadline: '2026-10-15',
            progress_percentage: 40,
            projected_completion: { months_remaining: 6, basis: 'monthly_savings_rate' },
          },
        ]),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Emergency Fund');
    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-top-savings-goal-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Top Savings Goal switches deterministically from populated profile to error profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/savings-goals**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');
      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SAVINGS_GOALS_UNAVAILABLE', message: 'failed' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            goal_id: 'goal_emergency',
            title: 'Emergency Fund',
            target_amount: 1000,
            current_amount: 400,
            status: 'active',
            deadline: '2026-10-15',
            progress_percentage: 40,
            projected_completion: { months_remaining: 6, basis: 'monthly_savings_rate' },
          },
        ]),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Emergency Fund');
    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-top-savings-goal-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Top Savings Goal switches deterministically from error profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/savings-goals**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');
      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              goal_id: 'goal_house',
              title: 'Home Upgrade Fund',
              target_amount: 5000,
              current_amount: 1500,
              status: 'active',
              deadline: '2026-12-31',
              progress_percentage: 30,
              projected_completion: { months_remaining: 7.3, basis: 'monthly_savings_rate' },
            },
          ]),
        });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SAVINGS_GOALS_UNAVAILABLE', message: 'failed' } }),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(1);
    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-top-savings-goal-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Home Upgrade Fund');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toHaveCount(0);
  });

  test('dashboard Smart Dashboard Top Savings Goal switches deterministically from empty profile to populated profile', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/savings-goals**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const profileId = requestUrl.searchParams.get('profile_id');
      if (profileId === 'profile_shared') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              goal_id: 'goal_house',
              title: 'Home Upgrade Fund',
              target_amount: 5000,
              current_amount: 1250,
              status: 'active',
              deadline: '2026-12-31',
              progress_percentage: 25,
              projected_completion: { months_remaining: 8.4, basis: 'monthly_savings_rate' },
            },
          ]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(1);
    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    const loadingStateAppeared = await page
      .getByTestId('smart-dashboard-top-savings-goal-loading')
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (loadingStateAppeared) {
      await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toBeVisible();
    }

    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveCount(1);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Home Upgrade Fund');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-error')).toHaveCount(0);
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-loading')).toHaveCount(0);
  });

  test('dashboard Subscriptions card renders deterministic recurring summary', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
  });

  test('dashboard Subscriptions manual recalc reloads deterministically from ready state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');

    mockApi.setSubscriptionsMode('loading');
    await page.getByTestId('subscriptions-refresh-button').click();
    await expect(page.getByTestId('subscriptions-card-loading')).toBeVisible();

    mockApi.setSubscriptionsMode('ready');
    await expect(page.getByTestId('subscriptions-card-loading')).toHaveCount(0);
    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
  });

  test('dashboard Subscriptions remains stable after dashboard re-entry in same session', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.goto('/');
    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
  });

  test('dashboard Subscriptions refreshes deterministically when profile context changes', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$41.50');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('YouTube Premium');
  });

  test('dashboard Subscriptions switches deterministically between populated profiles without stale content', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$41.50');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('YouTube Premium');
    await expect(page.getByText('Netflix')).toHaveCount(0);
  });

  test('dashboard Subscriptions remains deterministic across rapid populated profile switch and switch-back', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$41.50');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('YouTube Premium');

    await profileSwitch.selectOption('profile_personal');
    await expect(profileSwitch).toHaveValue('profile_personal');

    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
    await expect(page.getByText('YouTube Premium')).toHaveCount(0);
  });

  test('dashboard Subscriptions profile refresh coexists deterministically with Smart Insights visibility', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$41.50');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('YouTube Premium');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
  });

  test('dashboard Subscriptions switches deterministically from populated profile to empty profile', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_empty');
    await expect(profileSwitch).toHaveValue('profile_empty');

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-empty-state')).toBeVisible();
    await expect(page.getByTestId('subscriptions-empty-state')).toContainText('No recurring subscriptions detected for this profile yet.');
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$0.00');
    await expect(page.getByText('Netflix')).toHaveCount(0);
  });

  test('dashboard Subscriptions switches deterministically from empty profile back to populated profile', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('ready');
    await registerAndOpenDashboard(page);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_empty');
    await expect(profileSwitch).toHaveValue('profile_empty');

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-empty-state')).toBeVisible();
    await expect(page.getByTestId('subscriptions-empty-state')).toContainText('No recurring subscriptions detected for this profile yet.');
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$0.00');

    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$41.50');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('YouTube Premium');
    await expect(page.getByTestId('subscriptions-empty-state')).toHaveCount(0);
  });

  test('dashboard Subscriptions card renders deterministic empty state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('empty');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-empty-state')).toBeVisible();
    await expect(page.getByTestId('subscriptions-empty-state')).toContainText('No recurring subscriptions detected for this profile yet.');
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$0.00');
  });

  test('dashboard Subscriptions card renders deterministic error state without blocking dashboard usage', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card-error')).toBeVisible();
    await expect(page.getByText('Subscriptions are unavailable right now.')).toBeVisible();
    await expect(page.getByTestId('add-transaction-button')).toBeVisible();
  });

  test('dashboard Subscriptions card recovers from error after retry in same session', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card-error')).toBeVisible();

    mockApi.setSubscriptionsMode('ready');
    await page.getByTestId('subscriptions-error-retry').click();

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
  });

  test('dashboard Subscriptions error and recovery coexist safely with Smart Insights card', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card-error')).toBeVisible();
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();

    mockApi.setSubscriptionsMode('ready');
    await page.getByTestId('subscriptions-error-retry').click();

    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
  });

  test('dashboard Subscriptions card transitions from loading to ready deterministically', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSubscriptionsMode('loading');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('subscriptions-card-loading')).toBeVisible();

    mockApi.setSubscriptionsMode('ready');

    await expect(page.getByTestId('subscriptions-card-loading')).toHaveCount(0);
    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$22.49');
    await expect(page.getByTestId('subscriptions-item-0')).toContainText('Netflix');
  });

  test('dashboard Weekly Digest renders deterministic empty terminal state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('empty');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card-empty')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-card-empty')).toContainText('Not enough activity this week for a detailed digest yet.');
  });

  test('dashboard Weekly Digest renders deterministic success summary state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');
    await expect(page.getByTestId('weekly-digest-supporting-line')).toHaveText('Income $500.00 • Expense $120.00');
  });

  test('dashboard Weekly Digest renders deterministic loading state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('loading');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card-loading')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-card-loading-message')).toHaveText('Loading weekly digest...');
  });

  test('dashboard Weekly Digest renders deterministic error terminal state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card-error')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-card-error-message')).toHaveText('Weekly digest is unavailable right now.');
  });

  test('dashboard Weekly Digest manual refresh reloads deterministically from success state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');

    const weeklyDigestRefreshButton = page
      .getByTestId('weekly-digest-card')
      .getByRole('button', { name: /refresh/i });
    await expect(weeklyDigestRefreshButton).toBeVisible();
    await expect(weeklyDigestRefreshButton).toBeEnabled();

    mockApi.setWeeklyDigestMode('loading');
    await weeklyDigestRefreshButton.click();
    await expect(page.getByTestId('weekly-digest-card-loading')).toBeVisible();

    mockApi.setWeeklyDigestMode('success');
    await expect(page.getByTestId('weekly-digest-card-loading')).toHaveCount(0);
    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');
  });

  test('dashboard Weekly Digest error state coexists deterministically with Smart Insights visibility', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('error');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-card-error')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-card-error-message')).toHaveText('Weekly digest is unavailable right now.');
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
  });

  test('dashboard Weekly Digest remains deterministic after dashboard re-entry in same session', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    await page.goto('/');
    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');
  });

  test('dashboard Weekly Digest refreshes deterministically when profile context changes', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$510.00');
    await expect(page.getByTestId('weekly-digest-supporting-line')).toHaveText('Income $920.00 • Expense $410.00');
    await expect(page.getByText('Income $500.00 • Expense $120.00')).toHaveCount(0);
  });

  test('dashboard Weekly Digest switches deterministically from populated profile to empty profile', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_empty');
    await expect(profileSwitch).toHaveValue('profile_empty');

    await expect(page.getByTestId('weekly-digest-card-empty')).toBeVisible();
    await expect(page.getByText('Income $500.00 • Expense $120.00')).toHaveCount(0);
  });

  test('dashboard Weekly Digest switches deterministically from empty profile back to populated profile', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_empty');
    await expect(profileSwitch).toHaveValue('profile_empty');

    await expect(page.getByTestId('weekly-digest-card-empty')).toBeVisible();

    await profileSwitch.selectOption('profile_personal');
    await expect(profileSwitch).toHaveValue('profile_personal');

    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');
    await expect(page.getByTestId('weekly-digest-card-empty')).toHaveCount(0);
  });

  test('dashboard Weekly Digest switches deterministically between populated profiles without stale content', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    const profileSwitch = page.getByTestId('profile-switch');
    await expect(profileSwitch).toHaveValue('profile_personal');
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');

    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('weekly-digest-card-loading')).toHaveCount(0);
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$510.00');
    await expect(page.getByText('Income $500.00 • Expense $120.00')).toHaveCount(0);
  });

  test('dashboard Weekly Digest remains deterministic across rapid populated profile switch and switch-back', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('success');
    await registerAndOpenDashboard(page);

    const profileSwitch = page.getByTestId('profile-switch');
    await expect(profileSwitch).toHaveValue('profile_personal');

    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');
    await expect(page.getByTestId('weekly-digest-card-loading')).toHaveCount(0);

    await profileSwitch.selectOption('profile_personal');
    await expect(profileSwitch).toHaveValue('profile_personal');
    await expect(page.getByTestId('weekly-digest-card-loading')).toHaveCount(0);

    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$380.00');
    await expect(page.getByText('Income $920.00 • Expense $410.00')).toHaveCount(0);
  });

  test('dashboard AI Chat modal supports deterministic whitespace-disabled guard and close path', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await page.getByTestId('open-ai-insights-chat').click();
    await expect(page.getByTestId('ai-insights-chat')).toBeVisible();
    await expect(page.getByTestId('ai-chat-question-input')).toBeVisible();
    await expect(page.getByTestId('ai-chat-submit')).toBeVisible();
    await expect(page.getByTestId('ai-chat-close')).toBeVisible();

    await page.getByTestId('ai-chat-question-input').fill('   ');
    await expect(page.getByTestId('ai-chat-submit')).toBeDisabled();
    await expect(page.getByTestId('ai-chat-latest-response')).toHaveCount(0);

    await page.getByTestId('ai-chat-close').click();
    await expect(page.getByTestId('ai-insights-chat')).toHaveCount(0);
  });

  test('dashboard AI Chat modal supports deterministic successful submit path', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await page.getByTestId('open-ai-insights-chat').click();
    await expect(page.getByTestId('ai-insights-chat')).toBeVisible();

    await page.getByTestId('ai-chat-question-input').fill('How can I reduce dining spend this week?');
    await page.getByTestId('ai-chat-submit').click();

    await expect(page.getByTestId('ai-chat-submit')).toBeDisabled();

    await expect(page.getByTestId('ai-chat-latest-response')).toBeVisible();
    await expect(page.getByTestId('ai-chat-latest-response')).toContainText('Focus on dining this week');
    await expect(page.getByTestId('ai-chat-submit')).toBeEnabled();
  });

  test('dashboard AI Chat modal supports deterministic failed submit path', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setAiChatMode('error');
    await registerAndOpenDashboard(page);

    await page.getByTestId('open-ai-insights-chat').click();
    await expect(page.getByTestId('ai-insights-chat')).toBeVisible();

    await page.getByTestId('ai-chat-question-input').fill('How can I reduce dining spend this week?');
    await page.getByTestId('ai-chat-submit').click();

    await expect(page.getByTestId('ai-chat-submit')).toBeDisabled();
    await expect(page.getByTestId('ai-chat-loading-skeleton')).toBeVisible();

    await expect(page.getByTestId('ai-chat-error')).toContainText('We couldn’t generate insights right now. Please try again.');
    await expect(page.getByText('failed')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-submit')).toBeEnabled();
  });

  test('dashboard AI Chat modal supports deterministic retry after failure in same session', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setAiChatMode('error');
    await registerAndOpenDashboard(page);

    await page.getByTestId('open-ai-insights-chat').click();
    await expect(page.getByTestId('ai-insights-chat')).toBeVisible();

    await page.getByTestId('ai-chat-question-input').fill('How can I reduce dining spend this week?');
    await page.getByTestId('ai-chat-submit').click();

    await expect(page.getByTestId('ai-chat-error')).toContainText('We couldn’t generate insights right now. Please try again.');

    mockApi.setAiChatMode('success');
    await page.getByTestId('ai-chat-submit').click();

    await expect(page.getByTestId('ai-chat-loading-skeleton')).toBeVisible();
    await expect(page.getByTestId('ai-chat-latest-response')).toContainText('Focus on dining this week');
    await expect(page.getByTestId('ai-chat-error')).toHaveCount(0);
  });

  test('dashboard AI Chat modal resets latest response after close and reopen', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await page.getByTestId('open-ai-insights-chat').click();
    await expect(page.getByTestId('ai-insights-chat')).toBeVisible();

    await page.getByTestId('ai-chat-question-input').fill('How can I reduce dining spend this week?');
    await page.getByTestId('ai-chat-submit').click();
    await expect(page.getByTestId('ai-chat-latest-response')).toContainText('Focus on dining this week');

    await page.getByTestId('ai-chat-close').click();
    await expect(page.getByTestId('ai-insights-chat')).toHaveCount(0);

    await page.getByTestId('open-ai-insights-chat').click();
    await expect(page.getByTestId('ai-insights-chat')).toBeVisible();
    await expect(page.getByTestId('ai-chat-latest-response')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-error')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-question-input')).toHaveValue('How can I save more this month?');
  });

  test('dashboard Smart Metrics renders six cards with valid payload', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSmartMetricsMode('normal');

    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-metrics-grid-section')).toBeVisible();
    try {
      await expect(page.getByTestId('smart-metrics-request-state')).toHaveText('settled-success');
    } catch (error) {
      await logSmartMetricsDomDebug(page, 'before-settled-success-timeout');
      throw error;
    }
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
    await expect(page.getByTestId('smart-metrics-grid')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-savings-score')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-spend-velocity')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-financial-health')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-top-category')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-budget-confidence')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-projected-savings')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-url')).toContainText('/dashboard/metrics');

    const requestUrlFromDom = (await page.getByTestId('smart-metrics-request-url').textContent()) || '';
    const intercept = mockApi.getSmartMetricsInterceptDiagnostics();
    assertDeterministicSmartMetricsIntercept(intercept, requestUrlFromDom);
  });

  test('dashboard Smart Metrics loading transitions to success state', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSmartMetricsMode('loading');

    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-metrics-grid-section')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-state')).toHaveText('requested');
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('loading');
    await expect(page.getByTestId('smart-metrics-loading-grid')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-state')).toHaveText('settled-success');
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
    await expect(page.getByTestId('smart-metrics-grid')).toBeVisible();
    await expect(page.getByTestId('smart-metric-card-savings-score')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-url')).toContainText('/dashboard/metrics');

    const requestUrlFromDom = (await page.getByTestId('smart-metrics-request-url').textContent()) || '';
    const intercept = mockApi.getSmartMetricsInterceptDiagnostics();
    assertDeterministicSmartMetricsIntercept(intercept, requestUrlFromDom);
  });

  test('dashboard Smart Metrics empty state renders safely', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSmartMetricsMode('empty');

    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-metrics-grid-section')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-state')).toHaveText('settled-empty');
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('empty');
    await expect(page.getByTestId('smart-metrics-empty-state')).toBeVisible();
    await expect(page.getByText('Smart metrics are warming up')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-url')).toContainText('/dashboard/metrics');

    const requestUrlFromDom = (await page.getByTestId('smart-metrics-request-url').textContent()) || '';
    const intercept = mockApi.getSmartMetricsInterceptDiagnostics();
    assertDeterministicSmartMetricsIntercept(intercept, requestUrlFromDom);
  });

  test('dashboard Smart Metrics error state is isolated and keeps dashboard usable', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSmartMetricsMode('error');

    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-metrics-grid-section')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-state')).toHaveText('settled-error');
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('error');
    await expect(page.getByTestId('smart-metrics-error-state')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-retry')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Recent Transactions/i })).toBeVisible();
    await expect(page.getByTestId('add-transaction-button')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-url')).toContainText('/dashboard/metrics');

    const requestUrlFromDom = (await page.getByTestId('smart-metrics-request-url').textContent()) || '';
    const intercept = mockApi.getSmartMetricsInterceptDiagnostics();
    assertDeterministicSmartMetricsIntercept(intercept, requestUrlFromDom);
    expect(intercept.requests.some((request) => request.status !== null && request.status >= 500)).toBeTruthy();
  });

  test('dashboard Smart Metrics helper affordances render for applicable metrics', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setSmartMetricsMode('normal');

    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-metrics-grid-section')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-request-state')).toHaveText('settled-success');
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
    await expect(page.getByTestId('smart-metrics-grid')).toBeVisible();
    await expect(page.getByTestId('smart-metric-helper-savings-score')).toBeVisible();
    await expect(page.getByTestId('smart-metric-helper-spend-velocity')).toBeVisible();
    await expect(page.getByTestId('smart-metric-helper-financial-health')).toBeVisible();
    await expect(page.getByTestId('smart-metric-helper-budget-confidence')).toBeVisible();
    await expect(page.getByTestId('smart-metric-helper-projected-savings')).toBeVisible();
    await expect(page.getByTestId('smart-metric-helper-top-category')).toHaveCount(0);
    await expect(page.getByTestId('smart-metrics-request-url')).toContainText('/dashboard/metrics');

    const requestUrlFromDom = (await page.getByTestId('smart-metrics-request-url').textContent()) || '';
    const intercept = mockApi.getSmartMetricsInterceptDiagnostics();
    assertDeterministicSmartMetricsIntercept(intercept, requestUrlFromDom);
  });

  test('dashboard V2 release sanity loads core surfaces together', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Emergency Fund');
  });

  test('dashboard V2 release sanity keeps cross-surface coexistence stable during digest error and savings-goal empty states', async ({ page }) => {
    const mockApi = await installMockApi(page);
    mockApi.setWeeklyDigestMode('error');
    mockApi.setSavingsGoalsMode('empty');
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('weekly-digest-card-error')).toBeVisible();
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-empty')).toBeVisible();
    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
  });

  test('dashboard V2 release sanity profile switch keeps key completed surfaces in stable terminal states', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    const profileSwitch = page.getByTestId('profile-switch');
    await profileSwitch.selectOption('profile_shared');
    await expect(profileSwitch).toHaveValue('profile_shared');

    await expect(page.getByTestId('subscriptions-monthly-total')).toHaveText('$41.50');
    await expect(page.getByTestId('weekly-digest-net-total')).toHaveText('$510.00');
    await expect(page.getByTestId('smart-dashboard-top-savings-goal-title')).toHaveText('Home Upgrade Fund');
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
  });

  test('release candidate core sanity register/login lands on stable app shell', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('add-transaction-button')).toBeVisible();
    await expect(page.getByTestId('nav-transactions')).toBeVisible();
    await expect(page.getByTestId('nav-settings')).toBeVisible();
  });

  test('release candidate core sanity fresh-account add-first-transaction happy path stays stable', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);

    const addButton = page.getByTestId('add-transaction-button');
    const emptyStateAddButton = page.getByTestId('add-first-transaction');
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
    } else {
      await emptyStateAddButton.click();
    }

    await page.getByTestId('amount-input').fill('9.99');
    await page.getByTestId('description-input').fill('Core Flow Coffee');
    const createExpenseResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/expenses') && resp.request().method() === 'POST',
    );
    await page.getByTestId('submit-transaction').click();

    const createdExpense = (await (await createExpenseResponse).json()) as Tx;
    await expect(page.getByTestId(`view-${createdExpense.expense_id}`)).toBeVisible();
  });

  test('release candidate core sanity settings delete-account failure path remains stable with friendly message', async ({ page }) => {
    await installMockApi(page);
    await page.route('**/api/auth/account**', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'boom' } }),
        });
        return;
      }
      await route.fallback();
    });
    await registerAndOpenDashboard(page);

    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL(/\/settings/);
    await page.getByTestId('settings-delete-account').click();
    await page.getByTestId('delete-account-confirm-input').fill('DELETE');
    await page.getByTestId('confirm-delete-account').click();
    await expect(page.getByText('Server error. Please try again shortly.')).toBeVisible();
  });

  test('launch signoff app-shell navigation sanity dashboard to transactions to dashboard remains stable', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole('heading', { name: /Transactions/i })).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
  });

  test('launch signoff app-shell navigation sanity dashboard to settings to dashboard remains stable', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByTestId('settings-delete-account')).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('weekly-digest-card')).toBeVisible();
  });

  test('launch signoff app-shell navigation sanity dashboard to analytics to dashboard remains stable', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await page.getByTestId('nav-analytics').click();
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('subscriptions-card')).toBeVisible();
  });

  test('final release signoff confirmation dashboard shell opens with core V2 card visible', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-insights-card')).toBeVisible();
  });

  test('final release signoff confirmation app-shell reaches transactions route deterministically', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await page.getByTestId('nav-transactions').click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole('heading', { name: /Transactions/i })).toBeVisible();
  });

  test('final release signoff confirmation return to dashboard remains stable after analytics route', async ({ page }) => {
    await installMockApi(page);
    await registerAndOpenDashboard(page);

    await page.getByTestId('nav-analytics').click();
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('smart-dashboard-net-balance-value')).toBeVisible();
    await expect(page.getByTestId('smart-metrics-mode')).toHaveText('success');
  });
});
