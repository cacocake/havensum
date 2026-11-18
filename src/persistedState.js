import { migrateState, validateState, k_currentStateVersion } from './stateSchema.js';

async function readPersistedState(storage, key, parseState = JSON.parse) {
  const encodedState = await storage.getItem(key);
  if (encodedState === null) {
    return null;
  }
  const state = parseState(encodedState);
  validateState(state);
  if (state.version === k_currentStateVersion) {
    return state;
  }
  const migratedState = migrateState(state);
  const recoveryKey = `${key}:recovery:v${state.version}`;
  if (await storage.getItem(recoveryKey) === null) {
    await storage.setItem(recoveryKey, encodedState);
  }
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
    async write(key, state) {
      // Capture before queuing so later edits cannot change this save.
      const encodedState = JSON.stringify(migrateState(state));
      return enqueue(async () => {
        const storage = getStorage();
        // Protect callers that replace a baseline without reading it first.
        await readPersistedState(storage, key);
        await storage.setItem(key, encodedState);
      });
    }
  };
}
