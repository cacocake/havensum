import { monthOf } from './calendar.js';

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

export function isValidYearAmounts(event) {
  if (event.yearAmounts === undefined) {
    return true;
  }
  const isRecord = event.yearAmounts !== null && typeof event.yearAmounts === 'object' && !Array.isArray(event.yearAmounts);
  if (!isRecord || event.year) {
    return false;
  }
  return Object.entries(event.yearAmounts)
    .every(([year, amount]) => k_yearKeyPattern.test(year) && Number.isSafeInteger(amount) && amount >= 0);
}

export function eventsInMonth(events, month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return events.filter(event => event.month === monthNumber && (!event.year || event.year === year));
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
      if (year < earliestYear) {
        continue;
      }
      const month = `${year}-${String(event.month).padStart(2, '0')}`;
      const monthLabel = new Date(year, event.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
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
