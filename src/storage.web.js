import { k_stateStorageKey, k_snapshotStorageKey } from './storageKeys.js';
import { parseMergeBaseline } from './storageSerialization.js';

export function isDemoSession() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export async function readState() {
  if (isDemoSession()) {
    return null;
  }
  return JSON.parse(localStorage.getItem(k_stateStorageKey));
}

export async function writeState(state) {
  if (isDemoSession()) {
    return;
  }
  localStorage.setItem(k_stateStorageKey, JSON.stringify(state));
}

export async function readSnapshot() {
  if (isDemoSession()) {
    return null;
  }
  return parseMergeBaseline(localStorage.getItem(k_snapshotStorageKey));
}

export async function writeSnapshot(state) {
  if (isDemoSession()) {
    return;
  }
  localStorage.setItem(k_snapshotStorageKey, JSON.stringify(state));
}
