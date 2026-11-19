import { k_stateStorageKey, k_snapshotStorageKey, k_importRecoveryStorageKey, k_mergeRecoveryStorageKey, k_planInvitationDeferralKey, k_restoreRecoveryStorageKey, k_sharedFileBindingStorageKey, k_sharedFileJoinRecoveryStorageKey } from './storageKeys.js';
import { parseBinding } from './sharedFileBinding.js';
import { parseMergeBaseline, parseStoredYear } from './storageSerialization.js';
import { createPersistedStorage } from './persistedState.js';

const k_persistedStorage = createPersistedStorage(() => localStorage);

export async function readSavedLedgerCopy() {
  return isDemoSession() ? null : k_persistedStorage.readRaw(k_stateStorageKey);
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

export async function writeImportRecovery(state) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.write(k_importRecoveryStorageKey, state, { recoverInvalid: true });
}

export async function readImportRecovery() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.read(k_importRecoveryStorageKey);
}

// The ledger as it was before a reviewed backup merge, separate from CSV import recovery.
export async function writeMergeRecovery(state) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.write(k_mergeRecoveryStorageKey, state, { recoverInvalid: true });
}

export async function readMergeRecovery() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.read(k_mergeRecoveryStorageKey);
}

// The calendar year whose planning invitation was deferred with Later.
export async function readPlanInvitationDeferral() {
  if (isDemoSession()) {
    return null;
  }
  return parseStoredYear(localStorage.getItem(k_planInvitationDeferralKey));
}

export async function writePlanInvitationDeferral(year) {
  if (isDemoSession()) {
    return;
  }
  localStorage.setItem(k_planInvitationDeferralKey, String(year));
}

// The device ledger as it was before each full restore. Every distinct copy is kept.
export async function writeRestoreRecovery(state) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.writeKeptCopy(k_restoreRecoveryStorageKey, state);
}

export async function readRestoreRecovery() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.readLatestKeptCopy(k_restoreRecoveryStorageKey);
}

// This installation's shared Drive file link. A damaged link is kept as an
// invalid copy and read as not connected.
export async function readSharedFileBinding() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.readRecord(k_sharedFileBindingStorageKey, parseBinding);
}

export async function writeSharedFileBinding(binding) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.writeRecord(k_sharedFileBindingStorageKey, binding);
}

// The device ledger as it was before each shared-file adoption or join merge. Every distinct copy is kept.
export async function writeSharedFileJoinRecovery(state) {
  if (isDemoSession()) {
    return;
  }
  await k_persistedStorage.writeKeptCopy(k_sharedFileJoinRecoveryStorageKey, state);
}

export async function readSharedFileJoinRecovery() {
  if (isDemoSession()) {
    return null;
  }
  return k_persistedStorage.readLatestKeptCopy(k_sharedFileJoinRecoveryStorageKey);
}
