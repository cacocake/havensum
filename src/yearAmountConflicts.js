import { euro } from './money.js';

// Owner decision F20: a backup-merge conflict on a recurring planned cost's
// year amounts reads in plain words. The merge decision is unchanged:
// `yearAmounts` is one field, so choosing a side takes that side's whole set.
const k_plannedCostCollection = 'events';
const k_yearAmountsField = 'yearAmounts';

export function isYearAmountConflict(conflict) {
  return conflict.collection === k_plannedCostCollection && conflict.field === k_yearAmountsField;
}

function plannedCostById(state, id) {
  return (state[k_plannedCostCollection] ?? []).find(event => event.id === id);
}

// Adds the planned cost's name and each side's usual amount to each
// year-amount conflict, for display only. A field conflict means both sides
// still hold the planned cost.
export function describeYearAmountConflicts(conflicts, localState, remoteState) {
  return conflicts.map(conflict => {
    if (!isYearAmountConflict(conflict)) {
      return conflict;
    }
    const localPlannedCost = plannedCostById(localState, conflict.id);
    const remotePlannedCost = plannedCostById(remoteState, conflict.id);
    return {
      ...conflict,
      plannedCostName: localPlannedCost?.name ?? remotePlannedCost?.name ?? String(conflict.id),
      usualAmounts: { local: localPlannedCost?.amount, remote: remotePlannedCost?.amount }
    };
  });
}

// The years whose amount differs between the two sides, in calendar order.
function differingYears(conflict) {
  const localAmounts = conflict.local ?? {};
  const remoteAmounts = conflict.remote ?? {};
  const allYears = new Set([...Object.keys(localAmounts), ...Object.keys(remoteAmounts)]);
  return [...allYears]
    .filter(year => localAmounts[year] !== remoteAmounts[year])
    .sort();
}

// "2027", "2027 and 2028", "2026, 2027 and 2028".
function yearListPhrase(years) {
  if (years.length === 1) {
    return years[0];
  }
  return `${years.slice(0, -1).join(', ')} and ${years.at(-1)}`;
}

function plannedCostLabel(conflict) {
  return conflict.plannedCostName ?? String(conflict.id);
}

export function yearAmountConflictTitle(conflict) {
  const years = differingYears(conflict);
  if (!years.length) {
    return `${plannedCostLabel(conflict)} · amounts by year`;
  }
  const amountWord = years.length === 1 ? 'amount' : 'amounts';
  return `${plannedCostLabel(conflict)} · ${amountWord} for ${yearListPhrase(years)}`;
}

function usualAmountPhrase(conflict, side) {
  const usualAmount = conflict.usualAmounts?.[side];
  return usualAmount === undefined ? 'usual amount' : `usual amount (${euro(usualAmount)})`;
}

// A year without its own amount on a side uses that side's usual amount.
function sideAmountPhrase(conflict, side, year) {
  const yearAmount = conflict[side]?.[year];
  if (yearAmount !== undefined) {
    return euro(yearAmount);
  }
  return usualAmountPhrase(conflict, side);
}

export function yearAmountConflictLines(conflict, side) {
  const years = differingYears(conflict);
  // An empty set against no set at all still differs as stored, though no year does.
  if (!years.length) {
    return [`No year amounts; every year uses the ${usualAmountPhrase(conflict, side)}`];
  }
  return years.map(year => `Amount for ${year}: ${sideAmountPhrase(conflict, side, year)}`);
}
