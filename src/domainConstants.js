export const k_transactionTypes = Object.freeze({
  expense: 'expense',
  income: 'income',
  reimbursement: 'reimbursement',
  transfer: 'transfer'
});

export const k_spendingBehaviors = Object.freeze({
  fixed: 'Fixed',
  variable: 'Variable',
  occasional: 'Occasional'
});

export const k_reportingPeriods = Object.freeze({
  past: 'past',
  current: 'current',
  future: 'future'
});

export const k_systemCategoryIds = Object.freeze({
  salary: 'salary',
  interest: 'interest',
  loan: 'loan',
  uncategorized: 'uncategorized'
});

export const k_defaultHistoryWindow = 6;
export const k_monthsPerYear = 12;

export const k_entityIdPrefixes = Object.freeze({
  transaction: 'tx',
  account: 'account',
  category: 'cat',
  loan: 'loan',
  event: 'event'
});
