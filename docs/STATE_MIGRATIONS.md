# State schema and recovery

The migration foundation is on `codex/state-migration-recovery`, based on `develop`. It is separate from the unmerged identifier branch. Schema version 2 establishes a validated storage boundary without changing record IDs, money, reimbursement links, category inheritance, custom fields or frozen plans. Version 1 is the supported legacy Melo schema; unsupported versions fail visibly rather than being guessed or downgraded.

The active keys remain `melo-state-v1` and `melo-sync-base`. Their names are storage identities, not the current payload schema version. Keeping them avoids hiding existing local data during future branding work.

Before replacing a version 1 value, storage saves its exact original serialized text to the corresponding recovery key:

| Active value | Original version 1 copy |
| --- | --- |
| Ledger | `melo-state-v1:recovery:v1` |
| Merge baseline | `melo-sync-base:recovery:v1` |

The first original copy for a source version is retained. Repeated reads, saves, baseline exports and migration retries do not overwrite or prune it. Future schema steps must explicitly support their source versions and preserve that version's original in a separate recovery key. These copies contain private financial data; they belong in device storage, never Git.

Migration validates before writing, saves recovery before the active replacement, and only returns a usable state after both writes succeed. A failed recovery write leaves the active value untouched. If replacement fails after recovery succeeds, the next load retries while retaining that recovery copy. Already-current values are validated without a migration write. Invalid JSON, invalid known state fields and unsupported schemas block startup; absence alone permits example initialization. Retry loading handles temporary storage failures. Invalid input to a save cannot replace an existing ledger or baseline.

Both platform adapters share this behavior. Reads, migrations and saves are serialized within an app instance so an in-flight migration cannot overwrite a later save. Saves capture their input before queuing. This is not a cross-tab or cross-device revision/locking protocol.

Full versioned JSON imports are validated and migrated in memory for preview, and backup merge validates remote data and the selected result. The supplied file is not rewritten. Transaction-array JSON retains its existing mapping flow. When saving a replacement for an invalid merge baseline, storage preserves the original bytes first. Settings can download the latest distinct invalid baseline copy. Startup recovery can download the active saved ledger bytes when that ledger cannot open. A complete JSON restore/recovery interface, removal controls and migration of future product fields remain pending. Do not describe this foundation as a reviewed full-state restore flow.

Verification covers legacy ledger/baseline independence, raw recovery retention, frozen targets and links, category inheritance, scheduled obligations, corrupt and future schemas, quota failure/retry, interrupted migration, native save ordering, and browser startup/backup review. Android Hermes compilation remains separate from installation or physical-device verification.
