import { monthStats, reportingMonthStats, categorySettings, hasCategoryParent } from './ledger.js';
import { monthOf, daysInMonth, k_calendarDateLength } from './calendar.js';
import { expectedSavings } from './expectedSavings.js';
import { outlookHistory } from './outlookHistory.js';
import { k_reportingPeriods, k_systemCategoryIds } from './domainConstants.js';

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

// A read-only outlook. Never writes a plan, transaction or past month.
export function planInsights(state, month, today = new Date().toISOString().slice(0, k_calendarDateLength)) {
  const recordedState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.date <= today)
  };
  const { window: history, selected: recorded, partial } = outlookHistory(recordedState, month, today);
  const count = recorded.length;
  const average = field => {
    if (!count) {
      return null;
    }
    const total = recorded.reduce((total, historyMonth) => total + monthStats(recordedState, historyMonth)[field], 0);
    return Math.round(total / count);
  };
  const averages = { income: average('income'), spent: average('spent'), balance: average('balance') };
  const categories = state.categories.filter(category => !hasCategoryParent(category) && !k_incomeCategoryIds.has(category.id)).map(category => {
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
  const actual = reportingMonthStats(state, month, today);
  const days = daysInMonth(month);
  const elapsed = elapsedDays(period, days, today);
  const remainingMonthFraction = (days - elapsed) / days;
  const insights = { plan, actual, averages, categories, history, recorded, count, period, days, elapsed, partial };
  const prediction = expectedSavings(state, month, today);
  const forecast = prediction ? { ...prediction, variance: plan ? prediction.balance - plan.balance : null } : null;
  return { ...insights, forecast, lines: prediction?.variableLines || [] };
}
