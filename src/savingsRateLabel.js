import { interestRateForMonth } from './interestSchedule.js';

// A short description of the savings rate in effect this month.
export function savingsRateLabel(account, currentMonth) {
  const rate = interestRateForMonth(account, currentMonth);
  if (rate !== null) {
    return `${rate}% effective annual interest`;
  }
  if (account.unscheduledInterest !== undefined) {
    return `${account.unscheduledInterest}% saved · no start month`;
  }
  return 'No interest rate scheduled';
}
