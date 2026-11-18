import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalance, mergeThreeWay, monthStats } from '../src/engine.js';
import { parseImportContent } from '../src/importFiles.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_createdAt = '2026-11-18T10:00:00.000Z';

test('legacy and task-bearing JSON backups round trip and merging the same task twice keeps one record', async () => {
  const { createPaybackTask } = await import('../src/paybackTasks.js');
  const legacy = createFinancialState({ transactions: [createTransaction()] });
  const legacyFile = await parseImportContent('backup.json', JSON.stringify(legacy));
  assert.equal(legacyFile.backup.paybackTasks, undefined);
  const remote = createPaybackTask(legacy, 'weekly-shopping', { id: 'task', at: k_createdAt });
  const { backup } = await parseImportContent('backup.json', JSON.stringify(remote));
  const first = mergeThreeWay(legacy, legacy, backup).result;
  const repeat = mergeThreeWay(backup, first, backup);
  assert.deepEqual(repeat.result.paybackTasks, remote.paybackTasks);
  assert.deepEqual(repeat.conflicts, []);
  assert.deepEqual(repeat.result.transactions, legacy.transactions);
});

test('a future-dated payback counts as received when its date arrives and reserves reimbursement capacity', async () => {
  const { createPaybackTask, createPaybackDraft, paybackTaskSummary } = await import('../src/paybackTasks.js');
  const expense = createTransaction({ amount: 10000 });
  const futurePayback = createTransaction({ id: 'future', type: 'reimbursement', linkedId: expense.id, amount: 10000, date: '2026-11-20' });
  const state = createPaybackTask(createFinancialState({ transactions: [expense, futurePayback] }), expense.id, { id: 'task', at: k_createdAt });
  assert.equal(paybackTaskSummary(state, 'task', '2026-11-19').received, 0);
  assert.equal(createPaybackDraft(state, 'task', '2026-11-19'), null);
  assert.equal(paybackTaskSummary(state, 'task', '2026-11-20').status, 'received');
});

test('a backup merge requires a choice between concurrent closure and task edits', async () => {
  const { createPaybackTask, closePaybackTask, updatePaybackTask } = await import('../src/paybackTasks.js');
  const base = createPaybackTask(createFinancialState({ transactions: [createTransaction()] }), 'weekly-shopping', { id: 'task', at: k_createdAt });
  const at = '2026-11-18T12:00:00.000Z';
  const local = closePaybackTask(base, 'task', { at });
  const remote = updatePaybackTask(base, 'task', { person: 'Synthetic person', at });
  assert.equal(mergeThreeWay(base, local, remote).conflicts[0].collection, 'paybackTasks');
  assert.deepEqual(mergeThreeWay(base, base, remote).result.paybackTasks, remote.paybackTasks);
  const removed = { ...base, paybackTasks: [] };
  assert.equal(mergeThreeWay(base, local, removed).conflicts[0].collection, 'paybackTasks');
});

test('expecting a payback creates follow-up metadata without changing cash, spending or the frozen target', async () => {
  const { createPaybackTask } = await import('../src/paybackTasks.js');
  const state = createFinancialState({ transactions: [createTransaction({ amount: 10000 })], plan: { revision: 4, months: { '2026-11': { balance: 50000 } } } });
  const result = createPaybackTask(state, 'weekly-shopping', { id: 'task-synthetic', at: k_createdAt });

  assert.equal(result.paybackTasksVersion, 1);
  assert.deepEqual(result.paybackTasks.map(task => [task.id, task.expenseId, task.expectedAmount]), [['task-synthetic', 'weekly-shopping', 10000]]);
  assert.equal(accountBalance(result, 'everyday'), 90000);
  assert.deepEqual(monthStats(result, '2026-11'), monthStats(state, '2026-11'));
  assert.deepEqual(result.plan, state.plan);
  assert.equal(state.paybackTasks, undefined);
});

test('task due dates and closure chronology are validated without altering existing records', async () => {
  const { createPaybackTask, closePaybackTask } = await import('../src/paybackTasks.js');
  const state = createFinancialState({ transactions: [createTransaction()] });
  assert.throws(() => createPaybackTask(state, 'weekly-shopping', { id: 'follow-up', at: k_createdAt, dueDate: '2026-02-30' }), /due date/i);
  assert.throws(() => createPaybackTask(state, 'weekly-shopping', { id: 'follow-up', at: 'not-a-time' }), /timestamp/i);
  const tracked = createPaybackTask(state, 'weekly-shopping', { id: 'follow-up', at: k_createdAt });
  assert.throws(() => closePaybackTask(tracked, 'follow-up', { at: '2026-11-01T10:00:00.000Z' }), /chronology/i);
  assert.equal(tracked.paybackTasks[0].manuallyClosed, false);
});

