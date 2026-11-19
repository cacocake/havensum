// Stable identities: payload migrations preserve these keys and retain original
// serialized values under separate per-version recovery keys.
export const k_stateStorageKey = 'melo-state-v1';
export const k_snapshotStorageKey = 'melo-sync-base';
export const k_importRecoveryStorageKey = 'havensum-import-recovery-v1';
export const k_mergeRecoveryStorageKey = 'havensum-merge-recovery-v1';
// Per-installation preference, deliberately outside the shared ledger.
export const k_planInvitationDeferralKey = 'havensum-plan-invitation-deferral-v1';
export const k_restoreRecoveryStorageKey = 'havensum-restore-recovery-v1';
