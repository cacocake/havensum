import { isMonthKey, previousMonths } from './calendar.js';

// Effective annual percentage rates per savings account, each starting in a
// month and running until the next period starts. The final period is ongoing.
export function sortedInterestPeriods(account) {
  return [...(account.interestSchedule ?? [])].sort((first, second) => first.since.localeCompare(second.since));
}

export function interestRateForMonth(account, month) {
  const period = sortedInterestPeriods(account).filter(candidate => candidate.since <= month).at(-1);
  return period ? period.rate : null;
}

export function firstInterestMonth(account) {
  return sortedInterestPeriods(account)[0]?.since ?? null;
}


// Display periods: each runs through the month before its successor starts.
export function interestPeriodsForDisplay(account) {
  const periods = sortedInterestPeriods(account);
  return periods.map((period, index) => ({
    ...period,
    through: index + 1 < periods.length ? previousMonths(periods[index + 1].since, 1)[0] : null
  }));
}

export class InterestScheduleError extends Error {}

export function isInterestRate(rate) {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
}

// Adds or replaces the period starting in `since`. Rates for recorded months
// are not edited here: periods start in the current month or later. Only an
// unscheduled legacy rate may be given its past start month. Historical
// corrections use `correctedSchedule` in the reviewed correction flow.
export function scheduleWithPeriod(schedule, period, currentMonth, { allowPastStart = false } = {}) {
  const updatedSchedule = correctedSchedule(schedule, period);
  if (period.since < currentMonth && !(allowPastStart && !schedule.length)) {
    throw new InterestScheduleError('New rates start in the current or a future month. Earlier months keep their recorded interest.');
  }
  return updatedSchedule;
}

// LEDGER-2 (L03): inside the reviewed correction flow a period may start in
// any month, including completed ones. Nothing is saved until it is applied.
export function correctedSchedule(schedule, { since, rate }) {
  if (!isMonthKey(since)) {
    throw new InterestScheduleError('Choose a start month as YYYY-MM.');
  }
  if (!isInterestRate(rate)) {
    throw new InterestScheduleError('Enter a non-negative effective annual rate.');
  }
  return sortedInterestPeriods({ interestSchedule: [...schedule.filter(period => period.since !== since), { since, rate }] });
}

export function correctedScheduleWithout(schedule, since) {
  return schedule.filter(period => period.since !== since);
}

export function scheduleWithoutPeriod(schedule, since, currentMonth) {
  if (since < currentMonth) {
    throw new InterestScheduleError('A past rate period stays in place so recorded interest keeps its history.');
  }
  return schedule.filter(period => period.since !== since);
}
