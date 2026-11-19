import { categorySettings, hasCategoryParent, netExpenses } from './ledger.js';
import { completedHistory } from './outlookHistory.js';
import { isFixedBill, isLoanExpense } from './expectedBills.js';
import { billIdentity } from './outlookInputs.js';
import { expenseReportingMonth, isPlannedCostLink } from './plannedCosts.js';
import { k_spendingBehaviors, k_transactionTypes } from './domainConstants.js';
import { postedLedger } from './posting.js';
import { monthKeyOf, nextMonth } from './calendar.js';

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

// Recurring events and events in the planned year get their own plan lines.
function plannedEventIds(state, year) {
  return new Set((state.events ?? []).filter(event => !event.year || event.year === year).map(event => event.id));
}

// A payment for an event with no line in this plan is past occasional
// spending, counted in the event's occurrence month.
function isPastEventPayment(state, expense, eventIdsWithLines) {
  return isPlannedCostLink(expense.plannedCost) && !isLoanExpense(state, expense) && !eventIdsWithLines.has(expense.plannedCost.eventId);
}

// Each observed bill keeps its latest observed monthly amount, even when it is
// older than the averaging window, until the owner cancels that bill.
// Amounts are net of received linked paybacks, matching how plans measured
// fixed spending before per-bill estimates and how drift is checked.
function observedBills(state, recordedTransactions, historyAnchor) {
  const bills = new Map();
  const refunds = new Map();
  for (const payback of recordedTransactions) {
    if (payback.type === k_transactionTypes.reimbursement && payback.linkedId !== undefined) {
      refunds.set(payback.linkedId, (refunds.get(payback.linkedId) || 0) + payback.amount);
    }
  }
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
    const netAmount = Math.max(0, expense.amount - (refunds.get(expense.id) || 0));
    bill.months.set(observedMonth, (bill.months.get(observedMonth) || 0) + netAmount);
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
  const firstPlannedMonth = monthKeyOf(year, fromMonth);
  const recordedState = postedLedger(state, today);
  const recordedTransactions = recordedState.transactions;
  const history = completedHistory(recordedState, firstPlannedMonth, today, window);
  const historyAnchor = history.window.length ? nextMonth(history.window.at(-1)) : firstPlannedMonth;
  const selectedExpenses = history.selected.flatMap(month => netExpenses(recordedTransactions, month));
  const eventIdsWithLines = plannedEventIds(state, year);
  const historyExpenses = selectedExpenses.filter(expense => isEstimatedSpending(state, expense));

  const averageSpending = new Map();
  let occasionalTotal = selectedExpenses
    .filter(expense => isPastEventPayment(state, expense, eventIdsWithLines))
    .reduce((total, expense) => total + expense.net, 0);
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

export function billsDueInMonth(bills, categoryId, month) {
  return bills.filter(bill => bill.category === categoryId && !(bill.cancelledSince && bill.cancelledSince <= month));
}

// Recorded spending measured on the same basis as a plan line, so a drift
// check compares like with like: no loan or named-event payments, and for a
// fixed line only bills still due in the planned month.
export function lineSpending(state, completedMonth, line, plannedMonth) {
  const cancellations = state.outlook?.billCancellations ?? {};
  return netExpenses(state.transactions, completedMonth)
    .filter(expense => isEstimatedSpending(state, expense)
      && rootCategoryId(state, expense.category) === line.category
      && spendingBehavior(state, expense) === line.kind)
    .reduce((total, expense) => {
      if (line.kind !== k_spendingBehaviors.fixed) {
        return total + expense.net;
      }
      // Fixed lines also leave out bills cancelled by the planned month.
      const cancelledSince = cancellations[billIdentity(expense)];
      const isCancelled = Boolean(cancelledSince && cancelledSince <= plannedMonth);
      return isCancelled ? total : total + expense.net;
    }, 0);
}
