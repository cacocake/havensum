import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, T, H, Row, Button } from './ui.jsx';
import { euro } from './money.js';
import { expectedSavings } from './expectedSavings.js';
import { localCalendarDate, monthKeyOf } from './calendar.js';
import { k_monthsPerYear } from './domainConstants.js';

const k_monthNameOptions = { month: 'short' };

function signedEuro(amount) {
  return `${amount >= 0 ? '+' : '−'}${euro(Math.abs(amount))}`;
}

function monthName(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleString('en', k_monthNameOptions);
}

// Draft targets beside the independent forecast. Draft events are new evidence
// for the forecast; draft target amounts never feed it.
export default function PlanDraftPreview({ plan, state, year, fromMonth }) {
  const colors = useContext(Theme);
  const today = localCalendarDate();
  const months = Array.from({ length: k_monthsPerYear - fromMonth + 1 }, (_, offset) => monthKeyOf(year, fromMonth + offset));
  return <View testID="plan-draft-preview" style={{ marginTop: 6, marginBottom: 12 }}>
    <H size={16} style={{ marginBottom: 8 }}>Month by month</H>
    <Row style={{ gap: 8, paddingVertical: 4 }}>
      <T style={{ flex: 1, fontSize: 10, color: colors.muted }}>Month</T>
      <T style={{ flex: 2, fontSize: 10, color: colors.muted, textAlign: 'right' }}>Planned</T>
      <T style={{ flex: 2, fontSize: 10, color: colors.muted, textAlign: 'right' }}>Expected</T>
    </Row>
    {months.map(month => {
      const forecast = expectedSavings(state, month, today);
      return <Row key={month} accessibilityLabel={`${month} draft preview`} style={{ gap: 8, paddingVertical: 4, borderTopWidth: 1, borderColor: colors.line }}>
        <T style={{ flex: 1, fontSize: 12 }}>{monthName(month)}</T>
        <T style={{ flex: 2, fontSize: 12, textAlign: 'right' }}>{signedEuro(plan.months[month].balance)}</T>
        <T style={{ flex: 2, fontSize: 12, textAlign: 'right', color: colors.sub }}>{forecast ? signedEuro(forecast.balance) : 'Not enough history'}</T>
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

export function CarriedAssumptionNotes({ carried, loans }) {
  const colors = useContext(Theme);
  const staleOverrides = carried.overrides.filter(override => override.stale);
  if (!carried.source && !staleOverrides.length) {
    return null;
  }
  const loanName = loanId => loans.find(loan => loan.id === loanId)?.name ?? 'a removed loan';
  return <View testID="carried-assumption-notes" style={{ marginBottom: 10, gap: 4 }}>
    {carried.source && <T style={{ fontSize: 12, color: colors.sub }}>Assumptions start from your {carried.source.year} plan, revision {carried.source.revision}.</T>}
    {staleOverrides.map(override => <T key={override.lineId} style={{ fontSize: 12, color: colors.sub }}>Not applied: {override.name} override {euro(override.amount)}, its category no longer exists.</T>)}
    {carried.staleLoanChanges.map(change => <T key={`${change.loanId}-${change.since}`} style={{ fontSize: 12, color: colors.sub }}>Not applied: {loanName(change.loanId)} payment change from {change.since}, the loan has ended or was removed.</T>)}
  </View>;
}
