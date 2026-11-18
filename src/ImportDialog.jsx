import React, { useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Theme, H, T, Row, Button, Select, Dialog } from './ui.jsx';
import { useApp } from './context.js';
import { euro } from './money.js';
import { categoryPath } from './csvExchange.js';
import { getImportMapping, getImportColumns } from './importNormalization.js';
import { previewImportFile } from './importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from './importReview.js';
import ImportRowEditor from './ImportRowEditor.jsx';
import ImportResults, { AccountBalanceReview } from './ImportResults.jsx';
import { getImportBalances, getImportResults } from './importOutcomes.js';
import { createEntityId } from './identifiers';
import { isDemoSession, readImportRecovery, writeImportRecovery, writeState } from './storage';
import { downloadJSON } from './files';

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

function sourceValues(data, mapping, field, onlyDestinations = false) {
  const values = onlyDestinations ? [] : data.rows.map(row => sourceValue(row, mapping[field]));
  if (field === 'account') {
    const destinations = data.rows.filter(row => sourceValue(row, mapping.type).toLowerCase() === 'transfer')
      .map(row => sourceValue(row, row.schema_version ? 'to_account_id' : 'toAccount') || sourceValue(row, 'to_account_name'));
    values.push(...destinations);
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
  if (field === 'linkedId') {
    return state.transactions.find(transaction => transaction.id === value)?.title || String(value);
  }
  if (field === 'loanId') {
    return state.loans.find(loan => loan.id === value)?.name || String(value);
  }
  return String(value);
}

export default function ImportDialog({ data, onClose }) {
  const { state, setState } = useApp();
  const colors = useContext(Theme);
  const [mapping, setMapping] = useState(() => getImportMapping(data));
  const [unit, setUnit] = useState(data.backup ? 'cents' : 'euros');
  const [targetAccount, setTargetAccount] = useState('');
  const [accounts, setAccounts] = useState({});
  const [categories, setCategories] = useState({});
  const [review, setReview] = useState(null);
  const [results, setResults] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [choices, setChoices] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const columns = [{ value: '', label: 'Not mapped' }, ...getImportColumns(data).map(column => ({ value: column, label: column }))];
  const canonical = data.rows.some(row => Object.hasOwn(row, 'schema_version'));
  const hasTargetAccount = targetAccount !== '';
  const accountSources = sourceValues(data, mapping, 'account', hasTargetAccount);
  const accountOptions = state.accounts.map(account => ({ value: account.id, label: account.name }));

  function preview() {
    try {
      if (!mapping.title || !mapping.amount || !mapping.date) {
        throw Error('Map title, amount and date before continuing.');
      }
      setReview(previewImportFile(state, data, {
        mapping, unit, accounts, categories,
        targetAccount: hasTargetAccount ? targetAccount : undefined
      }));
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
      setResults(getImportResults(state, result, review, choices));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadRecovery() {
    try {
      const recovery = await readImportRecovery();
      if (!recovery) {
        throw Error('No pre-import backup is saved on this device.');
      }
      await downloadJSON(recovery);
    } catch (failure) {
      setError(failure.message);
    }
  }

  function updateRow(index, changes) {
    try {
      setReview(reviseTransactionImport(state, review, index, changes));
      setChoices(current => {
        const revisedChoices = { ...current };
        delete revisedChoices[index];
        return revisedChoices;
      });
      setEditingRow(null);
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  }

  function dismiss() {
    if (busy) {
      return;
    }
    onClose();
  }

  const unresolved = review?.rows.some(row => {
    const choice = choices[row.index];
    if (row.status === 'invalid') {
      return choice !== 'skip';
    }
    return ['edited', 'possible'].includes(row.status) && !choice;
  });
  const projection = useMemo(() => {
    if (!review || unresolved || results) {
      return {};
    }
    try {
      return { result: applyTransactionImport(state, review, choices, () => Symbol('import projection')) };
    } catch (failure) {
      return { error: failure.message };
    }
  }, [state, review, choices, unresolved, results]);
  const balances = review && !results ? getImportBalances(state, review, projection.result) : [];
  const expenses = editingRow === null ? [] : [...new Map([
    ...state.transactions,
    ...review.rows.filter(row => row.status !== 'invalid').map(row => row.transaction)
  ].filter(transaction => transaction.type === 'expense' && transaction.id !== undefined)
    .map(transaction => [transaction.id, transaction])).values()];

  return (
    <Dialog title={results ? 'Import results' : review ? 'Review your transactions' : 'Bring your history along'}
      subtitle={`${data.name} · ${data.rows.length} rows`} onClose={dismiss} width={640}>
      {results ? (
        <ImportResults results={results} fields={k_reviewFields} displayField={(field, value) => displayField(state, field, value)}
          onDone={dismiss} onDownloadRecovery={results.changed && !isDemoSession() ? downloadRecovery : undefined} />
      ) : !review ? (
        <>
          <Row style={{ gap: 12, flexWrap: 'wrap' }}>
            {Object.keys(mapping).map(field => (
              <Select key={field} label={k_fieldLabels[field]} value={mapping[field]} onChange={column => setMapping(current => ({ ...current, [field]: column }))} options={columns} style={{ width: '47%' }} />
            ))}
          </Row>
          {!canonical && <Select label="Amount unit" value={unit} onChange={setUnit} options={[{ value: 'euros', label: 'Euros · 12.50 = €12.50' }, { value: 'cents', label: 'Cents · 1250 = €12.50' }]} />}
          <Select label="Import into account" value={targetAccount} onChange={setTargetAccount} options={[
            { value: '', label: 'Map accounts from the file' },
            ...accountOptions
          ]} />
          {accountSources.length > 0 && <H size={18} style={{ marginBottom: 12 }}>
            {hasTargetAccount ? 'Map transfer destinations' : 'Map accounts'}
          </H>}
          {accountSources.map(value => (
            <Select key={value} label={`Account: ${value || '(missing)'}`} value={accounts[value] ?? state.accounts.find(account => String(account.id) === value || account.name === value)?.id ?? ''} onChange={id => setAccounts(current => ({ ...current, [value]: id }))} options={[{ value: '', label: 'Choose an account' }, ...accountOptions]} />
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
          <AccountBalanceReview balances={balances} afterLabel="Projected" />
          <Row style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(k_statusLabels).map(([status, label]) => <T key={status} style={{ fontSize: 12 }}>{review.rows.filter(row => row.status === status).length} {label}</T>)}
          </Row>
          {review.rows.map(row => (
            <View key={row.index} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line, gap: 8 }}>
              <T style={{ fontSize: 12, color: colors.sub }}>Row {row.index + 1}</T>
              <T style={{ fontWeight: '600' }}>{row.transaction.title}</T>
              {row.transaction.amount !== undefined && (
                <T style={{ fontSize: 12, color: colors.sub }}>
                  {row.transaction.date} · {row.transaction.type} · {displayField(state, 'account', row.transaction.account)}
                  {row.transaction.toAccount !== undefined && ` → ${displayField(state, 'toAccount', row.transaction.toAccount)}`}
                  {' · '}{euro(row.transaction.amount)}
                </T>
              )}
              {row.transaction.category !== undefined && <T style={{ fontSize: 12, color: colors.sub }}>{displayField(state, 'category', row.transaction.category)}</T>}
              <T style={{ fontSize: 12, color: colors.sub }}>{k_statusLabels[row.status]}</T>
              {row.status === 'possible' && (
                <View style={{ gap: 4 }}>
                  <T style={{ fontSize: 12, fontWeight: '600' }}>Possible matches in your ledger</T>
                  {row.possibleMatches.map(match => (
                    <T key={match.id} style={{ fontSize: 12, color: colors.sub }}>
                      {`${match.title} · ${match.date} · ${displayField(state, 'account', match.account)} · ${euro(match.amount)}`}
                    </T>
                  ))}
                </View>
              )}
              {row.status === 'edited' && Object.entries(k_reviewFields).filter(([field]) => (row.existing[field] ?? '') !== (row.transaction[field] ?? '')).map(([field, label]) => (
                <T key={field} style={{ fontSize: 12 }}>{label}: {displayField(state, field, row.existing[field])} → {displayField(state, field, row.transaction[field])}</T>
              ))}
              {row.error && <T style={{ color: colors.negative }}>Row {row.index + 1}: {row.error}</T>}
              {row.status === 'invalid' && (
                <Select label={`Row ${row.index + 1} decision`} value={choices[row.index] || ''}
                  onChange={choice => setChoices(current => ({ ...current, [row.index]: choice }))} options={[
                    { value: '', label: 'Correct the source or choose to skip' },
                    { value: 'skip', label: 'Skip this invalid row' }
                  ]} />
              )}
              {editingRow === row.index ? (
                <ImportRowEditor transaction={row.transaction} state={state} expenses={expenses} lockAccount={hasTargetAccount}
                  onUpdate={changes => updateRow(row.index, changes)} onCancel={() => setEditingRow(null)} />
              ) : (!row.normalizationError && row.duplicateOf === undefined && row.transaction.type && (
                <Button small kind="soft" disabled={busy || editingRow !== null} onPress={() => setEditingRow(row.index)}>{`Edit row ${row.index + 1}`}</Button>
              ))}
              {['edited', 'possible'].includes(row.status) && <Select label={`Row ${row.index + 1} decision`} value={choices[row.index] || ''} onChange={choice => setChoices(current => ({ ...current, [row.index]: choice }))} options={row.status === 'edited' ? [{ value: '', label: 'Choose what to keep' }, { value: 'keep', label: 'Keep the existing transaction' }, { value: 'replace', label: 'Use the imported changes' }] : [{ value: '', label: 'Review this possible duplicate' }, { value: 'skip', label: 'Skip this row' }, { value: 'add', label: 'Add as a separate purchase' }]} />}
            </View>
          ))}
          <T style={{ fontSize: 12, color: colors.sub, marginTop: 16 }}>A separate pre-import recovery copy is saved before any change. Existing records stay unless you explicitly approve their edits.</T>
          {projection.error && <T accessibilityRole="alert" style={{ color: colors.negative }}>{projection.error}</T>}
          <Row style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Button kind="soft" disabled={busy || editingRow !== null} onPress={() => setReview(null)}>Back to mapping</Button>
            <Button disabled={busy || unresolved || Boolean(projection.error) || editingRow !== null} onPress={apply}>{busy ? 'Saving…' : 'Import transactions'}</Button>
          </Row>
        </>
      )}
      {!!error && <T accessibilityRole="alert" style={{ color: colors.negative, marginTop: 16 }}>{error}</T>}
    </Dialog>
  );
}
