import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalance, compoundSavings } from '../src/engine.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

function createSavingsState(overrides = {}) {
  return createFinancialState({
    accounts: [{ id: 'savings', tag: 'Savings', openingBalance: 100000, interest: 12, interestStart: '2024-02' }],
    ...overrides
  });
}

test('interest posts on leap February month end and only for completed months', () => {
  const state = createSavingsState();
  const originalState = structuredClone(state);
  const result = compoundSavings(state, '2024-03');

  assert.deepEqual(result.transactions.map(({ date, amount }) => ({ date, amount })), [{ date: '2024-02-29', amount: 949 }]);
  assert.deepEqual(state, originalState);
});

test('interest includes same-month deposits and withdrawals but excludes future cash', () => {
  const state = createSavingsState({ transactions: [
    createTransaction({ id: 'deposit', type: 'income', category: 'salary', account: 'savings', date: '2024-02-01', amount: 100000 }),
    createTransaction({ id: 'withdrawal', account: 'savings', date: '2024-02-29', amount: 50000 }),
    createTransaction({ id: 'future', type: 'income', account: 'savings', date: '2024-03-01', amount: 900000 })
  ] });
  const result = compoundSavings(state, '2024-03');

  assert.equal(result.transactions.find(transaction => transaction.title === 'Savings interest').amount, 1423);
});

test('compounding crosses December to January and a repeated run changes nothing', () => {
  const state = createSavingsState();
  state.accounts[0].interestStart = '2025-12';
  const firstResult = compoundSavings(state, '2026-02');

  assert.deepEqual(firstResult.transactions.map(({ date, amount }) => ({ date, amount })), [
    { date: '2025-12-31', amount: 949 },
    { date: '2026-01-31', amount: 958 }
  ]);
  assert.equal(accountBalance(firstResult, 'savings'), 101907);
  assert.deepEqual(compoundSavings(firstResult, '2026-02'), firstResult);
});

test('zero or negative closing balances never generate interest income', async context => {
  for (const openingBalance of [0, -100000]) {
    await context.test(`opening balance ${openingBalance}`, () => {
      const state = createSavingsState();
      state.accounts[0].openingBalance = openingBalance;

      assert.deepEqual(compoundSavings(state, '2024-03').transactions, []);
    });
  }
});

test('zero-rate and non-savings accounts never generate automatic interest', () => {
  const state = createSavingsState();
  state.accounts = [
    { ...state.accounts[0], id: 'no-interest', interest: 0 },
    { ...state.accounts[0], id: 'personal', tag: 'Personal' }
  ];

  assert.deepEqual(compoundSavings(state, '2024-03').transactions, []);
});

test('an account without a start month does not invent retroactive interest', () => {
  const state = createSavingsState();
  delete state.accounts[0].interestStart;

  assert.deepEqual(compoundSavings(state, '2024-03').transactions, []);
});

test('separate savings accounts receive separate interest entries', () => {
  const state = createSavingsState();
  state.accounts.push({ ...state.accounts[0], id: 'other-savings', openingBalance: 200000 });
  const result = compoundSavings(state, '2024-03');

  assert.deepEqual(result.transactions.map(({ account, amount }) => ({ account, amount })), [
    { account: 'savings', amount: 949 },
    { account: 'other-savings', amount: 1898 }
  ]);
});
