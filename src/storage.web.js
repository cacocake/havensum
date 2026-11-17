import { k_stateStorageKey, k_snapshotStorageKey } from './storageKeys.js';

function isDemo() {
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

export async function readState() {
  if (isDemo()) {
    return null;
  }
  return JSON.parse(localStorage.getItem(k_stateStorageKey));
}

export async function writeState(state) {
  if (isDemo()) {
    return;
  }
  localStorage.setItem(k_stateStorageKey, JSON.stringify(state));
}

export async function readSnapshot() {
  if (isDemo()) {
    return null;
  }
  return JSON.parse(localStorage.getItem(k_snapshotStorageKey));
}

export async function writeSnapshot(state) {
  if (isDemo()) {
    return;
  }
  localStorage.setItem(k_snapshotStorageKey, JSON.stringify(state));
}
