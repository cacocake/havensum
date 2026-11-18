import { validatePaybackState } from './paybackState.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { k_stateStorageKey, k_snapshotStorageKey } from './storageKeys.js';
import { parseMergeBaseline } from './storageSerialization.js';

let g_stateWriteQueue = Promise.resolve();

export function isDemoSession() {
  return false;
}

export async function readState() {
  const encodedState = await AsyncStorage.getItem(k_stateStorageKey);
  return encodedState ? validatePaybackState(JSON.parse(encodedState)) : null;
}

export function writeState(state) {
  const encodedState = JSON.stringify(validatePaybackState(state));
  // A failed write is still reported to its caller, but must not poison later saves.
  const currentWrite = g_stateWriteQueue.catch(() => {}).then(() => (
    AsyncStorage.setItem(k_stateStorageKey, encodedState)
  ));
  g_stateWriteQueue = currentWrite;
  return currentWrite;
}

export async function readSnapshot() {
  const encodedSnapshot = await AsyncStorage.getItem(k_snapshotStorageKey);
  return encodedSnapshot ? validatePaybackState(parseMergeBaseline(encodedSnapshot)) : null;
}

export async function writeSnapshot(state) {
  await AsyncStorage.setItem(k_snapshotStorageKey, JSON.stringify(validatePaybackState(state)));
}
