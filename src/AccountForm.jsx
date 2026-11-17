import React, { useContext, useState } from 'react';
import { Theme, T, Button, Badge, Field, Select, Dialog } from './ui.jsx';
import { useApp } from './context.js';
import { cents, k_centsPerEuro } from './money.js';
import { monthOf } from './calendar.js';
import { palette } from './seed.js';
import { useDirtyForm } from './useDirtyForm.js';
import { createEntityId } from './identifiers';
import { k_entityIdPrefixes } from './domainConstants.js';

const k_accountTypes = { personal: 'Personal', joint: 'Joint', savings: 'Savings', investment: 'Investment' };
const k_defaultInterestRate = 3;
const k_invalidAccountMessage = 'Enter a name, valid balance and non-negative interest rate.';
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

export function AccountForm({ item, onClose }) {
  const { setState, notify } = useApp();
  const colors = useContext(Theme);
  const [name, setName] = useState(item?.name || '');
  const [tag, setTag] = useState(item?.tag || k_accountTypes.personal);
  const [openingBalance, setOpeningBalance] = useState(item ? String(item.openingBalance / k_centsPerEuro) : '0');
  const [interestRate, setInterestRate] = useState(String(item?.interest ?? k_defaultInterestRate));
  const [ticker, setTicker] = useState(item?.ticker || '');
  const [error, setError] = useState('');
  const isDirty = useDirtyForm([name, tag, openingBalance, interestRate, ticker]);
  const isSavingsAccount = tag === k_accountTypes.savings;
  const isInvestmentAccount = tag === k_accountTypes.investment;

  function save() {
    const openingBalanceInCents = cents(openingBalance);
    const annualInterestRate = Number(interestRate);
    const validInterestRate = Number.isFinite(annualInterestRate) && annualInterestRate >= 0;
    if (!name.trim() || !Number.isSafeInteger(openingBalanceInCents) || (isSavingsAccount && !validInterestRate)) {
      setError(k_invalidAccountMessage);
      return;
    }

    const account = {
      ...item,
      ...k_accountAppearance[tag],
      id: item?.id || createEntityId(k_entityIdPrefixes.account),
      name: name.trim(),
      tag,
      openingBalance: openingBalanceInCents,
      interest: isSavingsAccount ? annualInterestRate : 0,
      interestStart: item?.interestStart || monthOf(new Date().toISOString()),
      ticker
    };
    if (isSavingsAccount) {
      account.bank = `${interestRate}% annual interest`;
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
          <Field label="Effective annual interest · %" value={interestRate} onChangeText={setInterestRate} keyboardType="decimal-pad" />
          <T style={{ ...k_accountFormStyles.description, color: colors.sub }}>Interest compounds once per completed month, from the account's start month. Existing interest entries are never duplicated.</T>
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
