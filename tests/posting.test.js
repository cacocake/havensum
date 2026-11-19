import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalance } from '../src/engine.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { atLocalTime } from './helpers/localClock.js';

// L01: an entry counts from its date, by the device's local date.
function ledgerAroundTheTenth() {
  return createFinancialState({ transactions: [
    createTransaction({ id: 'tenth', amount: 100, date: '2026-11-10' }),
    createTransaction({ id: 'eleventh', amount: 200, date: '2026-11-11' }),
    createTransaction({ id: 'twelfth', amount: 400, date: '2026-11-12' })
  ] });
}

test('a current balance counts entries from their local date, east of UTC just after midnight', () => {
  // 00:30 on 11 November in Auckland is still 10 November in UTC.
  const balance = atLocalTime('Pacific/Auckland', '2026-11-10T11:30:00Z', () => accountBalance(ledgerAroundTheTenth(), 'everyday'));

  assert.equal(balance, 100000 - 100 - 200);
});

test('a current balance leaves an entry dated tomorrow out, west of UTC in the evening', () => {
  // 21:00 on 10 November in Los Angeles is already 11 November in UTC.
  const balance = atLocalTime('America/Los_Angeles', '2026-11-11T05:00:00Z', () => accountBalance(ledgerAroundTheTenth(), 'everyday'));

  assert.equal(balance, 100000 - 100);
});
