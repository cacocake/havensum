export const k_paybackTasksVersion = 1;

export function withPaybackTasks(state, tasks) {
  return { ...state, paybackTasks: tasks, paybackTasksVersion: tasks === undefined ? undefined : k_paybackTasksVersion };
}

function requireValid(condition, message) {
  if (!condition) {
    throw new SyntaxError(`Invalid payback tasks: ${message}.`);
  }
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isTimestamp(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function validatePaybackState(state) {
  if (state?.paybackTasks === undefined && state?.paybackTasksVersion === undefined) {
    return state;
  }
  requireValid(state.paybackTasksVersion === k_paybackTasksVersion, 'unsupported task version');
  requireValid(Array.isArray(state.paybackTasks), 'tasks must be an array');
  requireValid(Array.isArray(state.transactions), 'transactions must be an array');
  const taskIds = new Set();
  const expenseIds = new Set();
  for (const task of state.paybackTasks) {
    requireValid(task && typeof task === 'object', 'task must be a record');
    requireValid(typeof task.id === 'string' && task.id.trim().length > 0, 'task ID must be nonempty text');
    requireValid(!taskIds.has(task.id), 'duplicate task ID');
    requireValid(!expenseIds.has(task.expenseId), 'an expense already has a payback task');
    taskIds.add(task.id);
    expenseIds.add(task.expenseId);
    const expense = state.transactions.find(transaction => transaction.id === task.expenseId && transaction.type === 'expense');
    requireValid(Boolean(expense), 'task must reference an existing expense');
    requireValid(Number.isSafeInteger(task.expectedAmount) && task.expectedAmount > 0 && task.expectedAmount <= expense.amount, 'expected amount must be positive integer euro cents bounded by the expense');
    requireValid(typeof task.person === 'string' && typeof task.note === 'string', 'person and note must be text');
    requireValid(task.dueDate === '' || isCalendarDate(task.dueDate), 'due date must be an ISO calendar date');
    requireValid(isTimestamp(task.createdAt) && isTimestamp(task.updatedAt), 'task timestamp must be an ISO UTC timestamp');
    requireValid(task.createdAt <= task.updatedAt, 'task chronology');
    requireValid(typeof task.manuallyClosed === 'boolean' && Array.isArray(task.closureHistory), 'task lifecycle');
    requireValid(!task.manuallyClosed || task.closureHistory.length > 0, 'manual closure history is required');
    let previousClosureAt = task.createdAt;
    for (const closure of task.closureHistory) {
      requireValid(closure && isTimestamp(closure.at) && typeof closure.reason === 'string' && closure.reason.trim().length > 0, 'closure timestamp and reason');
      requireValid(closure.at >= previousClosureAt && closure.at <= task.updatedAt, 'closure chronology');
      previousClosureAt = closure.at;
    }
  }
  return state;
}
