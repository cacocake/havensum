import { ancestryOf, validateSharedLedger } from './sharedFileDocument.js';

// This installation's link to one shared file (S03): the file ID, the last
// remote revision it saw, and the snapshots of the file it has already
// incorporated into its local ledger. A snapshot is only a valid three-way
// baseline while the local ledger descends from it, so a snapshot is recorded
// only after the local ledger containing it is saved.
export const k_sharedFileBindingVersion = 1;
export const k_knownSnapshotLimit = 5;

function requireValid(condition, description) {
  if (!condition) {
    throw new SyntaxError(`Invalid shared-file link: ${description}.`);
  }
}

function snapshotOf(document) {
  return { writeId: document.writeId, ledger: document.ledger };
}

export function createBinding(fileId, { revision, snapshots }) {
  return recordIncorporatedSnapshots(
    { version: k_sharedFileBindingVersion, fileId, lastSeenRevision: revision, knownSnapshots: [] },
    snapshots,
    revision
  );
}

// Keeps the newest snapshots in the order they were incorporated. The
// baseline in use (`pinnedWriteId`) is never dropped, so a file that keeps
// being rewritten from that baseline can still be merged.
export function recordIncorporatedSnapshots(binding, documents, revision, { pinnedWriteId = null } = {}) {
  const knownSnapshots = [...binding.knownSnapshots];
  for (const document of documents) {
    const existingIndex = knownSnapshots.findIndex(snapshot => snapshot.writeId === document.writeId);
    if (existingIndex !== -1) {
      knownSnapshots.splice(existingIndex, 1);
    }
    knownSnapshots.push(snapshotOf(document));
  }
  return { ...binding, lastSeenRevision: revision, knownSnapshots: newestSnapshots(knownSnapshots, pinnedWriteId) };
}

function newestSnapshots(knownSnapshots, pinnedWriteId) {
  const newest = knownSnapshots.slice(-k_knownSnapshotLimit);
  const pinned = knownSnapshots.find(snapshot => snapshot.writeId === pinnedWriteId);
  if (!pinned || newest.includes(pinned)) {
    return newest;
  }
  return [pinned, ...knownSnapshots.slice(-(k_knownSnapshotLimit - 1))];
}

// The newest incorporated snapshot ({ writeId, ledger }) that the remote document descends from.
// Null means there is no common ancestor: a different file, a replaced file
// or a history older than this device remembers. That needs the
// one-sided-record review, never a guessed three-way merge.
export function selectBaseline(binding, fileId, remoteDocument) {
  if (!binding || binding.fileId !== fileId) {
    return null;
  }
  const ancestry = ancestryOf(remoteDocument);
  return binding.knownSnapshots.findLast(snapshot => ancestry.has(snapshot.writeId)) ?? null;
}

export function parseBinding(encodedBinding) {
  const binding = JSON.parse(encodedBinding);
  requireValid(binding !== null && typeof binding === 'object', 'not a record');
  requireValid(binding.version === k_sharedFileBindingVersion, 'unsupported version');
  requireValid(typeof binding.fileId === 'string' && binding.fileId.trim().length > 0, 'file ID');
  requireValid(binding.lastSeenRevision === null || typeof binding.lastSeenRevision === 'string', 'revision');
  requireValid(Array.isArray(binding.knownSnapshots), 'snapshots');
  const knownSnapshots = binding.knownSnapshots.map(snapshot => {
    requireValid(snapshot !== null && typeof snapshot === 'object' && typeof snapshot.writeId === 'string' && snapshot.writeId.length > 0, 'snapshot write ID');
    return { writeId: snapshot.writeId, ledger: validateSharedLedger(snapshot.ledger) };
  });
  return { ...binding, knownSnapshots };
}
