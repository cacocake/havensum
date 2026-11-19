import { monthStats } from './ledger.js';
import { monthKeyOf, monthOf, k_calendarDateLength } from './calendar.js';
import { k_monthsPerYear, k_reportingPeriods } from './domainConstants.js';
import { expectedSavings } from './expectedSavings.js';
import { plannedMonth } from './planArchive.js';
import { hasRecordedFinancialActivity } from './reportingHistory.js';
import { yearOutlookDrivers } from './yearOutlookDrivers.js';

function totalsOf(income, expense) {
  return { income, expense, balance: income - expense };
}

function sumTotals(entries) {
  const income = entries.reduce((total, entry) => total + entry.income, 0);
  const expense = entries.reduce((total, entry) => total + entry.expense, 0);
  return totalsOf(income, expense);
}

function reportingPeriod(month, currentMonth) {
  if (month < currentMonth) {
    return k_reportingPeriods.past;
  }
  if (month > currentMonth) {
    return k_reportingPeriods.future;
  }
  return k_reportingPeriods.current;
}

function outlookMonth(state, recordedState, month, today, planRevisionId) {
  const period = reportingPeriod(month, monthOf(today));
  const hasRecords = hasRecordedFinancialActivity(recordedState.transactions, month);
  let recorded = null;
  if (period !== k_reportingPeriods.future) {
    const stats = monthStats(recordedState, month);
    recorded = totalsOf(stats.income, stats.spent);
  }
  const isConfirmedComplete = (state.outlook?.completeMonths ?? []).includes(month);
  // A past month without records or confirmation has no evidence, not a zero result.
  const hasEvidence = period !== k_reportingPeriods.past || hasRecords || isConfirmedComplete;
  const prediction = hasEvidence ? expectedSavings(state, month, today) : null;
  const expected = prediction ? totalsOf(prediction.income, prediction.expense) : null;
  const plan = plannedMonth(state, month, planRevisionId);
  const planned = plan ? totalsOf(plan.income, plan.expense) : null;
  const isForecast = period !== k_reportingPeriods.past;
  return { month, period, hasRecords, recorded, expected, planned, prediction: isForecast ? prediction : null, partial: isForecast && Boolean(prediction?.partial) };
}

// A read-only full-year outlook: recorded months, expected months (the
// current month's estimate already includes its recorded activity) and the
// frozen target side by side. Never writes a plan or a transaction.
export function yearOutlook(state, year, today = new Date().toISOString().slice(0, k_calendarDateLength), { planRevisionId = null } = {}) {
  const recordedState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.date <= today)
  };
  const months = Array.from({ length: k_monthsPerYear }, (_, index) =>
    outlookMonth(state, recordedState, monthKeyOf(year, index + 1), today, planRevisionId));
  const recordedMonths = months.filter(month => month.recorded);
  const expectedMonths = months.filter(month => month.expected);
  const plannedMonths = months.filter(month => month.planned);
  const planned = plannedMonths.length ? sumTotals(plannedMonths.map(month => month.planned)) : null;
  // Only months with both an outlook and a target are compared.
  const comparableMonths = plannedMonths.filter(month => month.expected);
  const expectedOverComparableMonths = sumTotals(comparableMonths.map(month => month.expected));
  const plannedOverComparableMonths = sumTotals(comparableMonths.map(month => month.planned));
  return {
    year,
    months,
    recorded: sumTotals(recordedMonths.map(month => month.recorded)),
    expected: sumTotals(expectedMonths.map(month => month.expected)),
    planned,
    plannedMonths: plannedMonths.map(month => month.month),
    comparableMonths: comparableMonths.map(month => month.month),
    variance: comparableMonths.length ? expectedOverComparableMonths.balance - plannedOverComparableMonths.balance : null,
    unavailableMonths: months.filter(month => !month.expected).map(month => month.month),
    partialMonths: months.filter(month => month.partial).map(month => month.month),
    drivers: yearOutlookDrivers(state, year, months.filter(month => month.prediction))
  };
}
