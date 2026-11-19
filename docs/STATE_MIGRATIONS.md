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

## Version 4 · scheduled savings interest (SAVINGS-1)

Each account may hold `interestSchedule`, a list of `{ since: 'YYYY-MM', rate }` periods with unique start months and non-negative effective annual percentages. A period runs through the month before the next one starts; the last is ongoing, and a 0% successor ends a promotional rate. Version 4 ledgers reject the legacy `interest`/`interestStart` fields.

Migration from versions 1–3 turns a legacy rate with a start month into the first period. A legacy rate without a start month becomes `unscheduledInterest`; it earns nothing until the owner chooses a start month in the account editor. Exact earlier bytes are kept under `…:recovery:v1`, `…:recovery:v2` or `…:recovery:v3`, and earlier recovery copies are kept.

Compounding is unchanged: the effective annual rate becomes a monthly rate, interest is rounded to integer cents, and at most one entry is posted per account and completed month using the rate in effect for that month. Recorded entries are never regenerated, so editing rates never changes recorded interest. After the first period, new periods start in the current month or later and only current or future periods can be removed; historical corrections belong to LEDGER-2.

Reviewed merge treats an older (v1–v3) backup as unable to represent a schedule: if its single rate is already a period in this device's schedule, the schedule stays; otherwise the schedule stays and the legacy rate is offered as a conflict to review. The Excel export lists rate periods as text in an `interestRates` column.

## Interest corrections and bank-interest choices (LEDGER-2, version 4, additive)

No schema version change: both fields are optional and older version 4 ledgers stay valid. An app build from before LEDGER-2 would report a ledger holding a negative correction as unreadable data rather than as a newer version; every device should run the same build.

- A transaction with `correctsInterestMonth: 'YYYY-MM'` is a reviewed interest correction (id `interest-correction-<account>-<month>-<n>`). It is Interest income dated in that month and is the only entry whose integer-cent amount may be negative (non-zero). It never replaces or edits the month's app entry (`interest-<account>-<month>`) or bank entries. Canonical CSV carries it in a `corrects_interest_month` column, and JSON backups and the workbook's raw sheet in `correctsInterestMonth`, each with a signed amount; every other imported amount stays positive. An app interest entry is recognised by its ID even if re-dated, and startup never posts app interest for a month that holds corrections.
- An account may hold `interestBankChoices`, a list of `{ month: 'YYYY-MM', choice: 'bank' | 'both' }` with unique months. A month that holds bank interest (Interest income that is neither the app entry nor a correction) gets no app entry at startup unless its choice is `both`. Reviewed merge compares the field like any other account field.

## Full restore (BACKUP-1)

Settings → **Restore full backup** reads a full JSON backup of any supported version, applies the missing-category review and the normal migrations in memory, and shows a preview: record counts for this device beside the backup, archived plan years and revisions, and accounts with scheduled rates. Transaction lists, unreadable files, invalid ledgers and newer versions are refused before any preview. Replacing requires an explicit confirmation. The current ledger is first kept as a pre-restore copy (`havensum-restore-recovery-v1`, then `:1`, `:2`… — every distinct copy is retained), separate from import and merge recovery; if that copy fails nothing is replaced, and if saving the backup fails the ledger stays as it was. A preview no longer applies once the device ledger has changed, including a save from another tab. The restored ledger receives the same startup preparation as a loaded one before it is saved. The merge baseline is not changed. **Download pre-restore copy** exports the newest kept copy. This is distinct from reviewed merge (combining devices) and transaction import (appending entries).

## Year amounts on recurring planned costs (FORECAST-2)

A recurring planned cost (an event without `year`) may hold `yearAmounts`, a record of four-digit years to non-negative integer cents. It replaces the usual `amount` for that year only and is written when the owner accepts a suggestion and freezes the plan. One-off planned costs reject it. It is an optional field within schema version 4, so there is no migration or recovery copy: older ledgers and backups lack it and keep working. An older app version would ignore the field and use the usual amount. Reviewed merge treats `yearAmounts` as one field, so different year amounts set on two devices are offered as a conflict.

## Month moves on recurring planned costs (FORECAST-2 follow-up)

A recurring planned cost may also hold `monthFromYear`, a record of four-digit years to month numbers (1–12): from that year onwards the cost occurs in that month, and earlier years keep `month`, its original month. It is written when the owner moves the cost in Year ahead (owner decisions F16/F17), from this year (only when its old and new month are both this month or later) or a later one; a move replaces later moves, and moving back to the month already in effect drops the entry, so `month` itself never changes. One-off costs (with `year`) cannot hold it. It is optional and validated in schema v4, so no migration is needed: older ledgers and backups simply lack it. A full restore keeps it, and the three-way merge treats it as one field, so two devices moving one cost differently produce a conflict to review. An older app version would ignore it and keep the cost in its original month in every year.

## Start year on recurring planned costs (PLAN-3 follow-up)

A recurring planned cost may hold `fromYear`, a four-digit year: the cost occurs from that year onwards and not before. It is written when the owner adds a cost marked **Repeats every year** in a year's plan interview, set to the year being drafted (owner decision P04). Plans, Expected costs/Expected savings, Year ahead, comparable-cost evidence, draft estimates, the planned-cost picker and moves all skip earlier years; a move can start no earlier than `fromYear`. One-off costs (with `year`) cannot hold it. A recurring cost without it keeps occurring in every year, so existing ledgers and backups are unchanged. It is optional and validated in schema v4, so no migration is needed. A full restore keeps it, and the three-way merge treats it as one field: two devices setting different start years produce a conflict to review. An older app version would ignore it and apply the cost to every year, including years before it starts.

## Shared-file link and join recovery (DRIVE-2a)

Two device-only keys support the shared Drive file; neither changes the ledger schema. `havensum-shared-file-binding-v1` holds this installation's link: the file ID, the last-seen revision and up to five snapshots of the shared ledger (each validated and migrated on read like a stored ledger). Unreadable link bytes are kept under `…:recovery:invalid` and read as not connected. `havensum-shared-file-join-recovery-v1` keeps every distinct device ledger replaced by adopting or merging a shared file (`:1`, `:2`…), like the restore recovery copies. `melo-sync-base` and its recovery copies are unchanged and remain the manual backup-merge baseline. Example sessions store neither key.
