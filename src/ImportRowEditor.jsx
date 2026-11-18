import React, { useContext, useState } from 'react';
import { Button, DateField, Field, Row, Select, T, Theme } from './ui.jsx';
import { categoryPath, formatEuroAmount } from './csvExchange.js';
import { parseImportAmount } from './importNormalization.js';
import { k_spendingBehaviors, k_transactionTypes } from './domainConstants.js';
import { euro } from './money.js';
import { bankClassificationAllows } from './realBankReview.js';

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

export default function ImportRowEditor({ transaction, state, expenses, lockAccount, bank, counterparts, pair, onUpdate, onCancel }) {
  const colors = useContext(Theme);
  const [draft, setDraft] = useState(() => ({
    ...transaction,
    amount: formatEuroAmount(transaction.amount),
    counterpart: pair ? String(pair.counterpartIndex) : '',
    transferDate: pair?.dateConfirmed ? transaction.date : ''
  }));
  const [error, setError] = useState('');
  const { accounts, categories } = state;
  const isTransfer = draft.type === k_transactionTypes.transfer;
  const isReimbursement = draft.type === k_transactionTypes.reimbursement;
  const selectedCredit = counterparts.find(row => String(row.index) === draft.counterpart);
  const needsTransferDate = isTransfer && bank && selectedCredit && bank.valueDate !== selectedCredit.bank.valueDate;
  const scopedSource = Boolean(transaction.externalSource) && String(transaction.externalId ?? '') !== '';
  const accountOptions = accounts.map(record => ({ value: record.id, label: record.name }));
  const typeOptions = bank ? [
    { value: '', label: 'Choose a classification' },
    ...k_transactionOptions.filter(option => bankClassificationAllows(bank.direction, option.value))
  ] : k_transactionOptions;
  const linkedExpenseOptions = [
    ...(bank ? [
      { value: '', label: 'Choose how to link this credit' },
      { value: 'null', label: 'Unlinked balance adjustment' }
    ] : [{ value: '', label: 'Unlinked balance adjustment' }]),
    ...expenses.map(record => ({
      value: bank ? JSON.stringify(record.id) : record.id,
      label: `${record.title} · ${euro(record.amount)} · ${record.date}`
    }))
  ];
  if (draft.linkedId != null && draft.linkedId !== '' && selectedId(expenses, draft.linkedId) === undefined) {
    linkedExpenseOptions.push({
      value: bank ? JSON.stringify(draft.linkedId) : draft.linkedId,
      label: 'Unresolved original expense'
    });
  }

  function change(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function changeLinkedExpense(value) {
    change('linkedId', bank && value !== '' ? JSON.parse(value) : value);
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
        toAccount: isTransfer && !bank ? selectedId(accounts, draft.toAccount) : undefined,
        counterpartIndex: isTransfer && bank && draft.counterpart !== '' ? Number(draft.counterpart) : undefined,
        transferDate: needsTransferDate ? draft.transferDate : undefined,
        linkedId: isReimbursement && draft.linkedId !== ''
          ? (bank ? draft.linkedId : selectedId(expenses, draft.linkedId) ?? draft.linkedId)
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
      <Select label="Type" value={draft.type ?? ''} onChange={value => change('type', value)} options={typeOptions} />
      <Field label="Amount · EUR" value={draft.amount} onChangeText={value => change('amount', value)} keyboardType="decimal-pad" />
      {!needsTransferDate && <DateField value={draft.date} onChange={value => change('date', value)} />}
      {!lockAccount && !scopedSource && <Select label="Account" value={draft.account} onChange={value => change('account', value)} options={accountOptions} />}
      {isTransfer && bank ? (
        <Select label="Matching credit" value={draft.counterpart}
          onChange={value => setDraft(current => ({ ...current, counterpart: value, transferDate: '' }))} options={[
          { value: '', label: counterparts.length ? 'Choose the matching credit' : 'No credit from another account with the same amount' },
          ...counterparts.map(row => ({
            value: String(row.index),
            label: `${row.transaction.title} · ${row.bank.valueDate} · ${accounts.find(account => account.id === row.transaction.account)?.name} · ${row.bank.statementName}, row ${row.sourceRow}`
          }))
        ]} />
      ) : isTransfer ? (
        <Select label="Destination account" value={draft.toAccount ?? ''} onChange={value => change('toAccount', value)} options={[
          { value: '', label: 'Choose destination' },
          ...accountOptions.filter(option => String(option.value) !== String(draft.account))
        ]} />
      ) : (
        <>
          <Select label="Category" value={draft.category ?? ''} onChange={value => change('category', value)} options={[
          { value: '', label: bank && draft.type === k_transactionTypes.expense ? 'Choose a category' : 'Uncategorized' },
            ...categories.map(record => ({ value: record.id, label: categoryPath(categories, record.id) }))
          ]} />
          <Select label="Spending behaviour" value={draft.kind ?? ''} onChange={value => change('kind', value)} options={[
            { value: '', label: 'Use category default' },
            ...Object.values(k_spendingBehaviors)
          ]} />
        </>
      )}
      {needsTransferDate && (
        <Select label="Transfer date" value={draft.transferDate} onChange={value => change('transferDate', value)} options={[
          { value: '', label: 'Choose which value date to use' },
          { value: bank.valueDate, label: `${bank.valueDate} · debit value date` },
          { value: selectedCredit.bank.valueDate, label: `${selectedCredit.bank.valueDate} · credit value date` }
        ]} />
      )}
      {isReimbursement && (
        <Select label="Original expense" value={bank ? (JSON.stringify(draft.linkedId) ?? '') : (draft.linkedId ?? '')}
          onChange={changeLinkedExpense} options={linkedExpenseOptions} />
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
