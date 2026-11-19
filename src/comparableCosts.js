// FORECAST-2 discovery: what a named cost actually came to in its completed
// occurrences. Nothing here is shown in the app or written to the ledger.
import { k_calendarDateLength, monthOf, yearOfMonth } from './calendar.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';
import { hasCategoryParent, netExpenses } from './ledger.js';
import { paybackTaskSummary } from './paybackTasks.js';
import { needsPlannedCostReview } from './plannedCosts.js';
import { sumCents } from './money.js';

export const k_occurrenceStatus = Object.freeze({
  completed: 'completed',
  unconfirmed: 'unconfirmed',
  needsReview: 'needsReview',
  awaitingPayback: 'awaitingPayback',
  noPayments: 'noPayments',
  refunded: 'refunded'
});

// Fewer completed occurrences than this give no estimate: the owner enters an amount.
export const k_minimumComparableOccurrences = 3;
// Only the most recent comparable occurrences shape the estimate.
export const k_maximumComparableOccurrences = 5;

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
  if (!sumCents(linkedPayments.map(payment => payment.net))) {
    return k_occurrenceStatus.refunded;
  }
  return k_occurrenceStatus.completed;
}

// Only transactions and payback tasks dated by `evaluationDate` are used. Month
// confirmations and the cost's current month are read as they are now.
function occurrencesWithPayments(state, event, evaluationDate) {
  const recordedTransactions = state.transactions.filter(transaction => transaction.date <= evaluationDate);
  return pastOccurrenceMonths(recordedTransactions, event, evaluationDate).map(month => {
    const linkedPayments = netExpenses(recordedTransactions, month)
      .filter(expense => expense.plannedCost?.eventId === event.id && expense.plannedCost.month === month);
    return {
      month,
      status: occurrenceStatus(state, recordedTransactions, event, month, linkedPayments, evaluationDate),
      actual: sumCents(linkedPayments.map(payment => payment.net)),
      linkedPayments
    };
  });
}

export function plannedCostOccurrences(state, event, evaluationDate) {
  return occurrencesWithPayments(state, event, evaluationDate).map(({ linkedPayments, ...occurrence }) => ({
    ...occurrence,
    paymentIds: linkedPayments.map(payment => payment.id)
  }));
}

// Subcategories count toward their parent. Uncategorized expenses have no category.
function topLevelCategory(state, categoryId) {
  const category = state.categories.find(candidate => candidate.id === categoryId);
  if (!category) {
    return null;
  }
  return hasCategoryParent(category) ? category.parentId : category.id;
}

// The category holding the largest net share of an occurrence's linked expenses.
// Equal shares go to the category whose ID sorts first, so the choice is stable.
function topCategoryOf(state, linkedPayments) {
  const netByCategory = new Map();
  for (const payment of linkedPayments) {
    const categoryId = topLevelCategory(state, payment.category);
    if (categoryId === null) {
      continue;
    }
    netByCategory.set(categoryId, (netByCategory.get(categoryId) ?? 0) + payment.net);
  }
  const ranked = [...netByCategory].filter(([, net]) => net > 0)
    .sort(([leftId, leftNet], [rightId, rightNet]) => rightNet - leftNet || leftId.localeCompare(rightId));
  return ranked.length ? ranked[0][0] : null;
}

function completedOccurrences(state, event, evaluationDate) {
  return occurrencesWithPayments(state, event, evaluationDate)
    .filter(occurrence => occurrence.status === k_occurrenceStatus.completed)
    .map(occurrence => ({
      eventId: event.id,
      name: event.name,
      month: occurrence.month,
      actual: occurrence.actual,
      topCategory: topCategoryOf(state, occurrence.linkedPayments)
    }));
}

// The category a planned cost is compared by: the owner's "like" choice (a
// category or another planned cost), otherwise its own latest completed occurrence.
function comparisonCategory(state, event, evaluationDate, like, ownOccurrences) {
  if (like?.categoryId) {
    return topLevelCategory(state, like.categoryId);
  }
  const likeEvent = like?.eventId === undefined ? event : state.events.find(candidate => candidate.id === like.eventId);
  if (!likeEvent) {
    return null;
  }
  const likeOccurrences = likeEvent === event ? ownOccurrences : completedOccurrences(state, likeEvent, evaluationDate);
  return likeOccurrences.length ? likeOccurrences[likeOccurrences.length - 1].topCategory : null;
}

// Past years of the same recurring cost, plus completed occurrences of other
// planned costs with the same top category. Names and free text are never matched.
export function comparableOccurrences(state, event, evaluationDate, like) {
  const ownOccurrences = event.year ? [] : completedOccurrences(state, event, evaluationDate);
  const category = comparisonCategory(state, event, evaluationDate, like, ownOccurrences);
  const otherOccurrences = category === null ? [] : state.events
    .filter(candidate => candidate.id !== event.id)
    .flatMap(candidate => completedOccurrences(state, candidate, evaluationDate))
    .filter(occurrence => occurrence.topCategory === category);
  return [...ownOccurrences, ...otherOccurrences]
    .sort((left, right) => left.month.localeCompare(right.month) || String(left.eventId).localeCompare(String(right.eventId)));
}

// With an even count, the two middle amounts are averaged and a half cent rounds up.
function medianCents(sortedAmounts) {
  const middle = Math.floor(sortedAmounts.length / k_halves);
  if (sortedAmounts.length % k_halves) {
    return sortedAmounts[middle];
  }
  return Math.round((sortedAmounts[middle - 1] + sortedAmounts[middle]) / k_halves);
}

// Expects occurrences in month order, as comparableOccurrences returns them.
export function comparableCostEstimate(allComparable) {
  const comparable = allComparable.slice(-k_maximumComparableOccurrences);
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

const k_likeMonthLabelOptions = { month: 'short', year: 'numeric' };
const k_systemCategories = new Set(Object.values(k_systemCategoryIds));

function likeMonthLabel(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleString('en', k_likeMonthLabelOptions);
}

// What a new planned cost can be "like": a past planned cost with completed
// evidence (its latest occurrence) or a top-level spending category.
export function comparableLikeChoices(state, evaluationDate) {
  const plannedCosts = state.events.flatMap(event => {
    const occurrences = completedOccurrences(state, event, evaluationDate);
    if (!occurrences.length) {
      return [];
    }
    const latest = occurrences[occurrences.length - 1];
    return [{ like: { eventId: event.id }, label: `${event.name} · ${likeMonthLabel(latest.month)}` }];
  }).sort((left, right) => left.label.localeCompare(right.label));
  const categories = state.categories
    .filter(category => !hasCategoryParent(category) && !k_systemCategories.has(category.id))
    .map(category => ({ like: { categoryId: category.id }, label: category.name }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return { plannedCosts, categories };
}
