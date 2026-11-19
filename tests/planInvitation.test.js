import test from 'node:test';
import assert from 'node:assert/strict';
import { planInvitationYear } from '../src/planInvitation.js';
import { readPlanInvitationDeferral, writePlanInvitationDeferral, readState } from '../src/storage.web.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState, planArchiveOf } from './helpers/financialFixtures.js';

function ledgerWithPlanFor(year) {
  return createFinancialState({ plans: planArchiveOf({ year, months: {} }) });
}

test('the interview is offered on first use and when the current year has no plan', () => {
  assert.equal(planInvitationYear(createFinancialState(), { today: '2026-11-19', deferredYear: null }), 2026);
  assert.equal(planInvitationYear(ledgerWithPlanFor(2026), { today: '2026-12-31', deferredYear: null }), null);
  assert.equal(planInvitationYear(ledgerWithPlanFor(2026), { today: '2027-01-01', deferredYear: null }), 2027);
  assert.equal(planInvitationYear(ledgerWithPlanFor(2027), { today: '2027-01-01', deferredYear: null }), null);
});

test('Later suppresses the invitation for that calendar year only', () => {
  const ledger = ledgerWithPlanFor(2026);

  assert.equal(planInvitationYear(ledger, { today: '2027-03-01', deferredYear: 2027 }), null);
  assert.equal(planInvitationYear(ledger, { today: '2028-01-01', deferredYear: 2027 }), 2028);
});

test('deferring is remembered on the installation and changes no financial records', async context => {
  const storage = installBrowserStorage(context);
  const ledgerBytes = JSON.stringify(createFinancialState());
  storage.setItem('melo-state-v1', ledgerBytes);

  assert.equal(await readPlanInvitationDeferral(), null);
  await writePlanInvitationDeferral(2027);

  assert.equal(await readPlanInvitationDeferral(), 2027);
  assert.equal(storage.getItem('melo-state-v1'), ledgerBytes);
  assert.deepEqual(await readState(), JSON.parse(ledgerBytes));
});
