import React, { useContext, useState } from 'react';
import { useApp } from './context.js';
import { Theme, T, Row, Button, Field, Select, Toggle, Dialog } from './ui.jsx';
import { EditablePaymentHistory } from './LoanPaymentHistory.jsx';
import { useDirtyForm } from './useDirtyForm.js';
import { cents, isPositiveCentAmount, k_centsPerEuro } from './money.js';
import { k_transactionTypes, k_entityIdPrefixes } from './domainConstants.js';
import { createEntityId } from './identifiers';
import { monthNumberOf, monthKeyOf, monthOf, yearOfMonth } from './calendar.js';
import { loanPaymentInMonth, withLoanPaymentFrom } from './loanPaymentHistory.js';

const k_loanMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const k_defaultLoanYears = 3;
const k_loanFormMessages = {
  invalid: 'Enter a name, positive amounts and a valid month range (YYYY-MM).',
  invalidPaymentMonth: 'Choose the month the new payment applies from (YYYY-MM), up to the loan\'s last month.',
  saved: 'Loan saved · revise the remaining Year Plan to include it',
  proceedsNote: 'Loan balance adjustment; excluded from income.',
  paymentFromHint: 'Every payment from this month on uses the new amount. Later changes are replaced; earlier months stay as they were.'
};

// A new loan defaults to ending in the same local month, three years on.
function defaultLoanEnd(startMonth) {
  return monthKeyOf(yearOfMonth(startMonth) + k_defaultLoanYears, monthNumberOf(startMonth));
}

function amountText(amountInCents) {
  return String(amountInCents / k_centsPerEuro);
}

export function LoanForm({ item, onClose }) {
  const { setState, state, notify, today } = useApp();
  const colors = useContext(Theme);
  const currentMonth = monthOf(today);
  const [name, setName] = useState(item?.name || '');
  const [remaining, setRemaining] = useState(item ? amountText(item.remaining) : '');
  const [paymentChanges, setPaymentChanges] = useState(item?.paymentChanges ?? []);
  const historyLoan = item ? { ...item, paymentChanges } : null;
  const paymentThisMonth = historyLoan ? loanPaymentInMonth(historyLoan, currentMonth) : null;
  // Untouched, the payment follows the history; typing makes it a new payment.
  const [typedPayment, setTypedPayment] = useState(null);
  const payment = typedPayment ?? (historyLoan ? amountText(paymentThisMonth) : '');
  const [paymentFrom, setPaymentFrom] = useState(currentMonth);
  const [account, setAccount] = useState(item?.account || state.accounts[0]?.id || '');
  const [start, setStart] = useState(() => item?.start || currentMonth);
  const [end, setEnd] = useState(() => item?.end || defaultLoanEnd(currentMonth));
  const [credit, setCredit] = useState(false);
  const [error, setError] = useState('');
  const isNewPayment = Boolean(item) && typedPayment !== null && cents(typedPayment) !== paymentThisMonth;

  function removePaymentChange(since) {
    setPaymentChanges(changes => changes.filter(change => change.since !== since));
  }

  function editedLoan(loanFields, paymentInCents) {
    const loan = { ...item, ...loanFields, paymentChanges };
    if (!isNewPayment) {
      return loan;
    }
    return withLoanPaymentFrom(loan, { since: paymentFrom, amount: paymentInCents });
  }

  function save() {
    const remainingInCents = cents(remaining);
    const paymentInCents = cents(payment);
    const validAmounts = isPositiveCentAmount(remainingInCents) && isPositiveCentAmount(paymentInCents);
    const validMonths = k_loanMonthPattern.test(start) && k_loanMonthPattern.test(end) && end >= start;
    if (!name.trim() || !validAmounts || !validMonths) {
      setError(k_loanFormMessages.invalid);
      return;
    }
    if (isNewPayment && !(k_loanMonthPattern.test(paymentFrom) && paymentFrom <= end)) {
      setError(k_loanFormMessages.invalidPaymentMonth);
      return;
    }

    const loanId = item?.id || createEntityId(k_entityIdPrefixes.loan);
    const loanFields = { name, remaining: remainingInCents, start, end, account };
    setState(currentState => {
      const loans = item
        ? currentState.loans.map(loan => loan.id === loanId ? editedLoan(loanFields, paymentInCents) : loan)
        : [...currentState.loans, { id: loanId, original: remainingInCents, ...loanFields, payment: paymentInCents, paymentChanges: [] }];
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

  const isDirty = useDirtyForm([name, remaining, typedPayment, paymentFrom, paymentChanges, account, start, end, credit]);
  return <Dialog dirty={isDirty} title="A loan, accounted for" subtitle="Monthly repayments are expenses. Borrowed money is not earnings." onClose={onClose}>
    <Field label="Loan name" value={name} onChangeText={setName} placeholder="e.g. Car loan" />
    <Row style={{ gap: 12, flexWrap: 'wrap' }}>
      <Field label="Remaining balance · EUR" value={remaining} onChangeText={setRemaining} style={{ flex: 1, minWidth: 140 }} keyboardType="decimal-pad" />
      <Field label="Monthly payment · EUR" value={payment} onChangeText={setTypedPayment} style={{ flex: 1, minWidth: 140 }} keyboardType="decimal-pad" />
    </Row>
    {isNewPayment && <>
      <Field label="New payment from · YYYY-MM" value={paymentFrom} onChangeText={setPaymentFrom} />
      <T style={{ fontSize: 11, color: colors.sub, marginTop: -9, marginBottom: 17 }}>{k_loanFormMessages.paymentFromHint}</T>
    </>}
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
