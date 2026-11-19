import { SharedFileTransportError } from '../../src/sharedFileTransport.js';

// An in-memory stand-in for the external Drive boundary. It follows the
// sharedFileTransport contract, keeps every revision, and lets a test inject
// another device's write or a failure at a chosen moment.
export function createInMemoryDriveTransport() {
  const files = new Map();
  const hooks = { beforeRead: [], afterWrite: [], failNext: new Map() };
  let revisionCounter = 0;
  let fileCounter = 0;

  function nextRevision() {
    revisionCounter += 1;
    return `rev-${revisionCounter}`;
  }

  function takeFailure(operation) {
    const reason = hooks.failNext.get(operation);
    if (reason) {
      hooks.failNext.delete(operation);
      throw new SharedFileTransportError(reason);
    }
  }

  function requireFile(fileId) {
    const file = files.get(fileId);
    if (!file) {
      throw new SharedFileTransportError('fileMissing');
    }
    return file;
  }

  function storeRevision(fileId, content) {
    const revision = nextRevision();
    requireFile(fileId).revisions.push({ revision, content });
    return revision;
  }

  const transport = {
    async create({ content, partnerEmail }) {
      takeFailure('create');
      fileCounter += 1;
      const fileId = `file-${fileCounter}`;
      files.set(fileId, { partnerEmail, revisions: [] });
      return { fileId, revision: storeRevision(fileId, content) };
    },
    async read(fileId) {
      takeFailure('read');
      const pending = hooks.beforeRead.shift();
      if (pending) {
        await pending();
      }
      const head = requireFile(fileId).revisions.at(-1);
      return { revision: head.revision, content: head.content };
    },
    async write(fileId, content) {
      takeFailure('write');
      const revision = storeRevision(fileId, content);
      const pending = hooks.afterWrite.shift();
      if (pending) {
        await pending();
      }
      return { revision };
    }
  };

  return {
    transport,
    // Simulates a partner or a manual Drive edit replacing the content.
    replaceContent(fileId, content) {
      return storeRevision(fileId, content);
    },
    headContent(fileId) {
      return requireFile(fileId).revisions.at(-1).content;
    },
    revisionCount(fileId) {
      return requireFile(fileId).revisions.length;
    },
    partnerEmailOf(fileId) {
      return requireFile(fileId).partnerEmail;
    },
    deleteFile(fileId) {
      files.delete(fileId);
    },
    failNext(operation, reason) {
      hooks.failNext.set(operation, reason);
    },
    // Runs once, after the next write has landed and before it returns.
    onNextWriteLanded(action) {
      hooks.afterWrite.push(action);
    },
    onNextRead(action) {
      hooks.beforeRead.push(action);
    }
  };
}
