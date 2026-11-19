import { categorySettings, hasCategoryParent, netExpenses } from './ledger.js';
import { completedHistory } from './outlookHistory.js';
import { isFixedBill, isLoanExpense } from './expectedBills.js';
import { billIdentity } from './outlookInputs.js';
import { expenseReportingMonth, isPlannedCostLink } from './plannedCosts.js';
import { k_monthsPerYear, k_spendingBehaviors, k_transactionTypes } from './domainConstants.js';

function monthKey(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

function rootCategoryId(state, categoryId) {
  const category = categorySettings(state.categories, categoryId);
  return hasCategoryParent(category) ? category.parentId : category.id;
}

function spendingBehavior(state, expense) {
  return expense.kind || categorySettings(state.categories, expense.category).kind;
}

// Named events have their own plan lines, and loans have the loan line.
function isEstimatedSpending(state, expense) {
  return !isPlannedCostLink(expense.plannedCost) && !isLoanExpense(state, expense);
}

// Each observed bill keeps its latest observed monthly amount, even when it is
// older than the averaging window, until the owner cancels that bill.
function observedBills(state, recordedTransactions, historyAnchor) {
  const bills = new Map();
  for (const expense of recordedTransactions) {
    const observedMonth = expenseReportingMonth(expense);
    if (expense.type !== k_transactionTypes.expense || observedMonth >= historyAnchor || !isFixedBill(state, expense)) {
      continue;
    }
    const key = billIdentity(expense);
    if (!bills.has(key)) {
      bills.set(key, { key, name: expense.title || '', category: rootCategoryId(state, expense.category), months: new Map() });
    }
    const bill = bills.get(key);
    bill.months.set(observedMonth, (bill.months.get(observedMonth) || 0) + expense.amount);
  }
  return [...bills.values()].map(bill => {
    const latestMonth = [...bill.months.keys()].sort().at(-1);
    return {
      key: bill.key,
      name: bill.name,
      category: bill.category,
      amount: bill.months.get(latestMonth),
      cancelledSince: state.outlook?.billCancellations?.[bill.key] ?? null
    };
  });
}

function averageOver(monthCount, total) {
  return monthCount ? Math.round(total / monthCount) : 0;
}

// Evidence for an annual draft. A preview reads the ledger and never writes it.
export function planDraftEstimates(state, { year, fromMonth, window, today }) {
  const firstPlannedMonth = monthKey(year, fromMonth);
  const recordedTransactions = state.transactions.filter(transaction => transaction.date <= today);
  const recordedState = { ...state, transactions: recordedTransactions };
  const history = completedHistory(recordedState, firstPlannedMonth, today, window);
  const historyAnchor = history.window.at(-1) ? monthKey(...nextMonthParts(history.window.at(-1))) : firstPlannedMonth;
  const historyExpenses = history.selected.flatMap(month => netExpenses(recordedTransactions, month))
    .filter(expense => isEstimatedSpending(state, expense));

  const averageSpending = new Map();
  let occasionalTotal = 0;
  for (const expense of historyExpenses) {
    const behavior = spendingBehavior(state, expense);
    if (behavior === k_spendingBehaviors.occasional) {
      occasionalTotal += expense.net;
      continue;
    }
    if (isFixedBill(state, expense)) {
      continue;
    }
    const key = JSON.stringify([rootCategoryId(state, expense.category), behavior]);
    averageSpending.set(key, (averageSpending.get(key) || 0) + expense.net);
  }
  const monthCount = history.selected.length;
  return {
    evidence: { months: history.selected, partial: monthCount > 0 && history.partial },
    suggestedCushion: averageOver(monthCount, occasionalTotal),
    bills: observedBills(state, recordedTransactions, historyAnchor),
    averageFor(categoryId, behavior) {
      return averageOver(monthCount, averageSpending.get(JSON.stringify([categoryId, behavior])) || 0);
    },
    behaviorsFor(categoryId) {
      const behaviors = new Set();
      for (const key of averageSpending.keys()) {
        const [keyCategory, behavior] = JSON.parse(key);
        if (keyCategory === categoryId) {
          behaviors.add(behavior);
        }
      }
      return behaviors;
    }
  };
}

function nextMonthParts(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthNumber === k_monthsPerYear ? [year + 1, 1] : [year, monthNumber + 1];
}

export function billsDueInMonth(bills, categoryId, month) {
  return bills.filter(bill => bill.category === categoryId && !(bill.cancelledSince && bill.cancelledSince <= month));
}
