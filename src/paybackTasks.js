import { k_paybackTasksVersion, validatePaybackState } from './paybackState.js';

function changePaybackTask(state, taskId, change) {
  validatePaybackState(state);
  const task = state.paybackTasks?.find(record => record.id === taskId);
  if (!task) {
    throw Error('This payback task no longer exists.');
  }
  const changedTask = change(task);
  if (changedTask === task) {
    return state;
  }
  return validatePaybackState({ ...state, paybackTasks: state.paybackTasks.map(record => record.id === taskId ? changedTask : record) });
}

export function createPaybackTask(state, expenseId, input) {
  validatePaybackState(state);
  const expense = state.transactions.find(transaction => transaction.id === expenseId && transaction.type === 'expense');
  if (!expense) {
    throw Error('Choose an existing expense to expect a payback.');
  }
  const task = {
    id: input.id,
    expenseId,
    expectedAmount: input.expectedAmount ?? expense.amount,
    person: input.person || '',
    dueDate: input.dueDate || '',
    note: input.note || '',
    createdAt: input.at,
    updatedAt: input.at,
    manuallyClosed: false,
    closureHistory: []
  };
  return validatePaybackState({ ...state, paybackTasksVersion: k_paybackTasksVersion, paybackTasks: [...(state.paybackTasks || []), task] });
}

export function closePaybackTask(state, taskId, input) {
  return changePaybackTask(state, taskId, task => {
    if (task.manuallyClosed) {
      return task;
    }
    return {
      ...task,
      manuallyClosed: true,
      updatedAt: input.at,
      closureHistory: [...task.closureHistory, { at: input.at, reason: input.reason || 'Closed without recording a payback' }]
    };
  });
}

export function updatePaybackTask(state, taskId, input) {
  return changePaybackTask(state, taskId, task => paybackTaskWithDetails(task, input));
}

export function paybackTaskWithDetails(task, input) {
  return {
    ...task,
    expectedAmount: input.expectedAmount ?? task.expectedAmount,
    person: input.person ?? task.person,
    dueDate: input.dueDate ?? task.dueDate,
    note: input.note ?? task.note,
    updatedAt: input.at
  };
}

export function reopenPaybackTask(state, taskId, input) {
  return changePaybackTask(state, taskId, task => {
    if (!task.manuallyClosed) {
      return task;
    }
    return { ...task, manuallyClosed: false, updatedAt: input.at };
  });
}

export function paybackTaskSummary(state, taskId, asOf) {
  validatePaybackState(state);
  const task = state.paybackTasks?.find(record => record.id === taskId);
  if (!task) {
    throw Error('This payback task no longer exists.');
  }
  const expense = state.transactions.find(transaction => transaction.id === task.expenseId);
  const paybacks = state.transactions.filter(transaction => transaction.type === 'reimbursement' && transaction.linkedId === task.expenseId);
  const received = paybacks.filter(transaction => transaction.date <= asOf).reduce((total, transaction) => total + transaction.amount, 0);
  const recordedTotal = paybacks.reduce((total, transaction) => total + transaction.amount, 0);
  const outstanding = Math.max(0, task.expectedAmount - received);
  let status = 'open';
  if (task.manuallyClosed) {
    status = 'closed';
  } else if (outstanding === 0) {
    status = 'received';
  } else if (received > 0) {
    status = 'partial';
  }
  return {
    status, received, outstanding,
    overdue: !task.manuallyClosed && outstanding > 0 && Boolean(task.dueDate) && task.dueDate < asOf,
    recordable: Math.max(0, expense.amount - recordedTotal)
  };
}

export function createPaybackDraft(state, taskId, asOf) {
  const summary = paybackTaskSummary(state, taskId, asOf);
  if (summary.recordable === 0) {
    return null;
  }
  const task = state.paybackTasks.find(record => record.id === taskId);
  const expense = state.transactions.find(transaction => transaction.id === task.expenseId);
  return {
    type: 'reimbursement',
    title: `${task.person || 'Payback'} · ${expense.title}`,
    amount: Math.min(summary.outstanding || summary.recordable, summary.recordable),
    account: expense.account,
    category: expense.category,
    linkedId: expense.id,
    date: asOf
  };
}
