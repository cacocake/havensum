import { latestPlan } from './planArchive.js';
import { monthOf, yearOfMonth } from './calendar.js';

// The year to invite the owner to plan, or null. The interview is offered when
// the current calendar year has no approved plan and was not deferred on this
// installation. Offering or deferring never changes financial records.
export function planInvitationYear(state, { today, deferredYear }) {
  const currentYear = yearOfMonth(monthOf(today));
  if (latestPlan(state, currentYear) || deferredYear === currentYear) {
    return null;
  }
  return currentYear;
}
