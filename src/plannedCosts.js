import { monthOf } from './calendar.js';

const k_occurrenceMonth = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPlannedCostLink(link) {
  return link !== null && typeof link === 'object'
    && ((typeof link.eventId === 'string' && Boolean(link.eventId.trim())) || Number.isSafeInteger(link.eventId))
    && typeof link.month === 'string' && k_occurrenceMonth.test(link.month);
}

export function expenseReportingMonth(expense) {
  return isPlannedCostLink(expense.plannedCost) ? expense.plannedCost.month : monthOf(expense.date);
}

export function eventsInMonth(events, month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return events.filter(event => event.month === monthNumber && (!event.year || event.year === year));
}

export function needsPlannedCostReview(expense, event, month) {
  const link = expense.plannedCost;
  return isPlannedCostLink(link) && link.eventId === event.id && link.month !== month
    && (event.year || link.month.slice(0, 4) === month.slice(0, 4));
}

export function plannedCostOptions(events, paymentDate, savedLink) {
  const paymentYear = Number(paymentDate.slice(0, 4));
  const savedYear = savedLink ? Number(savedLink.month.slice(0, 4)) : paymentYear;
  const years = new Set([paymentYear, paymentYear + 1, savedYear]);
  const options = new Map();
  for (const event of events) {
    for (const year of event.year ? [event.year] : years) {
      const month = `${year}-${String(event.month).padStart(2, '0')}`;
      if (month < monthOf(paymentDate)) {
        continue;
      }
      const monthLabel = new Date(year, event.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
      options.set(JSON.stringify({ eventId: event.id, month }), { label: `${event.name} · ${monthLabel}`, month });
    }
  }
  if (savedLink && !options.has(JSON.stringify(savedLink))) {
    options.set(JSON.stringify(savedLink), { label: `Former planned cost · ${savedLink.month}`, month: savedLink.month });
  }
  return [...options].sort(([, left], [, right]) => left.month.localeCompare(right.month) || left.label.localeCompare(right.label))
    .map(([value, option]) => ({ value, label: option.label }));
}
