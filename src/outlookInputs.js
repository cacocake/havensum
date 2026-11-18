// A bill is observed independently of its category's other expenses.
// Exact account/category IDs and a normalized title keep identities inspectable.
export function billIdentity(transaction) {
  return JSON.stringify([transaction.account ?? null, transaction.category ?? null, (transaction.title || '').trim().toLowerCase()]);
}

const k_monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const k_maximumHistoryWindow = 120;

function requireValid(condition) {
  if (!condition) {
    throw new SyntaxError('Invalid outlook inputs. Keep the original backup and review its prediction settings.');
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredIdentifier(value) {
  return typeof value === 'string' || Number.isSafeInteger(value);
}

export function validateOutlookState(state) {
  const outlook = state?.outlook;
  if (outlook === undefined) {
    return state;
  }
  requireValid(isRecord(outlook));
  if (outlook.window !== undefined) {
    requireValid(Number.isInteger(outlook.window) && outlook.window > 0 && outlook.window <= k_maximumHistoryWindow);
  }
  if (outlook.completeMonths !== undefined) {
    requireValid(Array.isArray(outlook.completeMonths) && outlook.completeMonths.every(month => typeof month === 'string' && k_monthPattern.test(month)));
  }
  if (outlook.billCancellations !== undefined) {
    requireValid(isRecord(outlook.billCancellations));
    for (const [key, month] of Object.entries(outlook.billCancellations)) {
      let identity;
      try {
        identity = JSON.parse(key);
      } catch {
        requireValid(false);
      }
      requireValid(Array.isArray(identity) && identity.length === 3 && typeof identity[2] === 'string');
      requireValid(identity.slice(0, 2).every(value => value === null || isStoredIdentifier(value)));
      requireValid(typeof month === 'string' && k_monthPattern.test(month));
    }
  }
  if (outlook.eventPayments !== undefined) {
    requireValid(isRecord(outlook.eventPayments));
    const paymentIds = Object.values(outlook.eventPayments);
    requireValid(paymentIds.every(isStoredIdentifier));
    requireValid(new Set(paymentIds).size === paymentIds.length);
  }
  for (const field of ['incomeChanges', 'loanChanges']) {
    if (outlook[field] === undefined) {
      continue;
    }
    requireValid(Array.isArray(outlook[field]));
    const seenKeys = new Set();
    for (const change of outlook[field]) {
      requireValid(isRecord(change) && typeof change.since === 'string' && k_monthPattern.test(change.since));
      requireValid(Number.isSafeInteger(change.amount) && change.amount >= 0);
      if (field === 'loanChanges') {
        requireValid(isStoredIdentifier(change.loanId));
      }
      const key = JSON.stringify([change.loanId ?? null, change.since]);
      requireValid(!seenKeys.has(key));
      seenKeys.add(key);
    }
  }
  return state;
}
