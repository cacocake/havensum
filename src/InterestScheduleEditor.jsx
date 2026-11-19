import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, T, H, Row, Button, Field } from './ui.jsx';
import { interestPeriodsForDisplay } from './interestSchedule.js';

function monthYearName(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function periodLabel(period) {
  const through = period.through ? `through ${monthYearName(period.through)}` : 'ongoing';
  return `${period.rate}% from ${monthYearName(period.since)}, ${through}`;
}

// Effective annual rates by period. Past periods keep their recorded interest
// and cannot be removed here; current and future periods can. An unscheduled
// legacy rate shows the earliest month it may start from (BUG-2, L08).
export default function InterestScheduleEditor({ schedule, unscheduledRate, legacyStartText = null, currentMonth, rate, onRateChange, since, onSinceChange, onAdd, onRemove }) {
  const colors = useContext(Theme);
  const periods = interestPeriodsForDisplay({ interestSchedule: schedule });
  return <View testID="interest-schedule" style={{ gap: 8, marginBottom: 12 }}>
    <H size={16}>Interest rates</H>
    {!periods.length && unscheduledRate !== undefined && <T style={{ fontSize: 12, color: colors.sub }}>Saved rate {unscheduledRate}% has no start month yet, so no interest has been recorded. Choose when it started.</T>}
    {!periods.length && unscheduledRate !== undefined && legacyStartText && <T testID="interest-schedule-earliest" style={{ fontSize: 12, color: colors.sub }}>{legacyStartText}</T>}
    {periods.map(period => <Row key={period.since} style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <T style={{ flex: 1, minWidth: 180, fontSize: 12 }}>{periodLabel(period)}</T>
      {period.since >= currentMonth && <Button small kind="soft" accessibilityLabel={`Remove the rate from ${monthYearName(period.since)}`} onPress={() => onRemove(period.since)}>Remove</Button>}
    </Row>)}
    <Row style={{ gap: 12, flexWrap: 'wrap' }}>
      <Field label="Effective annual interest · %" value={rate} onChangeText={onRateChange} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 140 }} />
      <Field label="Rate starts · YYYY-MM" value={since} onChangeText={onSinceChange} placeholder="e.g. 2026-03" style={{ flex: 1, minWidth: 140 }} />
    </Row>
    <Button small kind="outline" icon="Plus" onPress={onAdd}>Add rate period</Button>
    <T style={{ fontSize: 12, color: colors.sub }}>Interest compounds once per completed month. A rate runs until the next one starts; a 0% period ends a promotional rate. Recorded interest is never changed or duplicated. To correct a past rate, use Correct past interest on the account.</T>
  </View>;
}
