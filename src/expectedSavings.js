import { monthStats } from './ledger.js';
import { daysInMonth, monthOf, k_calendarDateLength } from './calendar.js';
import { k_transactionTypes } from './domainConstants.js';
import { outlookHistory } from './outlookHistory.js';
import { expectedBills } from './expectedBills.js';
import { expectedVariableSpending } from './expectedVariableSpending.js';
import { expectedLoanSpending } from './expectedLoans.js';
import { occasionalSpending, expectedOccasionalEvents } from './expectedOccasionalSpending.js';

// Prediction inputs are independent of the frozen Year Plan.
export function expectedSavings(state, month, today = new Date().toISOString().slice(0, k_calendarDateLength)) {
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
  const historicalIncome = Math.round(totals.reduce((total, stats) => total + stats.income, 0) / historyCount);
  const registeredState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.type !== k_transactionTypes.reimbursement || transaction.date <= today)
  };
  const registered = monthStats(registeredState, month);
  const incomeChanges = (state.outlook?.incomeChanges || []).filter(change => change.since <= month)
    .sort((first, second) => first.since.localeCompare(second.since));
  const expectedIncome = incomeChanges.at(-1)?.amount ?? historicalIncome;
  const income = Math.max(expectedIncome, registered.income);
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
  if (!totals.length && !income && !expense) {
    return null;
  }
  return { income, expense, balance: income - expense, occasional, loan, fixed, bills, variableLines, events, monthlyReserve, partial, historyMonths: history };
}
