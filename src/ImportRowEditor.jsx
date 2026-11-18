import React, { useContext, useState } from 'react';
import { Button, DateField, Field, Row, Select, T, Theme } from './ui.jsx';
import { categoryPath, formatEuroAmount } from './csvExchange.js';
import { parseImportAmount } from './importNormalization.js';
import { k_spendingBehaviors, k_transactionTypes } from './domainConstants.js';
import { euro } from './money.js';

const k_transactionOptions = [
  { value: k_transactionTypes.expense, label: 'Expense' },
  { value: k_transactionTypes.income, label: 'Income' },
  { value: k_transactionTypes.reimbursement, label: 'Reimbursement' },
  { value: k_transactionTypes.transfer, label: 'Transfer' }
];

function selectedId(records, selectedValue) {
  return records.find(record => record.id === selectedValue
    || String(record.id) === selectedValue)?.id;
}

export default function ImportRowEditor({ transaction, state, expenses, lockAccount, onUpdate, onCancel }) {
  const colors = useContext(Theme);
  const [draft, setDraft] = useState(() => ({
    ...transaction,
    amount: formatEuroAmount(transaction.amount)
  }));
  const [error, setError] = useState('');
  const { accounts, categories } = state;
  const isTransfer = draft.type === k_transactionTypes.transfer;
  const isReimbursement = draft.type === k_transactionTypes.reimbursement;
  const scopedSource = Boolean(transaction.externalSource) && String(transaction.externalId ?? '') !== '';
  const accountOptions = accounts.map(record => ({ value: record.id, label: record.name }));
  const linkedExpenseOptions = [
    { value: '', label: 'Unlinked balance adjustment' },
    ...expenses.map(record => ({ value: record.id, label: `${record.title} · ${euro(record.amount)} · ${record.date}` }))
  ];
  if (draft.linkedId != null && draft.linkedId !== '' && selectedId(expenses, draft.linkedId) === undefined) {
    linkedExpenseOptions.push({ value: draft.linkedId, label: 'Unresolved original expense' });
  }

  function change(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function update() {
    try {
      const amount = parseImportAmount(draft.amount, 'euros');
      const category = isTransfer ? undefined : selectedId(categories, draft.category);
      onUpdate({
        title: draft.title.trim(),
        type: draft.type,
        amount,
        date: draft.date,
        account: selectedId(accounts, draft.account),
        category,
        note: draft.note,
        kind: isTransfer ? undefined : draft.kind || undefined,
        toAccount: isTransfer ? selectedId(accounts, draft.toAccount) : undefined,
        linkedId: isReimbursement && draft.linkedId !== ''
          ? selectedId(expenses, draft.linkedId) ?? draft.linkedId
          : undefined,
        loanId: draft.type === transaction.type ? transaction.loanId : undefined
      });
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <>
      <Field label="Title" value={draft.title} onChangeText={value => change('title', value)} />
      <Select label="Type" value={draft.type} onChange={value => change('type', value)} options={k_transactionOptions} />
      <Field label="Amount · EUR" value={draft.amount} onChangeText={value => change('amount', value)} keyboardType="decimal-pad" />
      <DateField value={draft.date} onChange={value => change('date', value)} />
      {!lockAccount && !scopedSource && <Select label="Account" value={draft.account} onChange={value => change('account', value)} options={accountOptions} />}
      {isTransfer ? (
        <Select label="Destination account" value={draft.toAccount ?? ''} onChange={value => change('toAccount', value)} options={[
          { value: '', label: 'Choose destination' },
          ...accountOptions.filter(option => String(option.value) !== String(draft.account))
        ]} />
      ) : (
        <>
          <Select label="Category" value={draft.category ?? ''} onChange={value => change('category', value)} options={[
            { value: '', label: 'Uncategorized' },
            ...categories.map(record => ({ value: record.id, label: categoryPath(categories, record.id) }))
          ]} />
          <Select label="Spending behaviour" value={draft.kind ?? ''} onChange={value => change('kind', value)} options={[
            { value: '', label: 'Use category default' },
            ...Object.values(k_spendingBehaviors)
          ]} />
        </>
      )}
      {isReimbursement && (
        <Select label="Original expense" value={draft.linkedId ?? ''} onChange={value => change('linkedId', value)} options={linkedExpenseOptions} />
      )}
      <Field label="Note" value={draft.note} onChangeText={value => change('note', value)} multiline />
      {!!error && <T accessibilityRole="alert" style={{ color: colors.negative }}>{error}</T>}
      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button small kind="soft" onPress={onCancel}>Cancel edit</Button>
        <Button small onPress={update}>Update draft</Button>
      </Row>
    </>
  );
}
