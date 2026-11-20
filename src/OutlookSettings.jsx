import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Card, Button, Dialog, Field, Select, Toggle } from './ui.jsx';
import { isMonthKey, previousMonths, currentLocalMonth, yearOfMonth } from './calendar.js';
import { loanPaymentInMonth } from './loanPaymentHistory.js';
import { latestPlan } from './planArchive.js';
import { cents } from './money.js';
import { validateOutlookState } from './outlookInputs.js';
import { useDirtyForm } from './useDirtyForm.js';

const k_centsPerEuro = 100;
const k_historyControlMonths = 12;
const dateName = month => new Date(`${month}-01T12:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' });

function mergeDatedChanges(existingChanges = [], legacyChanges = []) {
  const changes = new Map();
  for (const change of [...legacyChanges, ...existingChanges]) {
    changes.set(JSON.stringify([change.loanId ?? null, change.since]), change);
  }
  return [...changes.values()];
}

export default function OutlookSettings({ month }) {
  const [open, setOpen] = useState(false);
  return <Card>
    <H size={22}>Prediction assumptions</H>
    <T style={{ marginTop: 8, marginBottom: 16 }}>Confirm complete months and register known income or repayment changes independently of your frozen target.</T>
    <Button kind="outline" onPress={() => setOpen(true)}>Edit prediction assumptions</Button>
    {open && <OutlookSettingsDialog month={month} onClose={() => setOpen(false)} />}
  </Card>;
}

function OutlookSettingsDialog({ month, onClose }) {
  const { state, setState } = useApp();
  const colors = useContext(Theme);
  const [completeMonths, setCompleteMonths] = useState(state.outlook?.completeMonths || []);
  const [historyWindow, setHistoryWindow] = useState(String(state.outlook?.window || 6));
  const [since, setSince] = useState(month);
  const [incomeDrafts, setIncomeDrafts] = useState({});
  const [loanDrafts, setLoanDrafts] = useState({});
  const [adoptScheduledChanges, setAdoptScheduledChanges] = useState(false);
  const [error, setError] = useState('');
  const dirty = useDirtyForm([completeMonths, historyWindow, incomeDrafts, loanDrafts, adoptScheduledChanges]);
  const currentMonth = currentLocalMonth();
  const approvedPlan = latestPlan(state, yearOfMonth(month));
  const history = previousMonths(currentMonth, k_historyControlMonths);
  const savedIncome = state.outlook?.incomeChanges?.find(change => change.since === since);
  const income = incomeDrafts[since] ?? (savedIncome ? String(savedIncome.amount / k_centsPerEuro) : '');

  function loanAmount(loanId) {
    const savedLoan = state.outlook?.loanChanges?.find(change => change.since === since && change.loanId === loanId);
    return loanDrafts[since]?.[loanId] ?? (savedLoan ? String(savedLoan.amount / k_centsPerEuro) : '');
  }

  function save() {
    try {
      const outlook = { ...state.outlook, completeMonths, window: Number(historyWindow) };
      const incomeChanges = mergeDatedChanges(state.outlook?.incomeChanges, adoptScheduledChanges ? approvedPlan?.incomeChanges : []);
      // Loan payments already follow each loan's history (P12), so only income is copied.
      const loanChanges = state.outlook?.loanChanges ?? [];
      outlook.incomeChanges = incomeChanges.filter(change => !Object.hasOwn(incomeDrafts, change.since));
      for (const [changeMonth, amount] of Object.entries(incomeDrafts)) {
        if (amount.trim()) {
          outlook.incomeChanges.push({ since: changeMonth, amount: cents(amount) });
        }
      }
      outlook.loanChanges = loanChanges.filter(change => !Object.hasOwn(loanDrafts[change.since] ?? {}, change.loanId));
      for (const [changeMonth, amounts] of Object.entries(loanDrafts)) {
        for (const loan of state.loans) {
          const amount = amounts[loan.id];
          if (amount?.trim()) {
            outlook.loanChanges.push({ loanId: loan.id, since: changeMonth, amount: cents(amount) });
          }
        }
      }
      validateOutlookState({ outlook });
      setState(current => ({ ...current, outlook }));
      onClose();
    } catch (failure) {
      setError(failure.message);
    }
  }

  return <Dialog title="Prediction assumptions" dirty={dirty} onClose={onClose}>
    <Select label="Prediction history window" value={historyWindow} onChange={setHistoryWindow} options={['3', '6', '12'].map(value => ({ value, label: `${value} months` }))} />
    <H size={20}>Confirm your history</H>
    <T style={{ color: colors.sub, marginTop: 8, marginBottom: 12 }}>Mark a month complete only after entering all income and expenses. Confirmed months include zero-spending months. Otherwise the prediction is labelled partial.</T>
    {history.map(historyMonth => <Toggle key={historyMonth} label={`${dateName(historyMonth)} complete`} value={completeMonths.includes(historyMonth)} onChange={checked => setCompleteMonths(months => checked ? [...months, historyMonth] : months.filter(value => value !== historyMonth))} />)}
    <H size={20} style={{ marginTop: 18, marginBottom: 12 }}>Known changes</H>
    <Field label="Changes from · YYYY-MM" value={since} onChangeText={setSince} />
    <Field label="Known monthly income · EUR" value={income} onChangeText={amount => setIncomeDrafts(drafts => ({ ...drafts, [since]: amount }))} keyboardType="decimal-pad" placeholder="Use historical average" />
    <T style={{ color: colors.sub, marginBottom: 16 }}>This is the new total monthly income from that month. Registered income sets a floor. A blank removes the income change at the chosen month.</T>
    {state.loans.map(loan => <Field key={loan.id} label={`${loan.name} · expected monthly payment · EUR`} value={loanAmount(loan.id)} onChangeText={amount => setLoanDrafts(drafts => ({ ...drafts, [since]: { ...drafts[since], [loan.id]: amount } }))} keyboardType="decimal-pad" placeholder={`${loanPaymentInMonth(loan, isMonthKey(since) ? since : currentMonth) / k_centsPerEuro}`} />)}
    {Boolean(approvedPlan?.incomeChanges?.length) && <Toggle label="Copy existing scheduled changes" value={adoptScheduledChanges} onChange={setAdoptScheduledChanges} description="Fill missing dated income changes from the plan. Loan payments follow each loan's payment history. Target amounts and overrides are never copied." />}
    {error && <T accessibilityRole="alert" style={{ color: colors.negative, marginBottom: 12 }}>{error}</T>}
    <Button onPress={save}>Save prediction assumptions</Button>
  </Dialog>;
}
