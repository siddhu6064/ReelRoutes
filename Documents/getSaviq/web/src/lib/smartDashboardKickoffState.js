export function deriveNetBalanceCardState({ loading, error, summary }) {
  if (loading) {
    return { mode: 'loading' };
  }

  if (error) {
    return { mode: 'error', message: 'Net balance is unavailable right now.' };
  }

  const netBalance = summary?.net_balance;
  if (typeof netBalance !== 'number') {
    return { mode: 'empty', message: 'No balance data yet.' };
  }

  return { mode: 'success', netBalance };
}


export function deriveIncomeCardState({ loading, error, summary }) {
  if (loading) {
    return { mode: 'loading' };
  }

  if (error) {
    return { mode: 'error', message: 'Income is unavailable right now.' };
  }

  const totalIncome = summary?.total_income;
  if (typeof totalIncome !== 'number') {
    return { mode: 'empty', message: 'No income data yet.' };
  }

  return { mode: 'success', totalIncome };
}


export function deriveTotalSpendCardState({ loading, error, summary }) {
  if (loading) {
    return { mode: 'loading' };
  }

  if (error) {
    return { mode: 'error', message: 'Total spend is unavailable right now.' };
  }

  const totalSpend = summary?.total_spend;
  if (typeof totalSpend !== 'number') {
    return { mode: 'empty', message: 'No spend data yet.' };
  }

  return { mode: 'success', totalSpend };
}


export function deriveCurrentMonthSpendCardState({ loading, error, summary }) {
  if (loading) {
    return { mode: 'loading' };
  }

  if (error) {
    return { mode: 'error', message: 'Current month spend is unavailable right now.' };
  }

  const currentMonthSpend = summary?.current_month_spend;
  if (typeof currentMonthSpend !== 'number') {
    return { mode: 'empty', message: 'No current month spend data yet.' };
  }

  return { mode: 'success', currentMonthSpend };
}


export function deriveMonthOverMonthChangeCardState({ loading, error, summary }) {
  if (loading) {
    return { mode: 'loading' };
  }

  if (error) {
    return { mode: 'error', message: 'MoM change is unavailable right now.' };
  }

  const monthOverMonthChange = summary?.month_over_month_change_pct;
  if (typeof monthOverMonthChange !== 'number') {
    return { mode: 'empty', message: 'No month-over-month trend yet.' };
  }

  return { mode: 'success', monthOverMonthChange };
}


export function deriveTopSavingsGoalCardState({ loading, error, goalDisplay }) {
  if (loading) {
    return { mode: 'loading' };
  }

  if (error) {
    return { mode: 'error', message: 'Savings goal is unavailable right now.' };
  }

  if (!goalDisplay) {
    return { mode: 'empty', message: 'No active savings goals yet.' };
  }

  return { mode: 'success', goalDisplay };
}
