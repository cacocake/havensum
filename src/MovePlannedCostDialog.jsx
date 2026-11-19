import React, { useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Button, Dialog, Select, T, Theme } from './ui.jsx';
import { euro } from './money.js';
import { monthNumberName, shortMonthLabel } from './monthLabels.js';
import { k_monthsPerYear } from './domainConstants.js';
import { plannedCostMonth } from './plannedCosts.js';
import { movePlannedCost, plannedCostMovePreview, plannedCostMoveYears } from './plannedCostMoves.js';

const k_monthOptions = Array.from({ length: k_monthsPerYear }, (_, index) => ({ value: String(index + 1), label: monthNumberName(index + 1) }));

// The first year offered: the year being viewed, or this year for a past year.
function defaultFirstYear(viewedYear, moveYears) {
  return moveYears.includes(viewedYear) ? viewedYear : moveYears[0];
}

function ReviewNotice({ expenses }) {
  const colors = useContext(Theme);
  if (!expenses.length) {
    return <T testID="planned-cost-move-review" style={{ fontSize: 12, color: colors.sub, marginBottom: 14 }}>No linked expense needs review.</T>;
  }
  const count = expenses.length === 1 ? '1 linked expense stays' : `${expenses.length} linked expenses stay`;
  return <View testID="planned-cost-move-review" style={{ backgroundColor: colors.soft, padding: 12, borderRadius: 12, marginBottom: 14, gap: 4 }}>
    <T style={{ fontSize: 12 }}>{count} on the old month and will need review in Expected costs:</T>
    {expenses.map(expense => <T key={expense.id} style={{ fontSize: 11, color: colors.muted }}>
      {expense.title} · {euro(expense.amount)} · linked to {shortMonthLabel(expense.plannedCost.month)}
    </T>)}
  </View>;
}

// Moves a recurring planned cost from this year or a later one (owner
// decisions F16/F17). Earlier years, frozen plans and recorded expenses stay.
export default function MovePlannedCostDialog({ event, viewedYear, onClose }) {
  const { state, setState, today, notify } = useApp();
  const colors = useContext(Theme);
  const moveYears = plannedCostMoveYears(today);
  const initialYear = defaultFirstYear(viewedYear, moveYears);
  const initialMonth = plannedCostMonth(event, initialYear);
  const [firstYear, setFirstYear] = useState(String(initialYear));
  const [month, setMonth] = useState(String(initialMonth));
  const [error, setError] = useState('');
  const move = { eventId: event.id, fromYear: Number(firstYear), month: Number(month) };
  const preview = useMemo(() => plannedCostMovePreview(state, move), [state, event.id, firstYear, month]);
  const isDirty = firstYear !== String(initialYear) || month !== String(initialMonth);
  const earlierYear = move.fromYear - 1;

  function confirmMove() {
    try {
      movePlannedCost(state, { ...move, today });
    } catch (moveError) {
      setError(moveError.message);
      return;
    }
    setState(current => {
      try {
        return movePlannedCost(current, { ...move, today });
      } catch {
        return current;
      }
    });
    notify(`${event.name} moves to ${monthNumberName(move.month)} from ${move.fromYear}`);
    onClose();
  }

  const footer = <View style={{ gap: 8 }}>
    {error ? <T accessibilityRole="alert" style={{ color: colors.negative }}>{error}</T> : null}
    <Button icon="CalendarRange" disabled={!preview.isChange} onPress={confirmMove}>Move from {firstYear}</Button>
    <Button kind="soft" onPress={onClose}>Keep as it is</Button>
  </View>;

  return <Dialog title={`Move ${event.name}`} subtitle="Choose its new month and the first year it applies." onClose={onClose} dirty={isDirty} footer={footer}>
    <Select label="New month" value={month} onChange={value => { setMonth(value); setError(''); }} options={k_monthOptions}/>
    <Select label="First year" value={firstYear} onChange={value => { setFirstYear(value); setError(''); }} options={moveYears.map(year => ({ value: String(year), label: String(year) }))}/>
    <T testID="planned-cost-move-summary" style={{ fontSize: 12, marginBottom: 10 }}>
      {preview.isChange
        ? `From ${firstYear}, ${event.name} is planned in ${monthNumberName(move.month)} instead of ${monthNumberName(preview.previousMonth)}.`
        : `${event.name} is already in ${monthNumberName(move.month)} from ${firstYear}.`}
    </T>
    <T style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
      {earlierYear} and earlier keep their month and linked expenses. Frozen plans and recorded transactions stay as saved; Expected savings follows the new month.
    </T>
    {preview.isChange && preview.replacedMoveYears.length > 0 && <T style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
      This replaces the later move from {preview.replacedMoveYears.join(', ')}.
    </T>}
    {preview.isChange && <ReviewNotice expenses={preview.expensesToReview}/>}
  </Dialog>;
}
