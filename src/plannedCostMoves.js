// Moving a recurring planned cost from a chosen year onwards (owner decisions
// F16/F17). Earlier years keep their month, so their linked expenses stay valid.
// Expenses linked to the old month in a moved year keep their link and are
// flagged for review; frozen plans and recorded transactions are never rewritten.
import { monthNumberOf, monthOf, yearOfMonth } from './calendar.js';
import { k_monthsPerYear, k_transactionTypes } from './domainConstants.js';
import { isMonthNumber, isPlannedCostLink, needsPlannedCostReview, plannedCostMonth, plannedCostOccurrenceMonth } from './plannedCosts.js';

// A move can start in the first allowed year or in one of the next few years.
export const k_moveYearsAhead = 5;

export const k_moveErrors = Object.freeze({
  notRecurring: 'Choose a recurring planned cost to move.',
  invalidMonth: 'Choose a month from January to December.',
  pastYear: 'A move can start this year or a later year.',
  pastMonth: 'That month has already passed this year. Start the move next year.',
  beforeStart: 'A move can start from the first year this planned cost repeats.'
});

function currentYear(today) {
  return yearOfMonth(monthOf(today));
}

function currentMonthNumber(today) {
  return monthNumberOf(monthOf(today));
}

// Owner answer: a move from this year needs its old month this year to be this
// month or later, so a past occurrence is never moved.
function canMoveThisYear(today, event) {
  return plannedCostMonth(event, currentYear(today)) >= currentMonthNumber(today);
}

// A cost that starts repeating in a later year (owner decision P04) can only
// move from that year.
function firstMoveYear(today, event) {
  const firstCalendarYear = canMoveThisYear(today, event) ? currentYear(today) : currentYear(today) + 1;
  return Math.max(firstCalendarYear, event.fromYear ?? firstCalendarYear);
}

export function plannedCostMoveYears(today, event) {
  const firstYear = firstMoveYear(today, event);
  return Array.from({ length: k_moveYearsAhead + 1 }, (_, offset) => firstYear + offset);
}

// This year offers only the months still ahead; later years offer every month.
export function plannedCostMoveMonths(today, fromYear) {
  const firstMonth = fromYear === currentYear(today) ? currentMonthNumber(today) : 1;
  return Array.from({ length: k_monthsPerYear - firstMonth + 1 }, (_, offset) => firstMonth + offset);
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

// Months only change at a stored move, so after the latest one every year
// matches; the first year whose month differs is the real change, if any.
function firstChangedYear(event, moved, fromYear) {
  const moveYears = [event, moved].flatMap(candidate => Object.keys(candidate.monthFromYear ?? {}).map(Number));
  const lastYearToCompare = Math.max(fromYear, ...moveYears);
  for (let year = fromYear; year <= lastYearToCompare; year += 1) {
    if (plannedCostMonth(event, year) !== plannedCostMonth(moved, year)) {
      return year;
    }
  }
  return null;
}

function linkYear(expense) {
  return yearOfMonth(expense.plannedCost.month);
}

function needsReviewInItsYear(expense, event) {
  return needsPlannedCostReview(expense, event, plannedCostOccurrenceMonth(event, linkYear(expense)));
}

// Expenses linked to an occurrence from the first moved year on that the move
// itself puts out of step; ones already needing review are not counted again.
function expensesToReview(state, event, moved, fromYear) {
  return (state.transactions ?? []).filter(transaction => transaction.type === k_transactionTypes.expense
    && isPlannedCostLink(transaction.plannedCost)
    && transaction.plannedCost.eventId === event.id
    && linkYear(transaction) >= fromYear
    && needsReviewInItsYear(transaction, moved)
    && !needsReviewInItsYear(transaction, event));
}

export function plannedCostMovePreview(state, { eventId, fromYear, month }) {
  const event = recurringPlannedCost(state, eventId);
  const moved = movedEvent(event, fromYear, month);
  const changedYear = firstChangedYear(event, moved, fromYear);
  if (changedYear === null) {
    return { event: moved, isChange: false, replacedMoveYears: [], expensesToReview: [] };
  }
  return {
    event: moved,
    isChange: true,
    firstChangedYear: changedYear,
    previousMonth: plannedCostMonth(event, changedYear),
    newMonth: plannedCostMonth(moved, changedYear),
    replacedMoveYears: Object.keys(event.monthFromYear ?? {}).map(Number).filter(firstYear => firstYear > fromYear),
    expensesToReview: expensesToReview(state, event, moved, fromYear)
  };
}

function checkMoveStart(today, event, fromYear, month) {
  if (!isMonthNumber(month)) {
    throw Error(k_moveErrors.invalidMonth);
  }
  if (!Number.isInteger(fromYear) || fromYear < currentYear(today)) {
    throw Error(k_moveErrors.pastYear);
  }
  if (event.fromYear !== undefined && fromYear < event.fromYear) {
    throw Error(k_moveErrors.beforeStart);
  }
  if (fromYear !== currentYear(today)) {
    return;
  }
  if (!canMoveThisYear(today, event) || month < currentMonthNumber(today)) {
    throw Error(k_moveErrors.pastMonth);
  }
}

export function movePlannedCost(state, { eventId, fromYear, month, today }) {
  const event = recurringPlannedCost(state, eventId);
  checkMoveStart(today, event, fromYear, month);
  const preview = plannedCostMovePreview(state, { eventId, fromYear, month });
  if (!preview.isChange) {
    throw Error(`${event.name} is already in that month from ${fromYear}.`);
  }
  return { ...state, events: state.events.map(candidate => candidate.id === eventId ? preview.event : candidate) };
}
