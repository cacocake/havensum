import test from 'node:test';
import assert from 'node:assert/strict';
import { compoundSavings, mergeThreeWay } from '../src/engine.js';
import { interestPeriodsForDisplay, InterestScheduleError, scheduleWithPeriod, scheduleWithoutPeriod } from '../src/interestSchedule.js';
import { representsInterestSchedules } from '../src/interestMerge.js';
import { migrateState } from '../src/stateSchema.js';
import { readState, writeState } from '../src/storage.web.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState } from './helpers/financialFixtures.js';

function savingsLedger(interestSchedule, openingBalance = 100000) {
  return createFinancialState({
    accounts: [{ id: 'savings', name: 'Reserve', tag: 'Savings', openingBalance, interestSchedule }]
  });
}

function interestEntries(state) {
  return state.transactions.filter(transaction => transaction.title === 'Savings interest').map(({ date, amount }) => ({ date, amount }));
}

test('a promotional rate ends when a 0% successor starts', () => {
  const state = savingsLedger([{ since: '2026-09', rate: 12 }, { since: '2026-10', rate: 0 }]);

  const result = compoundSavings(state, '2026-11');

  assert.deepEqual(interestEntries(result), [{ date: '2026-09-30', amount: 949 }]);
});

test('a rate change in January applies from January while December keeps its own rate', () => {
  const state = savingsLedger([{ since: '2026-12', rate: 12 }, { since: '2027-01', rate: 6 }]);

  const entries = interestEntries(compoundSavings(state, '2027-02'));

  assert.deepEqual(entries.map(entry => entry.date), ['2026-12-31', '2027-01-31']);
  assert.equal(entries[0].amount, 949);
  assert.equal(entries[1].amount, Math.round((100000 + 949) * (Math.pow(1.06, 1 / 12) - 1)));
});

test('repeated runs and reloads never add a second entry for a completed month', () => {
  const state = savingsLedger([{ since: '2026-09', rate: 12 }]);
  const once = compoundSavings(state, '2026-11');

  assert.deepEqual(compoundSavings(once, '2026-11').transactions, once.transactions);
});

test('periods run through the month before the next start and the last one is ongoing', () => {
  const account = { interestSchedule: [{ since: '2027-03', rate: 0 }, { since: '2026-11', rate: 4.5 }] };

  assert.deepEqual(interestPeriodsForDisplay(account), [
    { since: '2026-11', rate: 4.5, through: '2027-02' },
    { since: '2027-03', rate: 0, through: null }
  ]);
});

