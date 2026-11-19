import test from 'node:test';
import assert from 'node:assert/strict';
import { compoundSavings } from '../src/engine.js';
import { applyInterestCorrection, interestCorrectionReview, StaleInterestCorrectionError, InterestChoiceRequiredError } from '../src/interestCorrection.js';
import { validateState } from '../src/stateSchema.js';
import { correctedSchedule, correctedScheduleWithout, InterestScheduleError } from '../src/interestSchedule.js';
import { accountBalance, monthStats } from '../src/ledger.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

// €1,000 at a 12% effective annual rate earns €9.49 in the first completed
// month (1.12^(1/12) − 1 ≈ 0.94888%) and €9.58 on €1,009.49 in the second.
function createSavingsState(overrides = {}) {
  return createFinancialState({
    accounts: [{ id: 'savings', name: 'Savings', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2026-01', rate: 12 }] }],
    ...overrides
  });
}

function bankInterest(overrides = {}) {
  return createTransaction({ id: 'bank-interest-jan', type: 'income', title: 'Interest from bank', category: 'interest', account: 'savings', date: '2026-01-31', amount: 950, ...overrides });
}

function interestEntries(state) {
  return state.transactions.filter(transaction => transaction.category === 'interest').map(({ id, date, amount }) => ({ id, date, amount }));
}

test('the app posts no interest of its own for a month that already holds bank interest until the owner chooses', () => {
  const state = createSavingsState({ transactions: [bankInterest()] });

  const result = compoundSavings(state, '2026-03');

  assert.deepEqual(interestEntries(result), [
    { id: 'bank-interest-jan', date: '2026-01-31', amount: 950 },
    { id: 'interest-savings-2026-02', date: '2026-02-28', amount: 958 }
  ]);
});

test('keeping both lets the app post its own interest beside the bank amount', () => {
  const state = createSavingsState({ transactions: [bankInterest()] });
  state.accounts[0].interestBankChoices = [{ month: '2026-01', choice: 'both' }];

  const result = compoundSavings(state, '2026-02');

  assert.deepEqual(interestEntries(result), [
    { id: 'bank-interest-jan', date: '2026-01-31', amount: 950 },
    { id: 'interest-savings-2026-01', date: '2026-01-31', amount: 958 }
  ]);
});

function postedSavingsState(overrides = {}) {
  return compoundSavings(createSavingsState(overrides), '2026-03');
}

function reviewedMonths(review) {
  return review.months.map(({ month, recorded, corrected, difference, compoundingEffect }) => ({ month, recorded, corrected, difference, compoundingEffect }));
}

test('a ledger whose recorded interest matches its balances and rates has nothing to correct', () => {
  const review = interestCorrectionReview(postedSavingsState(), 'savings', { currentMonth: '2026-03' });

  assert.deepEqual(review.months, []);
  assert.equal(review.total, 0);
});

test('a corrected past rate lists each completed month it changes, with the total', () => {
  const state = postedSavingsState();

  const review = interestCorrectionReview(state, 'savings', { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 6 }] });

  assert.deepEqual(reviewedMonths(review), [
    { month: '2026-01', recorded: 949, corrected: 487, difference: -462, compoundingEffect: false },
    { month: '2026-02', recorded: 958, corrected: 489, difference: -469, compoundingEffect: false }
  ]);
  assert.equal(review.total, -931);
});

test('a later month that changes only through an earlier correction is marked as a compounding effect', () => {
  const state = postedSavingsState();

  const review = interestCorrectionReview(state, 'savings', { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 6 }, { since: '2026-02', rate: 12 }] });

  assert.deepEqual(reviewedMonths(review), [
    { month: '2026-01', recorded: 949, corrected: 487, difference: -462, compoundingEffect: false },
    { month: '2026-02', recorded: 958, corrected: 954, difference: -4, compoundingEffect: true }
  ]);
});

test('a backdated deposit shows the interest its months should have earned', () => {
  const state = postedSavingsState();
  state.transactions.push(createTransaction({ id: 'missed-deposit', type: 'income', title: 'Missed deposit', category: 'salary', account: 'savings', date: '2026-01-15', amount: 100000 }));

  const review = interestCorrectionReview(state, 'savings', { currentMonth: '2026-03' });

  assert.deepEqual(reviewedMonths(review), [
    { month: '2026-01', recorded: 949, corrected: 1898, difference: 949, compoundingEffect: false },
    { month: '2026-02', recorded: 958, corrected: 1916, difference: 958, compoundingEffect: false }
  ]);
});

