import { yearOfMonth } from './calendar.js';
import { sortedInterestPeriods } from './interestSchedule.js';
import { isLoanActive, loanPaymentForMonth } from './expectedLoans.js';
import { sumCents } from './money.js';

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

// Rate periods from the one in effect at the start of the year onwards.
function ratePeriodsForYear(account, year) {
  const periods = sortedInterestPeriods(account).filter(period => yearOfMonth(period.since) <= year);
  const firstPeriodIndex = Math.max(0, periods.findLastIndex(period => yearOfMonth(period.since) < year));
  return periods.slice(firstPeriodIndex);
}

// `estimated` is only the share no recorded interest replaced.
function interestAcrossMonths(state, predictions, year) {
  const accounts = new Map();
  for (const line of predictions.flatMap(prediction => prediction.interest)) {
    const estimatedShare = line.expected - line.recorded;
    const total = accounts.get(line.account);
    if (total) {
      total.recorded += line.recorded;
      total.estimated += estimatedShare;
      total.expected += line.expected;
      continue;
    }
    const account = state.accounts.find(candidate => candidate.id === line.account);
    accounts.set(line.account, {
      account: line.account,
      name: line.name,
      recorded: line.recorded,
      estimated: estimatedShare,
      expected: line.expected,
      periods: ratePeriodsForYear(account, year)
    });
  }
  return [...accounts.values()];
}

function activeLoansAcrossMonths(state, months) {
  return (state.loans ?? []).flatMap(loan => {
    const firstActiveMonth = months.find(month => isLoanActive(loan, month));
    if (!firstActiveMonth) {
      return [];
    }
    return [{ id: loan.id, name: loan.name, payment: loanPaymentForMonth(state, loan, firstActiveMonth), since: firstActiveMonth, end: loan.end }];
  });
}

function namedCostsAcrossMonths(forecastMonths) {
  return forecastMonths.flatMap(month => month.prediction.events.map(event => ({
    id: event.id,
    name: event.name,
    month: month.month,
    amount: event.amount,
    remaining: event.remaining
  })));
}

// What shapes the expected months of a year: the scheduled changes that
// apply and the obligations behind each component. Read-only.
export function yearOutlookDrivers(state, year, forecastMonths) {
  const predictions = forecastMonths.map(month => month.prediction);
  const months = forecastMonths.map(month => month.month);
  const loanNames = new Map((state.loans ?? []).map(loan => [loan.id, loan.name]));
  const loanChanges = changesInYear(state.outlook?.loanChanges, year)
    .map(({ loanId, since, amount }) => ({ loanId, name: loanNames.get(loanId) ?? 'Removed loan', since, amount }));
  return {
    forecastMonths: months,
    incomeChanges: changesInYear(state.outlook?.incomeChanges, year).map(({ since, amount }) => ({ since, amount })),
    fixed: sumCents(predictions.map(prediction => prediction.fixed)),
    bills: billsAcrossMonths(predictions),
    loans: sumCents(predictions.map(prediction => prediction.loan)),
    activeLoans: activeLoansAcrossMonths(state, months),
    loanChanges,
    variable: sumCents(predictions.flatMap(prediction => prediction.variableLines.map(line => line.expected))),
    occasional: sumCents(predictions.map(prediction => prediction.occasional)),
    // Every forecast month shares the same history, so it shares one reserve.
    monthlyReserve: predictions[0]?.monthlyReserve ?? 0,
    namedCosts: namedCostsAcrossMonths(forecastMonths),
    interest: interestAcrossMonths(state, predictions, year)
  };
}
