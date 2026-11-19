import { yearOfMonth } from './calendar.js';
import { sortedInterestPeriods } from './interestSchedule.js';

function sumOf(values) {
  return values.reduce((total, value) => total + value, 0);
}

function changesInYear(changes, year) {
  return [...(changes ?? [])]
    .filter(change => yearOfMonth(change.since) === year)
    .sort((first, second) => first.since.localeCompare(second.since));
}

function billsAcrossMonths(predictions) {
  const bills = new Map();
  for (const bill of predictions.flatMap(prediction => prediction.bills)) {
    const total = bills.get(bill.key);
    if (total) {
      total.expected += bill.expected;
      continue;
    }
    bills.set(bill.key, { key: bill.key, name: bill.name, expected: bill.expected, cancelledSince: bill.cancelledSince ?? null });
  }
  return [...bills.values()];
}

function interestAcrossMonths(state, predictions, year) {
  const accounts = new Map();
  for (const line of predictions.flatMap(prediction => prediction.interest)) {
    const total = accounts.get(line.account);
    if (total) {
      total.recorded += line.recorded;
      total.estimated += line.expected - line.recorded;
      total.expected += line.expected;
      continue;
    }
    const account = state.accounts.find(candidate => candidate.id === line.account);
    const periods = sortedInterestPeriods(account).filter(period => yearOfMonth(period.since) <= year);
    const firstPeriodIndex = Math.max(0, periods.findLastIndex(period => yearOfMonth(period.since) < year));
    accounts.set(line.account, {
      account: line.account, name: line.name, recorded: line.recorded,
      estimated: line.expected - line.recorded, expected: line.expected,
      periods: periods.slice(firstPeriodIndex)
    });
  }
  return [...accounts.values()];
}

// What shapes the expected months of a year: the scheduled changes that
// apply and the obligations behind each component. Read-only.
export function yearOutlookDrivers(state, year, forecastMonths) {
  const predictions = forecastMonths.map(month => month.prediction);
  const loanNames = new Map((state.loans ?? []).map(loan => [loan.id, loan.name]));
  return {
    forecastMonths: forecastMonths.map(month => month.month),
    incomeChanges: changesInYear(state.outlook?.incomeChanges, year).map(({ since, amount }) => ({ since, amount })),
    fixed: sumOf(predictions.map(prediction => prediction.fixed)),
    bills: billsAcrossMonths(predictions),
    loans: sumOf(predictions.map(prediction => prediction.loan)),
    loanChanges: changesInYear(state.outlook?.loanChanges, year)
      .map(({ loanId, since, amount }) => ({ loanId, name: loanNames.get(loanId) ?? 'Removed loan', since, amount })),
    variable: sumOf(predictions.flatMap(prediction => prediction.variableLines.map(line => line.expected))),
    occasional: sumOf(predictions.map(prediction => prediction.occasional)),
    // Every forecast month shares the same history, so it shares one reserve.
    monthlyReserve: predictions[0]?.monthlyReserve ?? 0,
    namedCosts: forecastMonths.flatMap(month => month.prediction.events.map(event => ({
      id: event.id, name: event.name, month: month.month, amount: event.amount, remaining: event.remaining
    }))),
    interest: interestAcrossMonths(state, predictions, year)
  };
}
