# Havensum feature backlog

**IMPORT-2 (Cashew verification) is done, reviewed, merged into `develop` and pushed**, including its follow-ups for the owner's real test export (K10–K12) and loan-sign confirmation (K13); see its handoff notes at the end. **The FORECAST-2 follow-up (move a recurring planned cost from a chosen year, F16–F18) is done, reviewed and merged into `develop`** (see its handoff note at the end). **LEDGER-1 is done, reviewed and merged into `develop`**. **FORECAST-2 is done, reviewed and merged into `develop`** after the owner's answers (see "FORECAST-2 owner answers" and the implementation handoff at the end). No other ticket is unblocked: each needs owner input, samples, credentials or a device. PLAN-1–4, SAVINGS-1, BACKUP-1 and FORECAST-1 are done and merged into `develop`. Every other ticket needs owner input, samples, credentials or a device; see the session summaries at the end of this file. Work through PLAN-1 to PLAN-4 in order, one ticket per session, then SAVINGS-1. The later tickets are queued. ETF work is parked. This board is the handoff for Luna and future sessions.

## Starting point and workflow

The reviewed baseline for this board is `a859978` on `develop`. Real Bank and Cashew import, planned-cost links, expected-payback tasks, and independent Expected savings are already integrated. Inspect the current Git state and use the latest reviewed `develop`. Read [AGENTS.md](../AGENTS.md), [HANDOFF.md](../HANDOFF.md), [DECISIONS.md](../DECISIONS.md), and the relevant requirements before editing. Use a dedicated `codex/` task branch. Leave private attachments and runtime financial data out of Git, fixtures, and reviewer inputs. Leave `master` release-only. Push only if the owner requests that branch and destination.

For implementation, add one failing public behavior regression, make the minimal fix, and repeat. Use synthetic fixtures. Before integration run `npm run test:coverage`, `npm run test:browser`, `npm run build`, and `npm run check:android`. Request the required local read-only Claude review, fix actionable findings test-first, and rerun affected checks. If review cannot complete, commit locally and leave the branch open and unmerged. Hermes verifies compilation. Device QA has its own ticket.

At each handoff update the ticket status, decisions, remaining blockers, implementation commit, verification actually run, and Claude outcome. Start the following ticket in its own session.

## Product contract

The plan and forecast share one Year Plan workflow. The forecast and historical actuals inform draft decisions. After approval, show **Recorded**, **Expected**, and **Planned** together. New financial activity can move the forecast. Only an explicit approval freezes or revises the target. A target-only edit leaves Expected savings unchanged.

Use integer EUR cents. Cash follows its transaction date, including for early payments linked to a later event. Spending follows the linked occurrence where applicable. Transfers stay out of income and spending. Linked paybacks reduce the original expense period. An unpaid payback task creates no money.

## Ready for implementation

### PLAN-1 · Preserve frozen plans by year and revision

**Status:** Done, reviewed and merged into `develop` from `codex/plan-archive` (implementation `28e3b46`, review fixes `ecf9d2b`, `82fb948`, `24ad7c3`). See the PLAN-1 handoff note below. **Depends on:** Current reviewed `develop`.

- Store approved plans by year and retain each approved revision as an immutable snapshot. Give new snapshots collision-resistant IDs so two devices can create different revisions with the same display number. A shared year/month lookup should serve Year Plan, dashboard, charts, drill-downs, and plan comparisons. Display the latest approved revision for the selected year by default and allow read-only access to earlier years and revisions.
- Keep the existing revision start rule. For the current year, use the later of the selected month and the current calendar month at save time. For a future year, start in January. Recheck the calendar on save. If the start month moved within an editable year, refresh the preview and ask for a fresh approval. If the selected year has become a past year, block the save and explain that the year is now read-only. Before the revision start, retain months from the latest approved snapshot exactly, including months that were never planned. Saving a second year adds it without altering the first. Keep past years read-only.
- Migrate v1/v2 single-plan ledgers and baselines. Preserve the original year, revision number, amounts, and overrides. A null plan becomes an empty archive. Preserve exact prior bytes before replacing the ledger or baseline. Keep the storage keys and serialized recovery-first persistence. Keep CSV import recovery separate. Update JSON backups, demo data, and demo reset behavior.
- Merge independent plan years. Present concurrent changes to the same year as two whole revision histories for explicit review. Keep both candidates available until a choice is made. A matching display revision number cannot overwrite another snapshot. Preserve the pre-merge ledger in a recovery copy before applying the selected history. An older backup can contribute its represented year and preserves years it could never represent. Full replacement restore belongs to BACKUP-1.
- First regression: load a legacy ledger, freeze a second year, reload, and verify that the first year's frozen figures and overrides match the original. Then cover a null plan, a plan starting midyear, same-year revision with a selected month after the current month, a draft left open into the next month and a December draft left open into January, a selected year without a plan, and charts across years.
- Verify legacy and current backups, independent-year merges, same-year conflicts with colliding revision numbers, repeated merge, corrupt or future-version data, failed recovery and replacement writes, and intact plan links, category references, and forecast inputs. Verify that a target-only edit leaves Expected savings unchanged.

### PLAN-2 · Improve annual draft estimates

**Status:** Done, reviewed and merged into `develop` from `codex/plan-draft-estimates` (implementation `9d14d6a`, review fixes `1ed718a`, `7ed3b0e`). See the PLAN-2 handoff note below. **Depends on:** PLAN-1.

- Use the selected 3-, 6-, or 12-month lookback before the first month being planned, limited to completed calendar months. Reuse the existing confirmed months and bill cancellations in the independent outlook settings. Prefer owner-confirmed complete months, including confirmed zeros. When none are confirmed, use recorded months for a labeled partial estimate. Show which months contributed. With no usable history, show that and allow manual amounts.
- Suggest fixed costs per observed bill using account, category, and normalized title. Show the latest observed amount and apply explicit cancellations from their effective month. A missed payment leaves the bill expected. Roll bill suggestions into the plan lines and keep loans distinct. Calculate variable costs from net actuals using category inheritance and transaction overrides.
- Suggest an editable cushion from average net occasional spending. Exclude payments linked to named events that have separate plan lines. Count each event in its occurrence month, including early payments. Gate drift suggestions on the relevant confirmed complete calendar months.
- Verify €120 in one confirmed month and €0 in the next suggests €60 for variable spending. Cover unconfirmed gaps, partial or empty history, year boundaries, late linked paybacks, two bills in a category with only one cancelled, missed bills, and bill identity changes. Exercise a moved event awaiting review, loan changes, and a transfer. Verify preview leaves the ledger and frozen targets untouched.

### PLAN-3 · Review assumptions carried forward

**Status:** Done, reviewed and merged into `develop` from `codex/plan-carry-forward` (implementation `4923875`, review fixes `5117fec`, `42609b9`). The new recurring-cost option was deferred; the owner answered on 19 November 2026 (P04–P06) and it is tracked as **PLAN-3 follow-up** below. See the PLAN-3 handoff note below. **Depends on:** PLAN-2.

- Reuse the three-step interview. Prefill recurring income, applicable income and loan changes, history window, and review thresholds from the latest earlier plan. Use amounts effective at the start of the period and show later changes in their applicable months. Preserve deliberately entered zeros.
- Show earlier manual overrides beside fresh suggestions. Apply the ones the owner chooses to keep. For a same-year revision, prefill that year's current overrides. Surface assumptions for removed categories or closed loans without applying them.
- Carry recurring events into applicable years and leave one-off events in their original year. Preview draft targets and available forecasts month by month before **Freeze my plan**. Adding a named cost supplies new evidence to the forecast. Editing only a draft target leaves the forecast unchanged.
- Cover no prior plan, zero amounts, applicable changes carried once, keep/drop override, stale category and loan references, a one-off trip, a recurring event, history-window edits, and abandoning a draft. Verify older snapshots and same-year past months remain intact on save.

### PLAN-3 follow-up · "Repeats every year" for new planned costs, from the plan's year onwards

**Depends on:** PLAN-3, FORECAST-2 follow-ups (F16 year amounts and moves). **Status:** Done, reviewed and merged into `develop` from `codex/recurring-planned-cost-from-year` (implementation `aaab9a3`, `fb65dad`; review fixes `a1a1582`, `1df059b`); see the PLAN-3 follow-up handoff at the end. Follow-up b (P05, draft loan payment from a newer loan edit) is also done and merged; follow-up c was cancelled and superseded by LOAN-1 (P09).

**Owner answers (19 November 2026, in chat; P04–P06 in DECISIONS.md):**
1. **Repeat start (P04):** a new planned cost marked as repeating every year in the Year Plan interview counts from the year of the plan being drafted onwards. Earlier years, their forecasts/Expected savings and frozen plans are untouched. Stored as an optional `fromYear` on the recurring planned cost; recurring planned costs without it keep applying to every year.
2. **Loan payment for a new draft (P05):** when a carried loan change differs from a newer payment entered on the loan itself, a new draft starts from the newer loan payment. Loans keep no record of when their payment was edited, so this needs a stored edit date (schema, merge and backup work). Queued below as its own ticket.
3. **"Copy existing scheduled changes" after a same-year revision (P06):** current behaviour is acceptable; no change.

Cover: a repeating cost added to next year's draft does not appear in this year and appears in later years; editing an older-year plan does not pull it back; frozen snapshots unchanged; legacy recurring costs unaffected; validation, backup restore and merge of `fromYear`; comparable-cost evidence, the planned-cost picker, moves and year amounts respect the start year; a target-only edit leaves Expected savings unchanged; narrow layouts with long names.

#### PLAN-3 follow-up b · Draft loan payment from a newer loan edit (P05)

**Status:** Done, reviewed and merged into `develop` from `codex/loan-payment-edit-date` (implementation `3a5b76d`, docs `aa7e069`, review fix `8cf22f1`); see the PLAN-3 follow-up b handoff at the end. **Depends on:** PLAN-3 follow-up. Record when a loan's monthly payment is edited (new optional field, validated, kept by restore, merged three-way), and when a carried loan change in effect at the draft start predates a later edit of the loan's payment, start the draft from the loan's payment instead. Cover legacy loans without the field (keep today's carried change), a later plan change after the edit, merge conflicts, and the step-2 placeholder.

#### PLAN-3 follow-up c · Note a loan change replaced by a newer loan payment (P07)

**Status:** Cancelled by the owner (20 November 2026) before merge; superseded by **LOAN-1** (P09). Its unmerged work is on origin branch `codex/replaced-loan-change-note` (`77f5196` implementation; `88598fa` marks P07 implemented and must not be merged).

### LOAN-1 · Loan payment history and an owner-chosen plan revision (P09)

**Status:** Split by the owner into three slices (P11, 20 November 2026). **Done:** LOAN-1a, LOAN-1b and LOAN-1c are reviewed and merged into `develop` (owner request P18: all three in one session); see the three handoffs at the end. **Depends on:** PLAN-3 follow-up b (merged).

**Owner answers (20 November 2026, recorded as P11–P16 in DECISIONS.md):**

- **Split (P11):** LOAN-1a payment history; LOAN-1b the **Keep my plan** / **Revise from <month>** prompt and the revision including passed months; LOAN-1c one-off extra and advance/down-payments.
- **Prediction assumptions (P12):** Year Plan's "Prediction assumptions" loan amounts keep working as today: an amount typed there wins from its month for Expected savings; otherwise Expected savings follows the loan's history. The owner wants to readjust the plan case by case when a payment changes permanently (LOAN-1b) rather than see "over budget" every month.
- **Interview (P13):** shows each loan's payment history read-only and points to the loan to change it; no more plan-only loan payment fields.
- **Advance payment (P14, LOAN-1c):** a **Record advance payment** action on the loan card records the payment marked as an advance, lowers the remaining balance in the same save, then asks whether the monthly payment changed and from when.
- **Balance-only change (P15, LOAN-1b):** does not offer the plan revision.
- **AGENTS.md (P16, LOAN-1b):** add one line naming the P09 exception in LOAN-1b.

**LOAN-1a · Payment history.** Done, reviewed and merged into `develop` from `codex/loan-payment-history`. Loans keep `paymentChanges` (schema version 5, docs/STATE_MIGRATIONS.md). The loan form shows this month's payment; **Change the monthly payment** asks the new amount, **New payment from · YYYY-MM** (default the current local month, past or future, up to the loan's last month) and, optionally, **Until a chosen month** (P10: off means it lasts; a temporary or one-month payment returns to the earlier payment afterwards and leaves other changes untouched). A lasting payment replaces every later change; a mistaken entry can be removed; €0 is allowed for a pause. The loan card shows this month's payment and the history; **Record payment** prefills this month's amount. Drafts and new plans take loan payments from the history (superseding P05); the interview lists them read-only (P13); Year Outlook's drivers list the history's changes. Expected savings follows the history unless a Prediction-assumptions amount applies (P12); the copy toggle copies income only (P17) and saved prediction loan amounts are labelled with a Clear button (P20). Legacy ledgers and backups migrate once from every plan revision's changes with P05's rule (UTC edit month; a newer loan edit beats a carried restatement, P19); frozen plans and `paymentEditedAt` are kept. Merge offers different histories as one readable conflict.

**LOAN-1b · Keep my plan / Revise from <month>.** Done, reviewed and merged into `develop` from `codex/loan-plan-revision` (see its handoff). After a monthly-payment change on the loan (not a balance-only change, P15), when the year it changes in (this year at the earliest) has a plan, a prompt offers **Keep my plan** (nothing changes; every snapshot byte-identical) or **Revise from <month>**, which opens the interview for that year with the payment history prefilled. A change in a passed month of this year starts the interview this month and restates only the changed loan's part of the loan line and its totals in the passed months from the change month (P22, P23), marking the revision (`loanRestatedFrom`) and Year Plan; earlier revisions are kept; past years stay read-only. AGENTS.md names the exception (P16).

**LOAN-1c · One-off extra and advance payments.** Done, reviewed and merged into `develop` from `codex/loan-advance-payments` (see its handoff). **Record advance payment** on the loan card (P14) records a loan expense marked `loanAdvance`, lowers the recorded remaining balance in the same save (never below zero), then asks **Did the monthly payment change?**: **No, it stays €X** closes; **Yes, enter the new payment** opens the loan form ready for the new amount and month (never calculated), whose save can offer LOAN-1b's prompt. A one-off extra payment stays an ordinary **Record payment** entry: the history and plans are unchanged, no prompt, and its month shows the larger amount.

**Owner decision (20 November 2026, P09 in DECISIONS.md):**

