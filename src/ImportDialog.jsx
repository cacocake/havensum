import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { Theme, H, T, Row, Button, Select, Dialog } from './ui.jsx';
import { useApp } from './context.js';
import { euro } from './money.js';
import { categoryPath } from './csvExchange.js';
import { getImportMapping, getImportColumns } from './importNormalization.js';
import { previewImportFile } from './importFileReview.js';
import { applyTransactionImport } from './importReview.js';
import { createEntityId } from './identifiers';
import { writeImportRecovery, writeState } from './storage';

const k_statusLabels = { new: 'new', unchanged: 'unchanged', edited: 'edited', possible: 'possible duplicate', invalid: 'invalid' };
const k_fieldLabels = { title: 'Title', amount: 'Amount', date: 'Date', type: 'Type', account: 'Account', category: 'Category', note: 'Note' };
const k_reviewFields = {
  type: 'Type', title: 'Title', amount: 'Amount', date: 'Date', account: 'Account', category: 'Category',
  kind: 'Behaviour', note: 'Note', linkedId: 'Linked expense', toAccount: 'Destination account',
  externalSource: 'External source', externalId: 'External reference', loanId: 'Loan'
};

function sourceValue(row, column) {
  const value = String(row[column] ?? '');
  return row.text_encoding === 'apostrophe-v1' && value.startsWith("'") ? value.slice(1) : value;
}

function sourceValues(data, mapping, field) {
  const values = data.rows.map(row => sourceValue(row, mapping[field]));
  if (field === 'account') {
    values.push(...data.rows.filter(row => row.type === 'transfer').map(row => sourceValue(row, row.schema_version ? 'to_account_id' : 'toAccount')));
  }
  return [...new Set(values)];
}

function displayField(state, field, value) {
  if (value === undefined || value === null || value === '') {
    return 'None';
  }
  if (field === 'amount') {
    return euro(value);
  }
  if (field === 'account' || field === 'toAccount') {
    return state.accounts.find(account => account.id === value)?.name || String(value);
  }
  if (field === 'category') {
    return categoryPath(state.categories, value) || String(value);
  }
  return String(value);
}

