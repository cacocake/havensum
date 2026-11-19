import React, { useContext, useState } from 'react';
import { Theme, T, Button, Badge, Field, Select, Dialog } from './ui.jsx';
import { useApp } from './context.js';
import { cents, k_centsPerEuro } from './money.js';
import { currentLocalMonth } from './calendar.js';
import { correctableStartText, InterestScheduleError, scheduleWithPeriod, scheduleWithoutPeriod } from './interestSchedule.js';
import { earliestCorrectableMonth } from './interestCorrection.js';
import { savingsRateLabel } from './savingsRateLabel.js';
import InterestScheduleEditor from './InterestScheduleEditor.jsx';
import { palette } from './seed.js';
import { useDirtyForm } from './useDirtyForm.js';
import { createEntityId } from './identifiers';
import { k_entityIdPrefixes } from './domainConstants.js';

const k_accountTypes = { personal: 'Personal', joint: 'Joint', savings: 'Savings', investment: 'Investment' };
const k_defaultInterestRate = 3;
const k_invalidAccountMessage = 'Enter a name and a valid balance.';
const k_accountFormStyles = {
  description: { fontSize: 11, marginBottom: 17 },
  investmentDescription: { fontSize: 11, marginVertical: 15 },
  error: { marginBottom: 12 }
};
const k_accountAppearance = {
  [k_accountTypes.personal]: { icon: 'Wallet', color: palette[0], bank: 'Personal account' },
  [k_accountTypes.joint]: { icon: 'UsersRound', color: palette[5], bank: 'Shared account' },
  [k_accountTypes.savings]: { icon: 'Sprout', color: palette[3] },
  [k_accountTypes.investment]: { icon: 'ChartNoAxesCombined', color: palette[6], bank: 'Manual valuation' }
};

// A new savings account starts with the default rate from this month. An
// unscheduled legacy rate is offered so the owner can choose its start month.
function initialRateDraft(item) {
  if (!item) {
    return String(k_defaultInterestRate);
  }
  if (!item.interestSchedule?.length && item.unscheduledInterest !== undefined) {
    return String(item.unscheduledInterest);
  }
  // Only an account becoming a savings account starts like a new one.
  return item.tag !== k_accountTypes.savings && !item.interestSchedule?.length ? String(k_defaultInterestRate) : '';
}

