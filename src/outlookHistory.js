import { monthOf, previousMonths } from './calendar.js';
import { k_defaultHistoryWindow } from './domainConstants.js';
import { hasRecordedFinancialActivity } from './reportingHistory.js';

export function outlookHistory(state, month, today) {
  const window = previousMonths(month, state.outlook?.window || k_defaultHistoryWindow).reverse();
  const eligible = window.filter(historyMonth => historyMonth < monthOf(today));
  const confirmed = eligible.filter(historyMonth => (state.outlook?.completeMonths || []).includes(historyMonth));
  const selected = confirmed.length ? confirmed : eligible.filter(historyMonth => hasRecordedFinancialActivity(state.transactions, historyMonth));
  return { window, selected, partial: !confirmed.length };
}
