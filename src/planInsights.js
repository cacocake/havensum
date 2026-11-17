import { monthStats, categorySettings } from './ledger.js';
import { monthOf, previousMonths, daysInMonth, k_calendarDateLength } from './calendar.js';
import { hasRecordedFinancialActivity } from './reportingHistory.js';
import { k_defaultHistoryWindow, k_reportingPeriods, k_spendingBehaviors, k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

const k_incomeCategoryIds = new Set([k_systemCategoryIds.salary, k_systemCategoryIds.interest]);

function reportingPeriod(month, currentMonth) {
  if (month < currentMonth) {
    return k_reportingPeriods.past;
  }
  if (month > currentMonth) {
    return k_reportingPeriods.future;
  }
  return k_reportingPeriods.current;
}

function elapsedDays(period, days, today) {
  if (period === k_reportingPeriods.past) {
    return days;
  }
  if (period === k_reportingPeriods.future) {
    return 0;
  }
  return Math.min(days, Number(today.split('-')[2]));
}

function projectSpendingLine(line, period, remainingMonthFraction) {
  if (period === k_reportingPeriods.past) {
    return line.actual;
  }
  if (period === k_reportingPeriods.future) {
    return line.planned;
  }
  if (line.kind === k_spendingBehaviors.fixed) {
    return Math.max(line.actual + line.scheduled, line.planned);
  }
  const remainingAllowance = Math.round(line.planned * remainingMonthFraction);
  return line.actual + Math.max(line.scheduled, remainingAllowance);
}

function projectCommittedAmount(actualAmount, scheduledAmount, plannedAmount, period) {
  if (period === k_reportingPeriods.past) {
    return actualAmount;
  }
  if (period === k_reportingPeriods.future) {
    return plannedAmount;
  }
  return Math.max(actualAmount + scheduledAmount, plannedAmount);
}

// A read-only outlook. Never writes a plan, transaction or past month.
export function planInsights(state, month, today = new Date().toISOString().slice(0, k_calendarDateLength)) {
  const recordedState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.date <= today)
  };
  const historyWindow = state.plan?.window || k_defaultHistoryWindow;
  const history = previousMonths(month, historyWindow).reverse();
  const recorded = history.filter(historyMonth => (
    historyMonth < monthOf(today) && hasRecordedFinancialActivity(recordedState.transactions, historyMonth)
  ));
  const count = recorded.length;
  const average = field => {
    if (!count) {
      return null;
    }
    const total = recorded.reduce((total, historyMonth) => total + monthStats(recordedState, historyMonth)[field], 0);
    return Math.round(total / count);
  };
  const averages = { income: average('income'), spent: average('spent'), balance: average('balance') };
  const categories = state.categories.filter(category => !category.parentId && !k_incomeCategoryIds.has(category.id)).map(category => {
    const totals = recorded.map(historyMonth => monthStats(recordedState, historyMonth).expenses
      .filter(expense => {
        const resolvedCategory = categorySettings(state.categories, expense.category);
        return resolvedCategory.id === category.id || resolvedCategory.parentId === category.id;
      })
      .reduce((total, expense) => total + expense.net, 0));
    const average = count ? Math.round(totals.reduce((total, amount) => total + amount, 0) / count) : null;
    return { ...category, average };
  });
  const plan = state.plan?.months[month] || null;
  const period = reportingPeriod(month, monthOf(today));
  const actual = monthStats(recordedState, month);
  const days = daysInMonth(month);
  const elapsed = elapsedDays(period, days, today);
  const remainingMonthFraction = (days - elapsed) / days;
  const insights = { plan, actual, averages, categories, history, recorded, count, period, days, elapsed };
  if (!plan) {
    return { ...insights, forecast: null, lines: [] };
  }

  const buckets = new Map();
  const getBucket = (category, kind) => {
    const key = `${category}:${kind}`;
    if (!buckets.has(key)) {
      buckets.set(key, { category, kind, planned: 0, actual: 0, scheduled: 0, name: categorySettings(state.categories, category).name });
    }
    return buckets.get(key);
  };
  for (const line of plan.lines || []) {
    const bucket = getBucket(line.category, line.kind);
    bucket.planned += line.amount;
    bucket.override = Boolean(line.override || bucket.override);
  }

  const allocateExpenses = (expenses, amountField) => {
    const totals = { loan: 0, occasional: 0 };
    for (const expense of expenses) {
      const settings = categorySettings(state.categories, expense.category);
      const rootCategory = settings.parentId || settings.id || expense.category || k_systemCategoryIds.uncategorized;
      const behavior = expense.kind || settings.kind;
      if (rootCategory === k_systemCategoryIds.loan) {
        totals.loan += expense.net;
        continue;
      }
      if (behavior === k_spendingBehaviors.occasional) {
        totals.occasional += expense.net;
        continue;
      }
      getBucket(rootCategory, behavior)[amountField] += expense.net;
    }
    return totals;
  };
  const actualTotals = allocateExpenses(actual.expenses, 'actual');
  let scheduledTotals = { loan: 0, occasional: 0 };
  let scheduledIncome = 0;
  if (period === k_reportingPeriods.current) {
    const scheduledState = {
      ...state,
      transactions: state.transactions.filter(transaction => transaction.type !== k_transactionTypes.reimbursement || transaction.date <= today)
    };
    const scheduledExpenses = monthStats(scheduledState, month).expenses.filter(expense => expense.date > today);
    scheduledTotals = allocateExpenses(scheduledExpenses, 'scheduled');
    scheduledIncome = state.transactions
      .filter(transaction => transaction.type === k_transactionTypes.income && monthOf(transaction.date) === month && transaction.date > today)
      .reduce((total, transaction) => total + transaction.amount, 0);
  }

  const lines = [...buckets.values()]
    .filter(line => line.category !== k_systemCategoryIds.loan)
    .map(line => ({ ...line, forecast: projectSpendingLine(line, period, remainingMonthFraction) }));
  const reserve = (plan.cushion || 0) + (plan.event || 0);
  const loan = projectCommittedAmount(actualTotals.loan, scheduledTotals.loan, plan.loan || 0, period);
  const occasional = projectCommittedAmount(actualTotals.occasional, scheduledTotals.occasional, reserve, period);
  const income = projectCommittedAmount(actual.income, scheduledIncome, plan.income, period);
  const expense = lines.reduce((total, line) => total + line.forecast, 0) + loan + occasional;
  const balance = income - expense;
  const forecast = { income, expense, balance, loan, occasional, variance: balance - plan.balance };
  return { ...insights, forecast, lines };
}