test('expense save creates its task atomically and turning tracking off requires confirmation without recording money', async () => {
  const { saveTransaction } = await import('../src/transactionActions.js');
  const expense = createTransaction({ amount: 10000 });
  const original = createFinancialState();
  const state = saveTransaction(original, expense, { expectPayback: true, taskId: 'follow-up', at: k_createdAt });
  assert.equal(state.paybackTasks[0].expectedAmount, 10000);
  assert.throws(() => saveTransaction(state, expense, { expectPayback: false, at: '2026-11-18T11:00:00.000Z' }), /confirm.*payback/i);
  const closed = saveTransaction(state, expense, { expectPayback: false, confirmClose: true, at: '2026-11-18T11:00:00.000Z' });
  assert.equal(closed.paybackTasks[0].manuallyClosed, true);
  assert.equal(closed.paybackTasks[0].closureHistory.length, 1);
  assert.deepEqual(closed.transactions, state.transactions);
  assert.equal(original.transactions.length, 0);
});

test('editing an expense never clamps its expectation and confirmed deletion removes its task', async () => {
  const { createPaybackTask } = await import('../src/paybackTasks.js');
  const { saveTransaction, deleteTransaction } = await import('../src/transactionActions.js');
  const original = createTransaction({ amount: 10000 });
  const state = createPaybackTask(createFinancialState({ transactions: [original] }), original.id, { id: 'follow-up', at: k_createdAt });
  assert.throws(() => saveTransaction(state, { ...original, amount: 5000 }), /expected amount/i);
  const edited = saveTransaction(state, { ...original, amount: 5000 }, { expectPayback: true, expectedAmount: 4000, at: '2026-11-18T11:00:00.000Z' });
  assert.equal(edited.paybackTasks[0].expectedAmount, 4000);
  assert.equal(edited.paybackTasks[0].id, 'follow-up');
  assert.throws(() => deleteTransaction(edited, original.id), /confirm.*task.*history/i);
  const removed = deleteTransaction(edited, original.id, { confirmRemoveTask: true });
  assert.deepEqual(removed.paybackTasks, []);
  assert.deepEqual(removed.transactions, []);
  assert.equal(accountBalance(removed, 'everyday'), 100000);
  assert.equal(state.transactions[0].amount, 10000);
});

test('editing an expectation and explicitly reopening retain identity, closure history and actual payments', async () => {
  const { createPaybackTask, closePaybackTask, updatePaybackTask, reopenPaybackTask, paybackTaskSummary } = await import('../src/paybackTasks.js');
  const state = createPaybackTask(createFinancialState({ transactions: [createTransaction({ amount: 10000 })] }), 'weekly-shopping', { id: 'follow-up', at: k_createdAt });
  const closed = closePaybackTask(state, 'follow-up', { at: '2026-11-18T11:00:00.000Z', reason: 'Paused follow-up' });
  const edited = updatePaybackTask(closed, 'follow-up', { expectedAmount: 4000, person: 'Synthetic person', at: '2026-11-18T12:00:00.000Z' });
  assert.equal(paybackTaskSummary(edited, 'follow-up', '2026-11-18').status, 'closed');
  const reopened = reopenPaybackTask(edited, 'follow-up', { at: '2026-11-18T13:00:00.000Z' });
  assert.equal(paybackTaskSummary(reopened, 'follow-up', '2026-11-18').status, 'open');
  assert.equal(reopened.paybackTasks[0].id, 'follow-up');
  assert.equal(reopened.paybackTasks[0].expectedAmount, 4000);
  assert.deepEqual(reopened.paybackTasks[0].closureHistory, closed.paybackTasks[0].closureHistory);
  assert.deepEqual(reopened.transactions, state.transactions);
});

