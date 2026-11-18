import { categorySettings, netExpenses } from './ledger.js';
import { monthOf } from './calendar.js';
import { billIdentity } from './outlookInputs.js';
import { isPlannedCostLink } from './plannedCosts.js';
import { k_spendingBehaviors, k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

export function isLoanExpense(state, expense) {
  const category = categorySettings(state.categories, expense.category);
  return hasLoanLink(expense) || expense.category === k_systemCategoryIds.loan || category.parentId === k_systemCategoryIds.loan;
}

export function hasLoanLink(expense) {
  return expense.loanId !== undefined && expense.loanId !== null && expense.loanId !== '';
}

export function isFixedBill(state, expense) {
  return !isPlannedCostLink(expense.plannedCost) && !isLoanExpense(state, expense)
    && (expense.kind || categorySettings(state.categories, expense.category).kind) === k_spendingBehaviors.fixed;
}

export function expectedBills(state, month, today) {
  const observed = new Map();
  for (const expense of state.transactions) {
    if (expense.type !== k_transactionTypes.expense || !isFixedBill(state, expense) || expense.date > today || monthOf(expense.date) >= month) {
      continue;
    }
    const key = billIdentity(expense);
    if (!observed.has(key)) {
      observed.set(key, { key, name: expense.title || 'Untitled bill', account: expense.account, category: expense.category, months: new Map() });
    }
    const bill = observed.get(key);
    const observedMonth = monthOf(expense.date);
    bill.months.set(observedMonth, (bill.months.get(observedMonth) || 0) + expense.amount);
  }
  const receivedState = state.transactions.filter(transaction => transaction.type !== k_transactionTypes.reimbursement || transaction.date <= today);
  const registered = netExpenses(receivedState, month).filter(expense => isFixedBill(state, expense));
  for (const expense of registered) {
    const key = billIdentity(expense);
    if (!observed.has(key)) {
      observed.set(key, { key, name: expense.title || 'Untitled bill', account: expense.account, category: expense.category, months: new Map() });
    }
  }
  return [...observed.values()].map(bill => {
    const latestMonth = [...bill.months.keys()].sort().at(-1);
    const baseline = bill.months.get(latestMonth) || 0;
    const entries = registered.filter(expense => billIdentity(expense) === bill.key);
    const gross = entries.reduce((total, expense) => total + expense.amount, 0);
    const receivedPaybacks = entries.reduce((total, expense) => total + expense.refunded, 0);
    const cancelledSince = state.outlook?.billCancellations?.[bill.key];
    const cancelled = Boolean(cancelledSince && cancelledSince <= month);
    const remaining = cancelled ? 0 : Math.max(0, baseline - gross);
    const expected = gross - receivedPaybacks + remaining;
    const hasFutureEntry = entries.some(expense => expense.date > today);
    return {
      key: bill.key, name: bill.name, account: bill.account, category: bill.category,
      baseline, expected, remaining, cancelledSince,
      status: cancelled ? 'cancelled' : remaining > 0 ? 'still expected' : hasFutureEntry ? 'scheduled' : 'recorded'
    };
  });
}
