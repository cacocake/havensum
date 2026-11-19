// The boundary to the external file store (Google Drive in DRIVE-2b). The
// sync core depends only on this contract:
//
//   create({ content, partnerEmail }) → Promise<{ fileId, revision }>
//     Creates the file in the person's own storage and shares it with the
//     partner as editor (G02).
//   read(fileId) → Promise<{ revision, content }>
//     The current content and an opaque revision string.
//   write(fileId, content) → Promise<{ revision }>
//     An unconditional replacement. Drive v3 offers no compare-and-swap, so
//     the core detects lost races after writing instead of relying on one.
//
// Every failure the person can act on is a SharedFileTransportError with one
// of the reasons below. Any other error is treated as a temporary failure.

export const k_transportFailureReasons = Object.freeze({
  offline: 'offline',
  // The web access token expired; the person must reconnect (G10).
  expiredSession: 'expiredSession',
  // Sign-out, revoked app access or removed sharing (G04).
  accessLost: 'accessLost',
  // The file was deleted or trashed (G04).
  fileMissing: 'fileMissing'
});

export class SharedFileTransportError extends Error {
  constructor(reason, message = reason) {
    super(message);
    this.name = 'SharedFileTransportError';
    this.reason = reason;
  }
}
