import React, { useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Button, Dialog, Select, T, Theme } from './ui.jsx';
import { euro } from './money.js';
import { monthNumberName, shortMonthLabel } from './monthLabels.js';
import { plannedCostMonth } from './plannedCosts.js';
import { movePlannedCost, plannedCostMoveMonths, plannedCostMovePreview, plannedCostMoveYears } from './plannedCostMoves.js';

function monthOptions(months) {
  return months.map(monthNumber => ({ value: String(monthNumber), label: monthNumberName(monthNumber) }));
}

// The first year offered: the year being viewed when it can be chosen, the
// earliest allowed year for an earlier one, the latest for a later one.
function defaultFirstYear(viewedYear, moveYears) {
  if (moveYears.includes(viewedYear)) {
    return viewedYear;
  }
  if (viewedYear < moveYears[0]) {
    return moveYears[0];
  }
  return moveYears.at(-1);
}

function summaryText(event, preview, firstYear, month) {
  if (!preview.isChange) {
    return `${event.name} is already in ${monthNumberName(month)} from ${firstYear}.`;
  }
  return `From ${preview.firstChangedYear}, ${event.name} is planned in ${monthNumberName(preview.newMonth)} instead of ${monthNumberName(preview.previousMonth)}.`;
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
  const moveYears = plannedCostMoveYears(today, event);
  const initialYear = defaultFirstYear(viewedYear, moveYears);
  const initialMonth = plannedCostMonth(event, initialYear);
  const [firstYear, setFirstYear] = useState(String(initialYear));
  const [month, setMonth] = useState(String(initialMonth));
  const [error, setError] = useState('');
  const offeredMonths = plannedCostMoveMonths(today, Number(firstYear));
  const move = { eventId: event.id, fromYear: Number(firstYear), month: Number(month) };
  const preview = useMemo(() => plannedCostMovePreview(state, move), [state, event.id, firstYear, month]);
  const isDirty = firstYear !== String(initialYear) || month !== String(initialMonth);
  const earlierYear = move.fromYear - 1;

  function chooseMonth(value) {
    setMonth(value);
    setError('');
  }

  // This year offers only the months still ahead, so an earlier month moves to the first one offered.
  function chooseFirstYear(value) {
    setFirstYear(value);
    setError('');
    const monthsForYear = plannedCostMoveMonths(today, Number(value));
    if (!monthsForYear.includes(Number(month))) {
      setMonth(String(monthsForYear[0]));
    }
  }

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
    <Select label="First year" value={firstYear} onChange={chooseFirstYear} options={moveYears.map(year => ({ value: String(year), label: String(year) }))}/>
    <Select label="New month" value={month} onChange={chooseMonth} options={monthOptions(offeredMonths)}/>
    <T testID="planned-cost-move-summary" style={{ fontSize: 12, marginBottom: 10 }}>{summaryText(event, preview, firstYear, move.month)}</T>
    <T style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
      {earlierYear} and earlier keep their month and linked expenses. Frozen plans and recorded transactions stay as saved; Expected savings follows the new month.
    </T>
    {preview.isChange && preview.replacedMoveYears.length > 0 && <T style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
      This replaces the later move from {preview.replacedMoveYears.join(', ')}.
    </T>}
    {preview.isChange && <ReviewNotice expenses={preview.expensesToReview}/>}
  </Dialog>;
}
