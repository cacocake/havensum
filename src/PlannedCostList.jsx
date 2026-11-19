import React, { useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Button, Card, H, Row, T, Theme } from './ui.jsx';
import { euro } from './money.js';
import { monthNumberName } from './monthLabels.js';
import { plannedCostAmount, plannedCostRepeatText, plannedCostsInYear } from './plannedCosts.js';
import MovePlannedCostDialog from './MovePlannedCostDialog.jsx';

function recurrenceText(event, month, year) {
  if (event.year) {
    return `${monthNumberName(month)} ${year} only`;
  }
  const repeatText = plannedCostRepeatText(event);
  if (month !== event.month) {
    return `${monthNumberName(month)} · ${repeatText} · moved from ${monthNumberName(event.month)}`;
  }
  return `${monthNumberName(month)} · ${repeatText}`;
}

// The year's planned costs. A recurring one can move from this year or a
// later one (owner decisions F16/F17); one-off costs stay in their month.
export default function PlannedCostList({ year }) {
  const { state } = useApp();
  const colors = useContext(Theme);
  const [movingEventId, setMovingEventId] = useState(null);
  const costs = plannedCostsInYear(state.events ?? [], year);
  // Only a recurring cost can move; a merge or restore may change it while the dialog is open.
  const movingEvent = (state.events ?? []).find(event => event.id === movingEventId && !event.year);
  // Forget a cost that can no longer move, so the dialog never reopens by itself later.
  useEffect(() => {
    if (movingEventId !== null && !movingEvent) {
      setMovingEventId(null);
    }
  }, [movingEventId, movingEvent]);
  if (!costs.length) {
    return null;
  }
  return <Card testID="planned-costs" style={{ padding: 19 }}>
    <H size={22}>Planned costs</H>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 8, marginBottom: 8 }}>In {year}. Moving a recurring cost changes its month from the year you choose. Earlier years and frozen plans stay as they were.</T>
    {costs.map(({ event, month }) => <Row key={event.id} testID={`planned-cost-${event.id}`} style={{ gap: 10, flexWrap: 'wrap', paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line }}>
      <View style={{ flex: 1, minWidth: 150 }}>
        <T>{event.name}</T>
        <T style={{ fontSize: 12, color: colors.sub }}>{recurrenceText(event, month, year)} · {euro(plannedCostAmount(event, year))}</T>
      </View>
      {!event.year && <Button small kind="outline" icon="CalendarRange" accessibilityLabel={`Move ${event.name}`} onPress={() => setMovingEventId(event.id)}>Move…</Button>}
    </Row>)}
    {movingEvent && <MovePlannedCostDialog event={movingEvent} viewedYear={year} onClose={() => setMovingEventId(null)}/>}
  </Card>;
}