test('applying a reviewed rate correction keeps every recorded entry and adds one marked correction per month', () => {
  const state = postedSavingsState();
  const recordedEntries = structuredClone(state.transactions);
  const draft = { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 6 }] };

  const corrected = applyInterestCorrection(state, 'savings', interestCorrectionReview(state, 'savings', draft), draft);

  assert.deepEqual(corrected.transactions.slice(0, recordedEntries.length), recordedEntries);
  assert.deepEqual(corrected.transactions.slice(recordedEntries.length).map(({ id, date, amount, correctsInterestMonth, title }) => ({ id, date, amount, correctsInterestMonth, title })), [
    { id: 'interest-correction-savings-2026-01-1', date: '2026-01-31', amount: -462, correctsInterestMonth: '2026-01', title: 'Interest correction' },
    { id: 'interest-correction-savings-2026-02-1', date: '2026-02-28', amount: -469, correctsInterestMonth: '2026-02', title: 'Interest correction' }
  ]);
  assert.deepEqual(corrected.accounts[0].interestSchedule, [{ since: '2026-01', rate: 6 }]);
  assert.equal(accountBalance(corrected, 'savings', '2026-02-28'), 100000 + 487 + 489);
  assert.equal(monthStats(corrected, '2026-01').income, 487);
  assert.doesNotThrow(() => validateState(corrected));
  assert.deepEqual(state.transactions, recordedEntries);
});

test('a repeated or stale apply is refused instead of duplicating corrections', () => {
  const state = postedSavingsState();
  const draft = { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 6 }] };
  const review = interestCorrectionReview(state, 'savings', draft);
  const corrected = applyInterestCorrection(state, 'savings', review, draft);

  assert.throws(() => applyInterestCorrection(corrected, 'savings', review, draft), StaleInterestCorrectionError);
  assert.deepEqual(interestCorrectionReview(corrected, 'savings', draft).months, []);

  const changedSinceReview = structuredClone(state);
  changedSinceReview.transactions.push(createTransaction({ id: 'late-deposit', type: 'income', category: 'salary', account: 'savings', date: '2026-02-10', amount: 5000 }));
  assert.throws(() => applyInterestCorrection(changedSinceReview, 'savings', review, draft), StaleInterestCorrectionError);
});

test('a second correction of the same month adds a further numbered entry', () => {
  const state = postedSavingsState();
  const firstDraft = { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 6 }] };
  const once = applyInterestCorrection(state, 'savings', interestCorrectionReview(state, 'savings', firstDraft), firstDraft);
  const secondDraft = { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 12 }] };

  const twice = applyInterestCorrection(once, 'savings', interestCorrectionReview(once, 'savings', secondDraft), secondDraft);

  assert.deepEqual(twice.transactions.filter(transaction => transaction.correctsInterestMonth === '2026-01').map(({ id, amount }) => ({ id, amount })), [
    { id: 'interest-correction-savings-2026-01-1', amount: -462 },
    { id: 'interest-correction-savings-2026-01-2', amount: 462 }
  ]);
  assert.equal(accountBalance(twice, 'savings', '2026-02-28'), accountBalance(state, 'savings', '2026-02-28'));
});

test('bank interest imported after the app posted its own needs a per-month choice before applying', () => {
  const state = postedSavingsState({ transactions: [] });
  state.transactions.push(bankInterest());
  const draft = { currentMonth: '2026-03' };
  const review = interestCorrectionReview(state, 'savings', draft);

  assert.deepEqual(review.months.map(({ month, needsChoice, recorded, bank, difference }) => ({ month, needsChoice, recorded, bank, difference })), [
    { month: '2026-01', needsChoice: true, recorded: 949, bank: 950, difference: 0 },
    { month: '2026-02', needsChoice: false, recorded: 958, bank: 0, difference: 9 }
  ]);
  assert.throws(() => applyInterestCorrection(state, 'savings', review, draft), InterestChoiceRequiredError);
});

test('choosing the bank amount only offsets the app entry, and later months compound on the bank amount', () => {
  const state = postedSavingsState({ transactions: [] });
  state.transactions.push(bankInterest());
  const draft = { currentMonth: '2026-03', choices: [{ month: '2026-01', choice: 'bank' }] };
  const review = interestCorrectionReview(state, 'savings', draft);

  const corrected = applyInterestCorrection(state, 'savings', review, draft);

  assert.deepEqual(reviewedMonths(review), [
    { month: '2026-01', recorded: 949, corrected: 0, difference: -949, compoundingEffect: false }
  ]);
  assert.equal(monthStats(corrected, '2026-01').income, 950);
  assert.deepEqual(corrected.accounts[0].interestBankChoices, [{ month: '2026-01', choice: 'bank' }]);
  assert.deepEqual(interestCorrectionReview(corrected, 'savings', { currentMonth: '2026-03' }).months, []);
});

