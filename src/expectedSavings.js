import { monthStats } from './ledger.js';
import { daysInMonth, monthOf, k_calendarDateLength } from './calendar.js';
import { k_transactionTypes } from './domainConstants.js';
import { outlookHistory } from './outlookHistory.js';
import { expectedBills } from './expectedBills.js';
import { expectedVariableSpending } from './expectedVariableSpending.js';
import { expectedLoanSpending } from './expectedLoans.js';
import { occasionalSpending, expectedOccasionalEvents } from './expectedOccasionalSpending.js';
import { sumCents } from './money.js';
import { expectedInterest, scheduledInterestAccounts, scheduledInterestIncome } from './expectedInterest.js';

// Prediction inputs are independent of the frozen Year Plan.
// `projectedInterest` lets a multi-month outlook share one interest projection.
export function expectedSavings(state, month, today = new Date().toISOString().slice(0, k_calendarDateLength), { projectedInterest = null } = {}) {
  const recordedState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.date <= today)
  };
  const actual = monthStats(recordedState, month);
  if (month < monthOf(today)) {
    return { income: actual.income, expense: actual.spent, balance: actual.balance, occasional: occasionalSpending(state, actual), partial: false, historyMonths: [] };
  }
  const { selected: history, partial } = outlookHistory(recordedState, month, today);
  const totals = history.map(historyMonth => monthStats(recordedState, historyMonth));
  const historyCount = Math.max(1, totals.length);
  // Scheduled rates estimate interest directly, replacing its historical share.
  const scheduledAccountIds = new Set(scheduledInterestAccounts(state, month).map(account => account.id));
  const historicalBaseIncome = history.map((historyMonth, index) =>
    totals[index].income - scheduledInterestIncome(recordedState.transactions, historyMonth, scheduledAccountIds));
  const historicalIncome = Math.round(sumCents(historicalBaseIncome) / historyCount);
  const registeredState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.type !== k_transactionTypes.reimbursement || transaction.date <= today)
  };
  const registered = monthStats(registeredState, month);
  const incomeChanges = (state.outlook?.incomeChanges || []).filter(change => change.since <= month)
    .sort((first, second) => first.since.localeCompare(second.since));
  const expectedIncome = incomeChanges.at(-1)?.amount ?? historicalIncome;
  const registeredBaseIncome = registered.income - scheduledInterestIncome(registeredState.transactions, month, scheduledAccountIds);
  const baseIncome = Math.max(expectedIncome, registeredBaseIncome);
  const interest = expectedInterest(state, month, projectedInterest);
  const income = baseIncome + sumCents(interest.map(line => line.expected));
  const monthlyReserve = Math.round(totals.reduce((total, stats) => total + occasionalSpending(state, stats), 0) / historyCount);
  const days = daysInMonth(month);
  const elapsedDays = month > monthOf(today) ? 0 : Number(today.slice(8, 10));
  const remainingFraction = (days - elapsedDays) / days;
  const events = expectedOccasionalEvents(state, month, registered, today);
  const upcomingOccasional = events.reduce((total, event) => total + event.remaining, 0);
  const registeredOccasional = occasionalSpending(state, registered);
  const occasional = Math.max(registeredOccasional + upcomingOccasional, monthlyReserve);
  const loan = expectedLoanSpending(state, month, registered);
  const variableLines = expectedVariableSpending(state, totals, actual, registered, remainingFraction);
  const variable = variableLines.reduce((total, line) => total + line.expected, 0);
  const bills = expectedBills(state, month, today);
  const fixed = bills.reduce((total, bill) => total + bill.expected, 0);
  const expense = variable + occasional + loan + fixed;
  // Estimated interest alone is not evidence for a month.
  if (!totals.length && !baseIncome && !expense) {
    return null;
  }
  return { income, expense, balance: income - expense, occasional, loan, fixed, bills, variableLines, events, interest, monthlyReserve, partial, historyMonths: history };
}