- **Payment history:** a loan's monthly payment changes over time, up or down (a new rate, an advance or down-payment). The loan keeps a payment history ("€1,200 from 2026-01, €1,050 from 2026-09"). The loan form asks from which month a new payment applies, defaulting to the current local month (L02); past and future months are allowed, and entries can be corrected.
- **Later changes:** every payment from the chosen month on uses the new amount, so a later scheduled change for that loan (in the history or carried from a plan) no longer applies. Earlier months are untouched.
- **Until month (P10):** each payment change also has an **until** that defaults to "forever", with an option to pick a month. A temporary change returns to the payment that applied before it after its until month (€900 from 2027-01 until 2027-05, then €1,200 again from 2027-06). The same from and until month means that month only, e.g. a planned extra payment from a friend's money in March and a lower one in April, then back to the original. A forever change replaces later changes for that loan; a temporary one leaves them untouched. Temporary and one-month changes get the same plan prompt.
- **One-off extra payment:** a payment above the usual amount (e.g. a fixed service fee) is only a recorded payment. It changes neither the loan's monthly payment nor the plan, and shows as overspend in its month.
- **Advance or down-payment:** recorded as a payment on the loan, marked as an advance, and it lowers the recorded remaining balance. The app then asks whether the monthly payment changed, the new amount and from which month. It never calculates the bank's new payment; principal and interest are not guessed.
- **Plan revision prompt:** after any change to the monthly payment, offer to revise that year's plan: **Keep my plan** (nothing changes; the difference shows against the plan) or **Revise from <month>**. Revising opens the existing interview with the payment history prefilled and other budgets editable, and freezes a new revision; earlier revisions stay viewable. Nothing changes without the owner's choice.
- **Past months:** that revision follows the payment history from the month it changed, including months already passed in the current year. This is an owner-approved exception to "never rewrite a plan's historical months", allowed only through a revision the owner approves, with the earlier revision kept. Past years stay read-only.
- **Drafts:** a new year's draft takes each loan's payments from its history, which supersedes P05's timestamp comparison. Decide how `paymentEditedAt` (PLAN-3 follow-up b) and the plans' `loanChanges` migrate into or coexist with the history, without data loss for legacy loans, backups or frozen snapshots.

**Ask the owner before implementing (multiple choice, recommended option first) if genuinely ambiguous:** where Outlook settings' expected loan payments fit with the history; how an advance payment is marked (transaction field or loan action); whether the prompt also appears for a change only in the remaining balance.

**Cover:** a payment raised and one lowered from a future month; a temporary change (January until May) returning to the earlier payment in June, entered in either order alongside other changes; one-month changes in consecutive months; a past month entered late, and the revision updating its past months while the earlier revision is kept; **Keep my plan** leaving every snapshot byte-identical; a later scheduled change replaced; a one-off extra payment changing nothing but that month's actuals; an advance payment lowering the remaining balance and prompting for a new payment; legacy loans and backups (validation, migration, docs/STATE_MIGRATIONS.md, full restore, three-way merge with owner-chosen conflicts); Expected savings following the payment history while a target-only edit leaves it unchanged; the interview's step 2 and carried changes; narrow layouts with long loan names; reduced motion.

### PLAN-4 · Offer the interview and verify rollover

**Status:** Done, reviewed and merged into `develop` from `codex/plan-invitation` (implementation `d6326c5`, review fixes `46d5a5e`). See the PLAN-4 handoff note below. **Depends on:** PLAN-3.

- In Year Plan, offer the existing interview on first use and when the current calendar year has no plan. **Later** suppresses the invitation for that calendar year on the installation. Keep manual entry and future-year selection available. Approval removes the invitation once that year has a plan.
- Opening, dismissing, deferring, or restarting the interview changes no financial records. Cover a fresh ledger, January rollover, a prebuilt new-year plan, deferral across reload, and manual entry after deferral.
- Use shared web and Android UI. Verify narrow layouts, long names, and large amounts, the browser rollover flow, and Android compilation.

### SAVINGS-1 · Schedule savings interest by period

**Status:** Done, reviewed and merged into `develop` from `codex/savings-rate-schedule` (implementation `7c4133d`, review fixes `2dbb290`, `32eecc6`, test updates in the merge-prep commit). See the SAVINGS-1 handoff note below. **Depends on:** PLAN-4 for sequencing.

- Allow effective annual percentage rates per savings account, each with a unique start month. Display the period through the month before the next rate starts. Display the final rate as ongoing. A promotional rate ends when the successor starts, including a successor of 0%.
- Preserve legacy single rates and start behavior. Use the existing monthly compounding convention, round to integer cents, and generate at most one interest entry per account and completed month. Allow scheduling current and future months. Keep recorded interest intact. Historical corrections belong to LEDGER-2.
- Version the schedule schema and retain exact pre-migration ledger and baseline bytes in recovery slots for the source version. Keep prior recovery copies. Represent a legacy single rate as the first period when the account has a start month. Without a legacy start month, retain the saved rate as an unscheduled value and show it when setting up the schedule. Generate no historical entries until the owner sets a start month. Include rate schedules in validation, JSON backups, and reviewed merge. For legacy backups that cannot represent the schedule, preserve an existing schedule and review any conflicting legacy rate rather than collapsing it. If BACKUP-1 is already implemented, verify it restores rates along with the rest of the ledger. Cover migration of legacy rates both with and without a start month, invalid percentages and month keys, duplicate starts, a zero-rate period, a December-to-January change, non-positive eligible balances, and repeat reloads.
- On €1,000 at a 12% effective annual rate, the existing convention gives €9.49 for one completed month. A following month at 0% adds no interest. FORECAST-1 uses future rates for estimated interest without posting them.

## Queued recovery, import, and accounting

### BACKUP-1 · Full JSON restore

**Status:** Done, reviewed and merged into `develop` from `codex/full-restore` (implementation `948ec32`, review fixes `dea89a8`, `0196dfd` and a final index fix). See the BACKUP-1 handoff note below. **Depends on:** PLAN-1.

Provide a distinct full-ledger restore with file validation, preview, explicit replacement confirmation, and a separate recovery copy written before replacement. Summarize affected accounts, records, and archived plans. Preserve the distinction from reviewed merge and transaction import. Verify legacy and current backups, including scheduled rates if SAVINGS-1 has landed, missing-category review, invalid versions, corrupt files, cancelled and stale previews, quota failure, interrupted writes, and reload. A failed recovery copy blocks replacement.

### IMPORT-1 · Verify both owners' bank exports

**Needs:** A sanitized export and expected rows from the other owner, plus real matching transfer legs when available.

**Owner question (19 November 2026):** asked whether the other owner's bank uses the same export layout, the owner replied "I'm confused, my bank doesn't need to import anything." Asked to confirm (multiple choice) whether IMPORT-1 can be closed as not needed, the owner chose **Close as not needed**. **Status:** Closed — not needed (owner, 19 November 2026). Both owners use the same bank and export layout, so the verified Real Bank adapter covers it (tests/realBankImport.test.js covers overlapping exports, identical purchases, refunds and pairing two legs into one neutral transfer); no second bank profile will be built.

Reuse the Real Bank adapter if the second layout matches. Otherwise create a distinct verified profile. Verify original headers and accents, date and amount conventions, confirmed value-date handling, signs, fees, refunds, ambiguous transfer labels, and the chosen date for transfer legs that differ. Test repeated and overlapping exports, scoped matching, identical legitimate purchases, and pairing two reviewed legs into one neutral transfer. Use only synthetic or carefully sanitized fixtures in Git.

### IMPORT-2 · Extend Cashew verification