test('a legacy rate with a start month becomes the first period, keeping the exact earlier bytes', async context => {
  const storage = installBrowserStorage(context);
  const legacyLedger = createFinancialState({
    version: 3,
    accounts: [
      { id: 'savings', name: 'Reserve', tag: 'Savings', openingBalance: 100000, interest: 3, interestStart: '2026-05' },
      { id: 'imported', name: 'Imported', tag: 'Savings', openingBalance: 100000, interest: 2.5 }
    ]
  });
  const legacyBytes = JSON.stringify(legacyLedger);
  storage.setItem('melo-state-v1', legacyBytes);

  const migrated = await readState();
  const reloaded = await readState();

  assert.deepEqual(migrated.accounts, [
    { id: 'savings', name: 'Reserve', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2026-05', rate: 3 }] },
    { id: 'imported', name: 'Imported', tag: 'Savings', openingBalance: 100000, unscheduledInterest: 2.5 }
  ]);
  assert.deepEqual(reloaded, migrated);
  assert.equal(storage.getItem('melo-state-v1:recovery:v3'), legacyBytes);
  assert.deepEqual(interestEntries(compoundSavings(migrated, '2026-07')).length, 2);
  assert.equal(compoundSavings(migrated, '2026-07').transactions.some(transaction => transaction.account === 'imported'), false);
});

test('invalid rates, month keys, duplicate starts and leftover legacy fields are rejected', async context => {
  installBrowserStorage(context);
  const invalidSchedules = [
    [{ since: '2026-01', rate: -1 }],
    [{ since: '2026-01', rate: Number.NaN }],
    [{ since: '2026-01', rate: '3' }],
    [{ since: '2026-13', rate: 3 }],
    [{ since: '2026-01', rate: 3 }, { since: '2026-01', rate: 4 }],
    'not a schedule'
  ];
  for (const interestSchedule of invalidSchedules) {
    await assert.rejects(writeState(savingsLedger(interestSchedule)), SyntaxError);
  }
  const leftover = savingsLedger([{ since: '2026-01', rate: 3 }]);
  leftover.accounts[0].interest = 3;
  await assert.rejects(writeState(leftover), SyntaxError);
});

test('an older backup keeps a newer schedule when its single rate agrees, and asks when it differs', () => {
  const schedule = [{ since: '2026-01', rate: 3 }, { since: '2026-07', rate: 1 }];
  const base = savingsLedger(schedule);
  const local = structuredClone(base);
  const agreeingBackup = createFinancialState({ version: 3, accounts: [{ ...base.accounts[0], interestSchedule: undefined, interest: 3, interestStart: '2026-01' }] });
  delete agreeingBackup.accounts[0].interestSchedule;
  const differingBackup = structuredClone(agreeingBackup);
  differingBackup.accounts[0].interest = 5;

  const agreeing = mergeThreeWay(base, local, migrateState(agreeingBackup), { remoteHasInterestSchedules: representsInterestSchedules(agreeingBackup) });
  const differing = mergeThreeWay(base, local, migrateState(differingBackup), { remoteHasInterestSchedules: representsInterestSchedules(differingBackup) });

  assert.deepEqual([agreeing.result.accounts[0].interestSchedule, agreeing.conflicts], [schedule, []]);
  assert.deepEqual(differing.result.accounts[0].interestSchedule, schedule);
  assert.deepEqual(differing.conflicts.map(conflict => [conflict.id, conflict.field, conflict.remote]), [['savings', 'interestSchedule', [{ since: '2026-01', rate: 5 }, { since: '2026-07', rate: 1 }]]]);
});

test('merging an older backup leaves the backup and both ledgers unchanged', () => {
  const base = savingsLedger([{ since: '2026-01', rate: 3 }, { since: '2026-07', rate: 1 }]);
  const legacyBackup = createFinancialState({ version: 3, accounts: [{ id: 'savings', name: 'Reserve', tag: 'Savings', openingBalance: 100000, interest: 5, interestStart: '2026-01' }] });
  const remote = migrateState(legacyBackup);
  const originals = structuredClone([base, remote]);

  mergeThreeWay(base, base, remote, { remoteHasInterestSchedules: false });

  assert.deepEqual([base, remote], originals);
});

test('new periods start in the current or a future month, replacing a period with the same start', () => {
  const schedule = [{ since: '2026-05', rate: 3 }];

  assert.deepEqual(scheduleWithPeriod(schedule, { since: '2027-01', rate: 1 }, '2026-11'), [{ since: '2026-05', rate: 3 }, { since: '2027-01', rate: 1 }]);
  assert.deepEqual(scheduleWithPeriod([{ since: '2026-05', rate: 3 }, { since: '2026-12', rate: 2 }], { since: '2026-12', rate: 0 }, '2026-11'), [{ since: '2026-05', rate: 3 }, { since: '2026-12', rate: 0 }]);
  assert.throws(() => scheduleWithPeriod(schedule, { since: '2026-10', rate: 1 }, '2026-11'), /current or a future month/);
  assert.throws(() => scheduleWithPeriod(schedule, { since: '2027-01', rate: -2 }, '2026-11'), /rate/);
  assert.throws(() => scheduleWithPeriod(schedule, { since: '2027-1', rate: 2 }, '2026-11'), /YYYY-MM/);
});

test('the first period may start in a past month so an unscheduled legacy rate can be set up', () => {
  const correctableBound = { earliestMonth: '2026-03', currentMonth: '2026-11' };
  assert.deepEqual(scheduleWithPeriod([], { since: '2026-03', rate: 2.5 }, '2026-11', { allowPastStart: true, correctableBound }), [{ since: '2026-03', rate: 2.5 }]);
});

test('a legacy past start without an earliest correctable month is refused rather than unlimited', () => {
  assert.throws(() => scheduleWithPeriod([], { since: '2020-01', rate: 3 }, '2026-11', { allowPastStart: true }), InterestScheduleError);
});

test('only current and future periods can be removed, so recorded history keeps its rates', () => {
  const schedule = [{ since: '2026-05', rate: 3 }, { since: '2026-11', rate: 2 }, { since: '2027-01', rate: 1 }];

  assert.deepEqual(scheduleWithoutPeriod(schedule, '2027-01', '2026-11'), schedule.slice(0, 2));
  assert.deepEqual(scheduleWithoutPeriod(schedule, '2026-11', '2026-11'), [schedule[0], schedule[2]]);
  assert.throws(() => scheduleWithoutPeriod(schedule, '2026-05', '2026-11'), /past/);
});

test('a past start is allowed only when setting up an unscheduled legacy rate', () => {
  assert.throws(() => scheduleWithPeriod([], { since: '2020-01', rate: 3 }, '2026-11'), /current or a future month/);
  const correctableBound = { earliestMonth: '2020-01', currentMonth: '2026-11' };
  assert.deepEqual(scheduleWithPeriod([], { since: '2020-01', rate: 3 }, '2026-11', { allowPastStart: true, correctableBound }), [{ since: '2020-01', rate: 3 }]);
});

test('a legacy past start is refused before the earliest correctable month, but a schedule keeps the current-month rule', () => {
  const firstEntryBound = { earliestMonth: '2026-03', currentMonth: '2026-11' };
  const openingBalanceOnlyBound = { earliestMonth: '2026-11', currentMonth: '2026-11' };
  const legacyOptions = bound => ({ allowPastStart: true, correctableBound: bound });

  assert.throws(() => scheduleWithPeriod([], { since: '1026-01', rate: 3 }, '2026-11', legacyOptions(firstEntryBound)), { message: "Rates can start from Mar 2026, the account's first entry or rate period." });
  assert.throws(() => scheduleWithPeriod([], { since: '2026-02', rate: 3 }, '2026-11', legacyOptions(firstEntryBound)), /Mar 2026/);
  assert.deepEqual(scheduleWithPeriod([], { since: '2026-03', rate: 3 }, '2026-11', legacyOptions(firstEntryBound)), [{ since: '2026-03', rate: 3 }]);
  assert.throws(() => scheduleWithPeriod([], { since: '2026-10', rate: 3 }, '2026-11', legacyOptions(openingBalanceOnlyBound)), { message: 'This account has no earlier entries or rate periods, so rates can start from Nov 2026.' });
  assert.deepEqual(scheduleWithPeriod([], { since: '2026-11', rate: 3 }, '2026-11', legacyOptions(openingBalanceOnlyBound)), [{ since: '2026-11', rate: 3 }]);
  assert.throws(() => scheduleWithPeriod([{ since: '2026-11', rate: 3 }], { since: '2026-06', rate: 2 }, '2026-11', legacyOptions(firstEntryBound)), /current or a future month/);
});

test('an older backup leaves accounts without a schedule alone when it only carries the old 0% default', () => {
  const base = createFinancialState();
  const local = structuredClone(base);
  const legacyBackup = createFinancialState({ version: 3, accounts: base.accounts.map(account => ({ ...account, interest: 0, interestStart: '2026-01', name: account.id === 'shared' ? 'Shared home' : account.name })) });

  const merged = mergeThreeWay(base, local, migrateState(legacyBackup), { remoteHasInterestSchedules: false });

  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.result.accounts.map(account => [account.name, account.interestSchedule]), [['Everyday', undefined], ['Shared home', undefined]]);
});

