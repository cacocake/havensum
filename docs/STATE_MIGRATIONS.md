# State schema and recovery

The migration foundation is integrated into `develop`. Schema version 2 establishes a validated storage boundary and preserves record IDs, money, reimbursement links, category inheritance, custom fields and frozen plans. Version 1 is the supported legacy Melo schema. Unsupported versions stop with a recovery message.

The active keys remain `melo-state-v1` and `melo-sync-base`. Their names are storage identities, not the current payload schema version. Keeping them avoids hiding existing local data during future branding work.

Before replacing a version 1 value, storage saves its exact original serialized text to the corresponding recovery key:

| Active value | Original version 1 copy |
| --- | --- |
| Ledger | `melo-state-v1:recovery:v1` |
| Merge baseline | `melo-sync-base:recovery:v1` |

The first original copy for a source version is retained. Repeated reads, saves, baseline exports and migration retries do not overwrite or prune it. Future schema steps must explicitly support their source versions and preserve that version's original in a separate recovery key. These copies contain private financial data; they belong in device storage, never Git.

Migration validates before writing, saves recovery before the active replacement, and only returns a usable state after both writes succeed. A failed recovery write leaves the active value untouched. If replacement fails after recovery succeeds, the next load retries while retaining that recovery copy. Already-current values without missing category references are validated without a migration write. Invalid JSON, other invalid known state fields and unsupported schemas block startup. Absence alone permits example initialization. Retry loading handles temporary storage failures. Invalid input to a save cannot replace an existing ledger or baseline.

Both platform adapters share this behavior. Reads, migrations and saves are serialized within an app instance so an in-flight migration cannot overwrite a later save. Saves capture their input before queuing. This is not a cross-tab or cross-device revision/locking protocol.

A recognized ledger whose transaction refers to a missing category opens with that transaction uncategorized. The migration retains the exact original before saving, using numbered copies if the version already has a different original. The startup review retains the affected rows until accepted. The reviewed backup merge also identifies affected rows and allows renaming, selecting a category or keeping a row uncategorized before applying. The uploaded file stays unchanged. Category corrections preserve transaction IDs, amounts, dates, account links and reimbursement links.

Full versioned JSON imports are validated and migrated in memory for preview, and backup merge validates remote data and the selected result. The supplied file is not rewritten. Transaction-array JSON retains its existing mapping flow. When saving a replacement for an invalid merge baseline, storage preserves the original bytes first. Settings can download the most recently recovered baseline, even if those bytes were already archived. Startup recovery can download the active saved ledger bytes when that ledger cannot open. A complete JSON restore/recovery interface, removal controls and migration of future product fields remain pending. Do not describe this foundation as a reviewed full-state restore flow.

Verification covers legacy ledger/baseline independence, raw recovery retention, frozen targets and links, category inheritance, scheduled obligations, corrupt and future schemas, quota failure/retry, interrupted migration, native save ordering, and browser startup/backup review. Android Hermes compilation remains separate from installation or physical-device verification.

## Version 3 · archived plans (PLAN-1)

Version 3 replaces the single `plan` with `plans`, a record keyed by four-digit year. Each year holds a non-empty array of approved revisions in approval order; the last one is the latest. Every revision keeps the version 2 plan fields and gains a unique `id`. New revisions use collision-resistant IDs, so two devices can each approve a "revision 2" without colliding. A migrated legacy plan gets a content-derived ID (`plan-legacy-<year>-r<revision>-<digest>`), so the same legacy snapshot migrates identically on every device. A null plan becomes an empty archive. Year, revision number, amounts, overrides and scheduled changes are retained exactly. Version 3 ledgers that still contain `plan` are rejected.

Version 1 and 2 ledgers and baselines migrate on read. Their exact bytes are kept under `…:recovery:v1` or `…:recovery:v2` before replacement, with the same recovery-first rules as above. Storage keys are unchanged.

Approving a revision appends it to its year and leaves earlier revisions and other years untouched. Months before the revision start are copied exactly from the latest approved snapshot, including months it never planned. The interview fixes its start month when it opens and rechecks the calendar on save: a later start month refreshes the preview and requires a new approval, and a year that has become past is read-only and blocks the save.

Reviewed backup merge compares each year's whole revision history. Independent years merge silently; concurrent changes to one year are offered as two whole histories, so matching revision numbers cannot overwrite one another. A version 1/2 backup can contribute only the year it holds, and years it could never represent are kept. Before applying a reviewed merge, the device ledger is written to `havensum-merge-recovery-v1`, separate from CSV import recovery; a failed recovery write blocks the merge. Full replacement restore is BACKUP-1.
