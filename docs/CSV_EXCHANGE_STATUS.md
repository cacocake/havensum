# CSV exchange implementation

Work is isolated on `codex/csv-exchange`, created from `develop` after the owner authorized development to continue while Claude is unavailable. Foundation, independent Expected savings and branding branches remain unmerged. This branch uses baseline branding except for new Havensum CSV filenames/copy; integrate branding before final product presentation.

## Implemented

- Canonical UTF-8/comma/CRLF transaction export: schema version 1, exact integer-cent to decimal conversion, explicit EUR and four financial types, stable IDs, account/category IDs and names/paths, transfer destination, original-expense link, behaviour override, note, loan reference and scoped external provenance.
- `apostrophe-v1` safe text encoding: every nonempty textual cell receives one leading apostrophe and each row declares its encoding. Import removes exactly one only when the marker is present. Literal apostrophes, formulas, Unicode, commas, quotes, multiline notes and leading-zero IDs survive. Quoting alone is not treated as formula protection. Invalid controlled fields are rejected before export.
- A blank Date/Title/Amount/Account/Category/Note template, with expenses as default, and a separately downloadable short guide. No sample purchases are included in the blank file. Browser downloads and native UTF-8 sharing use the same serializers. Semicolon/decimal-comma input is covered by a synthetic Portugal fixture.
- A shared native/browser mapping and review dialog, extracted from Screens. Unknown/ambiguous accounts/categories require explicit mapping, including missing template categories. Amounts have at most two decimals, no thousands separators and safe-integer bounds. Unsupported currencies/types/behaviours/loans, invalid dates/links and pending payback-task metadata are rejected. JSON and legacy XLSX transaction imports remain distinct from full-state restore.
- Preview counts for new / unchanged / edited / possible duplicate / invalid. Unchanged stable records skip safely. Same-ID edits show changed values and require Keep / Use imported changes. Possible content matches require Skip / Add separately, preserving legitimate identical purchases. External identity is scoped by source and account. Repeated/conflicting identities inside a file and links to later expenses are checked as a batch. Apply revalidates the complete result and rejects a stale preview.
- Preview lets the owner edit individual transaction drafts and shows possible matches against both the source row and its edited draft. Choose one target account or map a multi-account file. Preview shows before and projected balances for the affected accounts after resolving conflicts. Results show the actual balances, added and updated transactions, skipped rows and reasons, and the available pre-import backup.
- A separate latest pre-import recovery copy at `havensum-import-recovery-v1`, saved before writing the reviewed result or changing application state. A failed recovery/save blocks applying the import. A no-op rerun does not overwrite the last recovery copy. Settings can download that copy without changing the shared merge baseline. Full restore remains pending; legacy state/baseline and migration recovery keys are not renamed or pruned.

Public-boundary tests exposed and fixed a legacy numeric-zero transaction-ID validation defect: such expenses now retain reimbursement limits. Existing numeric transaction IDs and links survive reimport into the existing ledger. New canonical IDs are textual on an empty ledger; ambiguous textual representations of existing IDs are rejected rather than guessed.

## Dependencies and integration

The CSV UI needs collision-resistant IDs for newly approved ID-less rows. Its `identifiers.web.js` / `.native.js` and `expo-crypto ~15.0.9` dependency match the existing identifier task branch exactly; source/lock metadata was reused without merging that branch. Preserve the reviewed foundation versions when reconciling these identical additions. No downloaded dependencies are committed.

After Claude review, integrate foundations, Expected savings and branding before CSV. Keep migration's serialized recovery-first persistence. Add new import recovery APIs alongside that implementation, validating their input through the unified state boundary while retaining the original recovery bytes. Keep outlook validation from Expected savings at `validateState`; never substitute this branch's older storage adapters. Preserve original recovery copies and shared baselines. Reconcile Settings, file-adapter, package and documentation overlaps. The numeric-ID regression/fix belongs on this branch even if related code also changes during other reviews.

## Verification

137 Node tests and coverage gates, 69 browser checks, web build and Hermes compilation pass, with the affected CSV flows rerun after final identifier validation changes. Synthetic Settings/review previews at 320/360/396/412/1280 px were visually inspected; measured page/dialog descendants remain within viewport bounds. Browser regressions now serve the native app's bundled fonts at the external font-delivery boundary after a Google Fonts timeout interrupted a setup hook. No financial flow failure was hidden by a retry policy.

## Pending and limits

Claude review remains scheduled for the stated noon availability, and gates merging. This branch is local and unpushed; prior explicit push authorization named the three earlier task branches and `develop`.

Expected-payback task fields remain an explicit unimplemented requirement, not a supported CSV contract. Bank-specific signed formats, two-sided transfer reconciliation and Cashew compatibility remain pending adapter work. See [CASHEW_IMPORT_RESEARCH.md](CASHEW_IMPORT_RESEARCH.md) for the published Cashew structure and the sanitized sample/version needed to verify it. The generic importer does not treat signed bank inflows as earnings. A CSV is transaction exchange, not full JSON restore, a shared-file merge protocol or a complete transfer of every setting/custom metadata field.

Hermes compilation is not an APK, Android installation, native share-sheet execution or physical-device verification. Browser/device storage remain separate. Large-file performance and spreadsheet editing behavior beyond the documented synthetic fixtures need further verification.
