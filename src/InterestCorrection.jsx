import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Theme, T, H, Row, Button, Badge, Field, Dialog, Divider } from './ui.jsx';
import { useApp } from './context.js';
import { euro, signedEuro } from './money.js';
import { monthOf } from './calendar.js';
import { shortMonthLabel } from './monthLabels.js';
import { correctableStartText, correctedSchedule, correctedScheduleWithout, interestPeriodsForDisplay, InterestScheduleError } from './interestSchedule.js';
import { k_interestBankChoices } from './interestEntries.js';
import { applyInterestCorrection, earliestCorrectableMonth, interestCorrectionReview } from './interestCorrection.js';
import { savingsRateLabel } from './savingsRateLabel.js';
import { useDirtyForm } from './useDirtyForm.js';
import { validateState } from './stateSchema.js';

const k_choiceLabels = {
  [k_interestBankChoices.bankOnly]: 'Bank amount only',
  [k_interestBankChoices.keepBoth]: 'Keep both'
};
const k_styles = {
  section: { gap: 8, marginBottom: 16 },
  note: { fontSize: 12 },
  monthRow: { gap: 10, paddingVertical: 10, borderTopWidth: 1, alignItems: 'flex-start' },
  wrapRow: { gap: 8, flexWrap: 'wrap' },
  field: { flex: 1, minWidth: 130 }
};

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function periodLabel(period) {
  const through = period.through ? `through ${shortMonthLabel(period.through)}` : 'ongoing';
  return `${period.rate}% from ${shortMonthLabel(period.since)}, ${through}`;
}

// L03: past rates change only here, as a draft that is reviewed before applying.
// LEDGER-2a (L07): a rate starts no earlier than `correctableBound.earliestMonth`.
function PastRates({ schedule, unscheduledRate, correctableBound, rate, onRateChange, since, onSinceChange, onScheduleChange, onError }) {
  const colors = useContext(Theme);
  function setRatePeriod() {
    try {
      const enteredRate = rate.trim() ? Number(rate.replace(',', '.')) : Number.NaN;
      onScheduleChange(correctedSchedule(schedule, { since: since.trim(), rate: enteredRate }, correctableBound));
      onRateChange('');
      onSinceChange('');
      onError('');
    } catch (scheduleError) {
      onError(scheduleError.message);
    }
  }
  return <View testID="interest-correction-rates" style={k_styles.section}>
    <H size={17}>Rates, including past months</H>
    {!schedule.length && <T style={{ ...k_styles.note, color: colors.sub }}>No rate periods. Completed months earn no app interest.{unscheduledRate !== undefined ? ` The saved rate ${unscheduledRate}% has no start month yet.` : ''}</T>}
    {interestPeriodsForDisplay({ interestSchedule: schedule }).map(period => <Row key={period.since} style={k_styles.wrapRow}>
      <T style={{ flex: 1, minWidth: 170, fontSize: 13 }}>{periodLabel(period)}</T>
      <Button small kind="soft" accessibilityLabel={`Remove the rate from ${shortMonthLabel(period.since)}`} onPress={() => onScheduleChange(correctedScheduleWithout(schedule, period.since))}>Remove</Button>
    </Row>)}
    <Row style={k_styles.wrapRow}>
      <Field label="Corrected rate · %" value={rate} onChangeText={onRateChange} keyboardType="decimal-pad" style={k_styles.field} />
      <Field label="From month · YYYY-MM" value={since} onChangeText={onSinceChange} placeholder="e.g. 2026-01" style={k_styles.field} />
    </Row>
    <T testID="interest-correction-earliest" style={{ ...k_styles.note, color: colors.sub }}>{correctableStartText(correctableBound.earliestMonth, correctableBound.currentMonth)}</T>
    <Button small kind="outline" icon="Plus" onPress={setRatePeriod}>Set rate from this month</Button>
  </View>;
}

