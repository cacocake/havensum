import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeThreeWay } from '../src/engine.js';
import { createFinancialState } from './helpers/financialFixtures.js';
import { parseImportContent } from '../src/importFiles.js';
import { billIdentity } from '../src/outlookInputs.js';

test('outlook edits arriving from a backup survive merge and concurrent edits require review', () => {
  const base = createFinancialState();
  const local = structuredClone(base);
  const remote = { ...structuredClone(base), outlook: { completeMonths: ['2026-10'] } };
  assert.deepEqual(mergeThreeWay(base, local, remote).result.outlook, remote.outlook);
  local.outlook = { completeMonths: ['2026-09'] };
  const merged = mergeThreeWay(base, local, remote);
  assert.equal(merged.conflicts[0].collection, 'outlook');
  assert.deepEqual(merged.result.outlook, local.outlook);
});

test('full JSON import retains independent assumptions and explicit bill and payment identities', async () => {
  const state = createFinancialState({ outlook: {
    window: 6, completeMonths: ['2026-10'],
    billCancellations: { [billIdentity({ account: 'everyday', category: 'rent', title: 'Internet' })]: '2026-11' },
    incomeChanges: [{ since: '2026-11', amount: 200000 }],
    loanChanges: [{ since: '2026-11', loanId: 'car', amount: 20000 }],
    eventPayments: { trip: 'deposit' }
  } });
  const parsed = await parseImportContent('backup.json', JSON.stringify(state));
  assert.deepEqual(parsed.backup, state);
});

test('one payment cannot be silently allocated to two upcoming costs', async () => {
  const state = createFinancialState({ outlook: { eventPayments: { trip: 'deposit', celebration: 'deposit' } } });
  await assert.rejects(parseImportContent('backup.json', JSON.stringify(state)), /outlook/i);
});

test('malformed bill identities in a backup are rejected instead of creating unusable cancellation controls', async () => {
  const state = createFinancialState({ outlook: { billCancellations: { '[{},null,"internet"]': '2026-11' } } });
  await assert.rejects(parseImportContent('backup.json', JSON.stringify(state)), /outlook/i);
});
