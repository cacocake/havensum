import React, { useContext, useState } from 'react';
import { useApp } from './context.js';
import { Theme, T, Button, Field, Select, DateField, Dialog } from './ui.jsx';
import { useDirtyForm } from './useDirtyForm.js';
import { cents, euro } from './money.js';
import { k_entityIdPrefixes } from './domainConstants.js';
import { createEntityId } from './identifiers';
import { monthOf } from './calendar.js';
import { loanPaymentInMonth } from './loanPaymentHistory.js';
import { withAdvancePayment, InvalidAdvancePaymentError } from './loanAdvancePayments.js';

const k_advanceMessages = {
  saved: 'Advance payment recorded',
  balanceNote: 'Recorded as a payment on the loan and taken off the recorded remaining balance. Principal and interest are not guessed.',
  paymentQuestion: 'Did your bank change the monthly payment after this advance? The app never calculates the new amount.'
};

// Owner decision P14: records an advance or down-payment on the loan, lowers
// the remaining balance in the same save, then asks whether the monthly
// payment changed and from when (entered on the loan, never calculated).
export function AdvancePaymentForm({ loan, onClose }) {
  const { state, setState, setModal, notify, today } = useApp();
  const colors = useContext(Theme);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [account, setAccount] = useState(loan.account);
  const [error, setError] = useState('');
  const [savedLoan, setSavedLoan] = useState(null);
  const isDirty = useDirtyForm([amount, date, account]) && !savedLoan;

  function save() {
    const advance = { loanId: loan.id, id: createEntityId(k_entityIdPrefixes.transaction), amount: cents(amount), date, account };
    try {
      const advanced = withAdvancePayment(state, advance);
      setState(currentState => withAdvancePayment(currentState, advance));
      setSavedLoan(advanced.loans.find(candidate => candidate.id === loan.id));
      notify(k_advanceMessages.saved);
    } catch (failure) {
      if (!(failure instanceof InvalidAdvancePaymentError)) {
        throw failure;
      }
      setError(failure.message);
    }
  }

  if (savedLoan) {
    const paymentNow = loanPaymentInMonth(savedLoan, monthOf(today));
    return <Dialog title="Did the monthly payment change?" onClose={onClose}>
      <T style={{ marginBottom: 8 }}>{`${loan.name} · remaining balance now ${euro(savedLoan.remaining)}`}</T>
      <T style={{ fontSize: 12, color: colors.sub, marginBottom: 20 }}>{k_advanceMessages.paymentQuestion}</T>
      <Button onPress={() => setModal({ type: 'loan', item: savedLoan, startWithPaymentChange: true })}>Yes, enter the new payment</Button>
      <Button kind="outline" style={{ marginTop: 10 }} onPress={onClose}>{`No, it stays ${euro(paymentNow)}`}</Button>
    </Dialog>;
  }

  return <Dialog dirty={isDirty} title={`An advance on ${loan.name}`} subtitle={k_advanceMessages.balanceNote} onClose={onClose}>
    <Field label="Advance payment · EUR" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
    <DateField label="Date" value={date} onChange={setDate} />
    <Select label="Paid from" value={account} onChange={setAccount} options={state.accounts.map(candidate => ({ value: candidate.id, label: candidate.name }))} />
    {error && <T style={{ color: colors.negative, marginBottom: 12 }}>{error}</T>}
    <Button onPress={save}>Record advance payment</Button>
  </Dialog>;
}
