import { compoundSavings } from './savingsInterest.js';
import { upgradeCategoryVisuals } from './categoryVisuals.js';

// The preparation every ledger receives before use: completed-month savings
// interest and the category visual upgrade. Used at startup and after restore.
export function prepareLoadedLedger(state, currentMonth) {
  return upgradeCategoryVisuals(compoundSavings(state, currentMonth));
}