export default function ImportDialog({ data, onClose }) {
  const { state, setState, notify } = useApp();
  const colors = useContext(Theme);
  const [mapping, setMapping] = useState(() => getImportMapping(data));
  const [unit, setUnit] = useState(data.backup ? 'cents' : 'euros');
  const [accounts, setAccounts] = useState({});
  const [categories, setCategories] = useState({});
  const [review, setReview] = useState(null);
  const [choices, setChoices] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const columns = [{ value: '', label: 'Not mapped' }, ...getImportColumns(data).map(column => ({ value: column, label: column }))];
  const canonical = data.rows.some(row => Object.hasOwn(row, 'schema_version'));

  function preview() {
    try {
      if (!mapping.title || !mapping.amount || !mapping.date) {
        throw Error('Map title, amount and date before continuing.');
      }
      setReview(previewImportFile(state, data, { mapping, unit, accounts, categories }));
      setChoices({});
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  }

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const result = applyTransactionImport(state, review, choices, () => createEntityId('import'));
      if (JSON.stringify(result) !== JSON.stringify(state)) {
        await writeImportRecovery(state);
        await writeState(result);
        setState(result);
      }
      notify('Reviewed import applied');
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (busy) {
      return;
    }
    onClose();
  }

  const unresolved = review?.rows.some(row => row.status === 'invalid' || (['edited', 'possible'].includes(row.status) && !choices[row.index]));

  return (
    <Dialog title={review ? 'Review your transactions' : 'Bring your history along'} subtitle={`${data.name} · ${data.rows.length} rows · append after review`} onClose={dismiss} width={640}>
      {!review ? (
        <>
          <Row style={{ gap: 12, flexWrap: 'wrap' }}>
            {Object.keys(mapping).map(field => (
              <Select key={field} label={k_fieldLabels[field]} value={mapping[field]} onChange={column => setMapping(current => ({ ...current, [field]: column }))} options={columns} style={{ width: '47%' }} />
            ))}
          </Row>
          {!canonical && <Select label="Amount unit" value={unit} onChange={setUnit} options={[{ value: 'euros', label: 'Euros · 12.50 = €12.50' }, { value: 'cents', label: 'Cents · 1250 = €12.50' }]} />}
          <H size={18} style={{ marginBottom: 12 }}>Map accounts</H>
          {sourceValues(data, mapping, 'account').map(value => (
            <Select key={value} label={`Account: ${value || '(missing)'}`} value={accounts[value] ?? state.accounts.find(account => String(account.id) === value || account.name === value)?.id ?? ''} onChange={id => setAccounts(current => ({ ...current, [value]: id }))} options={[{ value: '', label: 'Choose an account' }, ...state.accounts.map(account => ({ value: account.id, label: account.name }))]} />
          ))}
          <H size={18} style={{ marginBottom: 12 }}>Map categories</H>
          {sourceValues(data, mapping, 'category').map(value => (
            <Select key={value} label={`Category: ${value || '(missing)'}`} value={categories[value] ?? state.categories.find(category => String(category.id) === value || categoryPath(state.categories, category.id) === value)?.id ?? ''} onChange={id => setCategories(current => ({ ...current, [value]: id }))} options={[{ value: '', label: 'Choose a category' }, ...state.categories.map(category => ({ value: category.id, label: categoryPath(state.categories, category.id) }))]} />
          ))}
          <T style={{ fontSize: 12, color: colors.sub, marginBottom: 16 }}>Use ISO dates and positive EUR amounts. Missing types default to expense; unknown types require correction. Nothing is applied before review.</T>
          <Button onPress={preview}>Preview import</Button>
        </>
      ) : (
        <>
          <Row style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(k_statusLabels).map(([status, label]) => <T key={status} style={{ fontSize: 12 }}>{review.rows.filter(row => row.status === status).length} {label}</T>)}
          </Row>
          {review.rows.map(row => (
            <View key={row.index} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line, gap: 8 }}>
              <T style={{ fontSize: 12, color: colors.sub }}>Row {row.index + 1}</T>
              <T style={{ fontWeight: '600' }}>{row.transaction.title}</T>
              {row.transaction.amount !== undefined && <T style={{ fontSize: 12, color: colors.sub }}>{row.transaction.date} · {row.transaction.type} · {displayField(state, 'account', row.transaction.account)} · {euro(row.transaction.amount)}</T>}
              <T style={{ fontSize: 12, color: colors.sub }}>{k_statusLabels[row.status]}</T>
              {row.status === 'edited' && Object.entries(k_reviewFields).filter(([field]) => (row.existing[field] ?? '') !== (row.transaction[field] ?? '')).map(([field, label]) => (
                <T key={field} style={{ fontSize: 12 }}>{label}: {displayField(state, field, row.existing[field])} → {displayField(state, field, row.transaction[field])}</T>
              ))}
              {row.error && <T style={{ color: colors.negative }}>Row {row.index + 1}: {row.error}</T>}
              {['edited', 'possible'].includes(row.status) && <Select label={`Row ${row.index + 1} decision`} value={choices[row.index] || ''} onChange={choice => setChoices(current => ({ ...current, [row.index]: choice }))} options={row.status === 'edited' ? [{ value: '', label: 'Choose what to keep' }, { value: 'keep', label: 'Keep the existing transaction' }, { value: 'replace', label: 'Use the imported changes' }] : [{ value: '', label: 'Review this possible duplicate' }, { value: 'skip', label: 'Skip this row' }, { value: 'add', label: 'Add as a separate purchase' }]} />}
            </View>
          ))}
          <T style={{ fontSize: 12, color: colors.sub, marginTop: 16 }}>A separate pre-import recovery copy is saved before any change. Existing records stay unless you explicitly approve their edits.</T>
          <Row style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Button kind="soft" disabled={busy} onPress={() => setReview(null)}>Back to mapping</Button>
            <Button disabled={busy || unresolved} onPress={apply}>{busy ? 'Saving…' : 'Import transactions'}</Button>
          </Row>
        </>
      )}
      {!!error && <T accessibilityRole="alert" style={{ color: colors.negative, marginTop: 16 }}>{error}</T>}
    </Dialog>
  );
}
