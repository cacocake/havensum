import { clearMissingTransactionCategories, migrateState, validateState, k_currentStateVersion, UnsupportedStateVersionError } from './stateSchema.js';
import { k_stateStorageKey } from './storageKeys.js';

function invalidCopyKey(key, index) {
  const prefix = `${key}:recovery:invalid`;
  return index === 0 ? prefix : `${prefix}:${index}`;
}

function keptCopyKey(key, index) {
  return index === 0 ? key : `${key}:${index}`;
}

function latestKeptCopyIndexKey(key) {
  return `${key}:latest-index`;
}

function latestInvalidCopyIndexKey(key) {
  return `${key}:recovery:invalid:latest-index`;
}

async function retainRecoveryCopy(storage, keyAtIndex, encodedState) {
  for (let index = 0; ; index += 1) {
    const key = keyAtIndex(index);
    const savedCopy = await storage.getItem(key);
    if (savedCopy === encodedState) {
      return index;
    }
    if (savedCopy === null) {
      await storage.setItem(key, encodedState);
      return index;
    }
  }
}

async function retainInvalidCopy(storage, key, encodedValue) {
  const recoveryIndex = await retainRecoveryCopy(storage, index => invalidCopyKey(key, index), encodedValue);
  await storage.setItem(latestInvalidCopyIndexKey(key), String(recoveryIndex));
}

async function readPersistedState(storage, key, parseState = JSON.parse, recoverInvalid = false) {
  const encodedState = await storage.getItem(key);
  if (encodedState === null) {
    return null;
  }
  let state;
  let missingCategories;
  try {
    ({ state, missingCategories } = clearMissingTransactionCategories(parseState(encodedState)));
    validateState(state);
  } catch (error) {
    if (!recoverInvalid || !(error instanceof SyntaxError) || error instanceof UnsupportedStateVersionError) {
      throw error;
    }
    await retainInvalidCopy(storage, key, encodedState);
    return null;
  }
  if (state.version === k_currentStateVersion && !missingCategories.length) {
    return state;
  }
  const migratedState = migrateState(state);
  if (key === k_stateStorageKey && missingCategories.length) {
    const warnings = new Map((state.migrationCategoryWarnings ?? []).map(warning => [warning.transactionId, warning]));
    for (const warning of missingCategories) {
      warnings.set(warning.transactionId, warning);
    }
    migratedState.migrationCategoryWarnings = [...warnings.values()];
  }
  const recoveryKey = `${key}:recovery:v${state.version}`;
  await retainRecoveryCopy(storage, index => index === 0 ? recoveryKey : `${recoveryKey}:${index}`, encodedState);
  await storage.setItem(key, JSON.stringify(migratedState));
  return migratedState;
}

export function createPersistedStorage(getStorage) {
  let operationQueue = Promise.resolve();

  function enqueue(operation) {
    // A failure reaches its caller without poisoning later reads or saves.
    const currentOperation = operationQueue.catch(() => {}).then(operation);
    operationQueue = currentOperation;
    return currentOperation;
  }

  return {
    read(key, parseState) {
      return enqueue(() => readPersistedState(getStorage(), key, parseState));
    },
    readLatestInvalidCopy(key) {
      return enqueue(async () => {
        const storage = getStorage();
        const recordedIndex = await storage.getItem(latestInvalidCopyIndexKey(key));
        if (recordedIndex !== null && /^\d+$/.test(recordedIndex)) {
          const index = Number(recordedIndex);
          if (Number.isSafeInteger(index)) {
            const copy = await storage.getItem(invalidCopyKey(key, index));
            if (copy !== null) {
              return copy;
            }
          }
        }
        // Older installations can have recovery copies without an index.
        let latest = null;
        for (let index = 0; ; index += 1) {
          const copy = await storage.getItem(invalidCopyKey(key, index));
          if (copy === null) {
            return latest;
          }
          latest = copy;
        }
      });
    },
    // Keeps every distinct copy under `key`, `key:1`, `key:2`… and never
    // overwrites an earlier one. The index of the copy written or matched last
    // is recorded so the newest replaced ledger can be found again.
    writeKeptCopy(key, state) {
      const encodedState = JSON.stringify(migrateState(state));
      return enqueue(async () => {
        const storage = getStorage();
        const index = await retainRecoveryCopy(storage, copyIndex => keptCopyKey(key, copyIndex), encodedState);
        await storage.setItem(latestKeptCopyIndexKey(key), String(index));
      });
    },
    // The newest readable copy: the recorded latest first, then earlier ones.
    readLatestKeptCopy(key) {
      return enqueue(async () => {
        const storage = getStorage();
        const copies = [];
        for (let index = 0; ; index += 1) {
          const copy = await storage.getItem(keptCopyKey(key, index));
          if (copy === null) {
            break;
          }
          copies.push(copy);
        }
        const recordedIndex = await storage.getItem(latestKeptCopyIndexKey(key));
        const hasRecordedIndex = recordedIndex !== null && /^\d+$/.test(recordedIndex) && Number(recordedIndex) < copies.length;
        const latestIndex = hasRecordedIndex ? Number(recordedIndex) : copies.length - 1;
        const candidates = [copies[latestIndex], ...copies.slice(0, latestIndex).reverse(), ...copies.slice(latestIndex + 1).reverse()];
        for (const candidate of candidates.filter(copy => copy !== undefined)) {
          try {
            return migrateState(JSON.parse(candidate));
          } catch {
            // An unreadable copy is skipped so an earlier one can still be recovered.
          }
        }
        return null;
      });
    },
    // A non-ledger record. Unreadable bytes are kept as an invalid copy and
    // read as absent, so a damaged value can never block startup.
    readRecord(key, parseRecord) {
      return enqueue(async () => {
        const storage = getStorage();
        const encodedRecord = await storage.getItem(key);
        if (encodedRecord === null) {
          return null;
        }
        try {
          return parseRecord(encodedRecord);
        } catch (error) {
          if (!(error instanceof SyntaxError)) {
            throw error;
          }
          await retainInvalidCopy(storage, key, encodedRecord);
          return null;
        }
      });
    },
    writeRecord(key, record) {
      const encodedRecord = JSON.stringify(record);
      return enqueue(() => getStorage().setItem(key, encodedRecord));
    },
    // Raw saved bytes, read after any queued save so a pending write is included.
    readRaw(key) {
      return enqueue(() => getStorage().getItem(key));
    },
    async write(key, state, { recoverInvalid = false } = {}) {
      // Capture before queuing so later edits cannot change this save.
      const encodedState = JSON.stringify(migrateState(state));
      return enqueue(async () => {
        const storage = getStorage();
        // Protect callers that replace a baseline without reading it first.
        await readPersistedState(storage, key, JSON.parse, recoverInvalid);
        await storage.setItem(key, encodedState);
      });
    }
  };
}
