# Havensum — latest requirements and implementation handoff

17 November 2026. Owner requests in this document take precedence over older Melo names, XLSX-first requirements and plan-derived prediction assumptions. **Everything labeled pending below is a requirement, not a claim of implementation.**

## Scope and delivery

Continue the existing React Native/Expo Android app; maintain the responsive PC browser view of the same components. Work from a new local repository. The ZIP is source and documentation, not an APK, a copy of the live ledger or a connected cloud service. Keep the financial rules and existing UI repairs documented in HANDOFF.md.

| Work item | Status in this package |
| --- | --- |
| Latest published app source, interaction fixes and Plan/Averages screens | Included; original branding remains Melo |
| Havensum name and matching logo | Pending; brief below |
| Independent Expected savings | Pending; current prediction reads the frozen plan |
| CSV transaction export and downloadable Havensum template | Pending; generic CSV import exists |
| Two owners' bank CSV adapters | Pending; bank names/formats/samples not supplied |
| Awaiting paybacks tasks | Pending; actual linked reimbursements already exist |
| Full JSON backup export | Exists; dedicated reviewed full-state restore is pending |

## 1. Product identity: havensum

**Owner requirement:** rename the app to **havensum** and create a matching logo.

Brand brief: a calm home for shared financial clarity. Use a simple, original, flat vector mark that suggests shelter/haven and a balanced total. The wordmark should read `havensum`; use Havensum in prose where normal capitalization helps. A restrained shelter/arch and subtle H or sum-inspired geometry is a starting direction, not an approved final drawing. Avoid glossy effects, emoji, faux 3D or a generic bank shield. Keep the current warmth/playfulness and matte colors. Do not copy Apple's logo, Cashew assets or another brand.

Deliver editable SVG source; small-size legibility; monochrome and light/dark versions; Android adaptive foreground/background assets and required raster sizes generated from the vector; browser favicon and accessible app mark. Check the mark at 24 px and as a launcher icon. Logo creation is pending, not included as an approved asset in this handoff.

Rename visible headers, document titles, app metadata, share dialogs, download prefixes and relevant package labels. Treat app package ID/slug and existing data keys separately: changing the Android application ID can create a different install, and changing storage keys can hide existing data. Preserve `melo-state-v1` and `melo-sync-base` or migrate them with a recovery copy and versioned validation. Retain legacy backup compatibility. Do not fabricate a registered domain, trademark clearance or published store listing.

Acceptance: Havensum branding is consistent; old local data still opens; old backups can be identified/imported as supported; icon is legible in both themes; no accidental new empty ledger from a cosmetic rename.

## 2. Clarify Planned savings and Expected savings

**Owner clarification:** “Where will I land?” should be predicted from actual activity, historical averages and known upcoming changes, independently of a target.

| UI concept | Meaning |
| --- | --- |
| Recorded so far | Income received minus net spending recorded through the reporting date |
| Planned savings | Explicit frozen target from the approved Year Plan |
| Expected savings | Independent estimate of final monthly income minus expenses |
| Above / below plan | Expected savings minus Planned savings |

The packaged `src/planInsights.js` still derives remaining spending and income assumptions from `state.plan`. That was previously described too loosely; the independent correction is unfinished. Do not merely relabel it and claim the algorithm changed.

Required behavior:

- Fixed costs: derive from observed recurring costs/history with clear cancellation and incomplete-history rules. Do not divide already-paid rent across remaining days or count it again.
- Variable costs: use completed-month rolling averages (working default six months) to estimate remaining spending; combine recorded costs with the remaining allowance. Keep the history window visible.
- Occasional costs: feed a separately explained reserve/cushion, not the variable average. Final estimator and reserve-versus-known-event overlap need an explicit documented choice.
- Registered loan obligations and known scheduled costs/income changes belong in the outlook. Actual repayments must not be counted twice.
- Known assumptions can feed both plan and prediction, but a saved target/override is not evidence of an expected real-world cost. Store shared assumptions independently from the frozen target where needed.
- Exclude transfers and unlinked balance adjustments from earnings/expense averages. Offset received linked paybacks against the original expense month. An expected payback task alone is not received income or a reduction of actual expenses.
- Predict even without a frozen plan when enough history/known assumptions exist; omit comparison if no target exists. With insufficient history, show “Not enough history” or an explicitly partial estimate; do not make up a precise number.
- Past results are recorded results; future-month predictions should be labeled estimates. No ordinary transaction rewrites the frozen Year Plan or past plan snapshots.
- Explain the basis with values the owner can inspect. Use “Expected savings” and “Planned savings” rather than requiring the user to interpret “plan vs forecast.”

