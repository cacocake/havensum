import React, { useContext, useState } from 'react';
import { useApp } from './context.js';
import { Theme, T, Row, Button, Field, Select, Toggle, Dialog } from './ui.jsx';
import { EditablePaymentHistory } from './LoanPaymentHistory.jsx';
import { useDirtyForm } from './useDirtyForm.js';
import { cents, isPositiveCentAmount, k_centsPerEuro } from './money.js';
import { k_transactionTypes, k_entityIdPrefixes } from './domainConstants.js';
import { createEntityId } from './identifiers';
import { isMonthKey, monthNumberOf, monthKeyOf, monthOf, yearOfMonth } from './calendar.js';
import { loanPaymentInMonth, withLoanPaymentFrom, withNormalizedPayments } from './loanPaymentHistory.js';

const k_defaultLoanYears = 3;
const k_loanFormMessages = {
  invalid: 'Enter a name, positive amounts and a valid month range (YYYY-MM).',
  invalidPayment: 'Use a payment of zero or more, with at most two decimal places.',
  invalidPaymentMonth: 'Choose the month the new payment applies from (YYYY-MM), up to the loan\'s last month.',
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

function newPaymentProblem({ paymentText, paymentFrom, isTemporary, paymentUntil, end }) {
  const paymentInCents = cents(paymentText);
  if (!paymentText.trim() || !Number.isSafeInteger(paymentInCents) || paymentInCents < 0) {
    return k_loanFormMessages.invalidPayment;
  }
  if (!isMonthKey(paymentFrom) || paymentFrom > end) {
    return k_loanFormMessages.invalidPaymentMonth;
  }
  if (isTemporary && !(isMonthKey(paymentUntil) && paymentUntil >= paymentFrom)) {
    return k_loanFormMessages.invalidUntilMonth;
  }
  return '';
}

export function LoanForm({ item, onClose }) {
  const { setState, state, notify, today } = useApp();
  const colors = useContext(Theme);
  const currentMonth = monthOf(today);
  const [name, setName] = useState(item?.name || '');
  const [remaining, setRemaining] = useState(item ? amountText(item.remaining) : '');
  const [paymentChanges, setPaymentChanges] = useState(item?.paymentChanges ?? []);
  const isHistoryEdited = paymentChanges !== (item?.paymentChanges ?? []);
  const historyLoan = item ? { ...item, paymentChanges } : null;
  const paymentThisMonth = historyLoan ? loanPaymentInMonth(historyLoan, currentMonth) : null;
  // Untouched, the payment follows the history; typing makes it a new payment.
  const [typedPayment, setTypedPayment] = useState(null);
  const payment = typedPayment ?? (historyLoan ? amountText(paymentThisMonth) : '');
  const [paymentFrom, setPaymentFrom] = useState(currentMonth);
  const [isTemporary, setIsTemporary] = useState(false);
  const [paymentUntil, setPaymentUntil] = useState(currentMonth);
  const [account, setAccount] = useState(item?.account || state.accounts[0]?.id || '');
  const [start, setStart] = useState(() => item?.start || currentMonth);
  const [end, setEnd] = useState(() => item?.end || defaultLoanEnd(currentMonth));
  const [credit, setCredit] = useState(false);
  const [error, setError] = useState('');
  const isNewPayment = Boolean(item) && typedPayment !== null && cents(typedPayment) !== paymentThisMonth;

  function removePaymentChange(since) {
    setPaymentChanges(changes => changes.filter(change => change.since !== since));
  }

  function choosePaymentDuration(temporary) {
    setIsTemporary(temporary);
    setPaymentUntil(paymentFrom);
  }

  // Applies the form to the loan as saved now, so a change synced while the
  // form was open survives unless this form changed the same history.
  function editedLoan(currentLoan, loanFields) {
    const loan = { ...currentLoan, ...loanFields, paymentChanges: isHistoryEdited ? paymentChanges : currentLoan.paymentChanges };
    if (!isNewPayment) {
      return withNormalizedPayments(loan);
    }
    const newPayment = { since: paymentFrom, amount: cents(payment), ...(isTemporary ? { until: paymentUntil } : {}) };
    return withNormalizedPayments(withLoanPaymentFrom(loan, newPayment));
  }

  function save() {
    const remainingInCents = cents(remaining);
    const validAmounts = isPositiveCentAmount(remainingInCents) && (Boolean(item) || isPositiveCentAmount(cents(payment)));
    const validMonths = isMonthKey(start) && isMonthKey(end) && end >= start;
    if (!name.trim() || !validAmounts || !validMonths) {
      setError(k_loanFormMessages.invalid);
      return;
    }
    const newPaymentError = isNewPayment ? newPaymentProblem({ paymentText: payment, paymentFrom, isTemporary, paymentUntil, end }) : '';
    if (newPaymentError) {
      setError(newPaymentError);
      return;
    }

    const loanId = item?.id || createEntityId(k_entityIdPrefixes.loan);
    const loanFields = { name, remaining: remainingInCents, start, end, account };
    setState(currentState => {
      const loans = item
        ? currentState.loans.map(loan => loan.id === loanId ? editedLoan(loan, loanFields) : loan)
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

  const isDirty = useDirtyForm([name, remaining, typedPayment, paymentFrom, isTemporary, paymentUntil, paymentChanges, account, start, end, credit]);
  return <Dialog dirty={isDirty} title="A loan, accounted for" subtitle="Monthly repayments are expenses. Borrowed money is not earnings." onClose={onClose}>
    <Field label="Loan name" value={name} onChangeText={setName} placeholder="e.g. Car loan" />
    <Row style={{ gap: 12, flexWrap: 'wrap' }}>
      <Field label="Remaining balance · EUR" value={remaining} onChangeText={setRemaining} style={{ flex: 1, minWidth: 140 }} keyboardType="decimal-pad" />
      <Field label="Monthly payment · EUR" value={payment} onChangeText={setTypedPayment} style={{ flex: 1, minWidth: 140 }} keyboardType="decimal-pad" />
    </Row>
    {isNewPayment && <>
      <Field label="New payment from · YYYY-MM" value={paymentFrom} onChangeText={setPaymentFrom} />
      <Toggle value={isTemporary} onChange={choosePaymentDuration} label="Until a chosen month" description="Off: the new payment lasts until it changes again." />
      {isTemporary && <Field label="Until · YYYY-MM" value={paymentUntil} onChangeText={setPaymentUntil} />}
      <T style={{ fontSize: 11, color: colors.sub, marginTop: -9, marginBottom: 17 }}>{isTemporary ? k_loanFormMessages.temporaryHint : k_loanFormMessages.lastingHint}</T>
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