test("an older backup's positive rate for an account without a local schedule merges normally", () => {
  const base = savingsLedger(undefined);
  delete base.accounts[0].interestSchedule;
  const legacyBackup = createFinancialState({ version: 3, accounts: [{ ...base.accounts[0], interest: 2, interestStart: '2026-03' }] });

  const merged = mergeThreeWay(base, structuredClone(base), migrateState(legacyBackup), { remoteHasInterestSchedules: false });

  assert.deepEqual([merged.conflicts, merged.result.accounts[0].interestSchedule], [[], [{ since: '2026-03', rate: 2 }]]);
});

test("choosing an older backup's differing rate inserts it as one period instead of collapsing the schedule", () => {
  const schedule = [{ since: '2026-01', rate: 3 }, { since: '2026-07', rate: 1 }];
  const base = savingsLedger(schedule);
  const { interestSchedule, ...legacyAccount } = base.accounts[0];
  const legacyBackup = createFinancialState({ version: 3, accounts: [{ ...legacyAccount, interest: 5, interestStart: '2026-01' }] });

  const [conflict] = mergeThreeWay(base, structuredClone(base), migrateState(legacyBackup), { remoteHasInterestSchedules: false }).conflicts;

  assert.equal(conflict.legacyRate, true);
  assert.deepEqual(conflict.remote, [{ since: '2026-01', rate: 5 }, { since: '2026-07', rate: 1 }]);
});

test('migrated ledgers are validated, and an account cannot keep both a schedule and an unscheduled rate', async context => {
  installBrowserStorage(context);
  const legacyWithStraySchedule = createFinancialState({ version: 3, accounts: [{ id: 'savings', name: 'Reserve', tag: 'Savings', openingBalance: 0, interestSchedule: 'broken' }] });
  assert.throws(() => migrateState(legacyWithStraySchedule), SyntaxError);
  const both = savingsLedger([{ since: '2026-01', rate: 3 }]);
  both.accounts[0].unscheduledInterest = 2;
  await assert.rejects(writeState(both), SyntaxError);
});
