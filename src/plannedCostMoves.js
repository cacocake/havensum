// Moving a recurring planned cost from a chosen year onwards (owner decisions
// F16/F17). Earlier years keep their month, so their linked expenses stay valid.
// Expenses linked to the old month in a moved year keep their link and are
// flagged for review; frozen plans and recorded transactions are never rewritten.
import { monthOf, yearOfMonth } from './calendar.js';
import { k_transactionTypes } from './domainConstants.js';
import { isMonthNumber, isPlannedCostLink, needsPlannedCostReview, plannedCostMonth, plannedCostOccurrenceMonth } from './plannedCosts.js';

// A move can start this year or in one of the next few years.
export const k_moveYearsAhead = 5;

export const k_moveErrors = Object.freeze({
  notRecurring: 'Choose a recurring planned cost to move.',
  invalidMonth: 'Choose a month from January to December.',
  pastYear: 'A move can start this year or a later year.'
});

function currentYear(today) {
  return yearOfMonth(monthOf(today));
}

export function plannedCostMoveYears(today) {
  const firstYear = currentYear(today);
  return Array.from({ length: k_moveYearsAhead + 1 }, (_, offset) => firstYear + offset);
}

function recurringPlannedCost(state, eventId) {
  const event = (state.events ?? []).find(candidate => candidate.id === eventId);
  if (!event || event.year) {
    throw Error(k_moveErrors.notRecurring);
  }
  return event;
}

// Keeps moves before the first year, sets the month from that year and drops
// later moves. A move that repeats the month already in effect is dropped, so
// moving back to the original month leaves no move behind.
function movedEvent(event, fromYear, month) {
  const { monthFromYear: earlierMoves = {}, ...unmovedEvent } = event;
  const keptMoves = Object.entries(earlierMoves).filter(([firstYear]) => Number(firstYear) < fromYear);
  const candidateMoves = [...keptMoves, [String(fromYear), month]].sort(([left], [right]) => left.localeCompare(right));
  const monthFromYear = {};
  let monthInEffect = event.month;
  for (const [firstYear, movedMonth] of candidateMoves) {
    if (movedMonth === monthInEffect) {
      continue;
    }
    monthFromYear[firstYear] = movedMonth;
    monthInEffect = movedMonth;
  }
  if (!Object.keys(monthFromYear).length) {
    return unmovedEvent;
  }
  return { ...unmovedEvent, monthFromYear };
}

function sameMoves(left, right) {
  return JSON.stringify(left.monthFromYear ?? {}) === JSON.stringify(right.monthFromYear ?? {});
}

// Expenses linked to an occurrence from the first moved year on that no longer
// matches the cost's month for that year.
function expensesToReview(state, event, fromYear) {
  return (state.transactions ?? []).filter(transaction => transaction.type === k_transactionTypes.expense
    && isPlannedCostLink(transaction.plannedCost)
    && transaction.plannedCost.eventId === event.id
    && yearOfMonth(transaction.plannedCost.month) >= fromYear
    && needsPlannedCostReview(transaction, event, plannedCostOccurrenceMonth(event, yearOfMonth(transaction.plannedCost.month))));
}

export function plannedCostMovePreview(state, { eventId, fromYear, month }) {
  const event = recurringPlannedCost(state, eventId);
  const moved = movedEvent(event, fromYear, month);
  return {
    event: moved,
    isChange: !sameMoves(event, moved),
    previousMonth: plannedCostMonth(event, fromYear),
    replacedMoveYears: Object.keys(event.monthFromYear ?? {}).map(Number).filter(firstYear => firstYear > fromYear),
    expensesToReview: expensesToReview(state, moved, fromYear)
  };
}

export function movePlannedCost(state, { eventId, fromYear, month, today }) {
  const event = recurringPlannedCost(state, eventId);
  if (!isMonthNumber(month)) {
    throw Error(k_moveErrors.invalidMonth);
  }
  if (!Number.isInteger(fromYear) || fromYear < currentYear(today)) {
    throw Error(k_moveErrors.pastYear);
  }
  const preview = plannedCostMovePreview(state, { eventId, fromYear, month });
  if (!preview.isChange) {
    throw Error(`${event.name} is already in that month from ${fromYear}.`);
  }
  return { ...state, events: state.events.map(candidate => candidate.id === eventId ? preview.event : candidate) };
}
