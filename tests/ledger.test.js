import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalance, categorySettings, cents, euro, monthStats, validateTransaction } from '../src/engine.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

test('only an expense can carry a planned-cost link and it must identify a valid occurrence month', () => {
  const state = createFinancialState();
  const transaction = createTransaction({ plannedCost: { eventId: 'event', month: '2026-11' } });
  assert.equal(validateTransaction(state, transaction), transaction);
  assert.throws(() => validateTransaction(state, { ...transaction, type: 'income' }), /planned cost/i);
  assert.throws(() => validateTransaction(state, { ...transaction, plannedCost: { eventId: 'event', month: '2026-13' } }), /planned cost/i);
  assert.throws(() => validateTransaction(state, { ...transaction, plannedCost: { eventId: 'event', month: '2026-10' } }), /planned cost/i);
});

test('an expense cannot be edited below the reimbursements already received', () => {
  const expense = createTransaction({ amount: 10000 });
  const reimbursement = createTransaction({
    id: 'partial-payback',
    type: 'reimbursement',
    amount: 7000,
    linkedId: expense.id
  });
  const state = createFinancialState({ transactions: [expense, reimbursement] });

  assert.throws(
    () => validateTransaction(state, { ...expense, amount: 6000 }),
    /linked reimbursements/i
  );
});

test('received paybacks also prevent changing the original expense into income', () => {
  const expense = createTransaction();
  const reimbursement = createTransaction({ id: 'payback', type: 'reimbursement', amount: 100, linkedId: expense.id });
  const state = createFinancialState({ transactions: [expense, reimbursement] });

  assert.throws(() => validateTransaction(state, { ...expense, type: 'income' }), /linked reimbursements/i);
});

test('editing a reimbursement excludes its own previous amount from the repayment limit', () => {
  const expense = createTransaction({ amount: 10000 });
  const reimbursement = createTransaction({ id: 'payback', type: 'reimbursement', amount: 6000, linkedId: expense.id });
  const state = createFinancialState({ transactions: [expense, reimbursement] });
  const editedPayback = { ...reimbursement, amount: 10000 };

  assert.equal(validateTransaction(state, editedPayback), editedPayback);
});

test('invalid transaction fields are rejected at the shared ledger boundary', async context => {
  const invalidRecords = [
    { name: 'unknown type', changes: { type: 'borrowed' }, error: /valid transaction type/ },
    { name: 'blank title', changes: { title: '  ' }, error: /title/ },
    { name: 'non-text title', changes: { title: 42 }, error: /title/ },
    { name: 'zero amount', changes: { amount: 0 }, error: /amount/ },
    { name: 'negative amount', changes: { amount: -1 }, error: /amount/ },
    { name: 'fractional cent', changes: { amount: 1.5 }, error: /amount/ },
    { name: 'unsafe integer', changes: { amount: Number.MAX_SAFE_INTEGER + 1 }, error: /amount/ },
    { name: 'not a number', changes: { amount: Number.NaN }, error: /amount/ },
    { name: 'infinite amount', changes: { amount: Infinity }, error: /amount/ },
    { name: 'unknown account', changes: { account: 'missing' }, error: /account/ },
    { name: 'unknown category', changes: { category: 'missing' }, error: /category/ },
    { name: 'non-leap February', changes: { date: '2026-02-29' }, error: /date/ },
    { name: 'invalid month', changes: { date: '2026-13-01' }, error: /date/ },
    { name: 'timestamp instead of calendar date', changes: { date: '2026-11-10T00:00:00Z' }, error: /date/ },
    { name: 'missing transfer destination', changes: { type: 'transfer', toAccount: 'missing' }, error: /destination/ },
    { name: 'missing original expense', changes: { type: 'reimbursement', linkedId: 'missing' }, error: /linked expense/ }
  ];

  for (const { name, changes, error } of invalidRecords) {
    await context.test(name, () => {
      assert.throws(() => validateTransaction(createFinancialState(), createTransaction(changes)), error);
    });
  }
});

