import React, { useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Theme, T, H, Row, Button, Badge, Field, Dialog, Divider } from './ui.jsx';
import { useApp } from './context.js';
import { euro, signedEuro } from './money.js';
import { monthOf } from './calendar.js';
import { shortMonthLabel } from './monthLabels.js';
import { correctedSchedule, correctedScheduleWithout, interestPeriodsForDisplay } from './interestSchedule.js';
import { k_interestBankChoices } from './interestEntries.js';
import { applyInterestCorrection, interestCorrectionReview } from './interestCorrection.js';
import { savingsRateLabel } from './savingsRateLabel.js';
import { useDirtyForm } from './useDirtyForm.js';

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
function PastRates({ schedule, onScheduleChange, onError }) {
  const colors = useContext(Theme);
  const [rate, setRate] = useState('');
  const [since, setSince] = useState('');
  function setRatePeriod() {
    try {
      const enteredRate = rate.trim() ? Number(rate.replace(',', '.')) : Number.NaN;
      onScheduleChange(correctedSchedule(schedule, { since: since.trim(), rate: enteredRate }));
      setRate('');
      setSince('');
      onError('');
    } catch (scheduleError) {
      onError(scheduleError.message);
    }
  }
  return <View testID="interest-correction-rates" style={k_styles.section}>
    <H size={17}>Rates, including past months</H>
    {!schedule.length && <T style={{ ...k_styles.note, color: colors.sub }}>No rate periods. Completed months earn no app interest.</T>}
    {interestPeriodsForDisplay({ interestSchedule: schedule }).map(period => <Row key={period.since} style={k_styles.wrapRow}>
      <T style={{ flex: 1, minWidth: 170, fontSize: 13 }}>{periodLabel(period)}</T>
      <Button small kind="soft" accessibilityLabel={`Remove the rate from ${shortMonthLabel(period.since)}`} onPress={() => onScheduleChange(correctedScheduleWithout(schedule, period.since))}>Remove</Button>
    </Row>)}
    <Row style={k_styles.wrapRow}>
      <Field label="Corrected rate · %" value={rate} onChangeText={setRate} keyboardType="decimal-pad" style={k_styles.field} />
      <Field label="From month · YYYY-MM" value={since} onChangeText={setSince} placeholder="e.g. 2026-01" style={k_styles.field} />
    </Row>
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
  const [error, setError] = useState('');
  // Cancel asks before discarding a changed draft, like closing the dialog.
  const dismissRef = useRef(onClose);
  const isDirty = useDirtyForm([schedule, choices]);
  const currentMonth = monthOf(today);
  const draft = useMemo(() => ({ currentMonth, schedule, choices }), [currentMonth, schedule, choices]);
  const review = useMemo(() => account ? interestCorrectionReview(state, accountId, draft) : null, [state, account, accountId, draft]);
  if (!review) {
    return <Dialog title="Account unavailable" onClose={onClose}><T>This savings account is no longer available.</T></Dialog>;
  }
  const hasChanges = review.months.length > 0 || choices.length > 0 || !sameJson(schedule, storedSchedule);

  function choose(month, choice) {
    setChoices(currentChoices => [...currentChoices.filter(existing => existing.month !== month), { month, choice }]);
  }

  function apply() {
    try {
      const correctedState = applyInterestCorrection(state, accountId, review, draft);
      setState({
        ...correctedState,
        accounts: correctedState.accounts.map(candidate => candidate.id === accountId ? { ...candidate, bank: savingsRateLabel(candidate, currentMonth) } : candidate)
      });
      notify('Past interest corrected');
      onClose();
    } catch (applyError) {
      setError(applyError.message);
    }
  }

  return <Dialog dirty={isDirty} dismissRef={dismissRef} title="Correct past interest" subtitle={account.name} onClose={onClose}
    footer={<Row style={{ gap: 10, flexWrap: 'wrap' }}>
      <Button kind="outline" onPress={() => dismissRef.current()} style={{ flex: 1, minWidth: 120 }}>Cancel</Button>
      <Button icon="Check" disabled={review.needsChoice || !hasChanges} onPress={apply} style={{ flex: 1, minWidth: 160 }}>Apply corrections</Button>
    </Row>}>
    <T style={{ ...k_styles.note, color: colors.sub, marginBottom: 14 }}>Completed months are compared with what their balances and rates earn, compounding month by month. Recorded entries stay; each changed month gets one marked interest correction. To correct a past balance, record the missing entry or a balance adjustment on its date first.</T>
    <PastRates schedule={schedule} onScheduleChange={setSchedule} onError={setError} />
    <BankInterestChoices bankInterestMonths={review.bankInterestMonths} onChoose={choose} />
    <Divider />
    <AffectedMonths review={review} />
    {error ? <T accessibilityRole="alert" style={{ ...k_styles.note, color: colors.negative, marginTop: 10 }}>{error}</T> : null}
  </Dialog>;
}
