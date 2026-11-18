import { validateTransaction } from './transactionValidation.js';

export const k_currentStateVersion = 2;
const k_legacyStateVersion = 1;
const k_collectionNames = ['accounts', 'categories', 'transactions', 'loans', 'events'];
const k_spendingKinds = new Set(['Fixed', 'Variable', 'Occasional']);
const k_monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function requireValid(condition, description) {
  if (!condition) {
    throw new SyntaxError(`Invalid stored data: ${description}.`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdentifier(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStoredIdentifier(value) {
  // Legacy XLSX/JSON imports may have numeric IDs. Preserve their type and links.
  return isIdentifier(value) || Number.isSafeInteger(value);
}

function validateCentFields(record, fields) {
  for (const field of fields) {
    requireValid(Number.isSafeInteger(record[field]), `${field} must contain integer euro cents`);
  }
}

function validatePlan(plan) {
  if (plan === null) {
    return;
  }
  requireValid(isRecord(plan), 'plan must be a record');
  requireValid(Number.isInteger(plan.year) && plan.year >= 1 && plan.year <= 9999, 'plan year');
  requireValid(isRecord(plan.months), 'plan months');
  requireValid(Number.isInteger(plan.window) && plan.window > 0, 'plan history window');
  validateCentFields(plan, ['tolerance']);
  requireValid(typeof plan.drift === 'number' && Number.isFinite(plan.drift) && plan.drift > 0, 'plan drift');
  for (const collectionName of ['incomeChanges', 'loanChanges']) {
    requireValid(Array.isArray(plan[collectionName]), `plan ${collectionName}`);
    for (const change of plan[collectionName]) {
      requireValid(isRecord(change) && k_monthPattern.test(change.since), 'scheduled change month');
      validateCentFields(change, ['amount']);
      if (collectionName === 'loanChanges') {
        requireValid(isStoredIdentifier(change.loanId), 'scheduled loan ID');
      }
    }
  }
  for (const [month, plannedMonth] of Object.entries(plan.months)) {
    requireValid(k_monthPattern.test(month) && Number(month.slice(0, 4)) === plan.year, 'plan month key');
    requireValid(isRecord(plannedMonth), 'planned month');
    validateCentFields(plannedMonth, ['income', 'expense', 'balance', 'cushion', 'loan', 'event']);
    requireValid(Array.isArray(plannedMonth.lines), 'plan lines');
    for (const line of plannedMonth.lines) {
      requireValid(isRecord(line), 'plan line');
      validateCentFields(line, ['amount']);
    }
  }
}

export class UnsupportedStateVersionError extends SyntaxError {}

export function validateState(state) {
  requireValid(isRecord(state), 'ledger must be a record');
  if (state.version !== k_legacyStateVersion && state.version !== k_currentStateVersion) {
    throw new UnsupportedStateVersionError('Invalid stored data: unsupported schema version.');
  }
  for (const collectionName of k_collectionNames) {
    const records = state[collectionName];
    requireValid(Array.isArray(records), `${collectionName} must be an array`);
    const identifiers = new Set();
    for (const record of records) {
      requireValid(isRecord(record) && isStoredIdentifier(record.id), `${collectionName} record ID`);
      requireValid(!identifiers.has(record.id), `duplicate ID in ${collectionName}`);
      identifiers.add(record.id);
    }
  }
  requireValid(typeof state.demo === 'boolean', 'demo flag');
  requireValid(state.theme === 'light' || state.theme === 'dark', 'theme');
  requireValid(isRecord(state.preferences), 'preferences');
  for (const account of state.accounts) {
    requireValid(isIdentifier(account.name), 'account name');
    validateCentFields(account, ['openingBalance']);
    if (account.interest !== undefined) {
      requireValid(typeof account.interest === 'number' && Number.isFinite(account.interest) && account.interest >= 0, 'account interest');
    }
    if (account.interestStart) {
      requireValid(k_monthPattern.test(account.interestStart), 'interest start month');
    }
  }
  const categoriesById = new Map(state.categories.map(category => [category.id, category]));
  for (const category of state.categories) {
    requireValid(isIdentifier(category.name), 'category name');
    if (category.budget !== undefined && category.budget !== null && category.budget !== '') {
      validateCentFields(category, ['budget']);
    }
    if (category.kind) {
      requireValid(k_spendingKinds.has(category.kind), 'category spending behaviour');
    }
    const visitedIds = new Set([category.id]);
    let parentId = category.parentId;
    while (parentId) {
      requireValid(categoriesById.has(parentId) && !visitedIds.has(parentId), 'category ancestry');
      visitedIds.add(parentId);
      parentId = categoriesById.get(parentId).parentId;
    }
  }
  for (const loan of state.loans) {
    requireValid(isIdentifier(loan.name), 'loan name');
    validateCentFields(loan, ['remaining', 'original', 'payment']);
    requireValid(k_monthPattern.test(loan.start) && k_monthPattern.test(loan.end), 'loan months');
    requireValid(state.accounts.some(account => account.id === loan.account), 'loan account');
  }
  for (const event of state.events) {
    requireValid(isIdentifier(event.name), 'event name');
    validateCentFields(event, ['amount']);
    requireValid(Number.isInteger(event.month) && event.month >= 1 && event.month <= 12, 'event month');
  }
  for (const transaction of state.transactions) {
    const categoryId = transaction.category;
    if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
      requireValid(categoriesById.has(categoryId), 'transaction must reference a valid category');
    }
    if (transaction.kind) {
      requireValid(k_spendingKinds.has(transaction.kind), 'transaction spending behaviour');
    }
    try {
      validateTransaction(state, transaction);
    } catch (error) {
      throw new SyntaxError(`Invalid stored data: ${error.message}`);
    }
  }
  validatePlan(state.plan);
  return state;
}

// Version 2 establishes a validated persistence boundary. It does not renumber
// records or change financial values, plans, links or custom fields.
export function migrateState(state) {
  validateState(state);
  return { ...state, version: k_currentStateVersion };
}
