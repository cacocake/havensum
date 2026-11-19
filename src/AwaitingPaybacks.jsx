import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Badge, Button, Card, Dialog, Field, H, Row, T, Theme } from './ui.jsx';
import { closePaybackTask, createPaybackDraft, paybackTaskSummary, reopenPaybackTask } from './paybackTasks.js';
import { euro } from './money.js';
import { localCalendarDate } from './calendar.js';

const k_statusLabels = { open: 'Awaiting payback', partial: 'Partially received', received: 'Received', closed: 'Closed without further payment' };

export default function AwaitingPaybacks() {
  const { state, setState, setModal, notify } = useApp();
  const colors = useContext(Theme);
  const [showHistory, setShowHistory] = useState(false);
  const [closingTask, setClosingTask] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const today = localCalendarDate();
  const rows = (state.paybackTasks ?? []).map(task => ({
    task,
    expense: state.transactions.find(transaction => transaction.id === task.expenseId),
    summary: paybackTaskSummary(state, task.id, today)
  }));
  const active = rows.filter(({ summary }) => summary.status === 'open' || summary.status === 'partial');
  const history = rows.filter(({ summary }) => summary.status === 'closed' || summary.status === 'received');

  function updateTask(action) {
    try {
      setState(action());
      setClosingTask(null);
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  }

  function openPayback(taskId) {
    const draft = createPaybackDraft(state, taskId, today);
    if (draft) {
      setModal({ type: 'transaction', initialType: 'reimbursement', draft });
    }
  }

  function renderTask({ task, expense, summary }) {
    return (
      <View key={task.id} style={{gap:8,paddingTop:14,borderTopWidth:1,borderColor:colors.line}}>
        <H size={20}>{expense.title}</H>
        <Row style={{gap:8,flexWrap:'wrap'}}>
          <Badge>{k_statusLabels[summary.status]}</Badge>
          {summary.overdue && <Badge color={colors.negative}>Overdue</Badge>}
        </Row>
        <T>Expected {euro(task.expectedAmount)} · Received {euro(summary.received)}</T>
        {summary.status !== 'closed' && summary.outstanding > 0 && <T>{euro(summary.outstanding)} outstanding</T>}
        {Boolean(task.person || task.dueDate) && <T style={{color:colors.sub}}>{[task.person, task.dueDate && `Due ${task.dueDate}`].filter(Boolean).join(' · ')}</T>}
        {Boolean(task.note) && <T>{task.note}</T>}
        {task.closureHistory.map((closure, index) => <T key={index} style={{color:colors.sub}}>{closure.at.slice(0, 10)} · {closure.reason}</T>)}
        <Row style={{gap:8,flexWrap:'wrap'}}>
          <Button small kind="outline" onPress={() => setModal({type:'transaction-detail',id:expense.id})}>View expense</Button>
          {summary.suggestedAmount > 0 && <Button small onPress={() => openPayback(task.id)}>Record payback</Button>}
          {(summary.status === 'open' || summary.status === 'partial') && <Button small kind="soft" onPress={() => { setReason(''); setError(''); setClosingTask(task.id); }}>Close without payback</Button>}
          {task.manuallyClosed && <Button small kind="soft" onPress={() => updateTask(() => reopenPaybackTask(state, task.id, { at: new Date().toISOString() }))}>Resume tracking</Button>}
        </Row>
      </View>
    );
  }

  return (
    <Card style={{gap:16}}>
      <H size={24}>Awaiting paybacks</H>
      {active.length ? active.map(renderTask) : <T style={{color:colors.sub}}>No open payback tasks. Mark an expense to start tracking it.</T>}
      {history.length > 0 && <Button small kind="outline" onPress={() => setShowHistory(value => !value)}>{showHistory ? 'Hide payback history' : 'Show payback history'}</Button>}
      {showHistory && history.map(renderTask)}
      {Boolean(error) && !closingTask && <T accessibilityRole="alert">{error}</T>}
      {closingTask && <Dialog title="Close without recording a payback?" onClose={() => setClosingTask(null)}>
        <T style={{marginBottom:12}}>This closes the follow-up and keeps its history.</T>
        <Field label="Closure reason · optional" value={reason} onChangeText={setReason}/>
        {Boolean(error) && <T accessibilityRole="alert">{error}</T>}
        <Button onPress={() => updateTask(() => closePaybackTask(state, closingTask, { at: new Date().toISOString(), reason: reason.trim() }))}>Confirm close without payback</Button>
      </Dialog>}
    </Card>
  );
}
