import React from 'react';
import { H, Select, T } from './ui.jsx';

export const k_createCashewAccount = 'create-new';

function selectedAccountValue(name, selections, exact) {
  if (Object.hasOwn(selections, name)) {
    return selections[name];
  }
  return exact.length === 1 ? JSON.stringify([exact[0].id]) : '';
}

export default function CashewAccountMapping({ sourceNames, accounts, selections, onChange }) {
  const existingOptions = accounts.map(account => ({ value: JSON.stringify([account.id]), label: account.name }));
  return (
    <>
      <H size={18}>Cashew transaction export</H>
      <T style={{ marginVertical: 12 }}>Choose where each account goes. New accounts start at €0.00 and are saved with approved transactions.</T>
      {sourceNames.map(name => {
        const exact = accounts.filter(account => account.name === name);
        const canCreate = !accounts.some(account => account.name.trim() === name);
        const options = [{ value: '', label: 'Choose an account' }, ...existingOptions];
        if (canCreate) {
          options.push({ value: k_createCashewAccount, label: `Create ${name}` });
        }
        return <Select key={name} label={`Account: ${name}`}
          value={selectedAccountValue(name, selections, exact)}
          options={options} onChange={value => onChange(name, value)} />;
      })}
    </>
  );
}
