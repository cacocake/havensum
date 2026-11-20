import React, { useContext, useState } from 'react';
import { useApp } from './context.js';
import { View } from 'react-native';
import { Theme, T, Row, Button, Field, Select, Toggle, Dialog } from './ui.jsx';
import { EditablePaymentHistory } from './LoanPaymentHistory.jsx';
import { useDirtyForm } from './useDirtyForm.js';
import { cents, euro, isPositiveCentAmount, k_centsPerEuro } from './money.js';
import { k_transactionTypes, k_entityIdPrefixes } from './domainConstants.js';
import { createEntityId } from './identifiers';
import { isMonthKey, monthNumberOf, monthKeyOf, monthOf, yearOfMonth } from './calendar.js';
import { loanPaymentInMonth, withLoanFormEdits, withNormalizedPayments, withoutLoanPaymentChange } from './loanPaymentHistory.js';

const k_defaultLoanYears = 3;
const k_loanFormMessages = {
  invalid: 'Enter a name, positive amounts and a valid month range (YYYY-MM).',
  invalidPayment: 'Enter the new monthly payment: zero or more.',
  invalidPaymentMonth: 'Choose the month the new payment applies from (YYYY-MM), up to the loan\'s last month.',
  paymentBeforeStart: 'A new payment starts in the loan\'s start month or later.',
  invalidUntilMonth: 'Choose the last month of the temporary payment (YYYY-MM), from its first month on.',
  saved: 'Loan saved · revise the remaining Year Plan to include it',
  proceedsNote: 'Loan balance adjustment; excluded from income.',
  lastingHint: 'Every payment from this month on uses the new amount. Later changes are replaced; earlier months stay as they were.',
  temporaryHint: 'Only these months use the new amount. Afterwards the payment returns to what applies without it; other changes stay.'
};

// A new loan defaults to ending in the same local month, three years on.
function defaultLoanEnd(startMonth) {
  return monthKeyOf(yearOfMonth(startMonth) + k_defaultLoanYears, monthNumberOf(startMonth));
}

function amountText(amountInCents) {
  return String(amountInCents / k_centsPerEuro);
}

function newPaymentProblem({ paymentText, paymentFrom, isTemporary, paymentUntil, start, end }) {
  const paymentInCents = cents(paymentText);
  if (!paymentText.trim() || !Number.isSafeInteger(paymentInCents) || paymentInCents < 0) {
    return k_loanFormMessages.invalidPayment;
  }
  if (!isMonthKey(paymentFrom) || paymentFrom > end) {
    return k_loanFormMessages.invalidPaymentMonth;
  }
  if (paymentFrom < start) {
    return k_loanFormMessages.paymentBeforeStart;
  }
  const isValidUntil = isMonthKey(paymentUntil) && paymentUntil >= paymentFrom;
  if (isTemporary && !isValidUntil) {
    return k_loanFormMessages.invalidUntilMonth;
  }
  return '';
}

// The new monthly payment, the month it applies from and, optionally, the
// last month of a temporary payment (owner decisions P09 and P10).
function PaymentChangeFields({ change, onChange, onCancel }) {
  const colors = useContext(Theme);
  const update = fields => onChange({ ...change, ...fields });
  return <View style={{ marginBottom: 6 }}>
    <Field label="New monthly payment · EUR" value={change.amount} onChangeText={amount => update({ amount })} keyboardType="decimal-pad" />
    <Field label="New payment from · YYYY-MM" value={change.from} onChangeText={from => update({ from })} />
    <Toggle value={change.isTemporary} onChange={isTemporary => update({ isTemporary, until: change.from })} label="Until a chosen month" description="Off: the new payment lasts until it changes again." />
    {change.isTemporary && <Field label="Until · YYYY-MM" value={change.until} onChangeText={until => update({ until })} />}
    <T style={{ fontSize: 11, color: colors.sub, marginTop: -9, marginBottom: 12 }}>{change.isTemporary ? k_loanFormMessages.temporaryHint : k_loanFormMessages.lastingHint}</T>
    <Button small kind="outline" onPress={onCancel}>Keep the payment as it is</Button>
  </View>;
}