// L05: the owner decides per month how bank-posted interest relates to the app's.
function BankInterestChoices({ bankInterestMonths, onChoose }) {
  const colors = useContext(Theme);
  if (!bankInterestMonths.length) {
    return null;
  }
  return <View testID="interest-correction-bank" style={k_styles.section}>
    <H size={17}>Bank interest</H>
    <T style={{ ...k_styles.note, color: colors.sub }}>The bank already posted interest in these months. Choose whether it replaces the app's amount or comes on top of it.</T>
    {bankInterestMonths.map(bankMonth => <View key={bankMonth.month} style={{ ...k_styles.monthRow, borderColor: colors.line }}>
      <T style={{ fontWeight: '600' }}>{shortMonthLabel(bankMonth.month)}</T>
      <T style={{ ...k_styles.note, color: colors.sub }}>Bank {euro(bankMonth.bank)} · app {euro(bankMonth.appInterest)}{bankMonth.needsChoice ? ' · choose one' : ''}</T>
      <Row style={k_styles.wrapRow}>
        {Object.values(k_interestBankChoices).map(choice => <Button key={choice} small kind={bankMonth.choice === choice ? 'primary' : 'outline'}
          accessibilityLabel={`${k_choiceLabels[choice]} for ${shortMonthLabel(bankMonth.month)}`} onPress={() => onChoose(bankMonth.month, choice)}>
          {k_choiceLabels[choice]}
        </Button>)}
      </Row>
    </View>)}
  </View>;
}

function monthStatus(reviewedMonth) {
  if (reviewedMonth.needsChoice) {
    return 'Choose for bank interest';
  }
  return reviewedMonth.compoundingEffect ? 'Compounding effect' : null;
}

// L06: every affected completed month with its recorded and corrected
// interest, the difference, and the total.
function AffectedMonths({ review }) {
  const colors = useContext(Theme);
  if (!review.months.length) {
    return <T testID="interest-correction-empty" style={{ ...k_styles.note, color: colors.sub }}>Nothing to correct. Recorded interest matches the balances and rates.</T>;
  }
  return <View testID="interest-correction-months" style={k_styles.section}>
    <H size={17}>Affected months</H>
    {review.months.map(reviewedMonth => <Row key={reviewedMonth.month} testID={`interest-correction-${reviewedMonth.month}`} style={{ ...k_styles.monthRow, borderColor: colors.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontWeight: '600' }}>{shortMonthLabel(reviewedMonth.month)}</T>
        <T style={{ ...k_styles.note, color: colors.sub }}>Recorded {euro(reviewedMonth.recorded)} → {euro(reviewedMonth.corrected)}</T>
        {monthStatus(reviewedMonth) && <Badge style={{ marginTop: 5 }}>{monthStatus(reviewedMonth)}</Badge>}
      </View>
      <T testID={`interest-correction-${reviewedMonth.month}-difference`} numberOfLines={1} style={{ fontWeight: '700', flexShrink: 0 }}>{signedEuro(reviewedMonth.difference)}</T>
    </Row>)}
    <Row style={{ justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 }}>
      <T style={{ fontWeight: '600' }}>Total correction</T>
      <T testID="interest-correction-total" style={{ fontWeight: '700' }}>{signedEuro(review.total)}</T>
    </Row>
  </View>;
}

// The review of a draft, or why the draft can no longer be reviewed: a rate
// that starts before the earliest correctable month (L07), for example once
// the month the draft started in has rolled over while the dialog was open.
function reviewOfDraft(state, accountId, draft) {
  try {
    return { review: interestCorrectionReview(state, accountId, draft), draftError: '' };
  } catch (reviewError) {
    if (!(reviewError instanceof InterestScheduleError)) {
      throw reviewError;
    }
    return { review: null, draftError: reviewError.message };
  }
}