test('keeping both stores the choice once, and the app posts its entry where it had none', () => {
  const state = postedSavingsState({ transactions: [bankInterest()] });
  assert.equal(state.transactions.some(transaction => transaction.id === 'interest-savings-2026-01'), false);
  const draft = { currentMonth: '2026-03', choices: [{ month: '2026-01', choice: 'both' }] };

  const corrected = applyInterestCorrection(state, 'savings', interestCorrectionReview(state, 'savings', draft), draft);

  assert.deepEqual(interestEntries(corrected), [
    { id: 'bank-interest-jan', date: '2026-01-31', amount: 950 },
    { id: 'interest-savings-2026-02', date: '2026-02-28', amount: 958 },
    { id: 'interest-savings-2026-01', date: '2026-01-31', amount: 958 },
    { id: 'interest-correction-savings-2026-02-1', date: '2026-02-28', amount: 9 }
  ]);
  assert.deepEqual(interestCorrectionReview(corrected, 'savings', { currentMonth: '2026-03' }).months, []);
  assert.deepEqual(compoundSavings(corrected, '2026-03'), corrected);
});

test('stored corrections and bank-interest choices are validated', async context => {
  const correction = { id: 'interest-correction-savings-2026-01-1', type: 'income', title: 'Interest correction', amount: -462, date: '2026-01-31', account: 'savings', category: 'interest', correctsInterestMonth: '2026-01' };
  const invalidCorrections = {
    'zero amount': { amount: 0 },
    'fractional cents': { amount: -4.5 },
    'another month': { date: '2026-02-28' },
    'not interest income': { category: 'salary' },
    'an expense': { type: 'expense' }
  };
  assert.doesNotThrow(() => validateState(createSavingsState({ transactions: [correction] })));
  for (const [name, change] of Object.entries(invalidCorrections)) {
    await context.test(`correction with ${name}`, () => {
      assert.throws(() => validateState(createSavingsState({ transactions: [{ ...correction, ...change }] })), SyntaxError);
    });
  }
  const invalidChoices = {
    'an unknown choice': [{ month: '2026-01', choice: 'app' }],
    'an invalid month': [{ month: '2026-13', choice: 'bank' }],
    'a repeated month': [{ month: '2026-01', choice: 'bank' }, { month: '2026-01', choice: 'both' }],
    'a non-list': { month: '2026-01', choice: 'bank' }
  };
  for (const [name, interestBankChoices] of Object.entries(invalidChoices)) {
    await context.test(`choices with ${name}`, () => {
      const state = createSavingsState();
      state.accounts[0].interestBankChoices = interestBankChoices;
      assert.throws(() => validateState(state), SyntaxError);
    });
  }
});

test('an earlier first rate posts ordinary interest for months that had none and corrects the later ones', () => {
  const state = postedSavingsState();
  const schedule = correctedSchedule([{ since: '2026-01', rate: 12 }], { since: '2025-11', rate: 12 });
  const draft = { currentMonth: '2026-03', schedule };

  const corrected = applyInterestCorrection(state, 'savings', interestCorrectionReview(state, 'savings', draft), draft);

  assert.deepEqual(interestEntries(corrected).slice(2), [
    { id: 'interest-savings-2025-11', date: '2025-11-30', amount: 949 },
    { id: 'interest-savings-2025-12', date: '2025-12-31', amount: 958 },
    { id: 'interest-correction-savings-2026-01-1', date: '2026-01-31', amount: 18 },
    { id: 'interest-correction-savings-2026-02-1', date: '2026-02-28', amount: 18 }
  ]);
  assert.equal(accountBalance(corrected, 'savings', '2026-02-28'), 100000 + 949 + 958 + 967 + 976);
});

test('removing a past rate offsets the interest it earned', () => {
  const state = postedSavingsState();
  const draft = { currentMonth: '2026-03', schedule: correctedScheduleWithout([{ since: '2026-01', rate: 12 }], '2026-01') };

  const review = interestCorrectionReview(state, 'savings', draft);

  assert.deepEqual(review.months.map(({ month, difference }) => ({ month, difference })), [
    { month: '2026-01', difference: -949 },
    { month: '2026-02', difference: -958 }
  ]);
});

test('a correction draft refuses an invalid rate or month but allows past starts', () => {
  assert.throws(() => correctedSchedule([], { since: '2026-13', rate: 3 }), InterestScheduleError);
  assert.throws(() => correctedSchedule([], { since: '2026-01', rate: -1 }), InterestScheduleError);
  assert.deepEqual(correctedSchedule([{ since: '2026-01', rate: 12 }], { since: '2026-01', rate: 3 }), [{ since: '2026-01', rate: 3 }]);
});

test('a correction changes only its own account, and a removed account cannot be reviewed', () => {
  const state = postedSavingsState();
  state.accounts.push({ id: 'other-savings', name: 'Other', tag: 'Savings', openingBalance: 50000, interestSchedule: [{ since: '2026-01', rate: 12 }] });
  const draft = { currentMonth: '2026-03', schedule: [{ since: '2026-01', rate: 6 }] };

  const corrected = applyInterestCorrection(state, 'savings', interestCorrectionReview(state, 'savings', draft), draft);

  assert.equal(corrected.accounts[1], state.accounts[1]);
  assert.equal(corrected.transactions.filter(transaction => transaction.account === 'other-savings').length, 0);
  assert.throws(() => interestCorrectionReview(state, 'missing', draft), /no longer available/);
});
