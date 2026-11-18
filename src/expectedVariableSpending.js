import { categorySettings } from './ledger.js';
import { isLoanExpense, isFixedBill } from './expectedBills.js';
import { k_spendingBehaviors, k_systemCategoryIds } from './domainConstants.js';

export function expectedVariableSpending(state, historyStats, actual, registered, remainingFraction) {
  const buckets = new Map();
  function allocate(stats, field) {
    for (const expense of stats.expenses) {
      const category = categorySettings(state.categories, expense.category);
      const kind = expense.kind || category.kind;
      if (isLoanExpense(state, expense) || isFixedBill(state, expense) || kind === k_spendingBehaviors.occasional) {
        continue;
      }
      const categoryId = category.parentId ?? category.id ?? k_systemCategoryIds.uncategorized;
      if (!buckets.has(categoryId)) {
        buckets.set(categoryId, { category: categoryId, name: categorySettings(state.categories, categoryId).name, history: 0, actual: 0, registered: 0 });
      }
      buckets.get(categoryId)[field] += expense.net;
    }
  }
  for (const stats of historyStats) {
    allocate(stats, 'history');
  }
  allocate(actual, 'actual');
  allocate(registered, 'registered');
  return [...buckets.values()].map(bucket => {
    const average = Math.round(bucket.history / Math.max(1, historyStats.length));
    const remaining = Math.round(average * remainingFraction);
    return { ...bucket, average, expected: Math.max(bucket.registered, bucket.actual + remaining) };
  });
}
