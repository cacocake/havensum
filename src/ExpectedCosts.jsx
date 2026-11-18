import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Card, Button, Dialog, Field, Row, Select } from './ui.jsx';
import { Squish } from './Playful.jsx';
import { euro } from './money.js';
import { monthStats } from './ledger.js';
import { isOccasionalExpense } from './expectedOccasionalSpending.js';

const k_monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const k_billStatusLabels = { recorded: 'Recorded', scheduled: 'Scheduled', cancelled: 'Cancelled', 'still expected': 'Still expected' };

export default function ExpectedCosts({ prediction, month }) {
  const { state, setState } = useApp();
  const colors = useContext(Theme);
  const [selectedBill, setSelectedBill] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelFrom, setCancelFrom] = useState(month);
  const [error, setError] = useState('');
  const occasionalExpenses = monthStats(state, month).expenses.filter(expense => isOccasionalExpense(state, expense));

  function matchEventPayment(eventId, value) {
    setState(current => {
      const eventPayments = { ...current.outlook?.eventPayments };
      delete eventPayments[eventId];
      const payment = occasionalExpenses.find(expense => String(expense.id) === value);
      if (payment) {
        eventPayments[eventId] = payment.id;
      }
      return { ...current, outlook: { ...current.outlook, eventPayments } };
    });
  }

  function inspectBill(bill) {
    setSelectedBill(bill);
    setCancelFrom(month);
    setConfirming(false);
    setError('');
  }

  function cancelBill() {
    if (!k_monthPattern.test(cancelFrom)) {
      setError('Use a month in YYYY-MM format.');
      return;
    }
    setState(current => ({
      ...current,
      outlook: {
        ...current.outlook,
        billCancellations: { ...current.outlook?.billCancellations, [selectedBill.key]: cancelFrom }
      }
    }));
    setSelectedBill(null);
  }

  return <Card testID="expected-costs">
    <H size={23}>Expected costs</H>
    <T style={{ color: colors.sub, marginTop: 8, marginBottom: 12 }}>Each fixed bill stays expected until you explicitly cancel it. Recorded payments count once.</T>
    {(prediction.bills || []).map(bill => <Squish key={bill.key} accessibilityLabel={`Inspect expected bill ${bill.name}`} onPress={() => inspectBill(bill)} style={{ minHeight: 64, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
      <Row style={{ gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T>{bill.name}</T>
          <T style={{ fontSize: 12, color: colors.sub }}>{state.accounts.find(account => account.id === bill.account)?.name} · {k_billStatusLabels[bill.status]}</T>
        </View>
        <T style={{ fontWeight: '600' }}>{euro(bill.expected)}</T>
      </Row>
    </Squish>)}
    {(prediction.variableLines || []).map(line => <View key={line.category} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
      <Row style={{ justifyContent: 'space-between', gap: 12 }}><T style={{ flex: 1 }}>{line.name} · variable</T><T>{euro(line.expected)}</T></Row>
      <T style={{ fontSize: 12, color: colors.sub }}>Historical monthly average {euro(line.average)}</T>
    </View>)}
    <Row style={{ justifyContent: 'space-between', gap: 12, marginTop: 16 }}><T style={{ flex: 1 }}>Loan repayments</T><T>{euro(prediction.loan || 0)}</T></Row>
    <Row style={{ justifyContent: 'space-between', gap: 12, marginTop: 16 }}><T style={{ flex: 1 }}>Occasional costs and reserve</T><T>{euro(prediction.occasional || 0)}</T></Row>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 8 }}>Historical reserve {euro(prediction.monthlyReserve || 0)}. Known occasional costs use up this reserve; only excess adds to it.</T>
    {(prediction.events || []).map(event => <View key={event.id} style={{ marginTop: 18 }}>
      <T>{event.name} · known cost {euro(event.amount)}</T>
      <T style={{ color: colors.sub, marginTop: 4, marginBottom: 10 }}>Still upcoming {euro(event.remaining)}</T>
      <Select label={`Recorded expense for ${event.name}`} value={event.paymentId === undefined ? '' : String(event.paymentId)} onChange={value => matchEventPayment(event.id, value)} options={[
        { value: '', label: 'Not matched to an expense' },
        ...occasionalExpenses.filter(expense => !Object.entries(state.outlook?.eventPayments || {}).some(([eventId, paymentId]) => eventId !== String(event.id) && paymentId === expense.id)).map(expense => ({ value: String(expense.id), label: `${expense.date} · ${expense.title} · ${euro(expense.amount)}` }))
      ]} />
    </View>)}
    {selectedBill && <Dialog title={selectedBill.name} onClose={() => setSelectedBill(null)}>
      <T style={{ marginBottom: 14 }}>Latest observed monthly bill: {euro(selectedBill.baseline)}. Expected this month: {euro(selectedBill.expected)}.</T>
      <T style={{ color: colors.sub, marginBottom: 18 }}>Recognised by its account, category and title. Similar names on different accounts remain separate bills.</T>
      <H size={19}>Recorded history</H>
      {state.transactions.filter(transaction => transaction.type === 'expense' && transaction.account === selectedBill.account && transaction.category === selectedBill.category && (transaction.title || '').trim().toLowerCase() === selectedBill.name.trim().toLowerCase()).sort((first, second) => second.date.localeCompare(first.date)).slice(0, 12).map(transaction => <Row key={transaction.id} style={{ justifyContent: 'space-between', gap: 12, marginTop: 12 }}><T>{transaction.date}</T><T>{euro(transaction.amount)}</T></Row>)}
      {selectedBill.cancelledSince ? <T style={{ color: colors.sub, marginTop: 18 }}>Cancelled from {selectedBill.cancelledSince}. Recorded entries are retained.</T> : confirming ? <View style={{ marginTop: 18 }}>
        <Field label="Cancelled from · YYYY-MM" value={cancelFrom} onChangeText={setCancelFrom} />
        <T style={{ color: colors.sub, marginBottom: 14 }}>Only this bill's future expectation changes. Recorded transactions and your frozen plan stay as saved.</T>
        {error && <T accessibilityRole="alert" style={{ color: colors.negative }}>{error}</T>}
        <Button onPress={cancelBill}>Confirm cancellation</Button>
        <Button kind="soft" style={{ marginTop: 8 }} onPress={() => setConfirming(false)}>Keep this bill expected</Button>
      </View> : <Button style={{ marginTop: 18 }} kind="outline" onPress={() => setConfirming(true)}>Mark this cost as cancelled</Button>}
    </Dialog>}
  </Card>;
}
