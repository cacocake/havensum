import { validateTransaction } from './transactionValidation.js';
import { validatePaybackState } from './paybackState.js';
import { createPaybackTask, closePaybackTask, paybackTaskWithDetails } from './paybackTasks.js';

export function saveTransaction(state, transaction, input = {}) {
  validatePaybackState(state);
  validateTransaction(state, transaction);
  const exists = state.transactions.some(record => record.id === transaction.id);
  let result = {
    ...state,
    transactions: exists
      ? state.transactions.map(record => record.id === transaction.id ? transaction : record)
      : [...state.transactions, transaction]
  };
  const task = state.paybackTasks?.find(record => record.expenseId === transaction.id);
  if (task && input.expectPayback === true) {
    result.paybackTasks = state.paybackTasks.map(record => record.id === task.id
      ? { ...paybackTaskWithDetails(record, input), manuallyClosed: false }
      : record);
  } else if (!task && input.expectPayback === true) {
    result = createPaybackTask(result, transaction.id, { ...input, id: input.taskId });
  } else if (task && input.expectPayback === false) {
    if (!task.manuallyClosed && !input.confirmClose) {
      throw Error('Confirm closing this payback task without recording a payment.');
    }
    result.paybackTasks = state.paybackTasks.map(record => record.id === task.id ? paybackTaskWithDetails(record, input) : record);
    result = closePaybackTask(result, task.id, { at: input.at, reason: input.closeReason || 'Expectation turned off in the expense editor' });
  }
  return validatePaybackState(result);
}
export function deleteTransaction(state, transactionId, input = {}) {
  if (state.transactions.some(record => record.type === 'reimbursement' && record.linkedId === transactionId)) {
    throw Error('Remove or unlink its reimbursements before deleting this expense.');
  }
  const task = state.paybackTasks?.find(record => record.expenseId === transactionId);
  if (task && !input.confirmRemoveTask) {
    throw Error('Confirm deletion of this expense, its payback task and closure history.');
  }
  const result = { ...state, transactions: state.transactions.filter(record => record.id !== transactionId) };
  if (task) {
    result.paybackTasks = state.paybackTasks.filter(record => record.id !== task.id);
  }
  return validatePaybackState(result);
}