export function AccountForm({ item, onClose }) {
  const { state, setState, notify } = useApp();
  const colors = useContext(Theme);
  const [name, setName] = useState(item?.name || '');
  const [tag, setTag] = useState(item?.tag || k_accountTypes.personal);
  const [openingBalance, setOpeningBalance] = useState(item ? String(item.openingBalance / k_centsPerEuro) : '0');
  // Interest posts through the same local month the app uses at startup.
  const currentMonth = currentLocalMonth();
  const [schedule, setSchedule] = useState(item?.interestSchedule ?? []);
  const [interestRate, setInterestRate] = useState(initialRateDraft(item));
  const isUnscheduledLegacyRate = Boolean(item) && !item.interestSchedule?.length && item.unscheduledInterest !== undefined;
  // An unscheduled legacy rate waits for the owner to choose its real start month.
  const [rateStart, setRateStart] = useState(isUnscheduledLegacyRate ? '' : currentMonth);
  // BUG-2 (L08): a legacy rate's past start has the same earliest month as corrections.
  const legacyRateBound = isUnscheduledLegacyRate ? { earliestMonth: earliestCorrectableMonth(state, item.id, currentMonth), currentMonth } : {};
  const legacyRateOptions = { allowPastStart: isUnscheduledLegacyRate, correctableBound: legacyRateBound };
  const [ticker, setTicker] = useState(item?.ticker || '');
  const [error, setError] = useState('');
  const isDirty = useDirtyForm([name, tag, openingBalance, schedule, interestRate, rateStart, ticker]);
  const isSavingsAccount = tag === k_accountTypes.savings;
  const isInvestmentAccount = tag === k_accountTypes.investment;

  function scheduleWithDraftRate() {
    if (!interestRate.trim() || (isUnscheduledLegacyRate && !rateStart.trim())) {
      return schedule;
    }
    return scheduleWithPeriod(schedule, { since: rateStart.trim(), rate: Number(interestRate) }, currentMonth, legacyRateOptions);
  }

  function addRatePeriod() {
    try {
      // Adding is explicit, so a missing start month is reported rather than skipped.
      const rate = interestRate.trim() ? Number(interestRate) : Number.NaN;
      setSchedule(scheduleWithPeriod(schedule, { since: rateStart.trim(), rate }, currentMonth, legacyRateOptions));
      setInterestRate('');
      setError('');
    } catch (scheduleError) {
      setError(scheduleError.message);
    }
  }

  function removeRatePeriod(since) {
    try {
      setSchedule(scheduleWithoutPeriod(schedule, since, currentMonth));
      setError('');
    } catch (scheduleError) {
      setError(scheduleError.message);
    }
  }

  function save() {
    const openingBalanceInCents = cents(openingBalance);
    if (!name.trim() || !Number.isSafeInteger(openingBalanceInCents)) {
      setError(k_invalidAccountMessage);
      return;
    }
    let savedSchedule = schedule;
    if (isSavingsAccount) {
      try {
        savedSchedule = scheduleWithDraftRate();
      } catch (scheduleError) {
        setError(scheduleError instanceof InterestScheduleError ? scheduleError.message : k_invalidAccountMessage);
        return;
      }
    }

    const account = {
      ...item,
      ...k_accountAppearance[tag],
      id: item?.id || createEntityId(k_entityIdPrefixes.account),
      name: name.trim(),
      tag,
      openingBalance: openingBalanceInCents,
      ticker
    };
    if (savedSchedule.length) {
      account.interestSchedule = savedSchedule;
      delete account.unscheduledInterest;
    } else {
      delete account.interestSchedule;
    }
    if (isSavingsAccount) {
      account.bank = savingsRateLabel(account, currentMonth);
    }
    setState(currentState => ({
      ...currentState,
      accounts: item
        ? currentState.accounts.map(existingAccount => existingAccount.id === item.id ? account : existingAccount)
        : [...currentState.accounts, account]
    }));
    notify('Account saved');
    onClose();
  }

  return (
    <Dialog dirty={isDirty} title={item ? 'Edit account' : 'Room for your money'} onClose={onClose}>
      <Field label="Account name" value={name} onChangeText={setName} placeholder="e.g. Rainy day" />
      <Select label="Account type" value={tag} onChange={setTag} options={Object.values(k_accountTypes)} />
      <Field label="Opening balance · EUR" value={openingBalance} onChangeText={setOpeningBalance} keyboardType="decimal-pad" />
      {item && <T style={{ ...k_accountFormStyles.description, color: colors.sub }}>This is the starting balance. Recorded transactions are added to it.</T>}
      {isSavingsAccount && (
        <>
          <InterestScheduleEditor schedule={schedule} unscheduledRate={item?.unscheduledInterest} currentMonth={currentMonth}
            legacyStartText={isUnscheduledLegacyRate ? correctableStartText(legacyRateBound.earliestMonth, currentMonth) : null}
            rate={interestRate} onRateChange={setInterestRate} since={rateStart} onSinceChange={setRateStart}
            onAdd={addRatePeriod} onRemove={removeRatePeriod} />
        </>
      )}
      {isInvestmentAccount && (
        <>
          <Field label="ETF or stock ticker · optional" value={ticker} onChangeText={setTicker} placeholder="e.g. VWCE" />
          <Badge>Price feed not connected · balances are manual</Badge>
          <T style={{ ...k_accountFormStyles.investmentDescription, color: colors.sub }}>Ticker coverage must be verified before connecting Twelve Data.</T>
        </>
      )}
      {error && <T accessibilityRole="alert" style={{ ...k_accountFormStyles.error, color: colors.negative }}>{error}</T>}
      <Button onPress={save} icon="Check">Save account</Button>
    </Dialog>
  );
}
