import { isRecordIdentifier } from './recordIdentity.js';

const k_supportedTypes = new Set(['expense', 'income', 'reimbursement', 'transfer']);
const k_centsPerEuro = 100n;
const k_maximumCentAmount = BigInt(Number.MAX_SAFE_INTEGER);
const k_spendingKinds = new Set(['Fixed', 'Variable', 'Occasional']);
const k_genericTimestampPattern = /^(\d{4}-\d{2}-\d{2})[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
const k_pendingTaskColumns = ['expect_payback', 'expected_payback_amount', 'payback_due_date', 'payback_task_id'];
const k_fieldAliases = {
  title: ['title', 'name', 'description'], amount: ['amount', 'value'],
  date: ['date', 'datetime', 'datecreated'], type: ['type', 'transactiontype'],
  account: ['account_id', 'account', 'accountname'], category: ['category_id', 'category', 'categoryname'],
  note: ['note', 'notes']
};

export function getImportColumns(data) {
  return [...new Set(data.rows.flatMap(row => Object.keys(row)))];
}

export function getImportMapping(data) {
  const columns = getImportColumns(data);
  return Object.fromEntries(Object.entries(k_fieldAliases).map(([field, aliases]) => [
    field, columns.find(column => aliases.includes(column.toLowerCase())) || ''
  ]));
}

function normalizeImportDate(value, canonical) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (canonical || typeof value !== 'string') {
    return value;
  }
  return k_genericTimestampPattern.exec(value)?.[1] ?? value;
}

export function parseImportAmount(value, unit) {
  const text = String(value ?? '').trim();
  const pattern = unit === 'cents' ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
  if (!pattern.test(text)) {
    throw Error('Enter a positive amount with at most two decimals and no thousands separators.');
  }
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  const amount = unit === 'cents' ? BigInt(whole) : BigInt(whole) * k_centsPerEuro + BigInt(fraction.padEnd(2, '0'));
  if (amount <= 0n || amount > k_maximumCentAmount) {
    throw Error('Amount must contain positive safe integer euro cents.');
  }
  return Number(amount);
}

function resolveRecordId(records, identifier, name, label, mappings = {}, displayName = record => record.name) {
  const source = String(identifier || name || '');
  if (Object.hasOwn(mappings, source)) {
    const selected = records.filter(record => String(record.id) === String(mappings[source]));
    if (selected.length !== 1) {
      throw Error(`Map the ${label} explicitly before importing.`);
    }
    return selected[0].id;
  }
  const matches = identifier !== ''
    ? records.filter(record => String(record.id) === String(identifier) || displayName(record) === String(identifier))
    : records.filter(record => displayName(record) === name);
  if (matches.length !== 1) {
    throw Error(`Map the ${label} explicitly before importing.`);
  }
  return matches[0].id;
}

function preserveTransactionIdentifier(state, identifier) {
  if (identifier === undefined || identifier === null || identifier === '') {
    return undefined;
  }
  if (!isRecordIdentifier(identifier)) {
    throw Error('Transaction identifiers must be nonempty text or safe legacy integers.');
  }
  const matches = state.transactions.filter(transaction => String(transaction.id) === String(identifier));
  if (matches.length > 1) {
    throw Error('Transaction IDs are ambiguous. Resolve their identity before importing.');
  }
  return matches.length ? matches[0].id : identifier;
}

export function normalizeImportRows(state, data, options = {}) {
  const mapping = options.mapping || getImportMapping(data);
  const categoryName = category => {
    const parent = state.categories.find(record => record.id === category.parentId);
    return parent ? `${parent.name} / ${category.name}` : category.name;
  };
  return data.rows.map((row, index) => {
    try {
      if (k_pendingTaskColumns.some(column => row[column] !== undefined && row[column] !== '')) {
        throw Error('CSV payback-task metadata is not yet implemented. Keep it in the full JSON backup.');
      }
      const canonical = Object.hasOwn(row, 'schema_version');
      if (canonical && row.schema_version !== '1') {
        throw Error('Unsupported CSV schema version.');
      }
      if (canonical && row.text_encoding && row.text_encoding !== 'apostrophe-v1') {
        throw Error('Unsupported CSV text encoding.');
      }
      const text = column => {
        const value = String(row[column] ?? '');
        if (!canonical || row.text_encoding !== 'apostrophe-v1') {
          return value;
        }
        if (value && !value.startsWith("'")) {
          throw Error(`The ${column} safe-text prefix is missing.`);
        }
        return value.slice(1);
      };
      const currencyColumn = Object.keys(row).find(column => column.toLowerCase() === 'currency');
      const currency = row[currencyColumn];
      if ((canonical || currency !== undefined) && currency !== 'EUR') {
        throw Error('Only EUR is supported.');
      }
      const type = String(row[mapping.type] || (canonical ? '' : 'expense')).toLowerCase();
      if (!k_supportedTypes.has(type)) {
        throw Error('Choose an explicit expense, income, reimbursement or transfer type.');
      }
      const transaction = {
        id: row.id ?? undefined,
        type,
        date: normalizeImportDate(row[mapping.date], canonical),
        title: text(mapping.title),
        amount: parseImportAmount(row[mapping.amount], canonical ? 'euros' : options.unit || (data.backup ? 'cents' : 'euros')),
        account: options.targetAccount === undefined
          ? resolveRecordId(state.accounts, text(mapping.account), text(canonical ? 'account_name' : 'Account'), 'account', options.accounts)
          : resolveRecordId(state.accounts, '', '', 'account', { '': options.targetAccount })
      };
      transaction.id = preserveTransactionIdentifier(state, canonical ? text('id') : row.id);
      const categoryId = text(mapping.category);
      const categoryPath = text(canonical ? 'category_path' : 'Category');
      const needsCategoryMapping = !canonical && !data.backup && type === 'expense';
      if (categoryId || categoryPath || needsCategoryMapping) {
        transaction.category = resolveRecordId(state.categories, categoryId, categoryPath, 'category', options.categories, categoryName);
      }
      if (type === 'transfer') {
        transaction.toAccount = resolveRecordId(state.accounts, text(canonical ? 'to_account_id' : 'toAccount'), text('to_account_name'), 'destination account', options.accounts);
      }
      for (const [column, field] of Object.entries({ linked_id: 'linkedId', note: 'note', external_source: 'externalSource', external_id: 'externalId', loan_id: 'loanId' })) {
        let sourceColumn = column;
        if (field === 'note') {
          sourceColumn = mapping.note;
        } else if (!Object.hasOwn(row, column)) {
          sourceColumn = field;
        }
        if (text(sourceColumn)) {
          transaction[field] = canonical || field === 'note' ? text(sourceColumn) : row[sourceColumn];
        }
      }
      if (row.kind) {
        if (!k_spendingKinds.has(row.kind)) {
          throw Error('Choose Fixed, Variable or Occasional behaviour.');
        }
        transaction.kind = row.kind;
      }
      if (transaction.loanId !== undefined) {
        transaction.loanId = resolveRecordId(state.loans, transaction.loanId, '', 'registered loan');
      }
      if (transaction.linkedId !== undefined) {
        transaction.linkedId = preserveTransactionIdentifier(state, transaction.linkedId);
      }
      return transaction;
    } catch (error) {
      throw Error(`Row ${index + 1}: ${error.message}`);
    }
  });
}