export function LoanForm({ item, onClose }) {
  const { setState, state, notify, today } = useApp();
  const colors = useContext(Theme);
  const currentMonth = monthOf(today);
  const [name, setName] = useState(item?.name || '');
  const [remaining, setRemaining] = useState(item ? amountText(item.remaining) : '');
  const [payment, setPayment] = useState('');
  // A removal edits the history as listed: its starting payment and changes,
  // folded at the start month shown.
  const [editedHistory, setEditedHistory] = useState(null);
  const [paymentChange, setPaymentChange] = useState(null);
  const [account, setAccount] = useState(item?.account || state.accounts[0]?.id || '');
  const [start, setStart] = useState(() => item?.start || currentMonth);
  const shownStart = isMonthKey(start) ? start : item?.start;
  const historyLoan = item ? withNormalizedPayments({ ...withNormalizedPayments(item), ...(editedHistory ?? {}), start: shownStart }) : null;
  const [end, setEnd] = useState(() => item?.end || defaultLoanEnd(currentMonth));
  const [credit, setCredit] = useState(false);
  const [error, setError] = useState('');

  function startPaymentChange() {
    setPaymentChange({ amount: '', from: currentMonth, isTemporary: false, until: currentMonth });
  }

  function removePaymentChange(entry) {
    const remaining = withoutLoanPaymentChange(historyLoan, entry);
    setEditedHistory({ payment: remaining.payment, paymentChanges: remaining.paymentChanges });
  }

  function newPaymentOf(change) {
    const newPayment = { since: change.from, amount: cents(change.amount) };
    return change.isTemporary ? { ...newPayment, until: change.until } : newPayment;
  }

  function save() {
    const remainingInCents = cents(remaining);
    const validAmounts = isPositiveCentAmount(remainingInCents) && (Boolean(item) || isPositiveCentAmount(cents(payment)));
    const validMonths = isMonthKey(start) && isMonthKey(end) && end >= start;
    if (!name.trim() || !validAmounts || !validMonths) {
      setError(k_loanFormMessages.invalid);
      return;
    }
    const paymentChangeError = paymentChange ? newPaymentProblem({ paymentText: paymentChange.amount, paymentFrom: paymentChange.from, isTemporary: paymentChange.isTemporary, paymentUntil: paymentChange.until, start, end }) : '';
    if (paymentChangeError) {
      setError(paymentChangeError);
      return;
    }

    const loanId = item?.id || createEntityId(k_entityIdPrefixes.loan);
    const loanFields = { name, remaining: remainingInCents, start, end, account };
    const formEdits = { loanFields, paymentHistory: editedHistory, newPayment: paymentChange ? newPaymentOf(paymentChange) : null };
    setState(currentState => {
      const loans = item
        ? currentState.loans.map(loan => loan.id === loanId ? withLoanFormEdits(loan, formEdits) : loan)
        : [...currentState.loans, { id: loanId, original: remainingInCents, ...loanFields, payment: cents(payment), paymentChanges: [] }];
      const transactions = [...currentState.transactions];
      if (credit) {
        transactions.push({
          id: `${loanId}-proceeds`, type: k_transactionTypes.reimbursement,
          title: `${name} · loan proceeds`, note: k_loanFormMessages.proceedsNote,
          amount: remainingInCents, account, date: `${start}-01`
        });
      }
      return { ...currentState, loans, transactions };
    });
    notify(k_loanFormMessages.saved);
    onClose();
  }

  const isDirty = useDirtyForm([name, remaining, payment, paymentChange, editedHistory, account, start, end, credit]);
  return <Dialog dirty={isDirty} title="A loan, accounted for" subtitle="Monthly repayments are expenses. Borrowed money is not earnings." onClose={onClose}>
    <Field label="Loan name" value={name} onChangeText={setName} placeholder="e.g. Car loan" />
    <Row style={{ gap: 12, flexWrap: 'wrap' }}>
      <Field label="Remaining balance · EUR" value={remaining} onChangeText={setRemaining} style={{ flex: 1, minWidth: 140 }} keyboardType="decimal-pad" />
      {!item && <Field label="Monthly payment · EUR" value={payment} onChangeText={setPayment} style={{ flex: 1, minWidth: 140 }} keyboardType="decimal-pad" />}
    </Row>
    {historyLoan && <View style={{ marginBottom: 17 }}>
      <T style={{ fontSize: 12, fontWeight: '600', color: colors.sub }}>Monthly payment this month · {euro(loanPaymentInMonth(historyLoan, currentMonth))}</T>
      {!paymentChange && <Button small kind="soft" icon="Pencil" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={startPaymentChange}>Change the monthly payment</Button>}
    </View>}
    {paymentChange && <PaymentChangeFields change={paymentChange} onChange={setPaymentChange} onCancel={() => setPaymentChange(null)} />}
    {historyLoan && <EditablePaymentHistory loan={historyLoan} onRemove={removePaymentChange} />}
    <Select label="Payment account" value={account} onChange={setAccount} options={state.accounts.map(candidate => ({ value: candidate.id, label: candidate.name }))} />
    <Row style={{ gap: 12, flexWrap: 'wrap' }}>
      <Field label="Start month · YYYY-MM" value={start} onChangeText={setStart} style={{ flex: 1, minWidth: 140 }} />
      <Field label="Last month · YYYY-MM" value={end} onChangeText={setEnd} style={{ flex: 1, minWidth: 140 }} />
    </Row>
    {!item && <Toggle value={credit} onChange={setCredit} label="Add loan proceeds to this account" description="Off by default. Leave off for an existing loan." />}
    <T style={{ fontSize: 11, color: colors.sub, marginVertical: 13 }}>Repayment entries are recorded separately. The plan forecasts your monthly payment without creating fake transactions.</T>
    {error && <T style={{ color: colors.negative, marginBottom: 12 }}>{error}</T>}
    <Button onPress={save}>{item ? 'Save loan' : 'Add loan'}</Button>
  </Dialog>;
}