test('a valid leap-day expense is accepted without mutating the ledger', () => {
  const state = createFinancialState();
  const originalState = structuredClone(state);
  const expense = createTransaction({ date: '2024-02-29' });

  validateTransaction(state, expense);

  assert.deepEqual(state, originalState);
});

test('cross-account partial paybacks change receipt cash and net the original expense year', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'tickets', amount: 10000, date: '2025-12-31' }),
    createTransaction({ id: 'first-payback', type: 'reimbursement', amount: 3000, account: 'shared', date: '2026-01-01', linkedId: 'tickets' }),
    createTransaction({ id: 'second-payback', type: 'reimbursement', amount: 2000, account: 'shared', date: '2026-02-01', linkedId: 'tickets' })
  ] });

  assert.deepEqual({
    originalMonthSpending: monthStats(state, '2025-12').spent,
    receiptMonthIncome: monthStats(state, '2026-01').income,
    receiptMonthSpending: monthStats(state, '2026-01').spent,
    expenseAccount: accountBalance(state, 'everyday', '2025-12-31'),
    receivingAccountInJanuary: accountBalance(state, 'shared', '2026-01-31'),
    receivingAccountInFebruary: accountBalance(state, 'shared', '2026-02-28')
  }, {
    originalMonthSpending: 5000,
    receiptMonthIncome: 0,
    receiptMonthSpending: 0,
    expenseAccount: 90000,
    receivingAccountInJanuary: 53000,
    receivingAccountInFebruary: 55000
  });
});

test('one-cent transfers conserve total cash for every prefix of a sequence', () => {
  const state = createFinancialState();
  const k_transferCount = 200;
  const k_totalOpeningCash = 150000;

  for (let index = 0; index < k_transferCount; index += 1) {
    state.transactions.push(createTransaction({ id: `transfer-${index}`, type: 'transfer', amount: 1, toAccount: 'shared' }));
    assert.equal(accountBalance(state, 'everyday') + accountBalance(state, 'shared'), k_totalOpeningCash);
  }
  assert.equal(monthStats(state, '2026-11').balance, 0);
});

test('cash cutoffs include that day and exclude later transactions', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ amount: 100, date: '2026-11-10' }),
    createTransaction({ id: 'tomorrow', amount: 200, date: '2026-11-11' })
  ] });

  assert.equal(accountBalance(state, 'everyday', '2026-11-10'), 99900);
  assert.equal(accountBalance(state, 'missing', '2026-11-10'), 0);
});

test('subcategory zero budgets and customized visuals override inheritance independently', () => {
  const categories = [
    { id: 'parent', name: 'Parent', kind: 'Fixed', budget: 5000, icon: 'House', color: '#123456' },
    { id: 'child', parentId: 'parent', name: 'Custom name', kind: null, budget: 0, icon: 'Coffee', color: '' }
  ];

  assert.deepEqual(categorySettings(categories, 'child'), {
    id: 'child', parentId: 'parent', name: 'Custom name', kind: 'Fixed', budget: 0, icon: 'Coffee', color: '#123456'
  });
});

test('human euro amounts support decimal commas and negative opening balances', () => {
  assert.deepEqual(['12.34', '12,34', '-12.34', '0.01'].map(cents), [1234, 1234, -1234, 1]);
  assert.match(euro(1234), /12\.34/);
});

test('decimal conversion never invents a cent for a representable large amount', () => {
  const k_largeEuroAmount = '70368744177664.01';
  const k_expectedCents = 7036874417766401;

  assert.equal(cents(k_largeEuroAmount), k_expectedCents);
});

test('unlinked adjustments are not mistaken for paybacks on a new transaction without an ID', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'adjustment', type: 'reimbursement', amount: 5000 })
  ] });
  const expense = createTransaction({ id: undefined });

  assert.equal(validateTransaction(state, expense), expense);
});
