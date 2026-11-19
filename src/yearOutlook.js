import { monthStats } from './ledger.js';
import { monthKeyOf, monthOf, k_calendarDateLength } from './calendar.js';
import { k_monthsPerYear, k_reportingPeriods } from './domainConstants.js';
import { expectedSavings } from './expectedSavings.js';
import { interestProjection } from './expectedInterest.js';
import { sumCents } from './money.js';
import { plannedMonth } from './planArchive.js';
import { hasRecordedFinancialActivity, reportingPeriod } from './reportingHistory.js';
import { yearOutlookDrivers } from './yearOutlookDrivers.js';

function totalsOf(income, expense) {
  return { income, expense, balance: income - expense };
}

function statsTotals(stats) {
  return totalsOf(stats.income, stats.spent);
}

function sumTotals(entries) {
  const income = sumCents(entries.map(entry => entry.income));
  const expense = sumCents(entries.map(entry => entry.expense));
  return totalsOf(income, expense);
}

function recordedTotals(recordedState, month, period) {
  if (period === k_reportingPeriods.future) {
    return null;
  }
  return statsTotals(monthStats(recordedState, month));
}

// Current posting semantics (LEDGER-1 undecided): entries dated in a future
// month are registered, not recorded, and are shown as scheduled.
function scheduledTotals(state, month, period) {
  if (period !== k_reportingPeriods.future || !hasRecordedFinancialActivity(state.transactions, month)) {
    return null;
  }
  return statsTotals(monthStats(state, month));
}

function outlookMonth(state, recordedState, month, { today, planRevisionId, projectedInterest }) {
  const period = reportingPeriod(month, monthOf(today));
  const hasRecords = hasRecordedFinancialActivity(recordedState.transactions, month);
  const isConfirmedComplete = (state.outlook?.completeMonths ?? []).includes(month);
  const isForecast = period !== k_reportingPeriods.past;
  // A past month without records or confirmation has no evidence, not a zero result.
  const hasEvidence = isForecast || hasRecords || isConfirmedComplete;
  const prediction = hasEvidence ? expectedSavings(state, month, today, { projectedInterest }) : null;
  const plan = plannedMonth(state, month, planRevisionId);
  return {
    month,
    period,
    hasRecords,
    isConfirmedComplete,
    recorded: recordedTotals(recordedState, month, period),
    scheduled: scheduledTotals(state, month, period),
    expected: prediction ? totalsOf(prediction.income, prediction.expense) : null,
    planned: plan ? totalsOf(plan.income, plan.expense) : null,
    prediction: isForecast ? prediction : null,
    partial: isForecast && Boolean(prediction?.partial)
  };
}

function monthKeys(months) {
  return months.map(month => month.month);
}

// A read-only full-year outlook: recorded months, expected months (the
// current month's estimate already includes its recorded activity) and the
// frozen target side by side. Never writes a plan or a transaction.
export function yearOutlook(state, year, today = new Date().toISOString().slice(0, k_calendarDateLength), { planRevisionId = null } = {}) {
  const recordedState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.date <= today)
  };
  const projectedInterest = interestProjection(state, monthKeyOf(year, k_monthsPerYear));
  const monthOptions = { today, planRevisionId, projectedInterest };
  const months = Array.from({ length: k_monthsPerYear }, (_, index) =>
    outlookMonth(state, recordedState, monthKeyOf(year, index + 1), monthOptions));
  const plannedMonths = months.filter(month => month.planned);
  // Only months with both an outlook and a target are compared.
  const comparableMonths = plannedMonths.filter(month => month.expected);
  const expectedOverComparableMonths = sumTotals(comparableMonths.map(month => month.expected));
  const plannedOverComparableMonths = sumTotals(comparableMonths.map(month => month.planned));
  const variance = comparableMonths.length ? expectedOverComparableMonths.balance - plannedOverComparableMonths.balance : null;
  return {
    year,
    months,
    recorded: sumTotals(months.filter(month => month.recorded).map(month => month.recorded)),
    expected: sumTotals(months.filter(month => month.expected).map(month => month.expected)),
    planned: plannedMonths.length ? sumTotals(plannedMonths.map(month => month.planned)) : null,
    plannedMonths: monthKeys(plannedMonths),
    comparableMonths: monthKeys(comparableMonths),
    variance,
    unavailableMonths: monthKeys(months.filter(month => !month.expected)),
    partialMonths: monthKeys(months.filter(month => month.partial)),
    drivers: yearOutlookDrivers(state, year, months.filter(month => month.prediction))
  };
}