Acceptance: identical ledger and independent assumptions produce identical Expected savings before/after changing only target amounts/manual plan overrides. Changing an actual expense changes the estimate appropriately; changing a registered future obligation changes the prediction; transfers and task completion without payment do not. Cover late reimbursements, paid rent, missing history, month/year boundaries, occasional reserves, loans and future dates. Add tests for the new model; the 25 bundled tests currently describe the old one.

## 3. Downloadable Havensum quick-entry template

**Owner requirement:** download a template, rapidly enter expenses externally and import them **into the existing ledger**.

Use a simple CSV template with friendly headers, EUR amounts and a separate short guide. Required quick-entry fields: date, title, amount, account and category; expense is the default type. Optional note, behavior, subcategory and expected-payback fields can be included without making basic entry burdensome. Resolve names to stable IDs through preview; do not silently create the wrong account/category. A blank reusable template and a separate synthetic example are useful.

Support Android download/share and browser download. Import should preview new rows, duplicates, errors and mappings before applying. It must append approved new rows; never replace the ledger. Reimported stable IDs are safe; edited same-ID rows require explicit review rather than silently replacing or skipping changes. Rows without IDs need conservative duplicate handling that preserves legitimate identical purchases. See CSV_SPEC.md.

Acceptance: fill three expenses, preview/import into a non-empty ledger, observe the correct increase, import again without accidental duplicates. Existing records remain unchanged. Validate commas/quotes/newlines, decimal conventions, accented names, invalid dates, missing accounts/categories and canceled import.

## 4. Bank CSV conversion for both owners

**Yes, this is feasible.** A bank export is a source format that an adapter can normalize into Havensum transactions. It does not require bank linking or credentials.

Blocking inputs for bank-specific completion: bank name/product and representative sanitized exports for both owners (same bank can still have different export variants). Include original headers, separators/encoding, date/amount conventions, sample debit/credit, transfer, refund and fee rows. Remove names, account/IBAN numbers, balances and descriptions that identify real people; preserve structural formatting. If a field is required to understand parsing, replace it with a synthetic value. Also record the expected normalized result for each row. Do not commit real statements.

Build a reusable importer pipeline: detect/profile → parse → normalize → account/category mapping → classify/review → duplicate/reconciliation review → apply as one recoverable import. Each bank profile should be versioned, fixture-tested and scoped to its actual format. Keep a manual mapping fallback for unknown formats.

Do not classify every positive bank entry as income. Refunds/paybacks, loan proceeds and internal transfers have different meanings; suggest classifications and require review where ambiguous. Two sides of a transfer imported from different accounts must reconcile to one neutral transfer, not become income plus expense. Existing manually entered transactions need a match/reconciliation option, not a second copy. Scope source IDs to bank/profile/account/owner as necessary. No guessing same-field edits.

Acceptance: each sanitized real export produces agreed dates, amounts and account cash movements; overlapping exports and repeated files are safe; internal transfers are neutral; ambiguous credits are reviewed; errors show row numbers/reasons; no bank credentials or raw private statements enter Git.

## 5. CSV rather than XLSX

**Owner preference:** make CSV the primary transaction export for consistency with templates/bank files. This supersedes the original XLSX-first export requirement.

CSV is suitable for portable transaction rows and easy external editing. Its tradeoffs are one table per file, no rich styling/multiple workbook sheets, weak type information, and spreadsheet programs guessing dates, separators or identifiers. These are format tradeoffs, not a reason to reject CSV. Use explicit columns, schema version, stable IDs, ISO dates, EUR and documented number conventions. Separate account/category lookup CSVs may accompany a full portability export.

