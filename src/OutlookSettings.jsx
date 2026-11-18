import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Card, Button, Dialog, Field, Select, Toggle } from './ui.jsx';
import { previousMonths, monthOf } from './calendar.js';
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
  const [income, setIncome] = useState(() => {
    const change = state.outlook?.incomeChanges?.find(change => change.since === month);
    return change ? String(change.amount / k_centsPerEuro) : '';
  });
  const [loanAmounts, setLoanAmounts] = useState(() => Object.fromEntries((state.outlook?.loanChanges || []).filter(change => change.since === month).map(change => [change.loanId, String(change.amount / k_centsPerEuro)])));
  const [adoptScheduledChanges, setAdoptScheduledChanges] = useState(false);
  const [error, setError] = useState('');
  const dirty = useDirtyForm([completeMonths, historyWindow, since, income, loanAmounts, adoptScheduledChanges]);
  const currentMonth = monthOf(new Date().toISOString());
  const history = previousMonths(currentMonth, k_historyControlMonths);

  function save() {
    try {
      const outlook = { ...state.outlook, completeMonths, window: Number(historyWindow) };
      const incomeChanges = mergeDatedChanges(state.outlook?.incomeChanges, adoptScheduledChanges ? state.plan?.incomeChanges : []);
      const loanChanges = mergeDatedChanges(state.outlook?.loanChanges, adoptScheduledChanges ? state.plan?.loanChanges : []);
      const editIncome = income.trim() || state.outlook?.incomeChanges?.some(change => change.since === since);
      outlook.incomeChanges = incomeChanges.filter(change => !editIncome || change.since !== since);
      if (income.trim()) {
        outlook.incomeChanges.push({ since, amount: cents(income) });
      }
      outlook.loanChanges = loanChanges.filter(change => change.since !== since || !Object.hasOwn(loanAmounts, change.loanId));
      for (const loan of state.loans) {
        const amount = loanAmounts[loan.id];
        if (amount?.trim()) {
          outlook.loanChanges.push({ loanId: loan.id, since, amount: cents(amount) });
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
    <Field label="Known monthly income · EUR" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="Use historical average" />
    <T style={{ color: colors.sub, marginBottom: 16 }}>This is the new total monthly income from that month. Registered income sets a floor. A blank removes the income change at the chosen month.</T>
    {state.loans.map(loan => <Field key={loan.id} label={`${loan.name} · expected monthly payment · EUR`} value={loanAmounts[loan.id] || ''} onChangeText={amount => setLoanAmounts(values => ({ ...values, [loan.id]: amount }))} keyboardType="decimal-pad" placeholder={`${loan.payment / k_centsPerEuro}`} />)}
    {Boolean(state.plan?.incomeChanges?.length || state.plan?.loanChanges?.length) && <Toggle label="Copy existing scheduled changes" value={adoptScheduledChanges} onChange={setAdoptScheduledChanges} description="Fill missing dated income and loan changes from the plan. Existing prediction inputs take priority. Target amounts and overrides are never copied." />}
    {error && <T accessibilityRole="alert" style={{ color: colors.negative, marginBottom: 12 }}>{error}</T>}
    <Button onPress={save}>Save prediction assumptions</Button>
  </Dialog>;
}
