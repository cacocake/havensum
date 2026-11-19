import { parseSharedDocument } from './sharedFileDocument.js';
import { SharedFileTransportError, k_transportFailureReasons } from './sharedFileTransport.js';

// Reading the shared file and turning transport failures into sync statuses.
export const k_syncStatuses = Object.freeze({
  notConnected: 'notConnected',
  syncing: 'syncing',
  synced: 'synced',
  needsReview: 'needsReview',
  needsJoin: 'needsJoin',
  invalidRemote: 'invalidRemote',
  invalidMerge: 'invalidMerge',
  offline: 'offline',
  reconnect: 'reconnect',
  paused: 'paused',
  retryLater: 'retryLater'
});

const k_statusByFailureReason = Object.freeze({
  [k_transportFailureReasons.offline]: k_syncStatuses.offline,
  [k_transportFailureReasons.expiredSession]: k_syncStatuses.reconnect,
  [k_transportFailureReasons.accessLost]: k_syncStatuses.paused,
  [k_transportFailureReasons.fileMissing]: k_syncStatuses.paused
});

export const k_temporaryFailureReason = 'temporary';

// A transport failure the person can act on keeps its own status; anything
// else is temporary.
export function failureOutcome(error) {
  if (error instanceof SharedFileTransportError && k_statusByFailureReason[error.reason]) {
    return { status: k_statusByFailureReason[error.reason], reason: error.reason };
  }
  return { status: k_syncStatuses.retryLater, reason: k_temporaryFailureReason, message: error.message };
}

export async function readSharedDocument(transport, fileId) {
  let remote;
  try {
    remote = await transport.read(fileId);
  } catch (error) {
    return { outcome: failureOutcome(error) };
  }
  try {
    return { revision: remote.revision, document: parseSharedDocument(remote.content) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    // An invalid remote never overwrites local data; its bytes stay downloadable.
    return { outcome: { status: k_syncStatuses.invalidRemote, message: error.message, remoteContent: remote.content } };
  }
}