// LEDGER-2: a reviewed, explicit correction of a savings account's past
// interest. Recorded entries stay; Apply adds one marked correction per
// affected month and Cancel changes nothing.
export default function InterestCorrection({ accountId, onClose }) {
  const { state, setState, today, notify } = useApp();
  const colors = useContext(Theme);
  const account = state.accounts.find(candidate => candidate.id === accountId);
  const storedSchedule = account?.interestSchedule ?? [];
  const [schedule, setSchedule] = useState(storedSchedule);
  const [choices, setChoices] = useState([]);
  const [typedRate, setTypedRate] = useState('');
  const [typedSince, setTypedSince] = useState('');
  const [error, setError] = useState('');
  // Cancel asks before discarding a changed draft, like closing the dialog.
  const dismissRef = useRef(onClose);
  const isDirty = useDirtyForm([schedule, choices, typedRate, typedSince]);
  // A rate typed but not yet set would otherwise be ignored by Apply.
  const hasUnsetRate = Boolean(typedRate.trim() || typedSince.trim());
  const currentMonth = monthOf(today);
  const correctableBound = { earliestMonth: earliestCorrectableMonth(state, accountId, currentMonth), currentMonth };
  const draft = useMemo(() => ({ currentMonth, schedule, choices }), [currentMonth, schedule, choices]);
  const { review, draftError } = useMemo(() => {
    if (!account) {
      return { review: null, draftError: '' };
    }
    return reviewOfDraft(state, accountId, draft);
  }, [state, account, accountId, draft]);
  // An earlier Apply error no longer describes a changed draft or ledger.
  useEffect(() => {
    setError('');
  }, [state, draft]);
  if (!account) {
    return <Dialog title="Account unavailable" onClose={onClose}><T>This savings account is no longer available.</T></Dialog>;
  }
  const hasChanges = Boolean(review) && (review.months.length > 0 || choices.length > 0 || !sameJson(schedule, storedSchedule));

  function choose(month, choice) {
    setChoices(currentChoices => [...currentChoices.filter(existing => existing.month !== month), { month, choice }]);
  }

  function apply() {
    try {
      const appliedState = applyInterestCorrection(state, accountId, review, draft);
      const correctedState = {
        ...appliedState,
        accounts: appliedState.accounts.map(candidate => candidate.id === accountId ? { ...candidate, bank: savingsRateLabel(candidate, currentMonth) } : candidate)
      };
      // Never keep a ledger in memory that could not be saved.
      validateState(correctedState);
      setState(correctedState);
      notify('Past interest corrected');
      onClose();
    } catch (applyError) {
      setError(applyError.message);
    }
  }

  return <Dialog dirty={isDirty} dismissRef={dismissRef} title="Correct past interest" subtitle={account.name} onClose={onClose}
    footer={<Row style={{ gap: 10, flexWrap: 'wrap' }}>
      <Button kind="outline" onPress={() => dismissRef.current()} style={{ flex: 1, minWidth: 120 }}>Cancel</Button>
      <Button icon="Check" disabled={!review || review.needsChoice || !hasChanges || hasUnsetRate} onPress={apply} style={{ flex: 1, minWidth: 160 }}>Apply corrections</Button>
    </Row>}>
    <T style={{ ...k_styles.note, color: colors.sub, marginBottom: 14 }}>Completed months are compared with what their balances and rates earn, compounding month by month. Recorded entries stay; each changed month gets one marked interest correction. To correct a past balance, record the missing entry or a balance adjustment on its date first.</T>
    <PastRates schedule={schedule} unscheduledRate={account.unscheduledInterest} correctableBound={correctableBound} rate={typedRate} onRateChange={setTypedRate}
      since={typedSince} onSinceChange={setTypedSince} onScheduleChange={setSchedule} onError={setError} />
    {hasUnsetRate && <T testID="interest-correction-unset-rate" style={{ ...k_styles.note, color: colors.sub, marginBottom: 12 }}>Set the typed rate, or clear it, before applying.</T>}
    {review && <BankInterestChoices bankInterestMonths={review.bankInterestMonths} onChoose={choose} />}
    <Divider />
    {review && <AffectedMonths review={review} />}
    {error || draftError ? <T accessibilityRole="alert" style={{ ...k_styles.note, color: colors.negative, marginTop: 10 }}>{error || draftError}</T> : null}
  </Dialog>;
}
