import React, { useContext, useMemo } from 'react';
import { View } from 'react-native';
import { Theme, T, H, Row, Button } from './ui.jsx';
import { euro, signedEuro } from './money.js';
import { expectedSavings } from './expectedSavings.js';
import { interestProjection } from './expectedInterest.js';
import { localCalendarDate, monthKeyOf } from './calendar.js';
import { k_monthsPerYear } from './domainConstants.js';

const k_monthNameOptions = { month: 'short' };

function monthName(month) {
  return monthDate(month).toLocaleString('en', k_monthNameOptions);
}

// Draft targets beside the independent forecast. Draft events are new evidence
// for the forecast; draft target amounts never feed it.
export default function PlanDraftPreview({ plan, state, year, fromMonth }) {
  const colors = useContext(Theme);
  const months = Array.from({ length: k_monthsPerYear - fromMonth + 1 }, (_, offset) => monthKeyOf(year, fromMonth + offset));
  // The forecast only depends on the ledger and draft events, not draft targets.
  const forecasts = useMemo(() => {
    const today = localCalendarDate();
    const projectedInterest = interestProjection(state, monthKeyOf(year, k_monthsPerYear));
    return Object.fromEntries(months.map(month => [month, expectedSavings(state, month, today, { projectedInterest })]));
  }, [state.transactions, state.events, state.outlook, state.loans, state.accounts, year, fromMonth]);
  return <View testID="plan-draft-preview" style={{ marginTop: 6, marginBottom: 12 }}>
    <H size={16} style={{ marginBottom: 8 }}>Month by month</H>
    <Row style={{ gap: 8, paddingVertical: 4 }}>
      <T style={{ flex: 1, fontSize: 10, color: colors.muted }}>Month</T>
      <T style={{ flex: 2, fontSize: 10, color: colors.muted, textAlign: 'right' }}>Planned</T>
      <T style={{ flex: 2, fontSize: 10, color: colors.muted, textAlign: 'right' }}>Expected</T>
    </Row>
    {months.map(month => {
      const planned = signedEuro(plan.months[month].balance);
      const expected = forecasts[month] ? signedEuro(forecasts[month].balance) : 'Not enough history';
      return <Row key={month} accessible accessibilityLabel={`${monthName(month)}: planned ${planned}, expected ${expected}`} style={{ gap: 8, paddingVertical: 4, borderTopWidth: 1, borderColor: colors.line }}>
        <T style={{ flex: 1, fontSize: 12 }}>{monthName(month)}</T>
        <T testID={`draft-planned-${month}`} style={{ flex: 2, fontSize: 12, textAlign: 'right' }}>{planned}</T>
        <T testID={`draft-expected-${month}`} style={{ flex: 2, fontSize: 12, textAlign: 'right', color: colors.sub }}>{expected}</T>
      </Row>;
    })}
  </View>;
}

export function EarlierOverride({ override, value, onKeep, onDrop }) {
  const colors = useContext(Theme);
  if (!override) {
    return null;
  }
  const isKept = value !== undefined && value !== '';
  return <Row style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
    <T style={{ fontSize: 10, color: colors.sub }}>Earlier override {euro(override.amount)}</T>
    {isKept
      ? <Button small kind="soft" onPress={onDrop} accessibilityLabel={`Drop earlier override for ${override.name}`}>Drop</Button>
      : <Button small kind="soft" onPress={() => onKeep(override.amount)} accessibilityLabel={`Keep earlier override for ${override.name}`}>Keep</Button>}
  </Row>;
}

export function CarriedAssumptionNotes({ carried, loans, lineIds }) {
  const colors = useContext(Theme);
  const staleOverrides = carried.overrides.filter(override => override.stale);
  const unmatchedOverrides = carried.overrides.filter(override => !override.stale && !lineIds.includes(override.lineId));
  if (!carried.source && !staleOverrides.length) {
    return null;
  }
  const loanName = loanId => loans.find(loan => loan.id === loanId)?.name ?? 'a removed loan';
  return <View testID="carried-assumption-notes" style={{ marginBottom: 10, gap: 4 }}>
    {carried.source && <T style={{ fontSize: 12, color: colors.sub }}>Assumptions start from your {carried.source.year} plan, revision {carried.source.revision}.</T>}
    {staleOverrides.map(override => <T key={override.lineId} style={{ fontSize: 12, color: colors.sub }}>Not applied: {override.name} override {euro(override.amount)}, its category no longer exists.</T>)}
    {unmatchedOverrides.map(override => <T key={override.lineId} style={{ fontSize: 12, color: colors.sub }}>Not applied: {override.name} override {euro(override.amount)}, that plan line no longer exists.</T>)}
    {carried.staleLoanChanges.map(change => <T key={`${change.loanId}-${change.since}`} style={{ fontSize: 12, color: colors.sub }}>Not applied: {loanName(change.loanId)} payment change from {change.since}, the loan has ended or was removed.</T>)}
    {carried.replacedLoanChanges.map(change => <T key={`replaced-${change.loanId}-${change.since}`} style={{ fontSize: 12, color: colors.sub }}>Not applied: {loanName(change.loanId)} change to {euro(change.amount)} from {change.since}, the loan's payment was edited since.</T>)}
  </View>;
}

function monthDate(month) {
  return new Date(`${month}-01T12:00:00`);
}

function monthYearName(month) {
  return monthDate(month).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function monthLongName(month) {
  return monthDate(month).toLocaleString('en', { month: 'long' });
}

// Loan payments in effect when the period starts, and carried later changes
// in their months. Removing a carried change only affects this draft.
export function CarriedChanges({ loans, startMonth, incomeChanges, loanChanges, onRemoveIncomeChange, onRemoveLoanChange }) {
  const colors = useContext(Theme);
  const activeLoans = loans.filter(loan => loan.end >= startMonth);
  const laterLoanChanges = loanChanges.filter(change => change.since > startMonth);
  const loanName = loanId => loans.find(loan => loan.id === loanId)?.name ?? 'Loan';
  return <View testID="carried-changes" style={{ gap: 6 }}>
    {activeLoans.map(loan => {
      const restated = loanChanges.find(change => change.loanId === loan.id && change.since === startMonth);
      const firstMonth = loan.start > startMonth ? loan.start : startMonth;
      const firstMonthName = firstMonth.slice(0, 4) === startMonth.slice(0, 4) ? monthLongName(firstMonth) : monthYearName(firstMonth);
      return <T key={loan.id} style={{ fontSize: 12 }}>{loan.name} · {euro(restated?.amount ?? loan.payment)}/month from {firstMonthName}</T>;
    })}
    {[...incomeChanges.map(change => ({ change, kind: 'income' })), ...laterLoanChanges.map(change => ({ change, kind: 'loan' }))].map(({ change, kind }) => {
      const label = kind === 'income' ? 'Income' : loanName(change.loanId);
      const when = monthYearName(change.since);
      return <Row key={`${kind}-${change.loanId ?? ''}-${change.since}`} style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <T style={{ flex: 1, minWidth: 160, fontSize: 12, color: colors.sub }}>{label} {euro(change.amount)}/month from {when}</T>
        <Button small kind="soft" accessibilityLabel={`Remove carried ${kind === 'income' ? 'income' : label} change from ${when}`} onPress={() => kind === 'income' ? onRemoveIncomeChange(change) : onRemoveLoanChange(change)}>Remove</Button>
      </Row>;
    })}
  </View>;
}
