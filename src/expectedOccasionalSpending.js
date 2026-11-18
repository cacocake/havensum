import { categorySettings } from './ledger.js';
import { isLoanExpense } from './expectedBills.js';
import { k_spendingBehaviors } from './domainConstants.js';
import { eventsInMonth, isPlannedCostLink } from './plannedCosts.js';

export function isOccasionalExpense(state, expense) {
  return !isLoanExpense(state, expense) && (isPlannedCostLink(expense.plannedCost)
    || (expense.kind || categorySettings(state.categories, expense.category).kind) === k_spendingBehaviors.occasional);
}

export function occasionalSpending(state, stats) {
  return stats.expenses.filter(expense => isOccasionalExpense(state, expense)).reduce((total, expense) => total + expense.net, 0);
}

export function expectedOccasionalEvents(state, month, registered, today) {
  const matchedExpenseIds = new Set();
  return eventsInMonth(state.events ?? [], month).map(event => {
    const paymentId = state.outlook?.eventPayments?.[event.id];
    const linkedPayments = registered.expenses.filter(expense =>
      expense.plannedCost?.eventId === event.id && expense.plannedCost.month === month && isOccasionalExpense(state, expense));
    const legacyPayment = registered.expenses.find(expense =>
      expense.id === paymentId && !expense.plannedCost && isOccasionalExpense(state, expense) && !matchedExpenseIds.has(expense.id));
    if (legacyPayment) {
      linkedPayments.push(legacyPayment);
      matchedExpenseIds.add(legacyPayment.id);
    }
    const paid = linkedPayments.filter(expense => expense.date <= today).reduce((sum, expense) => sum + expense.amount, 0);
    const registeredAmount = linkedPayments.reduce((sum, expense) => sum + expense.amount, 0);
    return { ...event, paymentId: legacyPayment?.id, paid, scheduled: registeredAmount - paid,
      remaining: Math.max(0, event.amount - registeredAmount) };
  });
}
