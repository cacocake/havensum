import { monthOf, previousMonths } from './calendar.js';
import { k_defaultHistoryWindow } from './domainConstants.js';
import { hasRecordedFinancialActivity } from './reportingHistory.js';

export function outlookHistory(state, month, today) {
  const currentMonth = monthOf(today);
  const historyAnchor = month < currentMonth ? month : currentMonth;
  const window = previousMonths(historyAnchor, state.outlook?.window || k_defaultHistoryWindow).reverse();
  const confirmed = window.filter(historyMonth => (state.outlook?.completeMonths || []).includes(historyMonth));
  const selected = confirmed.length ? confirmed : window.filter(historyMonth => hasRecordedFinancialActivity(state.transactions, historyMonth));
  return { window, selected, partial: !confirmed.length };
}
