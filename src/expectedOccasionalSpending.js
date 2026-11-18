import { categorySettings } from './ledger.js';
import { isLoanExpense } from './expectedBills.js';
import { k_spendingBehaviors } from './domainConstants.js';

export function isOccasionalExpense(state, expense) {
  return !isLoanExpense(state, expense) && (expense.kind || categorySettings(state.categories, expense.category).kind) === k_spendingBehaviors.occasional;
}

export function occasionalSpending(state, stats) {
  return stats.expenses.filter(expense => isOccasionalExpense(state, expense)).reduce((total, expense) => total + expense.net, 0);
}

export function expectedOccasionalEvents(state, month, registered) {
  const matchedExpenseIds = new Set();
  return (state.events || []).filter(event => (
    event.month === Number(month.slice(5, 7)) && (!event.year || event.year === Number(month.slice(0, 4)))
  )).map(event => {
    const paymentId = state.outlook?.eventPayments?.[event.id];
    const payment = registered.expenses.find(expense => expense.id === paymentId && isOccasionalExpense(state, expense) && !matchedExpenseIds.has(expense.id));
    if (payment) {
      matchedExpenseIds.add(payment.id);
    }
    return { ...event, paymentId: payment?.id, remaining: Math.max(0, event.amount - (payment?.amount || 0)) };
  });
}
