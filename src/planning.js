import { categorySettings, netExpenses, hasCategoryParent } from './ledger.js';
import { previousMonths } from './calendar.js';
import { hasRecordedFinancialActivity } from './reportingHistory.js';
import { k_defaultHistoryWindow, k_monthsPerYear, k_spendingBehaviors, k_systemCategoryIds } from './domainConstants.js';

const k_defaultPlanIncome = 245000;
const k_defaultPlanCushion = 12000;
const k_defaultFixedTolerance = 200;
const k_defaultVariableDrift = 0.3;
const k_completedMonthsForDrift = 2;
const k_driftReasons = {
  fixed: 'Fixed spending moved outside its tolerance.',
  variable: 'Variable spending moved outside the configured drift band for two completed months.'
};

export function buildPlan(state, {
  year,
  fromMonth = 1,
  income = k_defaultPlanIncome,
  cushion = k_defaultPlanCushion,
  window = k_defaultHistoryWindow,
  overrides = {},
  incomeChanges = state.plan?.incomeChanges || [],
  loanChanges = state.plan?.loanChanges || []
}) {
  const revisionMonth = `${year}-${String(fromMonth).padStart(2, '0')}`;
  const history = previousMonths(revisionMonth, window);
  const recordedMonthCount = history.filter(month => hasRecordedFinancialActivity(state.transactions, month)).length;
  const rootCategories = state.categories.filter(category => !hasCategoryParent(category));
  const lines = rootCategories.flatMap(category => {
    const settings = categorySettings(state.categories, category.id);
    const belongsToCategory = transaction => {
      const resolvedCategory = categorySettings(state.categories, transaction.category);
      return resolvedCategory.id === category.id || resolvedCategory.parentId === category.id;
    };
    const historyExpenses = history.map(month => netExpenses(state.transactions, month).filter(belongsToCategory));
    const behaviors = new Set([settings.kind]);
    for (const expense of historyExpenses.flat()) {
      behaviors.add(expense.kind || categorySettings(state.categories, expense.category).kind);
    }

    return [...behaviors].filter(behavior => behavior !== k_spendingBehaviors.occasional).map(behavior => {
      const totals = historyExpenses.map(expenses => expenses
        .filter(expense => (expense.kind || categorySettings(state.categories, expense.category).kind) === behavior)
        .reduce((total, expense) => total + expense.net, 0));
      let calculatedAmount = totals.find(total => total > 0) || 0;
      if (behavior !== k_spendingBehaviors.fixed) {
        calculatedAmount = Math.round(totals.reduce((total, amount) => total + amount, 0) / Math.max(1, recordedMonthCount));
      }
      const matchesDefaultBehavior = behavior === settings.kind;
      const lineId = matchesDefaultBehavior ? category.id : `${category.id}:${behavior}`;
      const behaviorSuffix = matchesDefaultBehavior ? '' : ` · ${behavior.toLowerCase()}`;
      return {
        id: lineId,
        category: category.id,
        name: category.name + behaviorSuffix,
        kind: behavior,
        amount: overrides[lineId] ?? calculatedAmount,
        override: overrides[lineId] !== undefined
      };
    });
  });

  const carriedMonths = state.plan?.year === year ? (state.plan.months ?? {}) : {};
  // Plans are JSON data. Clone carried history too, using the same operation on
  // Hermes and web, so a returned revision cannot mutate the source snapshot.
  const months = JSON.parse(JSON.stringify(carriedMonths));
  const monthlyLines = lines.filter(line => line.category !== k_systemCategoryIds.loan);
  for (let monthNumber = fromMonth; monthNumber <= k_monthsPerYear; monthNumber += 1) {
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const monthlyIncome = incomeChanges
      .filter(change => change.since <= month)
      .sort((first, second) => first.since.localeCompare(second.since))
      .reduce((previousIncome, change) => change.amount, income);
    const monthlyLoan = state.loans
      .filter(loan => loan.start <= month && loan.end >= month)
      .reduce((total, loan) => {
        const payment = loanChanges
          .filter(change => change.loanId === loan.id && change.since <= month)
          .sort((first, second) => first.since.localeCompare(second.since))
          .reduce((previousPayment, change) => change.amount, loan.payment);
        return total + payment;
      }, 0);
    const event = (state.events || [])
      .filter(event => event.month === monthNumber && (!event.year || event.year === year))
      .reduce((total, event) => total + event.amount, 0);
    const expense = monthlyLines.reduce((total, line) => total + line.amount, 0) + monthlyLoan + cushion + event;
    const monthLines = monthlyLines.map(line => ({ ...line }));
    months[month] = { income: monthlyIncome, expense, cushion, loan: monthlyLoan, event, lines: monthLines, balance: monthlyIncome - expense };
  }
  return {
    year, incomeChanges, loanChanges, createdAt: new Date().toISOString(), window,
    tolerance: state.plan?.tolerance ?? k_defaultFixedTolerance,
    drift: state.plan?.drift ?? k_defaultVariableDrift,
    months, revision: (state.plan?.revision || 0) + 1
  };
}
function spendingForLine(state, month, line) {
  return netExpenses(state.transactions, month)
    .filter(expense => {
      const category = categorySettings(state.categories, expense.category);
      const belongsToCategory = category.id === line.category || category.parentId === line.category;
      return belongsToCategory && (expense.kind || category.kind) === line.kind;
    })
    .reduce((total, expense) => total + expense.net, 0);
}

export function driftAlerts(state, month) {
  const plannedMonth = state.plan?.months[month];
  if (!plannedMonth) {
    return [];
  }
  const alerts = [];
  const completedMonths = previousMonths(month, k_completedMonthsForDrift);
  const fixedTolerance = state.plan.tolerance ?? k_defaultFixedTolerance;
  const variableDrift = state.plan.drift ?? k_defaultVariableDrift;

  for (const line of plannedMonth.lines) {
    const latestSpending = spendingForLine(state, completedMonths[0], line);
    if (line.kind === k_spendingBehaviors.fixed) {
      if (latestSpending > 0 && Math.abs(latestSpending - line.amount) > fixedTolerance) {
        alerts.push({ category: line.name, reason: k_driftReasons.fixed });
      }
      continue;
    }
    if (line.kind !== k_spendingBehaviors.variable || line.amount <= 0) {
      continue;
    }
    const outsideBandForBothMonths = completedMonths.every(completedMonth => (
      Math.abs(spendingForLine(state, completedMonth, line) - line.amount) / line.amount > variableDrift
    ));
    if (outsideBandForBothMonths) {
      alerts.push({ category: line.name, reason: k_driftReasons.variable });
    }
  }
  return alerts;
}
