export function createFinancialState(overrides = {}) {
  return {
    version: 2,
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
    plan: null,
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
