import { clearMissingTransactionCategories, migrateState } from './stateSchema.js';
import { representedPlanYears } from './planMerge.js';
import { representsInterestSchedules } from './interestMerge.js';

// The shared Drive file (G05/G06): the financial collections both people see,
// wrapped in an envelope that records which write produced it and that
// write's ancestors. Device keys never enter the file.
export const k_sharedFileFormat = 'havensum-shared-file';
export const k_sharedFileFormatVersion = 1;
// Older ancestors are dropped; a device whose known snapshots are all older
// than this falls back to the one-sided-record review instead of guessing.
export const k_lineageLimit = 50;

export const k_sharedStateKeys = Object.freeze([
  'version',
  'accounts',
  'categories',
  'transactions',
  'loans',
  'events',
  // Schema versions 1–2 kept one frozen plan; reading an older file migrates it into `plans`.
  'plan',
  'plans',
  'outlook',
  'paybackTasks',
  'paybackTasksVersion',
  // Owner answer (19 November 2026): the pending missing-category review is shared.
  'migrationCategoryWarnings'
]);

// Theme and display preferences stay per device (G06); the example flag
// describes this installation's data, not the shared file.
export const k_deviceStateKeys = Object.freeze(['demo', 'theme', 'preferences']);

// Placeholders that let the full-state validation run on a ledger that has no
// device keys. They never leave this module.
const k_validationDeviceKeys = Object.freeze({ demo: false, theme: 'light', preferences: {} });

function requireValid(condition, description) {
  if (!condition) {
    throw new SyntaxError(`This shared file cannot be read: ${description}.`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWriteId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Only explicitly shared keys are copied, so an unclassified key stays on the device.
export function sharedLedgerOf(state) {
  const ledger = {};
  for (const key of k_sharedStateKeys) {
    if (state[key] !== undefined) {
      ledger[key] = state[key];
    }
  }
  return ledger;
}

// The reading device's own keys (and any unclassified ones) around a shared ledger.
export function withDeviceKeys(ledger, deviceState) {
  const deviceOnly = {};
  for (const [key, value] of Object.entries(deviceState)) {
    if (!k_sharedStateKeys.includes(key)) {
      deviceOnly[key] = value;
    }
  }
  return { ...deviceOnly, ...sharedLedgerOf(ledger) };
}

// Validates and migrates a shared ledger with the same rules as a stored
// ledger. A transaction whose category is missing opens uncategorized and
// joins the shared missing-category review, as at startup.
export function validateSharedLedger(ledger) {
  requireValid(isRecord(ledger), 'the ledger is missing');
  const { state: reviewable, missingCategories } = clearMissingTransactionCategories({ ...sharedLedgerOf(ledger), ...k_validationDeviceKeys });
  const migrated = migrateState(reviewable);
  if (!missingCategories.length) {
    return sharedLedgerOf(migrated);
  }
  const warnings = new Map((migrated.migrationCategoryWarnings ?? []).map(warning => [warning.transactionId, warning]));
  for (const warning of missingCategories) {
    warnings.set(warning.transactionId, warning);
  }
  return sharedLedgerOf({ ...migrated, migrationCategoryWarnings: [...warnings.values()] });
}

function lineageAfter(parent) {
  if (!parent) {
    return [];
  }
  return [...parent.lineage, parent.writeId].slice(-k_lineageLimit);
}

// `parent` is the parsed document this write was merged against, or null for a new file.
export function createSharedDocument(state, { writeId, parent }) {
  const document = {
    format: k_sharedFileFormat,
    formatVersion: k_sharedFileFormatVersion,
    writeId,
    lineage: lineageAfter(parent),
    ledger: validateSharedLedger(sharedLedgerOf(state))
  };
  return JSON.stringify(document);
}

export function parseSharedDocument(encodedDocument) {
  let document;
  try {
    document = JSON.parse(encodedDocument);
  } catch {
    throw new SyntaxError('This shared file cannot be read: it is not valid JSON.');
  }
  requireValid(isRecord(document) && document.format === k_sharedFileFormat, 'it is not a Havensum shared file');
  requireValid(document.formatVersion === k_sharedFileFormatVersion, 'it was written by a newer Havensum version');
  requireValid(isWriteId(document.writeId), 'its write ID is missing');
  requireValid(Array.isArray(document.lineage) && document.lineage.every(isWriteId), 'its write history is damaged');
  let ledger;
  try {
    ledger = validateSharedLedger(document.ledger);
  } catch (error) {
    throw new SyntaxError(`This shared file cannot be read: ${error.message}`);
  }
  // A ledger written by an older schema cannot represent every plan year or
  // rate schedule; the merge must not read those gaps as deletions.
  const representation = {
    remotePlanYears: representedPlanYears(document.ledger),
    remoteHasInterestSchedules: representsInterestSchedules(document.ledger)
  };
  return { writeId: document.writeId, lineage: document.lineage, ledger, representation };
}

// The write IDs a document descends from, including its own.
export function ancestryOf(document) {
  return new Set([...document.lineage, document.writeId]);
}
