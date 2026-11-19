import { validatePaybackState } from './paybackState.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { k_stateStorageKey, k_snapshotStorageKey, k_importRecoveryStorageKey, k_mergeRecoveryStorageKey, k_planInvitationDeferralKey, k_restoreRecoveryStorageKey, k_sharedFileBindingStorageKey, k_sharedFileJoinRecoveryStorageKey } from './storageKeys.js';
import { parseBinding } from './sharedFileBinding.js';
import { parseMergeBaseline, parseStoredYear } from './storageSerialization.js';
import { createPersistedStorage } from './persistedState.js';

const k_persistedStorage = createPersistedStorage(() => AsyncStorage);

export async function readSavedLedgerCopy() {
  return k_persistedStorage.readRaw(k_stateStorageKey);
}

export function isDemoSession() {
  return false;
}

export async function readState() {
  return k_persistedStorage.read(k_stateStorageKey);
}

export async function writeState(state) {
  await k_persistedStorage.write(k_stateStorageKey, state);
}

export async function readSnapshot() {
  return k_persistedStorage.read(k_snapshotStorageKey, parseMergeBaseline);
}

export async function readInvalidSnapshotCopy() {
  return k_persistedStorage.readLatestInvalidCopy(k_snapshotStorageKey);
}

export async function writeSnapshot(state) {
  await k_persistedStorage.write(k_snapshotStorageKey, state, { recoverInvalid: true });
}

export async function writeImportRecovery(state) {
  await k_persistedStorage.write(k_importRecoveryStorageKey, state, { recoverInvalid: true });
}

export async function readImportRecovery() {
  return k_persistedStorage.read(k_importRecoveryStorageKey);
}

// The ledger as it was before a reviewed backup merge, separate from CSV import recovery.
export async function writeMergeRecovery(state) {
  await k_persistedStorage.write(k_mergeRecoveryStorageKey, state, { recoverInvalid: true });
}

export async function readMergeRecovery() {
  return k_persistedStorage.read(k_mergeRecoveryStorageKey);
}

// The calendar year whose planning invitation was deferred with Later.
export async function readPlanInvitationDeferral() {
  return parseStoredYear(await AsyncStorage.getItem(k_planInvitationDeferralKey));
}

export async function writePlanInvitationDeferral(year) {
  await AsyncStorage.setItem(k_planInvitationDeferralKey, String(year));
}

// The device ledger as it was before each full restore. Every distinct copy is kept.
export async function writeRestoreRecovery(state) {
  await k_persistedStorage.writeKeptCopy(k_restoreRecoveryStorageKey, state);
}

export async function readRestoreRecovery() {
  return k_persistedStorage.readLatestKeptCopy(k_restoreRecoveryStorageKey);
}

// This installation's shared Drive file link. A damaged link is kept as an
// invalid copy and read as not connected.
export async function readSharedFileBinding() {
  return k_persistedStorage.readRecord(k_sharedFileBindingStorageKey, parseBinding);
}

export async function writeSharedFileBinding(binding) {
  await k_persistedStorage.writeRecord(k_sharedFileBindingStorageKey, binding);
}

// The device ledger as it was before each shared-file adoption or join merge. Every distinct copy is kept.
export async function writeSharedFileJoinRecovery(state) {
  await k_persistedStorage.writeKeptCopy(k_sharedFileJoinRecoveryStorageKey, state);
}

export async function readSharedFileJoinRecovery() {
  return k_persistedStorage.readLatestKeptCopy(k_sharedFileJoinRecoveryStorageKey);
}
