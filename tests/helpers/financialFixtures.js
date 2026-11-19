const k_planArchiveVersion = 3;
const k_currentVersion = 4;

// Ledgers before version 3 hold one frozen plan; later ledgers archive plans by year.
export function createFinancialState(overrides = {}) {
  const isSinglePlanLedger = overrides.version !== undefined && overrides.version < k_planArchiveVersion;
  const planFields = isSinglePlanLedger ? { plan: null } : { plans: {} };
  return {
    version: k_currentVersion,
    demo: false,
    theme: 'light',
    preferences: {},
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'shared', name: 'Shared', tag: 'Joint', openingBalance: 50000 }
    ],
    categories: [
      { id: 'groceries', name: 'Groceries', kind: 'Variable', icon: 'ShoppingBasket', color: '#5B91C4', budget: 20000 },
      { id: 'rent', name: 'Rent', kind: 'Fixed' },
      { id: 'shopping', name: 'Shopping', kind: 'Occasional' },
      { id: 'salary', name: 'Salary', kind: 'Fixed' },
      { id: 'interest', name: 'Interest', kind: 'Fixed' },
      { id: 'loan', name: 'Loan payments', kind: 'Fixed' }
    ],
    transactions: [],
    loans: [],
    events: [],
    ...planFields,
    ...overrides
  };
}

export function createTransaction(overrides = {}) {
  return {
    id: 'weekly-shopping',
    type: 'expense',
    title: 'Weekly shopping',
    amount: 1234,
    date: '2026-11-10',
    account: 'everyday',
    category: 'groceries',
    ...overrides
  };
}

// A legacy savings rate with a start month becomes the first scheduled
// period; without a start month it stays unscheduled.
function expectedScheduledAccount(account) {
  const { interest, interestStart, ...unchangedFields } = account;
  if (interest === undefined) {
    return unchangedFields;
  }
  return interestStart
    ? { ...unchangedFields, interestSchedule: [{ since: interestStart, rate: interest }] }
    : { ...unchangedFields, unscheduledInterest: interest };
}

// The expected ledger after migration: a single legacy plan moves under its
// year unchanged, gaining only the snapshot ID chosen by migration.
export function expectedMigratedLedger(legacyState, migratedState) {
  const { plan, ...unchangedFields } = legacyState;
  const accounts = legacyState.version < k_currentVersion ? legacyState.accounts.map(expectedScheduledAccount) : legacyState.accounts;
  if (legacyState.version >= k_planArchiveVersion) {
    return { ...legacyState, version: k_currentVersion, accounts };
  }
  if (!plan) {
    return { ...unchangedFields, version: k_currentVersion, accounts, plans: {} };
  }
  const yearKey = String(plan.year);
  const migratedId = migratedState?.plans?.[yearKey]?.[0]?.id;
  return { ...unchangedFields, version: k_currentVersion, accounts, plans: { [yearKey]: [{ ...plan, id: migratedId }] } };
}

// Wraps a frozen plan as the only approved revision of its year.
export function planArchiveOf(plan) {
  const year = plan.year ?? Number(Object.keys(plan.months)[0].slice(0, 4));
  return { [String(year)]: [{ id: `plan-${year}-fixture`, year, ...plan }] };
}
