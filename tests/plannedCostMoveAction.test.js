import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/engine.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { movePlannedCost, plannedCostMovePreview, plannedCostMoveYears } from '../src/plannedCostMoves.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

// Owner decisions F16/F17: a recurring planned cost moves from this year or a
// later one; earlier years, frozen plans and recorded expenses stay as they were.
const k_today = '2026-11-19';
const k_celebrations = { id: 'celebrations', name: 'December celebrations', month: 12, amount: 30000 };
const k_springFair = { id: 'spring-fair', name: 'Spring fair', month: 3, amount: 10000, year: 2027 };

function celebrationsPayment(id, date, month) {
  return createTransaction({ id, date, amount: 8000, category: 'shopping', plannedCost: { eventId: 'celebrations', month } });
}

function plannedState(overrides = {}) {
  const state = createFinancialState({ events: [k_celebrations, k_springFair], ...overrides });
  const plan = buildPlan(state, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02' });
  return approvePlanRevision(state, plan, { id: 'plan-2026-r1', fromMonth: 1, today: '2026-01-02' });
}

test('moving a recurring planned cost from 2027 changes only its month from 2027 on', () => {
  const state = plannedState({ transactions: [celebrationsPayment('gifts-2025', '2025-12-20', '2025-12')] });

  const moved = movePlannedCost(state, { eventId: 'celebrations', fromYear: 2027, month: 11, today: k_today });

  assert.deepEqual(moved.events, [{ ...k_celebrations, monthFromYear: { 2027: 11 } }, k_springFair]);
  assert.equal(moved.transactions, state.transactions);
  assert.equal(moved.plans, state.plans);
  assert.deepEqual({ ...moved, events: state.events }, state);
});

test('a move cannot start in a past year, on a one-off cost, or on an unknown cost', () => {
  const state = plannedState();

  assert.throws(() => movePlannedCost(state, { eventId: 'celebrations', fromYear: 2025, month: 11, today: k_today }), /this year or a later year/);
  assert.throws(() => movePlannedCost(state, { eventId: 'spring-fair', fromYear: 2027, month: 4, today: k_today }), /recurring planned cost/);
  assert.throws(() => movePlannedCost(state, { eventId: 'missing', fromYear: 2027, month: 4, today: k_today }), /recurring planned cost/);
  assert.throws(() => movePlannedCost(state, { eventId: 'celebrations', fromYear: 2027, month: 13, today: k_today }), /month/);
});

test('a move to the month already in effect with no later move is refused as no change', () => {
  const state = plannedState({ events: [{ ...k_celebrations, monthFromYear: { 2027: 11 } }] });

  assert.throws(() => movePlannedCost(state, { eventId: 'celebrations', fromYear: 2028, month: 11, today: k_today }), /already/);
  assert.throws(() => movePlannedCost(plannedState(), { eventId: 'celebrations', fromYear: 2026, month: 12, today: k_today }), /already/);
});

test('a move from this year back to the original month undoes a later move', () => {
  const state = plannedState({ events: [{ ...k_celebrations, monthFromYear: { 2027: 11 } }] });

  const moved = movePlannedCost(state, { eventId: 'celebrations', fromYear: 2026, month: 12, today: k_today });

  assert.deepEqual(moved.events[0], k_celebrations);
});

test('a move from a year replaces later moves and keeps earlier ones, and moving back to the original month clears it', () => {
  const state = plannedState({ events: [{ ...k_celebrations, monthFromYear: { 2027: 11, 2029: 10 } }] });

  const fromLaterYear = movePlannedCost(state, { eventId: 'celebrations', fromYear: 2028, month: 9, today: k_today });
  const backToOriginal = movePlannedCost(state, { eventId: 'celebrations', fromYear: 2027, month: 12, today: k_today });

  assert.deepEqual(fromLaterYear.events[0].monthFromYear, { 2027: 11, 2028: 9 });
  assert.deepEqual(backToOriginal.events[0], k_celebrations);
});

test('the move preview lists expenses linked to the old month in a moved year, which will need review', () => {
  const state = plannedState({
    transactions: [
      celebrationsPayment('gifts-2026', '2026-11-10', '2026-12'),
      celebrationsPayment('early-booking-2027', '2026-11-12', '2027-12'),
      celebrationsPayment('deposit-2028', '2026-11-13', '2028-12')
    ]
  });

  const preview = plannedCostMovePreview(state, { eventId: 'celebrations', fromYear: 2027, month: 11 });

  assert.deepEqual(preview.expensesToReview.map(expense => expense.id), ['early-booking-2027', 'deposit-2028']);
});

test('expenses already linked to the new month of a moved year do not need review', () => {
  const state = plannedState({ transactions: [celebrationsPayment('booking-2027', '2026-11-12', '2027-11')] });

  const preview = plannedCostMovePreview(state, { eventId: 'celebrations', fromYear: 2027, month: 11 });

  assert.deepEqual(preview.expensesToReview, []);
});

test('a move can start this year or in one of the next five years', () => {
  assert.deepEqual(plannedCostMoveYears(k_today), [2026, 2027, 2028, 2029, 2030, 2031]);
});

test('the move preview names the later moves it replaces and the month in effect before it', () => {
  const state = plannedState({ events: [{ ...k_celebrations, monthFromYear: { 2027: 11, 2029: 10 } }] });

  const preview = plannedCostMovePreview(state, { eventId: 'celebrations', fromYear: 2028, month: 9 });

  assert.deepEqual([preview.previousMonth, preview.replacedMoveYears, preview.isChange], [11, [2029], true]);
});
