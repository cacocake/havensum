import { withPaybackTasks } from './paybackState.js';

export function mergePaybackTasks(base, local, remote, result, conflicts) {
  if (!base.paybackTasks && !local.paybackTasks && !remote.paybackTasks) {
    return result;
  }
  const byExpense = tasks => new Map((tasks ?? []).map(task => [task.expenseId, task]));
  const baseTasks = byExpense(base.paybackTasks);
  const localTasks = byExpense(local.paybackTasks ?? base.paybackTasks);
  const remoteTasks = byExpense(remote.paybackTasks ?? base.paybackTasks);
  const mergedTasks = [];
  const equal = (first, second) => JSON.stringify(first) === JSON.stringify(second);
  for (const expenseId of new Set([...baseTasks.keys(), ...localTasks.keys(), ...remoteTasks.keys()])) {
    const original = baseTasks.get(expenseId);
    const device = localTasks.get(expenseId);
    const backup = remoteTasks.get(expenseId);
    const merged = equal(device, original) ? backup : device;
    const mergedExpense = result.transactions.find(transaction => transaction.id === expenseId);
    if (merged && !supportsTask(mergedExpense, merged)) {
      const deviceSide = trackedExpense(local, expenseId, device);
      const backupSide = trackedExpense(remote, expenseId, backup);
      conflicts.push({
        collection: 'paybackTasks', id: expenseId, field: '$trackedExpense',
        base: trackedExpense(base, expenseId, original), local: deviceSide, remote: backupSide
      });
      const previewSide = deviceSide.task ? deviceSide : backupSide;
      result = replaceExpense(result, expenseId, previewSide.expense);
      if (previewSide.task) {
        mergedTasks.push(previewSide.task);
      }
      continue;
    }
    if (!equal(device, backup) && !equal(device, original) && !equal(backup, original)) {
      conflicts.push({
        collection: 'paybackTasks', id: expenseId, field: '$paybackTask',
        base: original, local: device, remote: backup
      });
    }
    if (merged) {
      mergedTasks.push(merged);
    }
  }
  return withPaybackTasks(result, mergedTasks);
}

function supportsTask(expense, task) {
  return expense?.type === 'expense' && expense.amount >= task.expectedAmount;
}

function trackedExpense(state, expenseId, task) {
  const expense = state.transactions.find(transaction => transaction.id === expenseId);
  return { expense, task: task && supportsTask(expense, task) ? task : undefined };
}

function replaceExpense(state, expenseId, expense) {
  const transactions = state.transactions.filter(transaction => transaction.id !== expenseId);
  if (expense) {
    transactions.push(expense);
  }
  return { ...state, transactions };
}

export function takeReviewedTrackedExpense(state, expenseId, side) {
  return takeReviewedPaybackTask(replaceExpense(state, expenseId, side.expense), expenseId, side.task);
}

export function takeReviewedPaybackTask(state, expenseId, task) {
  const tasks = state.paybackTasks.filter(record => record.expenseId !== expenseId);
  if (task) {
    tasks.push(task);
  }
  return withPaybackTasks(state, tasks);
}
