// FORECAST-2 discovery: what a named cost actually came to in its completed
// occurrences. Nothing here is shown in the app or written to the ledger.
import { monthOf, yearOfMonth } from './calendar.js';
import { k_transactionTypes } from './domainConstants.js';
import { netExpenses } from './ledger.js';
import { paybackTaskSummary } from './paybackTasks.js';
import { needsPlannedCostReview } from './plannedCosts.js';
import { sumCents } from './money.js';

export const k_occurrenceStatus = Object.freeze({
  completed: 'completed',
  unconfirmed: 'unconfirmed',
  needsReview: 'needsReview',
  awaitingPayback: 'awaitingPayback',
  noPayments: 'noPayments'
});

const k_openPaybackStatuses = new Set(['open', 'partial']);

function occurrenceMonth(year, event) {
  return `${year}-${String(event.month).padStart(2, '0')}`;
}

// A one-off cost has its own year. A recurring cost occurs every year from the
// first year the ledger records anything.
function pastOccurrenceMonths(state, event, today) {
  const currentMonth = monthOf(today);
  if (event.year) {
    const month = occurrenceMonth(event.year, event);
    return month < currentMonth ? [month] : [];
  }
  const recordedDates = state.transactions.map(transaction => transaction.date).filter(date => date <= today);
  if (!recordedDates.length) {
    return [];
  }
  const firstYear = yearOfMonth(monthOf(recordedDates.reduce((earliest, date) => date < earliest ? date : earliest)));
  const months = [];
  for (let year = firstYear; year <= yearOfMonth(currentMonth); year += 1) {
    const month = occurrenceMonth(year, event);
    if (month < currentMonth) {
      months.push(month);
    }
  }
  return months;
}

function hasOpenPayback(state, expenseId, today) {
  return (state.paybackTasks ?? [])
    .filter(task => task.expenseId === expenseId)
    .some(task => k_openPaybackStatuses.has(paybackTaskSummary(state, task.id, today).status));
}

function occurrenceStatus(state, recordedState, event, month, linkedPayments, today) {
  const hasPaymentsToReview = recordedState.transactions.some(transaction => transaction.type === k_transactionTypes.expense
    && needsPlannedCostReview(transaction, event, month));
  if (hasPaymentsToReview) {
    return k_occurrenceStatus.needsReview;
  }
  if (!(state.outlook?.completeMonths ?? []).includes(month)) {
    return k_occurrenceStatus.unconfirmed;
  }
  if (!linkedPayments.length) {
    return k_occurrenceStatus.noPayments;
  }
  if (linkedPayments.some(payment => hasOpenPayback(state, payment.id, today))) {
    return k_occurrenceStatus.awaitingPayback;
  }
  return k_occurrenceStatus.completed;
}

// Uses only what was recorded by `today`, so an earlier date gives the
// evidence that was available then.
export function plannedCostOccurrences(state, event, today) {
  const recordedState = { ...state, transactions: state.transactions.filter(transaction => transaction.date <= today) };
  return pastOccurrenceMonths(recordedState, event, today).map(month => {
    const linkedPayments = netExpenses(recordedState.transactions, month)
      .filter(expense => expense.plannedCost?.eventId === event.id && expense.plannedCost.month === month);
    return {
      month,
      status: occurrenceStatus(state, recordedState, event, month, linkedPayments, today),
      actual: sumCents(linkedPayments.map(payment => payment.net)),
      paymentIds: linkedPayments.map(payment => payment.id)
    };
  });
}

// Fewer completed occurrences than this give no estimate: the owner enters an amount.
export const k_minimumComparableOccurrences = 2;
const k_middleDivisor = 2;

// Only occurrences of the same recurring cost are comparable. Names, payment
// categories and free text are not used to match different costs.
export function comparableOccurrences(state, event, today) {
  if (event.year) {
    return [];
  }
  return plannedCostOccurrences(state, event, today).filter(occurrence => occurrence.status === k_occurrenceStatus.completed);
}

function medianCents(sortedAmounts) {
  const middle = Math.floor(sortedAmounts.length / k_middleDivisor);
  if (sortedAmounts.length % k_middleDivisor) {
    return sortedAmounts[middle];
  }
  return Math.round((sortedAmounts[middle - 1] + sortedAmounts[middle]) / k_middleDivisor);
}

export function comparableCostEstimate(comparable) {
  if (comparable.length < k_minimumComparableOccurrences) {
    return { enough: false, comparable };
  }
  const sortedAmounts = comparable.map(occurrence => occurrence.actual).sort((left, right) => left - right);
  return {
    enough: true,
    estimate: medianCents(sortedAmounts),
    low: sortedAmounts[0],
    high: sortedAmounts[sortedAmounts.length - 1],
    comparable
  };
}
