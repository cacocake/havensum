import { k_stateStorageKey, k_snapshotStorageKey } from './storageKeys.js';
import { parseMergeBaseline } from './storageSerialization.js';
import { createPersistedStorage } from './persistedState.js';

const k_persistedStorage = createPersistedStorage(() => localStorage);

export async function readSavedLedgerCopy() {
  return isDemoSession() ? null : localStorage.getItem(k_stateStorageKey);
}

export function isDemoSession() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export async function readState() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.read(k_stateStorageKey);
}

export async function writeState(state) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.write(k_stateStorageKey, state);
}

export async function readSnapshot() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.read(k_snapshotStorageKey, parseMergeBaseline);
}

export async function readInvalidSnapshotCopy() {
  return isDemoSession() ? null : k_persistedStorage.readLatestInvalidCopy(k_snapshotStorageKey);
}

export async function writeSnapshot(state) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.write(k_snapshotStorageKey, state, { recoverInvalid: true });
}
