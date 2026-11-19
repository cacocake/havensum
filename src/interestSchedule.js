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

function previousMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Display periods: each runs through the month before its successor starts.
export function interestPeriodsForDisplay(account) {
  const periods = sortedInterestPeriods(account);
  return periods.map((period, index) => ({
    ...period,
    through: index + 1 < periods.length ? previousMonth(periods[index + 1].since) : null
  }));
}

const k_monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export class InterestScheduleError extends Error {}

export function isInterestRate(rate) {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
}

function sortedSchedule(schedule) {
  return [...schedule].sort((first, second) => first.since.localeCompare(second.since));
}

// Adds or replaces the period starting in `since`. Rates for recorded months
// are not edited here: after the first period, new periods start in the
// current month or later. Historical corrections are a separate flow.
export function scheduleWithPeriod(schedule, { since, rate }, currentMonth) {
  if (!k_monthPattern.test(since)) {
    throw new InterestScheduleError('Choose a start month as YYYY-MM.');
  }
  if (!isInterestRate(rate)) {
    throw new InterestScheduleError('Enter a non-negative effective annual rate.');
  }
  if (schedule.length && since < currentMonth) {
    throw new InterestScheduleError('New rates start in the current or a future month. Earlier months keep their recorded interest.');
  }
  return sortedSchedule([...schedule.filter(period => period.since !== since), { since, rate }]);
}

export function scheduleWithoutPeriod(schedule, since, currentMonth) {
  if (since < currentMonth) {
    throw new InterestScheduleError('A past rate period stays in place so recorded interest keeps its history.');
  }
  return schedule.filter(period => period.since !== since);
}
