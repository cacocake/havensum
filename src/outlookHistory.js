import { monthOf, previousMonths } from './calendar.js';
import { k_defaultHistoryWindow } from './domainConstants.js';
import { hasRecordedFinancialActivity } from './reportingHistory.js';

// Completed calendar months before the earlier of `firstMonth` and today's
// month. Owner-confirmed complete months win, including confirmed zeros;
// otherwise months with recorded activity give a partial estimate.
export function completedHistory(state, firstMonth, today, windowLength) {
  const currentMonth = monthOf(today);
  const historyAnchor = firstMonth < currentMonth ? firstMonth : currentMonth;
  const window = previousMonths(historyAnchor, windowLength).reverse();
  const confirmed = window.filter(historyMonth => (state.outlook?.completeMonths || []).includes(historyMonth));
  const selected = confirmed.length ? confirmed : window.filter(historyMonth => hasRecordedFinancialActivity(state.transactions, historyMonth));
  return { window, selected, partial: !confirmed.length };
}

export function outlookHistory(state, month, today) {
  return completedHistory(state, month, today, state.outlook?.window || k_defaultHistoryWindow);
}
