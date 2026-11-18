import AsyncStorage from '@react-native-async-storage/async-storage';
import { k_stateStorageKey, k_snapshotStorageKey } from './storageKeys.js';
import { parseMergeBaseline } from './storageSerialization.js';
import { createPersistedStorage } from './persistedState.js';

const k_persistedStorage = createPersistedStorage(() => AsyncStorage);

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

export async function writeSnapshot(state) {
  await k_persistedStorage.write(k_snapshotStorageKey, state);
}
