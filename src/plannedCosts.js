import { monthKeyOf, monthOf } from './calendar.js';
import { longMonthLabel } from './monthLabels.js';
import { k_monthsPerYear } from './domainConstants.js';

const k_occurrenceMonth = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPlannedCostLink(link) {
  return link !== null && typeof link === 'object'
    && ((typeof link.eventId === 'string' && Boolean(link.eventId.trim())) || Number.isSafeInteger(link.eventId))
    && typeof link.month === 'string' && k_occurrenceMonth.test(link.month)
    && (link.singleOccurrence === undefined || link.singleOccurrence === true);
}

export function expenseReportingMonth(expense) {
  return isPlannedCostLink(expense.plannedCost) ? expense.plannedCost.month : monthOf(expense.date);
}

const k_yearKeyPattern = /^\d{4}$/;

// A recurring planned cost can carry an amount for a single year, set when the
// owner accepts a suggestion in that year's draft (owner decision F16).
export function plannedCostAmount(event, year) {
  return event.yearAmounts?.[String(year)] ?? event.amount;
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidYearAmounts(event) {
  if (event.yearAmounts === undefined) {
    return true;
  }
  if (!isPlainRecord(event.yearAmounts) || event.year) {
    return false;
  }
  return Object.entries(event.yearAmounts)
    .every(([year, amount]) => k_yearKeyPattern.test(year) && Number.isSafeInteger(amount) && amount >= 0);
}

// A recurring planned cost can move from a chosen year onwards (owner decision
// F16): `monthFromYear` maps each first year to the month used from then on.
// Earlier years keep `month`, the cost's original month.
export function plannedCostMonth(event, year) {
  if (event.year || !event.monthFromYear) {
    return event.month;
  }
  const movesInEffect = Object.keys(event.monthFromYear)
    .filter(firstYear => Number(firstYear) <= year)
    .sort();
  if (!movesInEffect.length) {
    return event.month;
  }
  return event.monthFromYear[movesInEffect.at(-1)];
}

// The cost's occurrence in a year as a month key, such as "2027-11".
export function plannedCostOccurrenceMonth(event, year) {
  return monthKeyOf(year, plannedCostMonth(event, year));
}

const k_firstMonth = 1;

export function isMonthNumber(value) {
  return Number.isInteger(value) && value >= k_firstMonth && value <= k_monthsPerYear;
}

export function isValidMonthFromYear(event) {
  if (event.monthFromYear === undefined) {
    return true;
  }
  if (!isPlainRecord(event.monthFromYear) || event.year) {
    return false;
  }
  return Object.entries(event.monthFromYear)
    .every(([year, month]) => k_yearKeyPattern.test(year) && isMonthNumber(month));
}

// A one-off cost occurs in its own year. A recurring cost occurs every year
// from its start year, set when a draft adds it (owner decision P04); one
// without a start year occurs every year.
export function plannedCostOccursInYear(event, year) {
  if (event.year) {
    return event.year === year;
  }
  if (event.fromYear === undefined) {
    return true;
  }
  return year >= event.fromYear;
}

export function isValidFromYear(event) {
  if (event.fromYear === undefined) {
    return true;
  }
  return !event.year && Number.isSafeInteger(event.fromYear) && k_yearKeyPattern.test(String(event.fromYear));
}

// How a recurring cost repeats, for display: "every year" or "every year from 2027".
export function plannedCostRepeatText(event) {
  if (event.fromYear === undefined) {
    return 'every year';
  }
  return `every year from ${event.fromYear}`;
}

// The planned costs that occur in a year, in month order, each with its month
// for that year.
export function plannedCostsInYear(events, year) {
  return events.filter(event => plannedCostOccursInYear(event, year))
    .map(event => ({ event, month: plannedCostMonth(event, year) }))
    .sort((left, right) => left.month - right.month || left.event.name.localeCompare(right.event.name));
}

export function eventsInMonth(events, month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return events.filter(event => plannedCostOccursInYear(event, year) && plannedCostMonth(event, year) === monthNumber);
}

export function needsPlannedCostReview(expense, event, month) {
  const link = expense.plannedCost;
  return isPlannedCostLink(link) && link.eventId === event.id && link.month !== month
    && ((link.singleOccurrence && event.year) || link.month.slice(0, 4) === month.slice(0, 4));
}

// Offers occurrences from the year before the payment onwards, so a payment
// settled after its planned cost can still link to it (owner decision F15).
export function plannedCostOptions(events, paymentDate, savedLink) {
  const paymentYear = Number(paymentDate.slice(0, 4));
  const earliestYear = paymentYear - 1;
  const savedYear = savedLink ? Number(savedLink.month.slice(0, 4)) : paymentYear;
  const years = new Set([earliestYear, paymentYear, paymentYear + 1, savedYear]);
  const options = new Map();
  for (const event of events) {
    for (const year of event.year ? [event.year] : years) {
      // A link saved to a year before a recurring cost's start falls back to its original month below.
      if (!plannedCostOccursInYear(event, year)) {
        continue;
      }
      const month = plannedCostOccurrenceMonth(event, year);
      const isSavedOccurrence = savedLink?.eventId === event.id && month === savedLink.month;
      if (year < earliestYear && !isSavedOccurrence) {
        continue;
      }
      const monthLabel = longMonthLabel(month);
      const link = { eventId: event.id, month };
      if (event.year) {
        link.singleOccurrence = true;
      }
      options.set(JSON.stringify(link), { label: `${event.name} · ${monthLabel}`, month });
    }
  }
  if (savedLink && !options.has(JSON.stringify(savedLink))) {
    const event = events.find(candidate => candidate.id === savedLink.eventId);
    options.set(JSON.stringify(savedLink), {
      label: `${event?.name ?? 'Former planned cost'} · original month ${savedLink.month}`,
      month: savedLink.month
    });
  }
  return [...options].sort(([, left], [, right]) => left.month.localeCompare(right.month) || left.label.localeCompare(right.label))
    .map(([value, option]) => ({ value, label: option.label }));
}