**Status: Done.** Closed on 19 November 2026 with its two follow-ups (the owner's real test export, K10–K12, and the loan-sign confirmation, K13), all reviewed, merged into `develop` and pushed (last merge `e6e026a`). **Originally needed:** representative rows and agreed classifications — supplied as owner answers K01–K13 and the owner's own test export. Remaining unverified cases (older `debt`/`credit` rows, the published v1 layout beyond ordinary rows, loan objectives used for lending) are optional and do not reopen the ticket.

**Status (19 November 2026):** Done, reviewed and merged into `develop` from `codex/cashew-verification` (started from `75a8108`; implementation `11c9a44`–`b202a16`; review fixes `bc6518b`, `e440610`, `771e7c4`). See the IMPORT-2 handoff note at the end. The owner chose to proceed with synthetic rows that mirror the documented Cashew export format; every case beyond the verified ordinary EUR rows from v6.7.5+524 stays explicitly unverified against a real export. (Later the owner's own test export confirmed several shapes; see the real-export follow-up.)

**Owner answers (19 November 2026, in chat; recorded as K01–K08 in DECISIONS.md):**
1. **Borrowing/lending:** a `debt` row is importable only after picking an existing Havensum loan in review; positive = loan proceeds (unlinked balance adjustment tagged with the loan), negative = loan repayment expense tagged with the loan. `credit` (lent) rows stay blocked.
2. **Scheduled entries:** treated as paid when `amount unpaid` is blank or 0 (v1 exports only paid rows); still need a classification; review shows they came from a scheduled entry.
3. **Transfers:** a unique opposite `Balance Correction` row with the same amount and timestamp in another account is preselected as a suggested pair; the owner confirms or changes it. (Category rule superseded by K11: legs are recognised by their `Transferred Balance` note.)
4. **Paybacks:** manual link only, as today.
5. **Metadata:** ignore color/icon/emoji; show budget/objective read-only in review, never create records; non-zero `amount unpaid` or any `extra` stays a row error. (`extra` superseded by K10: shown read-only.)
6. **Classification:** ordinary rows still need an explicit choice; nothing prefilled from the sign.

Ordinary EUR rows from v6.7.5+524 are already verified. Check real transfer and payback rows where available. Agree how to handle borrowing, lending, scheduled entries, and populated metadata before widening support. Test both layouts, accents, integer-cent handling, matches after renames and layout changes, account creation only on confirmation, and original-expense links. Unverified entries retain their review status.

### LEDGER-1 · Posted versus future-dated activity

**Owner decision (19 November 2026, recorded as L01/L02 in DECISIONS.md):** an entry dated after today counts in current account balances and monthly reports from its date, by the device's local date. Until its date it shows as upcoming/scheduled and still feeds forecasts; from that day it is included automatically, with no manual confirmation step. **Status:** Done, reviewed and merged into `develop` from `codex/ledger-posting` (implementation `283a12b`–`fe86e22`; review fixes `a714369`–`b9bfbfd`). See the LEDGER-1 handoff note at the end; its owner questions are non-blocking.

Apply the agreed rule to current balances, account details, reports, forecasts, and import previews. Scheduled items can inform forecasts while current cash reflects posted movements. Cover today, month-end, time zones, future transfers, early planned-cost payments, and received paybacks.

### LEDGER-2 · Historical interest corrections

**Owner decision (19 November 2026, recorded as L03–L06 in DECISIONS.md):** corrections go through a reviewed *Correct past interest* flow on the savings account (past rates change only there; a corrected balance is an ordinary dated entry or balance adjustment). Each affected completed month keeps its recorded entries and gets one marked *Interest correction* entry for the difference. Bank-posted interest for a month that also has, or would get, an app entry needs a per-month choice: bank amount only, or keep both. The review lists all affected months with downstream *compounding effect* rows and a total, and applies them together. **Status:** Done, reviewed and merged into `develop` from `codex/interest-corrections` (implementation `d443fe4`, `ca2723f`; review fixes `869521f`, `870e6a0`). See the LEDGER-2 handoff note at the end; its owner questions were answered (L07), and the earliest-month limit is queued as LEDGER-2a.

Design a reviewed, explicit correction flow after agreement. Show the affected completed months and downstream compounding. Cover a corrected past balance, existing bank interest, duplicate prevention, cancel, and repeated application.

### LEDGER-2a · Earliest correctable month

**Owner decision (19 November 2026, L07):** a correction cannot start before the account's first recorded entry or its first rate period. **Status:** Done, reviewed and merged into `develop` from `codex/ledger-2a-earliest-correctable-month` (implementation `288dae9`; review fixes `90460b2`). Review answers recorded as L08. See the LEDGER-2a handoff note at the end. **Depends on:** LEDGER-2 (merged).

In the *Correct past interest* review (`src/interestCorrection.js`, `src/interestSchedule.js` `correctedSchedule`, `src/InterestCorrection.jsx`), refuse a draft rate period whose start month is earlier than the account's first transaction month (including a transfer into the account) or its first stored rate period (whichever is earlier; an account with neither may start from the current month), with a clear message, and never loop over months before that bound. Cover a mistyped far-past year, an account with no entries, a legacy unscheduled rate, and the existing earlier-start case that must still work.

### BUG-2 · Account-form past start for a legacy rate

**Owner decision (19 November 2026, L08):** the account form's past start month for an unscheduled legacy rate gets the same earliest-month limit as corrections. **Status:** Done, reviewed and merged into `develop` from `codex/bug-2-account-form-past-start` (implementation `a124a61`; review fixes `9edb458`, `ba3ca1a`). See the BUG-2 handoff note at the end. **Depends on:** LEDGER-2a (merged).

`AccountForm.jsx` lets an unscheduled legacy rate take any past start month (`scheduleWithPeriod(..., { allowPastStart: true })`), and startup then posts app interest for every completed month since then. A mistyped year (for example `1026-01`) would post thousands of entries. Add a failing regression first, then refuse a start before `earliestCorrectableMonth` (`src/interestCorrection.js`) with the shared `correctableStartText` message (`src/interestSchedule.js`). Cover a mistyped year, an account with only an opening balance (current month only), and a legacy rate whose valid past start still works.

## Queued forecast improvements

### FORECAST-1 · Full-year outlook in Year Plan

**Status:** Done, reviewed and merged into `develop` from `codex/year-outlook` (implementation `ff59a6d`, `275cd73`, `4302b60`; review fixes `337f638`, `c88a45e`). Scoped by the owner without posting changes. See the FORECAST-1 handoff note below. **Depends on:** Annual planning and SAVINGS-1. Coordinate posting-dependent changes with LEDGER-1.

- Show recorded, expected, and planned annual income, expenses, and savings together. Combine recorded past months with expected totals for current and future months. The current-month estimate includes recorded activity, so count it once. Label unavailable months and partial evidence. When there's no frozen target, display the forecast without a variance.
- Explain income changes, bills, loans, named costs, reserves, and scheduled savings rates. For accounts with scheduled-rate estimates, replace the historical interest component for forecast periods and include recorded interest once. Estimates stay out of the ledger.
- Test a midyear forecast, incomplete history, a partial-year frozen plan, changed obligations, late paybacks, and a target-only edit. Where evidence allows, backtest from an earlier date using only information available then and compare with later actuals.

### FORECAST-2 · Learn from comparable completed costs

**Depends on:** FORECAST-1. **Status:** Done, reviewed and merged into `develop` from `codex/forecast-comparable-costs` (implementation `d1e876f`, `5687b11`, `921cf6d`, `5768766`; review fixes `74f83b7`, `ac36777`); see the FORECAST-2 handoff notes below. Moving a recurring planned cost from a chosen year (F16) is tracked as **FORECAST-2 follow-up** below.

Check whether completed events and linked actuals improve predictions over a simple baseline. Domestic and international trips are examples of comparable expenses. Test sparse history, outliers, incomplete and partially paid events, moved events, refunds, and reimbursements. Decide what makes events comparable and what evidence the UI can expose. Avoid inferring trip type from free text alone.

If the evidence supports it, design an editable estimate or range that shows its comparable events. When evidence is sparse, ask for an amount. Accepting an estimate is an explicit draft choice and leaves approved snapshots intact.

### FORECAST-2 follow-up · Move a recurring planned cost from a chosen year (F16)

**Depends on:** FORECAST-2. **Status:** Done, reviewed and merged into `develop` from `codex/move-recurring-planned-cost` (started from `fd658b7`; implementation `864b7c4`, `cf2ecc5`, `3380a33`; review fixes `e1c3798`, `25e2351`, `a8c5f0e`); see the handoff note at the end.

Let the owner move a recurring planned cost's month from a chosen year onward. Earlier years keep their original month, and their linked expenses stay valid for validation, comparable-cost evidence, Expected savings, Year ahead and the planned-cost picker. Frozen plan snapshots and recorded transactions are never rewritten.

**Owner answers (19 November 2026, in chat):**
1. **Where:** a *Planned costs* card in Year Plan › Year ahead lists the year's planned costs; a recurring one offers **Move…** to pick the new month and the first year it applies. It is saved at once: forecasts update and frozen plans stay as approved.
2. **First year:** this year or a later year. Past years are locked.
3. **Expenses already linked to the old month in a moved year:** their links stay as recorded and are flagged for review (the existing "This planned cost moved" list). The move dialog says how many. They are not evidence until relinked by hand.
4. **A move from this year** (asked after review): both the old and the new month must be this month or later; otherwise the move starts next year.

### IMPORT-2 follow-up · Match the owner's real Cashew test export (done)

**Status (19 November 2026):** Done, reviewed and merged into `develop` from `codex/cashew-real-export` (started from `f5e71d5`); see its handoff note at the end. The owner supplied a small test export (v2 layout with `amount unpaid` and `extra`; kept out of Git as private runtime data). It showed recurrence text in `extra`, a localized transfer category with a `Transferred Balance` note, and loans as objectives on ordinary rows. Owner answers K10–K12 in DECISIONS.md. Synthetic fixtures mirror its structure.

### FORECAST-2 follow-up · Readable year-amount merge conflicts (F20)

**Depends on:** FORECAST-2 (year amounts). **Status:** done; reviewed and merged into `develop` from `codex/readable-year-amount-conflicts` (see the F20 handoff at the end).

When two devices set different amounts for the same year of a recurring planned cost, the backup-merge conflict review should name the planned cost and the year and show euro amounts, for example "December celebrations · amount for 2027: €410.00 here, €450.00 on the other device", instead of the raw `yearAmounts` field and cents. Keep the merge decision itself unchanged: `yearAmounts` is one field, so differing year amounts form one conflict per planned cost, and choosing a side takes that side's whole set of year amounts. The card should list each differing year on its own line. Match the final wording to the review's side labels (*This device* / *Backup file*). Cover a conflict on one year; several differing years on one planned cost (one card, one line per year); years set on different sides from the same starting point (still one conflict, shown year by year); long names at narrow widths; and screen-reader text. An edit-versus-delete conflict on a planned cost is a different conflict type, not part of this ticket; it only must not regress. Separate merge choices per year would be a new owner question, not part of this ticket.

## Queued delivery and integrations

### ANDROID-1 · Installable package

**Needs:** App ID, target runtime and device support, and owner-controlled signing setup. **Status:** Configured, reviewed and merged into `develop` from `codex/android-installable-package` (owner answers A01–A08 in DECISIONS.md, steps in [docs/ANDROID_BUILD.md](ANDROID_BUILD.md)). **Built and installed:** the owner built a release APK on their PC with their upload keystore from `fd55ca2`; it installed and starts on the owner's phone (recorded below). Full device QA is ANDROID-2. See the ANDROID-1 handoff note and the startup-crash bug fix.

| Source commit | Version name / code | Type | Build date | Signing certificate SHA-256 | Installed on |
| --- | --- | --- | --- | --- | --- |
| develop (owner's PC; exact commit not recorded) | 0.1.0 / 1 | Release APK | 19 November 2026 | not recorded | Owner's phone: installed, **crashed at startup** (Reanimated rejected the native timing curve; fixed in `fd55ca2`) |
| `fd55ca2` | 0.1.0 / 2 | Release APK | reported 19 November 2026 | `29591ff335e46c13c4556dd419e8c2812bd8efa40e2ede17d0c94f024d2e7d37` | Owner's phone: installed as an update and starts (owner report; full QA is ANDROID-2) |

Produce an installable Android build. Record source commit, build profile, and signing ownership. Keep credentials and compiled artifacts out of Git. A Hermes bundle is only a compilation check.

### ANDROID-2 · Physical-device QA

**Depends on:** ANDROID-1 and access to a physical phone.

Test installation and upgrade, offline startup, storage recovery, file picker and sharing, decimal input, keyboard resize, Android back navigation, safe areas, TalkBack, font scaling, and planning rollover. Record the device, build, results, and reproducible failures. Fix and retest release blockers.

### DRIVE-1 · Shared-file decisions

**Status:** Decided (owner answers G01–G10 in DECISIONS.md, 19 November 2026); see the DRIVE-1 handoff at the end. The access model is in [DRIVE_ACCESS_MODEL.md](DRIVE_ACCESS_MODEL.md). Real-account verification of the access model moves to DRIVE-2, before any transport is implemented.

Document who can find, read, and update the file and how access changes.

### DRIVE-2 · Shared Drive sync (split 19 November 2026)

The owner approved splitting DRIVE-2 on 19 November 2026: DRIVE-2a builds and tests everything that does not need Google credentials; DRIVE-2b adds the real Google transport and the two-account verification.

### DRIVE-2a · Credential-free shared-file sync core

**Depends on:** DRIVE-1 (decided). **Status:** Done, reviewed and merged into `develop` from `codex/drive-sync-core`; see the DRIVE-2a handoff at the end.

Shared-file document shape without device keys (G05/G06, every top-level key classified); a baseline tied to the file ID and last-seen revision (S03), separate from `melo-sync-base`; first join (adopt after a recovery copy, or merge with a review of every one-sided record, G08) and merging a second file in (G09); Create blocked with example data (G07); the read → validate/migrate → three-way merge → review → write → verify protocol behind a small transport interface, with lost-race recovery, pause-not-delete (G04) and the sync triggers and states (G10). Tested against an in-memory stand-in for Drive only. No Google OAuth, Picker or HTTP code, and Drive is not claimed to work.

### DRIVE-2b · Google Drive transport and two-account verification

**Depends on:** DRIVE-2a. **Blocked on:** the owner's Google Cloud setup: a project with the Drive and Picker APIs, an External consent screen with only `drive.file` and both owners as test users, OAuth client IDs for Android (final package `com.havensum.app` + SHA-1 of each signing key; the upload key's SHA-1 is `5d0ec4c8ed9b8b93b3b6136aa0063e7b775ab7c6`, a public certificate fingerprint) and web (authorized JavaScript origins), a Picker API key and the project number. Both owners' accounts are needed for the two-person checks. The full list is in [DRIVE_ACCESS_MODEL.md](DRIVE_ACCESS_MODEL.md#drive-2-blocker-setup-the-owner-must-provide).

Implement the `sharedFileTransport` contract with Drive v3 (create + share as writer, read, unconditional update), Google sign-in (Android `AuthorizationClient`, web token model with Reconnect), the Picker, and the app wiring of the DRIVE-2a core (scheduler, status card actions, review and join dialogs). The wiring must pass `createSyncProgressSaver` the sync's starting link (`snapshotBinding`) and an `adoptSavedState` that installs the ledger it hands over in the app (the saved ledger, or the saved ledger merged with an edit made during the save), and save join results with `commitSharedFileJoin`. While sync is wired, the app's own autosave must use `writeStateIfUnchanged`, so an edit kept in memory after a refused write-back (another tab saved meanwhile) can never be saved under a link that claims the partner's changes. Verify two devices with independent edits, same-field edits, deletion, concurrent plan revisions, interrupted writes and stale writes, and every item in "What DRIVE-2 must verify". Confirm the agreed account visibility.

### ETF-1 / ETF-2 · Optional ETF valuation

**Status:** Parked. **Needs:** Explicit owner interest before starting.

Start with units and a manually entered EUR price if requested. For automatic prices, first verify fund, exchange, provider coverage and entitlement, usage terms, and credential handling. Show quote dates and stale or offline state. Test quantity × price and separate valuation movement from received cash and income. Cash distributions belong in the ledger only when recorded.

## Session handoff — PLAN-1 (19 November 2026, Claude cloud session)

- **Implementation:** schema v3 `plans` archive keyed by year with append-only approved revisions (`src/planArchive.js`), per-year append-only merge (`src/planMerge.js`), pre-merge recovery copy `havensum-merge-recovery-v1`, v1/v2 migration with `:recovery:v2` bytes, revision-start recheck on save, read-only past years, read-only earlier revisions in Year Plan. Details in [STATE_MIGRATIONS.md](STATE_MIGRATIONS.md).
- **Checks (final commit):** `npm run test:coverage` 272/272 with thresholds met, `npm run test:browser` 228/228, `npm run build` and `npm run check:android` (Hermes compilation only) all pass. Browser tests ran against the preinstalled Chromium because the pinned Playwright browser download was blocked by the sandbox network policy.
- **Review:** a separate read-only Claude review found two merge defects that could drop approved revisions, an unguarded earlier-month rewrite path and a silent save failure. All were fixed test-first in `ecf9d2b`. A re-review found an un-appliable merge for out-of-order legacy snapshots and a migration lockout for plans without a revision number; both fixed test-first in `82fb948`/`24ad7c3`. The final re-review reported no blocking defects.
- **Recorded, not changed (owner input welcome):** (a) the merge recovery copy is a single slot, so a later merge replaces the previous pre-merge copy; (b) after a same-year conflict is resolved, the rejected history survives only in that recovery copy; (c) a new year no longer inherits income/loan changes, tolerance and drift from another year's plan. That carry-forward belongs to PLAN-3.

## Session handoff — PLAN-2 (19 November 2026, Claude cloud session)

- **Implementation:** `src/planDraftEstimates.js` builds draft evidence from completed calendar months before the first planned month (shared `completedHistory` with the outlook). Confirmed complete months win, including zeros; otherwise recorded months give a labelled partial estimate. Fixed lines total observed bills at their latest amount with per-bill cancellations applied per plan month; variable lines use net averages honouring inheritance and transaction overrides; loans, transfers and named-event payments stay out. The interview shows contributing months, a cushion suggestion (prefilled for a year's first plan) and the bills behind each fixed line. Drift suggestions need the relevant months confirmed complete. Snapshots record `evidence` and `suggestedCushion`.
- **Review fixes:** the first review found that a bill cancellation and loan- or event-linked expenses produced false drift alerts, and that a switch to gross bill amounts broke develop's net-spending drift contract. Plan bills are net of received linked paybacks again, drift measures spending on the same basis as the plan line, and payments for past events without a line in the new plan count as occasional history.
- **Owner questions (non-blocking; current behaviour follows existing conventions):** (1) plan bill targets are net of received paybacks while Expected savings uses each bill's latest gross amount. Should they match? (2) Planning next year in November with a 3-month window uses Aug–Oct, the same anchoring as Expected savings, rather than only October. (3) Drift suggestions now need owner-confirmed complete months, so a ledger that never confirms months gets none. (4) The bill list in the interview shows statuses for the first planned month only.
- **Checks (on `1ed718a`; `7ed3b0e` only removes an unused import and was rechecked with the Node suite):** `npm run test:coverage` 289/289 with thresholds met, `npm run test:browser` 234/234, `npm run build` and `npm run check:android` (Hermes compilation only).
- **Review:** separate read-only Claude review, then a focused re-review that confirmed every actionable finding fixed and passed the review gate.

## Session handoff — PLAN-3 (19 November 2026, Claude cloud session)

- **Implementation:** `src/planCarryForward.js` prefills a draft from this year's latest revision, otherwise the nearest earlier year's latest plan: income effective at the period start, later income and loan changes once, a loan change already in effect restated at the period start, history window, tolerance and drift. Zeros survive. Earlier overrides appear beside fresh suggestions with Keep/Drop; a same-year revision keeps that year's overrides. Overrides for removed categories and changes for ended or removed loans are listed as not applied. Existing recurring events (stored without a year) carry into every year and one-off events stay in their year. Step 2 shows loan payments in effect at the start and lists carried later income and loan changes in their months, each removable for the draft. Step 3 previews each month's planned and expected savings; draft events feed the forecast, draft targets do not.
- **Review fixes:** step 2 showed stale loan amounts and hid carried changes; overrides for lines that no longer exist vanished silently; preview tests were sign-dependent; the cushion of a same-year revision came from the selected rather than the start month; preview rows hid values from screen readers. All fixed test-first.
- **Owner questions (blocking only the deferred item):** (1) **Deferred:** a "repeats every year" option for new named costs. Saving one without a year would also change this year's forecast and any later revision of it. Should a new recurring cost apply from the plan's year onwards (needs a start-year field) or to every year? (2) A same-year revision now stores only later income/loan changes plus a restated loan payment, so Outlook settings' "Copy existing scheduled changes" no longer sees earlier changes from that plan. Acceptable? (3) When a carried loan change differs from a newer payment entered on the loan itself, which should the draft start from? It currently uses the carried change.
- **Checks (`42609b9`):** `npm run test:coverage` 295/295 with thresholds met, `npm run build`, `npm run check:android` (Hermes only), `npm run test:browser` 248/249. The one failure is a pre-existing intermittent failure in `paybackTasks.spec.js` (backup review of an expense and payback task), reproduced on `develop` without PLAN-3 and handled as its own bug task.
- **Review:** separate read-only Claude review and a focused re-review; all actionable findings fixed; the re-review reported no blocking defects.

## Bug fix — intermittent backup-review payback test (19 November 2026)

`paybackTasks.spec.js` "backup review identifies the expense and payback task…" failed about one run in five, also on `develop`. The test seeded storage from the running page, so the app's queued startup save could overwrite the seeded ledger. It now seeds through an init script before the reloaded app starts (branch `codex/bug-backup-review-flake`, `0eeba43`; 30/30 repeated runs pass; read-only Claude review approved). Test-only change. Related known limitation, not fixed: the app never re-reads storage, so with two tabs open the last save wins.

## Session handoff — PLAN-4 (19 November 2026, Claude cloud session)

- **Implementation:** `src/planInvitation.js` invites the owner when the current calendar year has no approved plan (first use included) unless that year was deferred. Year Plan shows a card built from the shared React Native components with **Start the interview** (switches to the current month and opens the existing interview) and **Later**. Later is stored per installation under `havensum-plan-invitation-deferral-v1`, outside the shared ledger, and applies only to that calendar year. Approving a plan for the year removes the card. Manual entry and other years stay available. Opening, cancelling, restarting or deferring changes no financial records.
- **Review fixes:** absence checks now first assert visible Year Plan content; opening, cancelling and restarting the interview are shown to leave the ledger bytes unchanged; a failed Later save still hides the card for the session with a plain message; the card is bounds-checked at 320/396/1280 px; deferral parsing is shared.
- **Owner questions (non-blocking):** (1) A real first launch loads example data that already has a 2026 plan, so a new user is not invited in 2026 until clearing it, and a Later tapped on example data stays after clearing. Should example data invite or defer at all? (2) In the web preview (`?demo=1`) Later is not saved and the card returns on revisiting Year Plan. (3) Start switches the app's selected month to the current month, and it stays there after Cancel. (4) Pre-existing: the app's starting month uses the UTC date while the invitation uses the local date, so just after local midnight on 1 January east of UTC the header can still show December.
- **Checks (`46d5a5e`; the merge commit only moves a comment):** `npm run test:coverage` 299/299 with thresholds met, `npm run test:browser` 270/270, `npm run build`, `npm run check:android` (Hermes compilation only; no device test).
- **Review:** separate read-only Claude review and a focused re-review; all actionable findings fixed; no blocking defects remained.

## Session handoff — SAVINGS-1 (19 November 2026, Claude cloud session)

- **Implementation:** schema v4 `interestSchedule` per account (`src/interestSchedule.js`), compounding by period in `src/savingsInterest.js` (re-exported from `engine.js`), migration and validation in `src/stateSchema.js`, older-backup protection in `src/interestMerge.js`, and the account editor's rate periods in `src/InterestScheduleEditor.jsx`. See [STATE_MIGRATIONS.md](STATE_MIGRATIONS.md). BACKUP-1 has not landed, so restoring rates through a full restore is not yet verified.
- **Review fixes:** removing the only period now saves; a past start is allowed only when setting up an unscheduled legacy rate; renaming an unscheduled account leaves it unscheduled until a start month is entered; an older backup's 0% default on accounts without a schedule is ignored and a positive rate merges normally; conflict titles distinguish older backups; migrated ledgers are re-validated and an account cannot hold both a schedule and an unscheduled rate; the editor and account label use the same UTC month as interest posting; shared calendar helpers replace duplicates.
- **Owner questions (non-blocking):** (1) Choosing an older backup's differing rate during review now inserts it as one period, replacing only the period with the same start month and leaving future periods. That start month is usually in the past, so months already holding recorded interest then show a different rate from the one posted (recorded entries never change). Please confirm a reviewed merge may override the "new periods start in the current month or later" rule, or whether the backup side should only be shown for information. (2) Pre-existing: rates reject comma decimals ("3,5") while balances accept them. (3) The start month is a typed `YYYY-MM` field rather than a month picker, and `account.bank` keeps the rate label written at save time.
- **Checks (`32eecc6`):** `npm run test:coverage` 315/315 with thresholds met, `npm run build`, `npm run check:android` (Hermes only). `npm run test:browser`: 294 passed and 9 failed — three existing tests across three viewports that asserted the old schema version, the old balance error text and the old single rate field. Those tests were updated to the new behaviour and both affected spec files were rerun (99/99).
- **Review:** separate read-only Claude review, two focused re-reviews; all actionable findings fixed test-first; the final re-review found no new defects.

## Session handoff — BACKUP-1 (19 November 2026, Claude cloud session)

- **Implementation:** `src/fullRestore.js` validates and previews a full backup; `src/RestoreBackup.jsx` shows the summary, missing-category review and explicit confirmation, writes `havensum-restore-recovery-v1` first, then saves the backup. Scheduled rates (SAVINGS-1) and archived plans (PLAN-1) restore with the rest of the ledger, including from legacy backups in migrated form. See [STATE_MIGRATIONS.md](STATE_MIGRATIONS.md).
- **Review fixes:** a restored ledger now gets the same startup preparation as a loaded one (interest catch-up, category visuals) before it is saved; every distinct pre-restore copy is kept (`havensum-restore-recovery-v1`, `:1`, …); the download returns the ledger replaced most recently and skips an unreadable copy; the dialog cannot be dismissed while writing and asks before discarding choices; a ledger saved by another tab after the preview makes it stale (the saved bytes are read after any queued save); the preview lists accounts and archived plans on both sides with labelled summary rows; category warnings carried in a backup join the restore review.
- **Owner questions (non-blocking):** (1) Should restoring a backup marked as example data be allowed? It currently restores as-is. (2) Pre-restore copies accumulate with no removal control. On web each copy is a full ledger in browser storage (about 5 MB in total), so after several restores of a large ledger the copy can fail for lack of space, which blocks further restores until space is freed. What retention limit or clear-up action do you want? (3) Are account names and counts enough for "affected accounts"? (4) Pre-existing on Android: the JSON picker filter may hide files the system labels `octet-stream`; this also affects backup merge and needs a device check (ANDROID-2).
- **Checks:** full gate on `0196dfd` — `npm run test:coverage` 327/327, `npm run test:browser` 324/324, `npm run build`, `npm run check:android` (Hermes only). The final commit only changes how a missing latest-copy index is read; rechecked with `npm run test:coverage` 328/328, build, Hermes and the restore and migration browser specs (48/48).
- **Review:** separate read-only Claude review and three focused re-reviews; all actionable findings fixed test-first; the last re-review found no blocking defects.

## Session summary — 19 November 2026 (Claude cloud session)

**Merged into local `develop` (not pushed):** PLAN-1, PLAN-2, PLAN-3, PLAN-4, SAVINGS-1, BACKUP-1, and a test-only fix for an intermittent backup-review browser test. Each went through a dedicated `codex/` branch, test-first slices, the full gate and a separate read-only Claude review with fixes on the same branch. `master` was not touched.

**Push status:** the push of this work to the session branch was refused by the cloud session's permission check, so everything exists only in the local repository of that session unless the owner pushes it or allows a push.

**Environment note:** Playwright 1.65.1's browser download was blocked by the network policy; browser tests ran against the preinstalled Chromium build linked to the expected path (not committed).

**Still blocked:**
- Owner decisions: LEDGER-1 (posting rule), LEDGER-2 (historical interest corrections), DRIVE-1 (shared-file access model), and a start-year rule for new recurring named costs (deferred from PLAN-3).
- Samples: IMPORT-1 (the other owner's sanitized bank export with expected rows), IMPORT-2 (representative Cashew rows and agreed classifications).
- Credentials or device: ANDROID-1 (app ID, signing ownership), ANDROID-2 (physical phone).
- Dependencies: FORECAST-1 can start once LEDGER-1 is decided (or explicitly scoped without posting changes); FORECAST-2 follows FORECAST-1; DRIVE-2 follows DRIVE-1. ETF work stays parked.

**Non-blocking owner questions** are listed in each ticket's handoff note above (PLAN-2: 4, PLAN-3: 3, PLAN-4: 4, SAVINGS-1: 3, BACKUP-1: 4).

## Session handoff — FORECAST-1 (19 November 2026, Claude cloud session)

- **Implementation:** `src/yearOutlook.js` builds a read-only year: past months use recorded results (a past month with neither records nor confirmation is *unavailable*, not zero), the current and later months use Expected savings (the current month's estimate already includes its recorded activity, so it counts once), and the frozen target sits beside them. The variance compares only months that have both an outlook and a target; with no plan there is no variance. Unconfirmed history marks forecast months *partial*. `src/yearOutlookDrivers.js` explains the forecast months: income changes, bills (with cancellations), loans and loan changes, everyday spending, named costs and reserve, and interest per scheduled account with its rate periods. `src/expectedInterest.js` estimates interest for accounts with a scheduled rate in the month using the existing compounding convention (estimates compound earlier estimates), replaces their historical interest in expected income, and counts recorded interest once instead of the estimate. One projection is shared across the year. Estimates never enter the ledger. The Year ahead tab (`src/YearOutlook.jsx`) shows the annual Recorded/Expected/Planned summary, the drivers and per-month rows with Plan, Recorded (or Scheduled) and Expected.
- **Posting semantics (LEDGER-1 not decided):** unchanged. Future-dated entries still count as registered activity in Expected savings; in Year ahead a future month with such entries shows their total as **Scheduled**, outside the Recorded and Expected totals.
- **Review fixes:** interest alone no longer makes a month available (recorded interest still does); historical interest is replaced only once a schedule applies to the month; future-dated entries stay visible; a shared interest projection and an id set in `compoundSavings` (startup posting unchanged); month rows announce every value to screen readers; confirmed empty months show €0; the drivers list the loans behind the total; a stronger backtest; shared `reportingPeriod`, `sumCents`, `signedEuro`, `loanPaymentForMonth` helpers.
- **Owner questions (non-blocking):** (1) Expected income adds scheduled interest on top of a scheduled income change, treating income changes as non-interest income. Is that what you mean by an income change? (2) Past months with records but no completeness confirmation count as recorded results without a *partial* label; should they be labelled too? (3) Year ahead, like the This month card, decides "today" by the UTC date (pre-existing, see PLAN-4 Q4). (4) If a bank-imported interest entry exists for a month that the app also estimated earlier in the projection, later months compound on the estimate rather than the bank amount (minor; relates to LEDGER-2's bank-versus-app interest question). (5) Backtesting is covered by tests that cut the ledger at an earlier date; the app has no backtest view.
- **Not done (style nit):** the long inline-style JSX rows in `YearOutlook.jsx` mirror the old screen and were not restructured.
- **Checks (`337f638`):** `npm run test:coverage` 345/345 with thresholds met, `npm run test:browser` 333/333, `npm run build`, `npm run check:android` (Hermes compilation only; no device test). **`c88a45e`:** `npm run test:coverage` 346/346, the five affected browser specs (93/93), build and Hermes.
- **Review:** separate read-only Claude review (no blocking defects; should-fix items fixed test-first), a focused re-review of the fixes (no blocking defects), and a final re-review of the nit commit.

## Session handoff — FORECAST-2 discovery (19 November 2026, Claude cloud session)

- **Branch:** `codex/forecast-comparable-costs`, open and unmerged; nothing pushed to `develop`. At discovery time `src/comparableCosts.js` was not imported by the app (the implementation note below supersedes this). `tests/comparableCosts.test.js` holds the synthetic evidence.
- **What the data supports today.** A named cost is `{ id, name, month, amount, year? }`. Payments link to one occurrence (`plannedCost: { eventId, month }`), or, through the older "Recorded expense for …" choice in Expected costs, to a cost without an occurrence (`outlook.eventPayments`) and paybacks link to payments. The H09 complete-month confirmation exists. There is no field that says what kind of cost an event is. The owner's earlier estimate for a cost is not kept: editing the amount overwrites it, and frozen plans store only each month's total of named costs.
- **Measured actual of an occurrence** (`plannedCostOccurrences`): the linked payments net of linked paybacks, using only transactions dated by the evaluation date and payback tasks created by then. Month confirmations and the cost's current month and amount are read as they are now, because the ledger keeps no history of them, so a backtest is not a perfect replay of what was known at the time. It counts as evidence (*completed*) only when (a) the owner has confirmed its month complete, (b) no payment is still linked to a moved month, (c) no linked payment has an open or partly received payback task (a task closed without payment releases it), and (d) at least one payment is linked. A confirmed month without linked payments is reported as *no payments*, not as a €0 cost. A fully refunded payment, however, gives a completed €0 occurrence. Unlinked spending in the same category and unlinked refunds never count. Payments matched only through the older "Recorded expense for …" choice in Expected costs (`outlook.eventPayments`) are not counted either.
- **Comparable rule tested:** only occurrences of the same recurring cost (same event ID) are compared. Names, payment categories and free text are not used, so one-off trips (each a separate event with a year) have no comparables yet.
- **Estimate tested** (`comparableCostEstimate`): with at least two completed occurrences, the median in whole cents plus the lowest-to-highest range and the occurrences used. With fewer, there is no estimate and the owner enters an amount.
- **Synthetic backtest** (each December predicted from what was known on 1 December, against the stored amount as the baseline): (1) if the stored amount is consistently low (€300 against €380–€450), the median's errors are €55/€10/€15 against €150/€120/€100; (2) if the stored amount is already accurate, the median is slightly worse (€10/€20/€0 against €10/€10/€0); (3) one unusual €1,200 year moves the median by only €5 and it stays €10 off, while an average would be €202.50 off (the accurate stored €400 was €5 off); (4) for a cost that rises steadily, the median lags (€60 off, against €90 for the stored amount and €30 for the latest year alone).
- **Conclusion:** comparing past occurrences helps only when the owner's amount is off, and it can hurt slightly when the amount is accurate. Synthetic data cannot show which case applies to your costs, so the comparison should be an optional suggestion beside your amount with its occurrences visible, never a replacement. Real benefit can only be measured on your own history, on your device. No estimate UI was built because the questions below decide its behaviour.
- **Owner questions (blocking implementation):**
  1. **Comparability for one-off costs.** Should named costs get an explicit group that you choose and can edit (for example *Domestic trip* or *International trip*), stored with the cost? Or should only repeats of the same recurring cost be compared? A group field is a schema change (validation, backups, merge and migration).
  2. **When an occurrence counts.** Is (a)–(d) above right? In particular, should a confirmed month with no linked payments mean "skipped" (excluded, current behaviour) or a real €0? And should a cost that was cancelled and fully refunded count as €0 (current behaviour, which lowers the median and range) or be excluded?
  3. **Payments after the occurrence.** Validation only lets a payment link to its own month or a later one. A trip settled after it happened (for example on a later card bill) can't be linked, so its measured actual comes out low. Should a payment be linkable to an earlier occurrence?
  4. **Accepting an estimate for a recurring cost.** A recurring cost has one amount for every year (PLAN-3's start-year question is still open), so accepting a suggestion would also change this year's forecast and other years. Should the accepted amount apply only to the draft year (a per-year amount), or from that year onwards?
  5. **Evidence threshold and estimator.** Is it acceptable to show a median and range from two completed occurrences, or should it need more? Should older years count equally, or only the last few?
  6. **Real-data check.** Do you want a local, read-only "how past estimates compared" view so you can judge the benefit on your own data before suggestions appear in the interview?
  7. **Older matched payments.** Expected costs still offers "Recorded expense for …", which matches one payment to a cost without naming an occurrence, and the forecast counts it as paid. Should such a payment count as evidence for the occurrence in the month it reports in, or should only payments linked to an occurrence count (current behaviour)?
  8. **Moving a recurring cost.** A recurring cost has one month for all years. Moving it (say from December to November) leaves every earlier year's payments linked to the old month, so those years need review and drop out of the evidence. The review can't be completed without changing history: validation stops a December payment linking to November of that year, and relinking it to next November moves its reporting month. Should a move apply only from a chosen year, so past occurrences keep their original month?
- **Checks:** `npm run test:coverage` 370/370 with thresholds met (`comparableCosts.js` 100% lines, 98% branches). Each status guard, the partly received payback status, the task creation-date filter and the date cut-off were checked by removing them and seeing a test fail. The browser suite, build and Hermes check were not run, because no app code imports the module and nothing will be integrated until the questions are answered.
- **Review:** separate read-only Claude review (no blocking defects; should-fix items fixed test-first in `8a0fe1b` or recorded as questions 2, 7 and 8) and a focused re-review (no blocking defects; question order, wording and this checks line fixed). Accepted nit: a payback task's creation date is its UTC date, compared with the local evaluation date.
- **Not merged:** the branch stays open until the owner answers the questions above. No new session was started, because no other ticket is unblocked.

### FORECAST-2 owner answers (19 November 2026)

Answered in chat; these replace the questions above. Terminology: the plan item is a **planned cost** everywhere in the UI, docs and questions (code keeps `events`). Expenses are the actual transactions linked to it.

1. **Comparable planned costs:** two planned costs compare when they have the same **top category**: the category holding the largest share of their linked expenses after paybacks, with subcategories rolled up to their parent. Past years of the same recurring planned cost compare automatically. A new planned cost has no linked expenses yet, so the owner picks once, when adding it, which past planned cost or category it is like; that choice is used only for the suggestion.
2. **Evidence:** a confirmed month with no linked expenses is skipped (current behaviour). A cancelled planned cost whose expenses were fully refunded is excluded, not counted as €0 (change needed).
3. **Late payments:** an expense dated after an occurrence may be linked to it and counts in that occurrence's month; cash still follows the payment date (validation and link-picker change).
4. **Accepting a suggestion:** applies to the draft year only (a per-year amount). Other years keep the planned cost's usual amount, and approved snapshots stay intact.
5. **Threshold:** suggest a median and range once three comparable completed planned costs exist, using the five most recent; with fewer, ask for an amount.
6. **Where it appears:** show the suggestion beside the owner's amount in the planning interview, with the past planned costs it came from. Never replace the owner's amount automatically. No separate comparison view.
7. **Older "Recorded expense for …" matches** do not count as evidence (current behaviour).
8. **Moving a recurring planned cost:** applies from a year the owner chooses; earlier years keep their original month and their linked expenses stay valid evidence.

The implementation note below records how these were built; it stores only per-year amounts and keeps schema v4.

## Session handoff — FORECAST-2 implementation (19 November 2026, Claude cloud session)

- **Evidence and comparison** (`src/comparableCosts.js`): an occurrence counts when its month is confirmed complete, no linked expense needs review, no payback task created by then is still open, at least one expense is linked, and its net is above €0 (fully refunded costs are *refunded* and excluded). Each planned cost's evidence uses only its own linked expenses and their paybacks. Planned costs compare by the same top category (largest net share, subcategories rolled up, ties to the first category ID). A recurring cost also compares with its own past years. A new cost uses the owner's like choice (a past planned cost or a top-level spending category; system categories are not offered). The suggestion is the median and range of the five most recent comparables once there are three; otherwise the owner enters an amount.
- **Late links:** an expense may now link to an occurrence before its date (validation and the picker, which offers occurrences from the year before the payment onwards and always keeps a saved link's own occurrence). Spending follows the occurrence month and cash the payment date.
- **Year amounts:** recurring planned costs may hold `yearAmounts` (`{ "YYYY": cents }`), used by plans, Expected savings, Expected costs and the Year ahead drivers through `plannedCostAmount`. It is an optional, validated field in schema v4 (no migration: older ledgers and backups simply lack it). Risk: an older app version would ignore it and use the usual amount. Two devices setting different year amounts on one planned cost produce a merge conflict to review, shown with the raw field name (`yearAmounts`) like other merge conflicts.
- **Interview** (`src/PlannedCostSuggestion.jsx`, shared by web and Android): the bigger-things step lists the revised months' planned costs at this year's amount. Recurring costs show their suggestion with the past costs behind it. **Use … for {year}** sets a draft year amount, **Keep usual** returns the year to the usual amount (also removing one saved by an earlier revision), and either choice marks the draft as changed. Nothing is stored until **Freeze my plan**, and earlier revisions and months before the revision start stay unchanged. A new cost can be compared with a past cost or a category, and **Use €…** only fills its amount field. The like choice resets when the cost is added or its name is cleared.
- **Not built:** (a) moving a recurring cost from a chosen year (F16) needs a screen that edits planned costs, and none exists; (b) the like choice is not stored, because it only serves the suggestion.
- **Checks:** on `74f83b7`, `npm run test:coverage` 388/388 with thresholds met, `npm run test:browser` 348/348, `npm run build`, `npm run check:android` (Hermes compilation only; no device test). The final nit commit `ac36777` was rechecked with `npm run test:coverage` (389/389), build, Hermes and the planned-cost browser spec on all three viewports (18/18).
- **Review:** a separate read-only Claude review of the implementation (no blocking defects; six should-fix items fixed test-first in `74f83b7`), a focused re-review (no blocking defects; two nits fixed in the final commit) and a final re-review of that commit.
- **Owner questions (non-blocking):** (1) Accepting a suggestion changes Expected savings as well as the plan, because a planned cost's amount is forecast evidence (the PLAN-3 convention). Is that what you expect? (2) Merge conflicts on year amounts show the raw field and cents, like other merge conflicts.
- **Owner answers (19 November 2026, in chat):** (1) Confirmed: accepting a suggested amount also changes Expected savings, because a planned cost's amount is forecast evidence; a target-only edit still leaves Expected savings unchanged (decision F19). (2) A year-amount merge conflict should read plainly, for example "December celebrations · amount for 2027: €410.00 here, €450.00 on the other device", instead of the raw field and cents (decision F20). Not built yet; queued as **FORECAST-2 follow-up · Readable year-amount merge conflicts** below.

## Session handoff — LEDGER-1 (19 November 2026, Claude cloud session)

- **Decision recorded:** L01 (owner) and L02 (derived from L01, awaiting confirmation) in DECISIONS.md. An entry dated after today counts in balances and monthly reports from its date, by the device's local date. Until then it is *scheduled*, stays visible and feeds forecasts. From its date it counts automatically, with no confirmation and no write to the ledger.
- **Implementation:**
  - `src/posting.js` (`isScheduledEntry`, `postedLedger`) holds the rule.
  - `accountBalance` defaults to today's local date.
  - `reportingMonthStats` uses posted entries for every month, including future ones. A future month therefore shows only posted early payments linked to it.
  - `scheduledMonthStats` and `scheduledAccountMovement` total scheduled entries apart. `expensePaybacks` splits received from scheduled paybacks.
  - Forecasts (`expectedSavings`, `yearOutlook`, `planInsights`, `planDraftEstimates`), drift alerts and the workbook summary use the posted ledger and the local date.
  - The app's starting month, startup and restore interest posting, the new-entry date, loan start/end defaults, rate editors and payback tasks all use the local date (`localCalendarDate`, `currentLocalMonth`). This replaces the UTC dates noted in PLAN-4 Q4 and FORECAST-1 Q3.
  - `useLocalDate` holds one "today" for the app (shared through the app context). It changes at local midnight while the app stays open and is checked again when the app returns to the foreground, so an entry counts on its date without a restart. Forms and a few one-off helpers still read the clock directly when they open.
- **UI (shared web/Android components):**
  - Activity rows say *Scheduled*.
  - Home shows today's balances and "N scheduled entries · ±€ when they post".
  - Account detail shows the balance today, posted movements, the scheduled change and the balance after scheduled entries.
  - An expense's detail counts only received paybacks as *Paid back*. A later payback shows as *Scheduled payback*.
  - Year ahead month rows show Recorded (posted, including posted early payments in a future month), a separate Scheduled cell (any month, including later this month and late payments for a past occurrence) and Expected.
  - The import review shows balances as of today, what the import schedules, and marks later-dated rows.
- **Kept as before (existing contracts, see questions 1–2):**
  - A past month's Expected stays its recorded result (FORECAST-1).
  - A scheduled payback does not reduce Expected before its date (conservative payback rule). Both are shown as Scheduled.
- **Owner questions (non-blocking; current behaviour keeps the existing contracts):**
  1. A late payment dated after today for a past planned cost (F15) is shown as Scheduled in that past month, but Expected for the past month and the year total leaves it out until its date. Should it count in Expected before its date?
  2. A payback recorded with a future date is shown as Scheduled but does not lower Expected spending until it arrives. Should a recorded future payback lower the prediction before its date?
  3. Home's Recent activity sorts newest date first, so several bills dated later this month can push today's entries out of the top five. Keep this, or show scheduled entries in their own "Upcoming" group?
  4. L02: please confirm that the local date also drives the app's starting month and the default dates of new entries and loans (implemented that way). **Answered (19 November 2026): confirmed; the phone's local date is used everywhere.** Done on `codex/confirm-l02-local-date`: backup and transaction CSV file names (web and Android, through `src/exportFileNames.js`), a payback task's creation day in planned-cost evidence, and the dates shown for a frozen plan's approval, plan revisions and a payback closed without payment (through `localDateOfTimestamp` in `src/calendar.js`) now use the local date too. Imported Cashew/bank dates keep the date written in the file. An unreadable stored timestamp shows the existing "not recorded" text. The revision label in a merge-conflict review is covered through the shared helper's unit test, not a browser flow. UTC stays only where it is exact by design: stored timestamps and checks that a typed date such as 2026-11-19 is a real calendar date.
  5. Savings interest still posts only when the app starts or a backup is restored. An app left open across a month end shows the new month's balances but posts last month's interest only on the next start. Is that acceptable?
  6. The xlsx export's month summary and drift alerts were treated as monthly reports (posted entries only); raw transaction exports keep every entry. Confirm.
- **Paybacks screen:** a later payback shows *Scheduled payback · counts from <date>*; the original's net and the header total count received paybacks only.
- **Checks (`b9bfbfd`):** `npm run test:coverage` 404/404 with thresholds met (96.3% lines, 94.5% branches), `npm run test:browser` 384/384, `npm run build`, `npm run check:android` (Hermes compilation only; no device test).
- **Review:** separate read-only Claude review (one blocking defect: expense rows and details counted a later payback as received; should-fix items for drift alerts, the workbook summary, loan defaults, the import preview, a stale Year ahead after a day change and style), then three focused re-reviews. They found two more items: a second "today" source that could disagree after midnight, and the same payback defect on the Paybacks screen. All were fixed test-first. The last re-review found no blocking defects.
- **Not done (nits):** backup and CSV file names still use the UTC date; a scheduled payback's amount stays green on the Paybacks screen; a payback task's creation day is a UTC day (accepted in FORECAST-2); the future-month Home label reads "December · posted so far".

## Session handoff — FORECAST-2 follow-up: move a recurring planned cost (19 November 2026, Claude cloud session)

- **Owner answers:** F17 (a *Planned costs* card in Year ahead with **Move…**; first year this year or later; expenses linked to the old month in a moved year stay linked and are flagged for review) and F18 (a move from this year needs its old and new month to be this month or later; otherwise it starts next year). Recorded in DECISIONS.md and in the ticket above.
- **Storage:** optional `monthFromYear` (`{ "YYYY": month }`) on recurring planned costs, schema v4, no migration; `month` stays the original month. Validated, kept by full restore, merged as one field (conflict when two devices move one cost differently). Documented in docs/STATE_MIGRATIONS.md. Risk: an older app version ignores it and keeps the original month every year.
- **Implementation:** `plannedCostMonth`, `plannedCostOccurrenceMonth` and `plannedCostsInYear` in `src/plannedCosts.js` give each year's month; plans, Expected costs/Expected savings, Year ahead, comparable-cost evidence, the planned-cost picker and the interview's planned-cost list use them. `src/plannedCostMoves.js` holds the move rules (allowed years and months, normalization that replaces later moves and drops repeats, a preview naming the first year that really changes, the later moves replaced, and only the expenses the move itself sends to review). UI: `src/PlannedCostList.jsx` and `src/MovePlannedCostDialog.jsx`, shared by web and Android; the move saves at once and never touches frozen plans or transactions.
- **Checks:** `npm run test:coverage` 432/432 with thresholds met (96.4% lines, 94.6% branches) on `a8c5f0e`; `npm run test:browser` 402/402 on `e1c3798` (later commits only add a unit test and two small nits, rechecked with the planned-cost, suggestion and Year ahead specs on all three viewports, 45/45); `npm run build`; `npm run check:android` (Hermes compilation only; no device test).
- **Review:** separate read-only Claude review (one blocking product gap: moving into or away from a month already past this year, answered by the owner as F18; should-fix items for the preview summary, the review count, redundant moves and a render guard), a focused re-review of the fixes (no blocking defects; boundary tests and two nits added) and a final re-review of the last commit (no findings).
- **Accepted nits:** the success notice is shown even if a concurrent change makes the functional state update a no-op (the existing PlanForm pattern); first years are capped at five years after the first allowed year; if the date rolls over while the dialog is open, confirming shows the past-month error instead of re-clamping; a field-level merge could in theory pair `year` from one device with `monthFromYear` from the other (same pre-existing exposure as `yearAmounts`; no UI makes a recurring cost one-off).
- **Owner questions (non-blocking):** none new.

## Session handoff — LEDGER-2 (19 November 2026, Claude cloud session)

- **Decisions recorded:** L03–L06 in DECISIONS.md (owner answers): reviewed flow on the account; one marked correction entry per affected month; per-month choice for bank interest; all affected months previewed with compounding effects and applied together.
- **Implementation:**
  - `src/interestEntries.js` tells app entries (by ID, even if re-dated, while still Interest income), corrections (`correctsInterestMonth`) and bank interest (any other Interest income on the account) apart, and holds the stored per-month choices (`interestBankChoices`).
  - `src/interestCorrection.js` reviews an account against a draft schedule and draft choices: it recompounds every completed month on corrected amounts, lists changed months (recorded, corrected, difference, *compounding effect*) and months needing a bank choice, and applies exactly the reviewed result. A stale or repeated apply is refused; a month without an app entry gets its ordinary entry, otherwise a numbered correction (highest kept number + 1).
  - `compoundSavings` posts no app interest for a month holding bank interest until the owner keeps both, nor for a month holding corrections.
  - Corrections are the only signed entries (validation in `transactionValidation.js`); `interestBankChoices` is validated in `stateSchema.js` (additive, no version bump; see STATE_MIGRATIONS.md). Canonical CSV (`corrects_interest_month`), JSON backup rows and the workbook raw sheet keep the marker and sign; import comparison includes the marker.
  - `correctedSchedule`/`correctedScheduleWithout` allow past rate periods only for the correction draft; the normal editor still refuses them.
- **UI (shared web/Android):** account detail shows a *Past interest* card for savings accounts (differing months and total, or months needing a bank choice) with *Correct past interest* / *Review past interest*. The dialog edits past rates as a draft, offers *Bank amount only* / *Keep both* per month, lists affected months and the total, blocks Apply while a choice or a typed-but-unset rate is pending, asks before discarding a changed draft and validates the ledger before saving. Activity rows and details show a negative correction with a minus; correction details explain it and have no Edit button.
- **Owner questions — answered 19 November 2026 (L07):** 1 keep (no Edit), 2 keep (later months previewed), 3 keep (main category only), 4 limit to the account's first entry or first rate period → LEDGER-2a; 5 is a statement of current behaviour, not asked. Original questions, current behaviour in brackets:
  1. Corrections cannot be edited, only superseded by reviewing again [no Edit]. The ordinary app interest entry stays editable; edits to it then show up as differences in the review. OK?
  2. While a bank-interest choice is pending, later months are previewed as if the app entry stayed [their differences change once you choose]. Acceptable, or hide later months until every choice is made?
  3. Bank interest means Interest income in the system *Interest* category itself, not its subcategories [subcategories ignored, as in the forecast]. Should a subcategory count?
  4. A typed start month far in the past (e.g. a mistyped year) makes the review slow; should the earliest correctable month be limited, for example to the account's first entry?
  5. In the import row editor a negative correction row cannot be edited (it can be imported or skipped).
- **Checks (merged tree with ANDROID-1, DRIVE-1 and L02):** `npm run test:coverage` 475/475 with thresholds met (96.6% lines, 94.6% branches), `npm run test:browser` 426/426 on the final run (earlier runs hit only the BUG-1 flake below), `npm run build`, `npm run check:android` (Hermes compilation only; no device test).
- **Review:** separate read-only Claude review (two blocking defects: an unscheduled legacy rate and a re-dated app entry each produced an unsaveable ledger; four should-fix items: backup/workbook round trips, repeated correction numbers, startup posting over corrected months, a typed rate ignored by Apply), then two focused re-reviews (two should-fix leftovers fixed in `870e6a0`); the last found no blocking or should-fix issues. All fixes were test-first.
- **Bug found between tasks (BUG-1, not fixed here; since fixed, see "Bug fix — BUG-1" below):** the browser test `fullRestore.spec.js` "a ledger saved by another tab after the preview makes the preview stale" fails intermittently on `develop` itself (all three viewports in one full run of `e53517f`; about 2% of repeated runs, more under load). When it fails, the restore dialog closes without the stale-preview notice. The likely cause is that the app's own save of its in-memory ledger lands after the simulated other-tab write, so the bytes match the preview again. This is unconfirmed. It needs its own `codex/` bug branch from `develop`: first decide whether the app or the test is at fault, then add a failing regression and fix it. The LEDGER-2 merge passes everything else.
- **Not done (nits):** a correction cancelling an app entry re-dated into the next month is still dated in its own month, so that month's end balance dips until the re-dated entry's date; the review is not bounded in time (queued as LEDGER-2a); an older app build would report a ledger holding a negative correction as unreadable rather than as a newer version (all devices should run the same build).

## Session handoff — ANDROID-1 (19 November 2026, Claude cloud session)

- **Owner answers** (DECISIONS.md A01–A08):
  - Application ID `com.havensum.app`.
  - Android 7.0+ (API 24) portrait phones, targeting SDK 36.
  - First delivery is a sideloadable release APK; the Play AAB path stays configured.
  - The owner builds on their own PC with local Gradle and keeps the upload keystore. There is no EAS, Expo account or cloud-held key.
  - Android Auto Backup is off.
- **Configuration:**
  - `app.json` sets the package, `versionCode 1` (now 2, see the startup-crash bug fix below), `allowBackup: false` and three removed permissions (legacy storage read/write, overlay).
  - `plugins/withHavensumReleaseSigning.cjs` signs release builds from four `HAVENSUM_UPLOAD_*` properties in the owner's user Gradle properties. A release build fails without them; there is no debug-key fallback.
  - `eas.json` reads the version from `app.json` (`appVersionSource: local`); it is unused.
  - `.gitignore` covers `/android/`, APK/AAB and keystore files.
  - The build, signing, install and version steps are in [docs/ANDROID_BUILD.md](ANDROID_BUILD.md).
- **Build profile and signing ownership:**
  - Release APK via `assembleRelease` (AAB via `bundleRelease` later).
  - Signed with the owner's upload keystore, held only by the owner.
  - The first package ships as version code 1. Each later package that reaches a phone gets a version code raised by 1 in a `develop` commit first.
- **Not built here:** the container has no Android SDK, and its network blocks `dl.google.com` (Android SDK and Google Maven) and `api.expo.dev`. No APK, installation or device test existed at that point (since built from `fd55ca2`, see the ANDROID-1 table). The first `assembleRelease` and the missing-key guard are unverified until the owner's PC build. Record that build in the ANDROID-1 table above.
- **Checks** (merged with develop at 75a8108):
  - `npm run test:coverage` 434/434, thresholds met.
  - `npm run test:browser`.
  - `npm run build`.
  - `npm run check:android` (Hermes compilation only).
  - `tests/androidPackage.test.js` runs `expo prebuild` offline and checks the generated application ID, version code, backup, removed permissions, release signing, guard and repeatability.
- **Review:** a separate read-only Claude review found no blocking defects, and its should-fix items were fixed in `7784250`: Windows Gradle commands, a debug/release signature-clash warning, a portable test, and a ticket status with a build record. A re-review (no blocking defects) prompted `e175ca7`, which keeps the keystore outside the checkout, corrects the password advice and the `npm run android` wording, removes a duplicated plugin message, makes test cleanup safe, and corrects the backlog status. A final re-review found no blocking defects; its two nits (this line, and cleanup tolerating a missing link) were fixed in `ee85ae0`. A full review of the whole branch found no blocking defects; its build-guide fixes (cmd-safe commands, commands run from the repository root, Windows tool paths, the first version code, EAS incompatibility) were applied in `065dfab`, whose focused re-review found no blocking defects; its three wording nits were fixed in the closing commit.
- **Owner questions (non-blocking):**
  1. Should debug builds get a separate ID (`com.havensum.app.debug`) so a development build can sit beside the real app on the same phone? For now the guide warns against installing a development build on the phone that holds your data.
  2. The Expo `slug` is still `melo-money`. Local builds don't use it; rename it only if EAS is adopted later.
  3. `package.json` has a duplicate `expo-crypto` dependency key (pre-existing). It is harmless; `expo prebuild` removes it when it rewrites the file.
- **Device check for ANDROID-2:** prebuild warns that `userInterfaceStyle: automatic` needs `expo-system-ui` on Android. Check dark mode and the system bars on the phone.
- **Unverified on Windows:** the prebuild test's Windows changes (Expo CLI through `node`, a junction for `node_modules`) were not run on Windows.

## Session handoff — DRIVE-1 (19 November 2026, Claude cloud session)

- **Owner answers (multiple choice; the recommended option was chosen each time):**
  - `drive.file` only (G01).
  - Either person creates the file and shares it with the partner as editor. The partner picks it once in Google's picker (G02). The creator stays owner (G03).
  - Sign-out or revocation keeps local data and pauses sync (G04).
  - Everything except per-device display preferences is shared with both people (G05).
  - Theme and display preferences stay per device (G06).
- **Follow-up answers after review:**
  - Create is blocked while example data is loaded (G07).
  - A joining partner with local entries either adopts the file (after a recovery copy) or merges with a review of every one-sided record (G08).
  - Setup offers Open first, and Create warns to check with the partner (G09).
  - Sync runs automatically, with a Sync now button and a web Reconnect state (G10).
- **Documents:**
  - DECISIONS.md section "DRIVE-1" (G01–G10).
  - [DRIVE_ACCESS_MODEL.md](DRIVE_ACCESS_MODEL.md): who can find, read and update the file; how access changes; transport constraints; what DRIVE-2 must verify; the owner's Cloud setup.
- **Research limits:**
  - Google's facts came from search results of the official pages. This session's network could not open developers.google.com or support.google.com directly.
  - Not documented, so DRIVE-2 must verify:
    - whether `drive.file` grants survive revocation and re-consent;
    - the Android desktop/mobile Picker's redirect and client requirements;
    - whether an unverified-app screen appears with only a non-sensitive scope.
  - Drive v3 documents no conditional (If-Match) writes, so the write protocol cannot assume compare-and-swap.
- **Open for DRIVE-2 (owner to confirm):** does a joining device that holds only the example data adopt the shared file without the adopt-or-merge choice?
- **Not done:** no Drive code was written (out of scope for this ticket). Nothing is verified with real accounts. S03 (baseline/revision protocol) and the first-join merge for a partner who already has local data are DRIVE-2 design work.
- **Review:** a separate read-only Claude review checked the docs against the codebase and Google's documentation. It could not fetch Google's pages either, so it checked against known documentation. It found no blocking defects. It raised five should-fix items: the empty-baseline merge was described wrongly; theme/device keys conflicted with "same as the backup"; and three unrecorded owner choices (demo data, two files, sync timing and first join), which the owner then answered as G07–G10. It also raised four nits. Two re-reviews followed; their items were fixed in `754e18d` and `8d7e7f6`. The last re-review found nothing blocking or should-fix.
- **Checks:** this change is docs only. Develop gained the F16 follow-up code, so every check was rerun after merging the latest `origin/develop` (`75a8108`) into the branch:
  - `npm run test:coverage` 432/432 with thresholds met (96.4% lines, 94.5% branches);
  - `npm run test:browser` 402/402;
  - `npm run build`;
  - `npm run check:android` (Hermes compilation only; no device test).

## Session handoff — DRIVE-2a (19 November 2026, Claude cloud session)

- **Split:** the owner approved splitting DRIVE-2 into DRIVE-2a (this ticket, credential-free sync core) and DRIVE-2b (Google transport and two-account verification, still blocked on the owner's Google Cloud setup and ANDROID-1's Android client ID).
- **Owner answers (multiple choice, recommended option first):**
  - A device holding only example data adopts the shared file directly (recommended; D2A-01).
  - The missing-category review list is shared (the owner chose "Share it" over the recommended "Stay on device"; D2A-02).
  - IMPORT-1 is closed as not needed (recommended; the DRIVE-1 session relayed the same clarification: both owners use the same bank layout).
- **Implemented (new modules):**
  - `sharedFileDocument.js`: the file envelope and the shared/device key classification.
  - `sharedFileBinding.js`: the file-bound link and baselines.
  - `sharedFileRead.js` and `sharedFileSync.js`: the protocol, with write-ahead, verify and lost-race re-merge.
  - `sharedFileMerge.js`: shared-ledger merge, review of deleted-but-used records, and the shared warning list.
  - `sharedFileJoin.js`: first join, adopt or merge, and a second file.
  - `sharedFileStatus.js`: triggers, scheduler, progress saver and card states.
  - `sharedFileTransport.js`: the transport contract.
  - `mergeReview.js`: choice handling extracted from the backup merge, now shared by both.
  - `SharedFileStatus.jsx`: the Drive row in Settings. It honestly shows "Not connected", with Open before Create, both disabled, and Create blocked with example data.
  - Storage: `havensum-shared-file-binding-v1` and `havensum-shared-file-join-recovery-v1`, with web/native parity and an atomic ledger+link save. `melo-sync-base` is unchanged.
  - Decisions are D2A-01–D2A-09 in DECISIONS.md. The protocol is described in DRIVE_ACCESS_MODEL.md under "Sync core (DRIVE-2a)".
- **Tests:**
  - 76 node tests against an in-memory stand-in for the Drive boundary only, covering:
    - two devices, independent and same-field edits;
    - edit/delete and deleted-but-used records;
    - concurrent plan revisions;
    - lost races, overwritten verified writes, lost write replies and stopped apps;
    - corrupted and older-schema files, lost access, deleted files, an expired session and offline;
    - first join, adoption with recovery, a second file;
    - the scheduler, and edits during a sync save.
  - Native storage parity.
  - Browser tests for the Settings row at three viewports, including 320 px.
- **Not done (DRIVE-2b):**
  - No Google OAuth, Picker or HTTP code. Drive is not claimed to work.
  - The review and join dialogs and the app wiring are not built (scheduler, `createSyncProgressSaver` with `snapshotBinding` and `adoptSavedState`, and `commitSharedFileJoin`), because nothing can reach them without a transport.
  - The Android AsyncStorage row size with five snapshots of a large ledger must be checked.
- **Review:** a separate read-only Claude review (fresh subagent given the spec and the diff) ran on the branch and on each fix:
  - **First pass:** two blocking findings.
    - A lost write reply or a stopped app could let a lagging baseline revert the partner's later changes. Fixed by write-ahead link snapshots and an atomic ledger+link save.
    - A record deleted on one side and used on the other was merged silently or broke sync. Fixed by offering it for review and refusing invalid merges.
    - It also raised ten should-fix items and several nits, all fixed.
  - **Four re-reviews:** they found successive should-fix items in the sync-progress saver, all fixed test-first:
    - install the saved ledger in the app;
    - keep an edit typed during a save;
    - leave a collision typed during a save for review;
    - keep that edit saved.
  - **Final re-review of `1e0aa07`:** no blocking or should-fix findings remain.
- **Owner gate:** the owner chose to fix BUG-1 (the flaky full-restore stale-preview test, which also failed on unmodified `develop`) before merging. DRIVE-2a waited until BUG-1 landed (`9d393e1`).
- **Merge with `develop`:**
  - Brought in BUG-1, BUG-2, LEDGER-2a, the IMPORT-2 follow-up, F20 and the ANDROID-1 build record.
  - In `Screens.jsx`, kept F20's conflict cards and used the shared merge-choice module.
  - Kept every sibling's DECISIONS and backlog sections, and carried the Android package and SHA-1 into the DRIVE-2b blocker.
  - A merge review found that the joint ledger+link save skipped BUG-1's cross-tab check. Fixed in `f96f18c` with a regression test. The re-review found nothing blocking or should-fix.
  - DRIVE-2b must make the app's own autosave use `writeStateIfUnchanged` while sync is wired (recorded in DRIVE-2b).
- **Checks (final merged tree with K13):** `npm run test:coverage` 601/601 with thresholds met (97.3% lines, 95.0% branches); `npm run test:browser` 477/477; `npm run build`; `npm run check:android` (Hermes compilation only; no device test).

## Session handoff — IMPORT-2 · Extend Cashew verification (19 November 2026)

- **Scope:** synthetic rows mirroring the published Cashew export (owner choice K01). Owner answers K01–K09 are in DECISIONS.md; behaviour and known limits are in the IMPORT-2 section of docs/CASHEW_IMPORT_RESEARCH.md. Nothing beyond the ordinary EUR rows from v6.7.5+524 is verified against a real export; no exact Cashew compatibility is claimed.
- **Implemented:** both layouts read Dart double amounts to integer cents (v1 previously rejected float tails; comma and zero-padded amounts are now row errors in both layouts — a deliberate tightening); paid scheduled entries import after classification (K04); budget/objective shown read-only (K07); a unique opposite Balance Correction pair is preselected as a transfer and import confirms it (K05/K09) (recognised by the transfer note since K11); `debt` rows import only against a chosen Havensum loan, as proceeds or a repayment in the loan category (K02/K03), and are never transfer legs; lending stays blocked; editing imported proceeds keeps the loan tag. Coverage added for accents, renames on both sides, same-file payback links and malformed cells.
- **Checks:** `npm run test:coverage` (449 pass on the tree merged with develop `5b2164d`; all files 96.65% lines), `npm run test:browser` (417 pass), `npm run build`, `npm run check:android` (Hermes export = compilation only).
- **Review:** separate read-only Claude review found 1 blocking (debt credit usable as a transfer leg) and 4 should-fix items; all fixed test-first, the owner answered the pair-confirmation question (K09), and the re-review found nothing actionable.
- **Still needs the owner:** a small sanitized Cashew export of their version with a transfer pair, a payback, a scheduled entry, a borrowing row and populated budget/objective, plus the expected Havensum result, to move these cases from synthetic to verified.

## Bug fix — Android release crashes at startup (19 November 2026, Claude cloud session)

- **Found by:** the owner's first release APK (version code 1), built on their PC from `develop` and installed on their phone. It closed immediately. Logcat: `ReanimatedError: [Reanimated] Invalid predefined timing function "cubic-bezier(0.23, 1, 0.32, 1)"` in `MotionPressable`.
- **Cause:** `src/Motion.native.jsx` passed the curve to Reanimated 4's CSS-style transitions as a `cubic-bezier(...)` string. On native, Reanimated's `transitionTimingFunction` longhand accepts only named curves or its easing builders (such as `cubicBezier()`). The web accepts the string, and Hermes compilation (`check:android`) can't detect it, so no earlier check caught it.
- **Fix:** `src/motionTransitions.native.js` builds the press and meter transition settings (property, duration, reduced motion) with the same curve made by `cubicBezier(0.23, 1, 0.32, 1)`. `MotionPressable` and `Meter` use these builders. Web motion is unchanged.
- **Regression test:** `tests/native/motionTiming.test.js` runs both components' transition settings, with normal and reduced motion, through Reanimated's own `normalizeCSSTransitionProperties`, the startup path that threw. Reanimated is loaded in Node by `tests/helpers/reanimatedInNode.js`, with only `react-native` and `react-native-worklets` stubbed. With the old string curve the test failed with the device's exact error.
- **Review:** a separate read-only Claude review found nothing blocking. Its should-fix item (test the components' real transition settings, not just the curve) and its nits (the current module-mock option, doc wording, a note on Reanimated's internal paths) were fixed before merging, and a focused re-review of those fixes found nothing blocking.
- **Version:** `versionCode` raised to 2, because version code 1 is already on the owner's phone.
- **Verified by the owner:** the rebuild from `fd55ca2` (version code 2) installs over version 1 and starts on the owner's phone. Other screens and flows are not device-checked yet (ANDROID-2).

## Session handoff — IMPORT-2 follow-up: the owner's real Cashew test export (19 November 2026)

- **Input:** a small test export from the owner's Cashew app (newer layout; version not stated). Kept out of Git and review inputs as private runtime data; `tests/cashewExportShape.test.js` uses synthetic rows with the same structure.
- **Owner answers:** K10 (`extra` shown read-only, never blocks), K11 (transfer legs recognised by the `Transferred Balance` / `from → to` note, category ignored), K12 (a row with an objective may be recorded against a chosen Havensum loan by its sign, otherwise classified normally).
- **Result on the real file:** the transfer pair is suggested; paid scheduled rows await a classification; unpaid ones stay row errors; objective rows offer an optional loan; ordinary and payback rows await a classification.
- **Checks:** `npm run test:coverage`, `npm run test:browser`, `npm run build`, `npm run check:android` on the tree merged with develop: 499 unit tests (thresholds met) and 435 browser tests pass. Hermes export is compilation only.
- **Review:** separate read-only Claude review: nothing blocking; two should-fix test gaps and doc/style nits fixed; re-review found one stale doc passage, now corrected.
- **Still unverified:** older `debt`/`credit` type rows (K02), the published v1 layout beyond ordinary rows, and loan objectives used for lending. The owner later confirmed the loan-objective sign follows the cash (K13); the review now spells out what a loan-linked row becomes. No exact Cashew compatibility is claimed.

## Session handoff — FORECAST-2 follow-up · Readable year-amount merge conflicts (F20) (19 November 2026, Claude cloud session)

- **Implemented** (`fa0d73d`, review fix `2633179` on `codex/readable-year-amount-conflicts`):
  - New `src/yearAmountConflicts.js`. After `mergeThreeWay`, it adds the planned cost's name and each side's usual amount to `events`/`yearAmounts` conflicts, for display only.
  - The card title names the planned cost and the differing years, for example "December celebrations · amounts for 2027 and 2028".
  - Each side (This device / Backup file) lists one line per differing year, such as "Amount for 2027: €410.00". A year with no year amount on a side reads "usual amount (€400.00)" with that side's usual amount. An empty set against no set reads "No year amounts; every year uses the usual amount (€X)".
  - The merge decision is unchanged: one conflict per planned cost, and choosing a side takes that side's whole `yearAmounts`.
  - The review card moved into a small `MergeConflictCard` component in src/Screens.jsx. Each side is now a button whose screen-reader name reads its label and every line, and which reports its selected state.
  - Other conflict types are untouched. A browser test guards planned-cost edit-versus-delete.
- **Tests:** tests/yearAmountConflicts.test.js (7 unit tests: one year, several years, years set on different sides, all year amounts cleared, empty set against none, an undescribed conflict, other conflicts passed through unchanged) and tests/browser/yearAmountConflicts.spec.js (choosing the backup takes its whole set plus accessible names; long name and large amounts at 320 px; edit-versus-delete still works).
- **Checks** on the tree merged with origin/develop `f5e71d5`:
  - `npm run test:coverage`: 495/495 (96.89% lines, 94.80% branches);
  - `npm run test:browser`: 441/441;
  - `npm run build`;
  - `npm run check:android` (Hermes compilation only; no device test).
- **Review:** a separate read-only Claude review found nothing blocking. It raised one should-fix (an empty `{}` against no year amounts gave a broken title) and one robustness nit (rendering an undescribed conflict would crash). Both were fixed test-first, and the re-review found nothing blocking.
- **Deferred nits:**
  - A short hint that the usual amount shown is each side's own.
  - Moving the merge card into its own file. This was left alone to keep churn small in the shared Screens.jsx.
- **Not done / owner:** separate merge choices per year would be a new owner question; nothing was asked.

## Session handoff — LEDGER-2a · Earliest correctable month (19 November 2026, Claude cloud session)

- **Implemented (L07):** `earliestCorrectableMonth` (`src/interestCorrection.js`) is the earliest of:
  - the account's first entry month. Any entry on the account counts; a transfer counts by its target only when it is a transfer. App interest and corrections count by the month they belong to, even if re-dated.
  - its first stored rate period.
  - the current month.

  The review refuses a draft rate before that month (`InterestScheduleError`) before it loops, so a mistyped year never reviews centuries of months. Apply re-reviews, so it refuses it too.
- **Dialog:** `correctedSchedule` takes the bound, and `src/InterestCorrection.jsx` shows the earliest month as a hint. The hint and the refusal share `correctableStartText`; when the bound is only the current month, it says the account has no earlier entries or rate periods. A draft that falls behind the bound at month rollover shows the message and disables Apply instead of crashing the dialog.
- **Changed tests:** two LEDGER-2 tests that started a correction before any recorded entry now record the money on its date (a transfer in, a first deposit). Their expected amounts are unchanged.
- **Owner answers (L08):** no extra lookback floor; a mistyped entry date is fixed by editing or deleting that entry. An account with only an opening balance is correctable from the current month only. The account form's legacy past start gets the same limit, queued as **BUG-2**.
- **Checks (tree merged with develop `278466c`):** `npm run test:coverage` 514/514 with thresholds met (96.9% lines, 94.8% branches); `npm run build`; `npm run check:android` (Hermes compilation only, no device test). `npm run test:browser`: 450/453. The three failures are the known BUG-1 flake (`fullRestore.spec.js` "makes the preview stale", all viewports in one run); the same test passed 9/9 when rerun alone. The pre-merge run of this branch had 440/441 with the same flake.
- **Review:** a separate read-only Claude review found nothing blocking. It raised two should-fix items: the hint named the current month as the account's first entry, and a mistyped entry year reopens the slow path (an owner question, answered in L08). It also raised nits: `toAccount` on non-transfers, style, and hand-written bounds in tests. All were fixed test-first in `90460b2`. A re-review found nothing blocking or should-fix; it left two optional nits (argument shape of `correctableStartText`, a default wording when no current month is passed), not changed.

## Bug fix — BUG-1 · Flaky stale-preview full-restore test (19 November 2026, Claude cloud session)

- **Status:** done and reviewed on `codex/bug-1-stale-restore-flake`, merged into `develop` by the no-fast-forward merge that follows this record (commits `124a81b`, `7b91fc7`, `2cfa345`, `3fe4232`, `098ef47`, plus the final test and decision commit).
- **Root cause (confirmed, a product defect):** the preview captured the saved ledger bytes only after `await file.text()`. If another tab or window saved during that window, its bytes became the preview's baseline. The confirm-time check then passed, and the restore overwrote the other tab's save. The pre-restore copy held this tab's stale in-memory ledger, so the other tab's save was lost. The test flaked because its simulated other-tab write ran right after `setFiles` resolved, sometimes before the preview read storage. The earlier guess (this tab's own save landing late) was wrong.
- **Evidence:** a temporary diagnostic (not committed) delayed the file read and logged every ledger read and write. The other-tab write at 1500 ms preceded the preview's read at 1881 ms. The restore then went ahead, and the recovery copy held the light-theme ledger while the other tab had saved the dark one. Natural reproduction did not recur here: 0 of about 700 repeated runs, including under CPU load.
- **Fix:**
  - `src/persistedState.js` remembers the bytes each storage instance last read or saved per key.
  - The restore checks them before writing the pre-restore copy, and again in the same queued step as the final save (`writeIfUnchanged` / `writeStateIfUnchanged`, with `SavedStateChangedError` re-exported through `./storage`).
  - A failed save leaves the remembered bytes unchanged, so a restore after a failed save behaves as before.
  - `isRestorePreviewCurrent` is unchanged.
- **Owner decisions:** R01 (the refusing tab reloads the ledger saved elsewhere and says so; choosing the backup again can then proceed) and R02 (that reload keeps no copy of the refusing tab's unsaved edits), in DECISIONS.md.
- **Tests:**
  - Browser: the original test now waits for the preview before the other tab's save. New tests cover a save while the backup is read, a save between the check and the final save, an unreadable save from the other tab, and a refusal followed by a successful restore over the reloaded ledger.
  - Unit (storage): guarded save refused after another tab saved since this instance last saved or read, refused over data never read, allowed after a failed save, allowed on a fresh install and after a legacy migration.
- **Checks (merged tree with the latest `develop`, `bfdd415`):**
  - `npm run test:coverage` 505/505 (96.75% lines, 94.74% branches);
  - `npm run test:browser` 444/444, and 447/447 after the last test commit;
  - `npm run build`;
  - `npm run check:android` (Hermes compilation only; no device test);
  - stress: all other-tab tests 180/180 with `--repeat-each 15 --workers 6`.
  - after merging the latest `develop` (`361138a`, LEDGER-2a and the F20 follow-up): `npm run test:coverage` 520/520 (96.84% lines, 94.71% branches), `npm run test:browser` 465/465, `npm run build`, `npm run check:android`.
- **Review:**
  - Three separate read-only Claude reviews.
  - Round 1 found a false refusal after a failed save and a window between the check and the final save. Both were fixed (`7b91fc7`).
  - Round 2 found the stuck refusal, which the owner resolved as R01 (`098ef47`), plus style nits that were fixed (`3fe4232`).
  - Round 3 found no correctness defect. Its medium point became R02. Its test gap on the reload-failed path was closed.
- **Known limits (not changed):**
  - App's ordinary save on every state change still overwrites other tabs; this predates BUG-1.
  - A refusal caused by this tab's own later edit (old "stale" notice) has no browser test, because the modal preview blocks edits; the rule is unit-tested.
  - If another tab removes the ledger key entirely, the notice asks for an app reload but a retry is allowed.
  - The reload does not reopen the missing-category review automatically; its button is shown.

## Session handoff — BUG-2 · Account-form past start for a legacy rate (19 November 2026, Claude cloud session)

- **Fixed (L08):** the account form's past start month for an unscheduled legacy rate can no longer be earlier than `earliestCorrectableMonth` (`src/interestCorrection.js`). Before, a mistyped year such as `1026-01` was saved, and startup then posted app interest for every completed month since.
  - `scheduleWithPeriod` (`src/interestSchedule.js`) takes a `correctableBound` for the legacy past start and refuses earlier months with the shared `correctableStartText` message.
  - Without a bound, a legacy past start may start from the current month only, so a future caller cannot reopen the unlimited path.
  - `src/AccountForm.jsx` computes the bound (`legacyRateCorrectableBound`) for both Save and Add rate period. `src/InterestScheduleEditor.jsx` shows the same earliest-month hint as the correction dialog while the legacy rate has no start.
  - An account with only an opening balance may start the legacy rate from the current month only. Once a schedule exists, the existing current-or-future rule is unchanged.
- **Tests:**
  - Browser (`tests/browser/interestSchedule.spec.js`, all three viewports):
    - a mistyped year on an account with only an opening balance is refused, posts nothing and keeps the hint inside the narrow dialog;
    - a legacy rate funded by a transfer in on 2026-10-01 refuses 2026-09 and still accepts 2026-10, posting October's interest.
  - Unit (`tests/interestSchedule.test.js`): the bound, the opening-balance-only case, the schedule rule and the unbounded fallback.
- **Changed test:** the existing browser test "an unscheduled legacy rate earns nothing until its start month is chosen" started a past rate on an account with only an opening balance, which L08 now limits to the current month. It now records the money on its date with a transfer in, as LEDGER-2a did. The expected interest (949 cents) is unchanged.
- **Checks (tree merged with develop `9d393e1`, BUG-1):**
  - `npm run test:coverage`: 522/522 (96.85% lines, 94.72% branches);
  - `npm run test:browser`: 468/468;
  - `npm run build`;
  - `npm run check:android` (Hermes compilation only; no device test).
- **Review:** a separate read-only Claude review found nothing blocking.
  - Should-fix, fixed in `9edb458`: a past start without a bound was still unlimited and asserted by tests; a dense ternary in the form.
  - Nits fixed in the same commit: gate the hint on a legacy rate; fund the account with a transfer in the browser test.
  - A re-review found nothing blocking. Its test nit (pin the current-month fallback) was fixed in `ba3ca1a`.
  - Not changed: memoizing the bound (the correction dialog computes it the same way) and splitting the combined unit test.
- **Process note:** the first failing browser regression was run and seen failing before the fix, but both landed in one commit (`a124a61`).
- **Not done / owner:** nothing needed. A stored schedule that already starts in a mistyped year (saved before this fix, or from a backup) is not limited here. Fixing it would be a separate owner question; nothing was asked.

## Session handoff — IMPORT-2 closed (19 November 2026)

- **K13 follow-up:** the owner confirmed the loan-objective sign follows the cash (+ = loan money received, − = a payment on the loan). The sign rule stays; the review now spells out what a loan-linked row becomes. Merged and pushed as `e6e026a` after the full gate (523 unit, 468 browser, build, Hermes compile) and a read-only Claude review with nothing blocking.
- **Board:** IMPORT-2 is closed. Optional only: real exports with older `debt`/`credit` type rows (K02), the published v1 layout beyond ordinary rows, or a loan objective used for lending would verify those cases.

## Session handoff — PLAN-3 follow-up · "Repeats every year" from the plan's year (19 November 2026, Claude cloud session)

- **Owner answers recorded:** P04 (a new repeating cost counts from the drafted year onwards), P05 (a draft starts from a newer loan payment; queued as **PLAN-3 follow-up b** because loans keep no edit date), P06 ("Copy existing scheduled changes" after a same-year revision is acceptable; no change). See DECISIONS.md and the ticket above.
- **Storage:** optional `fromYear` on recurring planned costs (schema v4, no migration). It is validated (a four-digit integer, never on one-off costs), kept by full restore, and merged three-way as one field, so different start years become a conflict for the owner. Recurring costs without it still apply to every year. Documented in docs/STATE_MIGRATIONS.md. Risk: an older app version ignores it and applies the cost to every year.
- **Implementation:**
  - `plannedCostOccursInYear` in `src/plannedCosts.js` now decides whether a cost occurs in a year everywhere this is checked: plans, Expected costs/Expected savings, Year ahead, draft estimates (`plannedEventIds`), comparable-cost evidence, the planned-cost picker, the interview's planned-cost list and the Year ahead *Planned costs* card.
  - Moves start no earlier than `fromYear`.
  - A saved link from before a cost starts stays selectable and reads "…, before it repeats".
  - UI: a **Repeats every year** switch in step 2 of the interview. Its description ("Counts from 2027 onwards. 2026 and earlier stay as they are." or "Off: 2027 only.") is read with the switch. The amount label becomes "Amount each year · EUR". Lists show "every year from 2027".
  - The shared `Toggle` (src/ui.jsx) now exposes its description: `aria-describedby` on web, `accessibilityHint` on Android.
- **Tests:**
  - tests/plannedCostStartYear.test.js (18 unit tests): plans by year; validation; picker and pre-start links; comparable evidence; draft estimates; moves; Expected savings; Year ahead; legacy costs; year amounts; a same-year revision keeping earlier snapshots; a target-only edit leaving Expected savings unchanged; restore; merge.
  - tests/browser/plannedCostStartYear.spec.js, on all three viewports. Covers a next-year draft with a long name at 320 px, the accessible description, the saved `fromYear`, unchanged 2026 plans and the Year ahead lists, and a revision of this year's plan that keeps the cost out.
  - tests/browser/plannedCostMove.spec.js now uses retrying option assertions, after one intermittent desktop failure in a full run.
- **Checks:**
  - `npm run test:coverage`: 524/524 (96.91% lines, 94.87% branches).
  - `npm run build`, and `npm run check:android` (Hermes compilation only; no device test).
  - `npm run test:browser` on `a1a1582`: 448/450. The 2 failures are the known intermittent `fullRestore.spec.js` stale-preview test (owned by the sibling BUG-1 session).
  - The affected specs were rerun on `1df059b`.
  - On the tree merged with origin/develop `87e827b` (LEDGER-2a, BUG-1, BUG-2, K13, DRIVE-2a; the later IMPORT-2 board update `3f0b3a4` is docs-only): `npm run test:coverage` 619/619 (97.29% lines, 95.06% branches), `npm run test:browser` 483/483, `npm run build`, `npm run check:android`.
- **Review:** a separate read-only Claude review raised nothing blocking. Its should-fix items (the switch description was not read by screen readers; no target-only regression) and nits (pre-start link wording, suggestion candidate timing, a realistic merge case) were fixed test-first. The re-review found nothing blocking; its two nits (one-off link wording, empty-description guard) are fixed in `1df059b` and were re-reviewed.
- **Deferred nits:** readable merge-conflict wording for `fromYear` (shown raw, like `monthFromYear`); splitting the dense step-2 JSX in `PlanForm` into its own component; a native render test for the `Toggle` hint.
- **Owner question (non-blocking; current behaviour is the safe default):** in a same-year revision (for example in November), the month list only offers the months still being revised. A repeating cost whose month has already passed (say every March) therefore cannot be added from that interview. Should such a cost (a) start next year automatically, (b) stay as it is: add it from next year's interview, or (c) other?
- **Not done:** PLAN-3 follow-up b (P05) is queued, not started.

## Session handoff — PLAN-3 follow-up b · Draft loan payment from a newer loan edit (20 November 2026, Claude cloud session)

- **Decisions made within the ticket (not owner questions):**
  - Only a save of the loan form that changes the monthly payment counts as a payment edit. A rename, other loan details, a new loan, imports, demo data and Outlook settings' expected payments do not stamp it.
  - The edit time is an exact UTC instant (`new Date().toISOString()`), like the plan's `createdAt` and payback task times. L02 governs calendar dates ("today"), not instants. An instant also orders an edit and an approval made on the same day.
- **Storage:** optional `paymentEditedAt` on loans (schema v4, no migration). It is validated as an exact UTC instant (`src/loanPaymentEdits.js`, `src/stateSchema.js`), kept by full restore, and merged three-way as one field. A payment edit on both devices gives `payment` and `paymentEditedAt` conflicts for the owner. Documented in docs/STATE_MIGRATIONS.md, with clock-skew and older-version limits.
- **Behaviour (`src/planCarryForward.js`):**
  - When the loan's `paymentEditedAt` is later than the source plan's `createdAt`, the carried change in effect at the draft start is not restated. The draft, step-2 placeholder ("160 · unchanged") and carried list then show the loan's own payment.
  - Changes after the draft start still carry in their months.
  - Legacy loans keep the carried change, and so do plans whose `createdAt` is missing or not an exact UTC instant.
  - The loan form stamps the field through `editedLoan`.
- **Tests:**
  - tests/loanPaymentEdit.test.js (12 unit tests) covers:
    - an edit after approval winning, with a later change still carrying;
    - legacy loans;
    - an edit before approval;
    - plans without an approval time, or with a loose one;
    - a newer revision after the edit;
    - a same-year revision keeping earlier months and snapshots;
    - validation, what counts as a payment edit, restore and merge;
    - a target-only edit leaving Expected savings unchanged.
  - tests/browser/loanPaymentEdit.spec.js runs on all three viewports. It edits the payment in the loan form, then checks step 2's list and placeholder, the frozen 2027 plan and the unchanged 2026 snapshot. A rename keeps the carried change. The first browser test was seen failing without the fix.
- **Checks:**
  - On `3a5b76d`: `npm run test:coverage` 630/630; `npm run test:browser` 489/489.
  - On `8cf22f1`: `npm run test:coverage` 631/631 (97.30% lines, 95.05% branches). The affected browser specs (loanPaymentEdit, planCarryForward) passed 21/21. `npm run build`, and `npm run check:android` (Hermes compilation only; no device test).
- **Review:** a separate read-only Claude review found nothing blocking.
  - Should-fix 1 is fixed test-first in `8cf22f1`: a non-ISO plan `createdAt` could parse differently on Hermes and V8, so only exact UTC instants are compared now.
  - Nits fixed in the same commit: a duplicate loan lookup, an unreachable guard and the documented limits.
  - A re-review of `8cf22f1` found nothing blocking. Its test-naming nit (a `_` prefix on an unused local) is fixed in the board commit. Not changed: seconds-only timestamps (without milliseconds) count as having no time, which is the safe, documented fallback; the app always writes milliseconds.
- **Deferred nits:**
  - Readable merge-conflict wording for `paymentEditedAt`, which is shown raw like `fromYear`.
  - Importing the storage key in browser specs, which other specs also hard-code.
- **Owner answers (20 November 2026):** add a "Not applied: …" note for a loan change replaced by a newer loan payment (P07, queued as **PLAN-3 follow-up c**). The PLAN-3 follow-up question about a repeating cost whose month has passed in a same-year revision is answered: keep as is and add it from next year's interview (P08).
- **Open edge, not asked:** a plan change scheduled between the edit and the draft start (for example a December drop approved in March, with the payment edited in September) also yields to the edit, because the rule compares approval times as specified.

## Session handoff — IMPORT-2 source-informed transfer rules (19 November 2026)

- **Why:** the owner asked to infer the remaining cases from Cashew's open-source code. Findings are in the last section of docs/CASHEW_IMPORT_RESEARCH.md. Owner answers K14 (translated note headings and the `←` arrow), K15 (legs up to 60 seconds apart) and K16 (lending guidance on objective rows) are in DECISIONS.md.
- **Branch:** `codex/cashew-source-transfer-rules` from develop; merged into `develop` and pushed.
- **Implemented:** transfer notes accepted with any of Cashew's 43 translated headings (`src/cashewTransferHeadings.js`, attributed, matching data only) and either arrow; legs up to 61 seconds apart (K15 raised from 60 after review); date-only timestamps compare at midnight; the objective note warns that Havensum loans are for money borrowed only (K16).
- **Checks:** `npm run test:coverage`, `npm run test:browser`, `npm run build`, `npm run check:android` on the merged tree (counts in the merge commit message). Hermes export is compilation only.
- **Review:** separate read-only Claude review (one should-fix: Cashew's minute rollover can put the legs 61 s apart, answered by the owner as K15 = 61 s; nits fixed); re-review found nothing blocking.

## Session handoff — owner answers after PLAN-3 follow-up b (20 November 2026)

- **P07 cancelled:** the owner stopped the "Not applied" note (PLAN-3 follow-up c) mid-session. Nothing merged. Its branch `codex/replaced-loan-change-note` is on origin for reference only.
- **P09 recorded, queued as LOAN-1:** loan payment history with a month for each change, one-off extra payments and advance payments, and an owner-chosen plan revision that follows the history from the month the payment changed, including passed months of the current year. See the LOAN-1 ticket and DECISIONS.md.
- **The P05 edge case** (a scheduled plan change between the loan edit and the draft start) goes away under P09: the new payment applies from its chosen month, and later scheduled changes for that loan no longer apply.
- **AGENTS.md was not edited:** P09 records the owner-approved exception to "never rewrite a plan's historical months". The owner may want AGENTS.md updated to match.
- **P10 (same day):** each loan payment change gets an until month (default "forever"). Temporary and one-month changes return to the earlier payment afterwards and get the same plan prompt. Added to LOAN-1.

## Session handoff — LOAN-1a · Loan payment history (20 November 2026, Claude cloud session)

- **Scope:** owner split LOAN-1 into 1a/1b/1c (P11) and asked to finish all three in this session without chaining (P18). Payment history stays loan-only; repeating bills and subscriptions stay as today (P18).
- **Branch:** `codex/loan-payment-history` from `develop` (`dca73ac`), with `origin/develop` (P10, `d82eebf`) merged in. Schema version 5 adds `paymentChanges` (docs/STATE_MIGRATIONS.md).
- **Owner answers:** P11–P22 in DECISIONS.md (this ticket's split, Prediction assumptions, interview, advance payment, balance-only prompt, AGENTS.md line, copy toggle, scope, migration carry rule, labelled prediction overrides). The sibling's P10 (until month) is implemented.
- **Superseded:** P05's timestamp comparison now only shapes the one-time migration; `paymentEditedAt` is kept, no longer written. The cancelled follow-up c branch was not merged.
- **Tests:** new unit files tests/loanPaymentHistory.test.js and tests/loanPaymentMigration.test.js (replacing tests/loanPaymentEdit.test.js); browser spec tests/browser/loanPaymentHistory.spec.js (replacing loanPaymentEdit.spec.js); plus carry-forward, Year Outlook and Prediction-assumptions cases. UI tests for the first loan form were written after the form, not test-first; later fixes were test-first.
- **Review:** two separate read-only reviews; all blockers and should-fixes fixed test-first (same-year revisions, UTC edit month, start-month folding and overlapping temporaries, a one-month change in a lasting change's month, plans vs non-normalized histories, drivers card, copy toggle, explicit payment-change step, form saving onto the current loan). Owner questions from review answered as P19–P21; P22 (passed months in a revision change only the loan line) is queued for LOAN-1b. A third review found a migration crash on plans with two changes in one month and form/normalization issues, all fixed test-first.
- **Checks:** `npm run test:coverage` 672/672 (97.43% lines, 95.21% branches); `npm run test:browser` 537/537 (full run before the last two wording/flag nits; the loan spec 45/45 after them); `npm run build` passes; `npm run check:android` exports (Hermes compilation only).
- **Known nits (review, not fixed):** the loan form lists and edits the history as saved and folds at a new start only on save; when the form removed an entry, its list replaces a history change synced from another device while it was open; moving the start earlier shows no hint that the starting payment also covers the earlier months; a temporary payment equal to the amount already in effect still adds an entry.
- **Not done here:** Android physical-device verification (Hermes export only). Pushing the task branch was refused by a permission check; `develop` is pushed after merge.

## Session handoff — LOAN-1b · Keep my plan / Revise from <month> (20 November 2026, Claude cloud session)

- **Branch:** `codex/loan-plan-revision` from the local `develop` merge of LOAN-1a (`338369d`). New `src/loanPlanRevision.js` (first changed month, revision offer, restated loan lines), `src/LoanPlanPrompt.jsx`; the loan form opens the prompt after a payment change; `PlanForm` takes a `loanRevision`; Year Plan marks a restated revision; plans may hold `loanRestatedFrom` (validated).
- **Owner decisions:** P09, P15 (no prompt for balance-only), P16 (AGENTS.md line, added), P22 (only the loan line in passed months), P23 (only the changed loan), P24 (first planned year affected), P25 (a loan the plan never held is only added; plans record per-loan shares).
- **Review:** a separate read-only review found an offer for changes confined to past years, a save that could never succeed after a month rollover, and all loans being restated; fixed test-first (P23/P24 asked of the owner). A second review found a negative loan line for a loan the plan never held (P25 asked and fixed with per-loan shares), an offer that could switch years while the interview was open (now refused), and the mark naming a month before the first restated one; all fixed test-first. The mark is not carried to later ordinary revisions (documented). A December change saved on 1 January is refused as a past year rather than re-offered for the new year. A third review found the older-plan fallback untested and loose share validation; tests and a share-sum check were added. Plans frozen before LOAN-1b have no shares, so for their passed months P25's weaker rule applies (the share removed never exceeds the frozen loan line).
- **Checks:** `npm run test:coverage` 689/689 (97.49% lines, 95.30% branches); `npm run test:browser` 552/552; `npm run build` passes; `npm run check:android` exports (Hermes compilation only).
- **Known nits (review, not fixed):** a negative loan payment (only possible in a hand-edited backup; the schema predates this ticket) would make a new plan fail the loan-share check with a technical message; the loan-history browser helper answers the plan prompt whenever it appears.
- **Tests:** tests/loanPlanRevision.test.js (offers incl. past-year-only and first planned year, restatement with and without loan shares, P25, the mark's first month, validation of the mark and shares, the save recheck, target-only Expected savings regression); tests/browser/loanPlanRevision.spec.js (Keep my plan byte-identical, revise from a passed month, no prompt for a balance-only edit or a year without a plan, narrow layout, Year Plan mark). The Year Plan mark's browser check was added after its code.

## Session handoff — LOAN-1c · Advance and one-off extra payments (20 November 2026, Claude cloud session)

- **Branch:** `codex/loan-advance-payments` from `develop` (`37d599d`, LOAN-1a and LOAN-1b pushed). New `src/loanAdvancePayments.js` and `src/AdvancePaymentForm.jsx`; a **Record advance payment** button on the loan card (src/LoansScreen.jsx); the loan form can open ready for a new payment; transactions may hold `loanAdvance: true` (validated; dropped when edited into something else).
- **Owner decisions:** P09, P14 (loan card action), P15 (a balance-only change offers no plan revision; the advance's own balance change asks about the payment instead).
- **Tests:** tests/loanAdvancePayments.test.js (advance save, floor at zero, invalid amounts and loans, mark validation, one-off extra payment leaving history and plans unchanged); tests/browser/loanAdvancePayments.spec.js (advance and No, advance then a new payment and the LOAN-1b prompt, empty advance refused, one-off extra payment with no prompt, narrow layout, editing an advance).
- **Known limitations:** deleting or editing an advance later does not restore the remaining balance; CSV and the workbook do not export the advance mark.