Retain JSON as the complete, versioned app backup for accounts, categories, hierarchy, task metadata, settings, plans and links. CSV transaction exchange is not full-state restore and not two-person three-way sync. Preserve legacy XLSX import while migrating; XLSX export can become a secondary legacy option or be removed after CSV parity is verified. Update UI copy accordingly.

Acceptance: export → import preserves transactions, integer cents, IDs, types, account/category associations and supported links. Same-ID edits are reviewed. A CSV import never silently resets state. JSON restore remains a distinct recovery flow.

## 6. Expected-payback tasks

**Owner requirement:** marking an expense as awaiting a payback creates a task/reminder. It can be completed without a registered payment or used to enter a payment.

Proposed wording: expense toggle **“Expect a payback”**; list **“Awaiting paybacks”**; actions **“Record payback”** and **“Close without payback”**. The checkmark can open the explicit close-without-payment confirmation when nothing has been received. Do not label an unpaid closed task “Paid.”

Suggested data model (implementation proposal): a task with a collision-resistant `id`, `expenseId`, total `expectedAmount` in cents, optional person label/due date/note, lifecycle fields and explicit manual-closure reason/time. Derive received amount from linked reimbursement records; do not maintain a separate independently editable payment total. Default expected total to the original expense amount, editable for partial expected recovery, bounded by the expense. Partial repayments remain supported. This is receivable follow-up, not bill splitting or a new transaction type.

| Event | Task behavior | Financial behavior |
| --- | --- | --- |
| Save expense with Expect a payback on | Create/open task | Record the expense normally; no fake inflow |
| Record partial payback from task | Prefill expense link/account/remaining expected amount; task stays open/partial | Create a real linked reimbursement only on save |
| Received linked total reaches expected total | Resolve as received | Existing reimbursement engine applies original-month netting |
| Tick/close task without payment | Confirm “Close without recording a payback?”; optionally capture note | Task metadata only; expense/net spending/cash/income unchanged |
| Cancel payment form | Keep task state | No transaction |
| Edit/delete a reimbursement | Recompute received/outstanding; reopen an automatically resolved task if needed | Preserve normal validation and original-month attribution |
| Manually closed task later receives money | Keep explicit closure history; allow inspecting/recording later payment | Money is recorded truthfully; never duplicate the payment |
| Delete/edit original expense or expected amount | Review dependent task/links; avoid orphan records or silent clamps | Existing linked-reimbursement constraints still apply |

Working scope: an in-app follow-up list and due-state indicator. Android notification scheduling, reminder cadence and cross-device notification ownership are not decided; do not imply push/local notifications work merely because a task exists. Surface open and overdue items clearly; keep manually closed items in a history view. Do not count expected recoveries as actual cash or silently deduct them from the conservative prediction. If expected recoveries are ever shown as a scenario, label them separately.

Include tasks in versioned JSON backups/migrations and future three-way merge. Same-field/close-vs-edit/delete conflicts must be reviewed. Do not create a task automatically for every legacy expense during migration; existing reimbursements without tasks continue to work.

Acceptance tests: create task; partial/full payments; cross-month payment; close without payment leaves all money totals unchanged; cancellation; reimbursement deletion/reopening; expense edit/delete; old-data migration; repeated import with task metadata; JSON round-trip; future same-field/delete merge conflict.

## Implementation order

1. Establish the local baseline, stronger IDs/schema migrations and recovery protection.
2. Correct independent Expected savings and its labels; prove target independence.
3. Rename Havensum and add logo assets without losing existing data.
4. Add CSV export/template/import identity and round-trip tests.
5. Add expected-payback task lifecycle and linked entry flows.
6. Finish bank-specific adapters against the owners' sanitized samples.
7. Continue Android installation/device QA, annual onboarding, archived plans, Drive and ETF work from the existing roadmap.

This order is a working implementation sequence, not a reason to block independent work while samples are unavailable. Ask for bank samples only when needed to finish those adapters. No new native PC app, bank connection, non-EUR support or bill-splitting scope is authorized.
