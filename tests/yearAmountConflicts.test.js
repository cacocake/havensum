import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeThreeWay } from '../src/engine.js';
import { describeYearAmountConflicts, yearAmountConflictLines, yearAmountConflictTitle } from '../src/yearAmountConflicts.js';
import { createFinancialState } from './helpers/financialFixtures.js';

// Owner decision F20: a year-amount merge conflict names the planned cost and
// the year and shows euro amounts instead of the raw field and cents.
const k_celebrations = { id: 'celebrations', name: 'December celebrations', month: 12, amount: 40000 };

function reviewedYearAmountConflicts({ base, local, remote }) {
  const baseState = createFinancialState({ events: [base] });
  const localState = createFinancialState({ events: [local] });
  const remoteState = createFinancialState({ events: [remote] });
  const { conflicts } = mergeThreeWay(baseState, localState, remoteState);
  return describeYearAmountConflicts(conflicts, localState, remoteState);
}

test('a conflict on one year names the planned cost and the year and shows each side in euros', () => {
  const [conflict] = reviewedYearAmountConflicts({
    base: { ...k_celebrations, yearAmounts: { 2027: 40500 } },
    local: { ...k_celebrations, yearAmounts: { 2027: 41000 } },
    remote: { ...k_celebrations, yearAmounts: { 2027: 45000 } }
  });

  assert.equal(yearAmountConflictTitle(conflict), 'December celebrations · amount for 2027');
  assert.deepEqual(yearAmountConflictLines(conflict, 'local'), ['Amount for 2027: €410.00']);
  assert.deepEqual(yearAmountConflictLines(conflict, 'remote'), ['Amount for 2027: €450.00']);
});

test('several differing years on one planned cost form one conflict with one line per year', () => {
  const conflicts = reviewedYearAmountConflicts({
    base: { ...k_celebrations, yearAmounts: { 2026: 40000, 2027: 40500, 2028: 40500 } },
    local: { ...k_celebrations, yearAmounts: { 2026: 40000, 2027: 41000, 2028: 43000 } },
    remote: { ...k_celebrations, yearAmounts: { 2026: 40000, 2027: 45000, 2028: 44000 } }
  });

  assert.equal(conflicts.length, 1);
  assert.equal(yearAmountConflictTitle(conflicts[0]), 'December celebrations · amounts for 2027 and 2028');
  assert.deepEqual(yearAmountConflictLines(conflicts[0], 'local'), ['Amount for 2027: €410.00', 'Amount for 2028: €430.00']);
  assert.deepEqual(yearAmountConflictLines(conflicts[0], 'remote'), ['Amount for 2027: €450.00', 'Amount for 2028: €440.00']);
});

test('years set on different sides from the same start form one conflict and show the usual amount where a side has no year amount', () => {
  const conflicts = reviewedYearAmountConflicts({
    base: k_celebrations,
    local: { ...k_celebrations, yearAmounts: { 2027: 41000 } },
    remote: { ...k_celebrations, amount: 38000, yearAmounts: { 2028: 45000 } }
  });
  const yearAmountConflicts = conflicts.filter(conflict => conflict.field === 'yearAmounts');

  assert.equal(yearAmountConflicts.length, 1);
  assert.equal(yearAmountConflictTitle(yearAmountConflicts[0]), 'December celebrations · amounts for 2027 and 2028');
  assert.deepEqual(yearAmountConflictLines(yearAmountConflicts[0], 'local'), ['Amount for 2027: €410.00', 'Amount for 2028: usual amount (€400.00)']);
  assert.deepEqual(yearAmountConflictLines(yearAmountConflicts[0], 'remote'), ['Amount for 2027: usual amount (€380.00)', 'Amount for 2028: €450.00']);
});

test('clearing every year amount on one side shows the usual amount for each differing year', () => {
  const [conflict] = reviewedYearAmountConflicts({
    base: { ...k_celebrations, yearAmounts: { 2027: 40500 } },
    local: k_celebrations,
    remote: { ...k_celebrations, yearAmounts: { 2027: 45000 } }
  });

  assert.equal(yearAmountConflictTitle(conflict), 'December celebrations · amount for 2027');
  assert.deepEqual(yearAmountConflictLines(conflict, 'local'), ['Amount for 2027: usual amount (€400.00)']);
  assert.deepEqual(yearAmountConflictLines(conflict, 'remote'), ['Amount for 2027: €450.00']);
});

test('edit-versus-delete and other planned-cost conflicts are left exactly as the merge reported them', () => {
  const baseState = createFinancialState({ events: [k_celebrations, { ...k_celebrations, id: 'spring-fair', name: 'Spring fair' }] });
  const localState = createFinancialState({ events: [{ ...k_celebrations, name: 'Winter party', yearAmounts: { 2027: 41000 } }] });
  const remoteState = createFinancialState({ events: [{ ...k_celebrations, name: 'Holiday dinner' }, { ...k_celebrations, id: 'spring-fair', name: 'Spring fair', amount: 9000 }] });
  const { conflicts } = mergeThreeWay(baseState, localState, remoteState);

  const described = describeYearAmountConflicts(conflicts, localState, remoteState);

  assert.deepEqual(described, conflicts);
  assert.deepEqual(described.map(conflict => [conflict.id, conflict.field]), [['celebrations', 'name'], ['spring-fair', '$record']]);
});

test('an empty set of year amounts against none reads as no year amounts on either side instead of a broken title', () => {
  const [conflict] = reviewedYearAmountConflicts({
    base: { ...k_celebrations, yearAmounts: { 2027: 40500 } },
    local: { ...k_celebrations, yearAmounts: {} },
    remote: k_celebrations
  });

  assert.equal(yearAmountConflictTitle(conflict), 'December celebrations · amounts by year');
  assert.deepEqual(yearAmountConflictLines(conflict, 'local'), ['No year amounts; every year uses the usual amount (€400.00)']);
  assert.deepEqual(yearAmountConflictLines(conflict, 'remote'), ['No year amounts; every year uses the usual amount (€400.00)']);
});

test('a year-amount conflict that was not described still reads by year without crashing', () => {
  const conflict = { collection: 'events', id: 'celebrations', field: 'yearAmounts', base: undefined, local: { 2027: 41000 }, remote: {} };

  assert.equal(yearAmountConflictTitle(conflict), 'celebrations · amount for 2027');
  assert.deepEqual(yearAmountConflictLines(conflict, 'remote'), ['Amount for 2027: usual amount']);
});