test('later money preserves manual closure and recording from the task only creates a draft', async () => {
  const { createPaybackTask, closePaybackTask, paybackTaskSummary, createPaybackDraft } = await import('../src/paybackTasks.js');
  const original = createFinancialState({ transactions: [createTransaction({ amount: 10000 })] });
  const tracked = createPaybackTask(original, 'weekly-shopping', { id: 'follow-up', expectedAmount: 6000, at: k_createdAt });
  const closed = closePaybackTask(tracked, 'follow-up', { at: '2026-11-18T11:00:00.000Z' });
  const later = { ...closed, transactions: [...closed.transactions, createTransaction({ id: 'later-payback', type: 'reimbursement', linkedId: 'weekly-shopping', amount: 2500, date: '2026-11-19' })] };
  const draft = createPaybackDraft(later, 'follow-up', '2026-11-20');
  assert.equal(paybackTaskSummary(later, 'follow-up', '2026-11-20').status, 'closed');
  assert.deepEqual(later.paybackTasks[0].closureHistory, closed.paybackTasks[0].closureHistory);
  assert.equal(draft.amount, 3500);
  assert.equal(draft.account, 'everyday');
  assert.equal(draft.linkedId, 'weekly-shopping');
  assert.equal(draft.type, 'reimbursement');
  assert.equal(later.transactions.length, 2);
});

test('partial and full linked paybacks resolve tasks and deletion reopens automatically resolved follow-up', async () => {
  const { createPaybackTask, paybackTaskSummary } = await import('../src/paybackTasks.js');
  const expense = createTransaction({ amount: 10000, date: '2026-10-10' });
  const state = createPaybackTask(createFinancialState({ transactions: [expense] }), expense.id, { id: 'follow-up', at: k_createdAt, expectedAmount: 6000, dueDate: '2026-11-15' });
  const partial = { ...state, transactions: [...state.transactions, createTransaction({ id: 'partial', type: 'reimbursement', amount: 2500, linkedId: expense.id, date: '2026-11-10' })] };
  assert.deepEqual(paybackTaskSummary(partial, 'follow-up', '2026-11-18'), { status: 'partial', received: 2500, outstanding: 3500, overdue: true, recordable: 7500 });
  const paid = { ...partial, transactions: [...partial.transactions, createTransaction({ id: 'remainder', type: 'reimbursement', amount: 3500, linkedId: expense.id, date: '2026-11-17' })] };
  assert.equal(paybackTaskSummary(paid, 'follow-up', '2026-11-18').status, 'received');
  assert.equal(paybackTaskSummary(partial, 'follow-up', '2026-11-18').status, 'partial');
  assert.equal(monthStats(paid, '2026-10').spent, 4000);
  assert.equal(monthStats(paid, '2026-11').income, 0);
  assert.equal(accountBalance(paid, 'everyday'), 96000);
});

test('closing without payment preserves every money record and an explicit closure history', async () => {
  const { createPaybackTask, closePaybackTask } = await import('../src/paybackTasks.js');
  const state = createFinancialState({ transactions: [
    createTransaction({ amount: 10000, date: '2026-10-10' }),
    createTransaction({ id: 'partial-payback', type: 'reimbursement', linkedId: 'weekly-shopping', amount: 2500, date: '2026-11-10' })
  ], plan: { revision: 8 } });
  const tracked = createPaybackTask(state, 'weekly-shopping', { id: 'follow-up', at: k_createdAt });
  const result = closePaybackTask(tracked, 'follow-up', { at: '2026-11-18T11:00:00.000Z', reason: 'No further payback expected' });

  assert.equal(result.paybackTasks[0].manuallyClosed, true);
  assert.deepEqual(result.paybackTasks[0].closureHistory, [{ at: '2026-11-18T11:00:00.000Z', reason: 'No further payback expected' }]);
  assert.equal(accountBalance(result, 'everyday'), 92500);
  assert.equal(monthStats(result, '2026-10').spent, 7500);
  assert.equal(monthStats(result, '2026-11').income, 0);
  assert.deepEqual(result.transactions, state.transactions);
  assert.deepEqual(result.plan, state.plan);
  assert.equal(tracked.paybackTasks[0].manuallyClosed, false);
});

test('a task must have a unique identity, a real expense and a bounded integer-cent expectation', async () => {
  const { createPaybackTask } = await import('../src/paybackTasks.js');
  const state = createFinancialState({ transactions: [createTransaction({ amount: 10000 })] });
  for (const expectedAmount of [0, -1, 0.5, 10001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createPaybackTask(state, 'weekly-shopping', { id: 'invalid-task', at: k_createdAt, expectedAmount }), /expected amount/i);
  }
  assert.throws(() => createPaybackTask(state, 'missing', { id: 'missing-expense', at: k_createdAt }), /existing expense/);
  const first = createPaybackTask(state, 'weekly-shopping', { id: 'one-task', at: k_createdAt });
  assert.throws(() => createPaybackTask(first, 'weekly-shopping', { id: 'another-task', at: k_createdAt }), /already.*task/i);
  assert.throws(() => createPaybackTask(state, 'weekly-shopping', { at: k_createdAt }), /task.*ID/i);
});
