import React, { useContext, useMemo } from 'react';
import { View } from 'react-native';
import { Button, Row, Select, T, Theme } from './ui.jsx';
import { plannedCostAmount, plannedCostRepeatText, plannedCostsInYear } from './plannedCosts.js';
import { euro, k_centsPerEuro } from './money.js';
import { comparableCostEstimate, comparableLikeChoices, comparableOccurrences, k_minimumComparableOccurrences } from './comparableCosts.js';
import { shortMonthLabel } from './monthLabels.js';

const k_noLikeChoice = '';

export function parseLikeChoice(value) {
  return value === k_noLikeChoice ? undefined : JSON.parse(value);
}

// A suggestion from comparable completed planned costs. It never changes an
// amount by itself: the owner chooses to use it.
function SuggestionCard({ estimate, useLabel, onUse }) {
  const colors = useContext(Theme);
  if (!estimate.hasEnoughEvidence) {
    return <T testID="planned-cost-suggestion" style={{ fontSize: 11, color: colors.sub, marginBottom: 8 }}>
      Not enough similar past costs yet ({estimate.comparable.length} of {k_minimumComparableOccurrences}). Enter the amount you expect.
    </T>;
  }
  return <View testID="planned-cost-suggestion" style={{ backgroundColor: colors.soft, padding: 12, borderRadius: 12, marginBottom: 10, gap: 4 }}>
    <T style={{ fontSize: 12, color: colors.text }}>
      Similar past costs suggest {euro(estimate.estimate)} (between {euro(estimate.low)} and {euro(estimate.high)}).
    </T>
    {estimate.comparable.map(occurrence => <T key={`${occurrence.eventId}-${occurrence.month}`} style={{ fontSize: 10, color: colors.muted }}>
      {occurrence.name} · {shortMonthLabel(occurrence.month)} · {euro(occurrence.actual)}
    </T>)}
    <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
      <Button small kind="soft" icon="Sparkles" onPress={() => onUse(estimate.estimate)}>{useLabel}</Button>
    </View>
  </View>;
}

// For a planned cost being added: the owner says what it is like, then may use the suggestion.
export function NewPlannedCostSuggestion({ state, evaluationDate, candidate, likeValue, onLikeChange, onUseAmount }) {
  const choices = useMemo(() => comparableLikeChoices(state, evaluationDate), [state, evaluationDate]);
  // Only the candidate's identity and timing affect which costs compare, so typing its name does not recompute.
  const estimate = useMemo(() => {
    const like = parseLikeChoice(likeValue);
    if (!like) {
      return null;
    }
    return comparableCostEstimate(comparableOccurrences(state, candidate, evaluationDate, like));
  }, [state, evaluationDate, candidate.id, candidate.year, candidate.fromYear, likeValue]);
  const options = [
    { value: k_noLikeChoice, label: 'No comparison' },
    ...choices.plannedCosts.map(choice => ({ value: JSON.stringify(choice.like), label: `Like ${choice.name} · ${shortMonthLabel(choice.month)}` })),
    ...choices.categories.map(choice => ({ value: JSON.stringify(choice.like), label: `Like other ${choice.name} costs` }))
  ];
  return <View>
    <Select label="Compare with past costs · optional" value={likeValue} onChange={onLikeChange} options={options} />
    {estimate && <SuggestionCard estimate={estimate} useLabel={`Use ${euro(estimate.estimate)}`}
      onUse={amount => onUseAmount(String(amount / k_centsPerEuro))} />}
  </View>;
}

// For a recurring planned cost already in the plan: accepting sets this year's
// amount only. `acceptedAmount` is the year amount in effect for the draft.
export function RecurringPlannedCostSuggestion({ state, evaluationDate, event, year, acceptedAmount, onAccept, onRevert }) {
  const colors = useContext(Theme);
  const estimate = useMemo(() => comparableCostEstimate(comparableOccurrences(state, event, evaluationDate)), [state, event, evaluationDate]);
  if (acceptedAmount !== undefined) {
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <T style={{ fontSize: 11, color: colors.sub, flexShrink: 1 }}>Using {euro(acceptedAmount)} for {year} only.</T>
      <Button small kind="outline" onPress={onRevert}>Keep usual {euro(event.amount)}</Button>
    </View>;
  }
  return <SuggestionCard estimate={estimate} useLabel={`Use ${euro(estimate.estimate ?? 0)} for ${year}`} onUse={onAccept} />;
}

// The draft's planned costs for the revised months, with this year's amount.
// Recurring costs offer a suggestion that applies to this year only.
export function DraftPlannedCosts({ state, evaluationDate, events, year, fromMonth, onAccept, onRevert }) {
  const draftYearCosts = plannedCostsInYear(events, year).filter(cost => cost.month >= fromMonth);
  return draftYearCosts.map(({ event, month }) => {
    const storedEvent = state.events.find(candidate => candidate.id === event.id);
    return <View key={event.id}>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 9 }}>
        <T style={{ fontSize: 12, flexShrink: 1 }}>{event.name} · month {month}{event.year ? '' : ` · ${plannedCostRepeatText(event)}`}</T>
        <T style={{ fontSize: 12 }}>{euro(plannedCostAmount(event, year))}</T>
      </Row>
      {storedEvent && !storedEvent.year && <RecurringPlannedCostSuggestion state={state} evaluationDate={evaluationDate} event={storedEvent} year={year}
        acceptedAmount={event.yearAmounts?.[String(year)]} onAccept={amount => onAccept(event.id, amount)} onRevert={() => onRevert(event.id)} />}
    </View>;
  });
}
