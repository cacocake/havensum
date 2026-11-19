// FORECAST-2 discovery: what a named cost actually came to in its completed
// occurrences. Nothing here is shown in the app or written to the ledger.
import { k_calendarDateLength, monthOf, yearOfMonth } from './calendar.js';
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

// Fewer completed occurrences than this give no estimate: the owner enters an amount.
export const k_minimumComparableOccurrences = 2;

const k_openPaybackStatuses = new Set(['open', 'partial']);
const k_halves = 2;

function occurrenceMonth(year, event) {
  return `${year}-${String(event.month).padStart(2, '0')}`;
}

function earliestDate(dates) {
  return dates.reduce((earliest, date) => {
    if (date < earliest) {
      return date;
    }
    return earliest;
  });
}

// A one-off cost has its own year. A recurring cost occurs every year from the
// first year the ledger records anything.
function pastOccurrenceMonths(recordedTransactions, event, evaluationDate) {
  const currentMonth = monthOf(evaluationDate);
  if (event.year) {
    const month = occurrenceMonth(event.year, event);
    return month < currentMonth ? [month] : [];
  }
  if (!recordedTransactions.length) {
    return [];
  }
  const firstRecordedDate = earliestDate(recordedTransactions.map(transaction => transaction.date));
  const firstRecordedYear = yearOfMonth(monthOf(firstRecordedDate));
  const months = [];
  for (let year = firstRecordedYear; year <= yearOfMonth(currentMonth); year += 1) {
    const month = occurrenceMonth(year, event);
    if (month < currentMonth) {
      months.push(month);
    }
  }
  return months;
}

// Only tasks that existed by the evaluation date can hold an occurrence back.
// createdAt is a UTC timestamp, so its date can differ from the local date by one day.
function hasOpenPayback(state, expenseId, evaluationDate) {
  return (state.paybackTasks ?? [])
    .filter(task => task.expenseId === expenseId && task.createdAt.slice(0, k_calendarDateLength) <= evaluationDate)
    .some(task => k_openPaybackStatuses.has(paybackTaskSummary(state, task.id, evaluationDate).status));
}

function occurrenceStatus(state, recordedTransactions, event, month, linkedPayments, evaluationDate) {
  const hasPaymentsToReview = recordedTransactions.some(transaction => transaction.type === k_transactionTypes.expense
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
  if (linkedPayments.some(payment => hasOpenPayback(state, payment.id, evaluationDate))) {
    return k_occurrenceStatus.awaitingPayback;
  }
  return k_occurrenceStatus.completed;
}

// Only transactions and payback tasks dated by `evaluationDate` are used. Month
// confirmations and the cost's current month are read as they are now.
export function plannedCostOccurrences(state, event, evaluationDate) {
  const recordedTransactions = state.transactions.filter(transaction => transaction.date <= evaluationDate);
  return pastOccurrenceMonths(recordedTransactions, event, evaluationDate).map(month => {
    const linkedPayments = netExpenses(recordedTransactions, month)
      .filter(expense => expense.plannedCost?.eventId === event.id && expense.plannedCost.month === month);
    return {
      month,
      status: occurrenceStatus(state, recordedTransactions, event, month, linkedPayments, evaluationDate),
      actual: sumCents(linkedPayments.map(payment => payment.net)),
      paymentIds: linkedPayments.map(payment => payment.id)
    };
  });
}

// Only occurrences of the same recurring cost are comparable. Names, payment
// categories and free text are not used to match different costs.
export function comparableOccurrences(state, event, evaluationDate) {
  if (event.year) {
    return [];
  }
  return plannedCostOccurrences(state, event, evaluationDate)
    .filter(occurrence => occurrence.status === k_occurrenceStatus.completed);
}

// With an even count, the two middle amounts are averaged and a half cent rounds up.
function medianCents(sortedAmounts) {
  const middle = Math.floor(sortedAmounts.length / k_halves);
  if (sortedAmounts.length % k_halves) {
    return sortedAmounts[middle];
  }
  return Math.round((sortedAmounts[middle - 1] + sortedAmounts[middle]) / k_halves);
}

export function comparableCostEstimate(comparable) {
  if (comparable.length < k_minimumComparableOccurrences) {
    return { hasEnoughEvidence: false, comparable };
  }
  const sortedAmounts = comparable.map(occurrence => occurrence.actual).sort((left, right) => left - right);
  return {
    hasEnoughEvidence: true,
    estimate: medianCents(sortedAmounts),
    low: sortedAmounts[0],
    high: sortedAmounts[sortedAmounts.length - 1],
    comparable
  };
}
