# Havensum feature backlog

**FORECAST-2 discovery is done and blocked on owner decisions** (branch `codex/forecast-comparable-costs`, open and unmerged; see its handoff note at the end). No other ticket is unblocked. PLAN-1–4, SAVINGS-1, BACKUP-1 and FORECAST-1 are done and merged into `develop`. Every other ticket needs owner input, samples, credentials or a device; see the session summaries at the end of this file. Work through PLAN-1 to PLAN-4 in order, one ticket per session, then SAVINGS-1. The later tickets are queued. ETF work is parked. This board is the handoff for Luna and future sessions.

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

**Status:** Done, reviewed and merged into `develop` from `codex/plan-carry-forward` (implementation `4923875`, review fixes `5117fec`, `42609b9`). The new recurring-cost option is deferred pending an owner decision. See the PLAN-3 handoff note below. **Depends on:** PLAN-2.

- Reuse the three-step interview. Prefill recurring income, applicable income and loan changes, history window, and review thresholds from the latest earlier plan. Use amounts effective at the start of the period and show later changes in their applicable months. Preserve deliberately entered zeros.
- Show earlier manual overrides beside fresh suggestions. Apply the ones the owner chooses to keep. For a same-year revision, prefill that year's current overrides. Surface assumptions for removed categories or closed loans without applying them.
- Carry recurring events into applicable years and leave one-off events in their original year. Preview draft targets and available forecasts month by month before **Freeze my plan**. Adding a named cost supplies new evidence to the forecast. Editing only a draft target leaves the forecast unchanged.
- Cover no prior plan, zero amounts, applicable changes carried once, keep/drop override, stale category and loan references, a one-off trip, a recurring event, history-window edits, and abandoning a draft. Verify older snapshots and same-year past months remain intact on save.

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

Reuse the Real Bank adapter if the second layout matches. Otherwise create a distinct verified profile. Verify original headers and accents, date and amount conventions, confirmed value-date handling, signs, fees, refunds, ambiguous transfer labels, and the chosen date for transfer legs that differ. Test repeated and overlapping exports, scoped matching, identical legitimate purchases, and pairing two reviewed legs into one neutral transfer. Use only synthetic or carefully sanitized fixtures in Git.

### IMPORT-2 · Extend Cashew verification

**Needs:** Representative rows and agreed classifications for the cases the owner uses.

Ordinary EUR rows from v6.7.5+524 are already verified. Check real transfer and payback rows where available. Agree how to handle borrowing, lending, scheduled entries, and populated metadata before widening support. Test both layouts, accents, integer-cent handling, matches after renames and layout changes, account creation only on confirmation, and original-expense links. Unverified entries retain their review status.

### LEDGER-1 · Posted versus future-dated activity

**Needs:** Owner decision on when a scheduled entry becomes posted and which date drives each view.

Apply the agreed rule to current balances, account details, reports, forecasts, and import previews. Scheduled items can inform forecasts while current cash reflects posted movements. Cover today, month-end, time zones, future transfers, early planned-cost payments, and received paybacks.

### LEDGER-2 · Historical interest corrections

**Needs:** Owner decision on backdated balances and rates, and whether bank-posted interest replaces an app entry.

Design a reviewed, explicit correction flow after agreement. Show the affected completed months and downstream compounding. Cover a corrected past balance, existing bank interest, duplicate prevention, cancel, and repeated application.

## Queued forecast improvements

### FORECAST-1 · Full-year outlook in Year Plan

**Status:** Done, reviewed and merged into `develop` from `codex/year-outlook` (implementation `ff59a6d`, `275cd73`, `4302b60`; review fixes `337f638`, `c88a45e`). Scoped by the owner without posting changes. See the FORECAST-1 handoff note below. **Depends on:** Annual planning and SAVINGS-1. Coordinate posting-dependent changes with LEDGER-1.

- Show recorded, expected, and planned annual income, expenses, and savings together. Combine recorded past months with expected totals for current and future months. The current-month estimate includes recorded activity, so count it once. Label unavailable months and partial evidence. When there's no frozen target, display the forecast without a variance.
- Explain income changes, bills, loans, named costs, reserves, and scheduled savings rates. For accounts with scheduled-rate estimates, replace the historical interest component for forecast periods and include recorded interest once. Estimates stay out of the ledger.
- Test a midyear forecast, incomplete history, a partial-year frozen plan, changed obligations, late paybacks, and a target-only edit. Where evidence allows, backtest from an earlier date using only information available then and compare with later actuals.

### FORECAST-2 · Learn from comparable completed costs

**Depends on:** FORECAST-1. **Status:** Discovery done on `codex/forecast-comparable-costs` (open, unmerged). Implementation is blocked on the owner questions in the FORECAST-2 handoff note below.

Check whether completed events and linked actuals improve predictions over a simple baseline. Domestic and international trips are examples of comparable expenses. Test sparse history, outliers, incomplete and partially paid events, moved events, refunds, and reimbursements. Decide what makes events comparable and what evidence the UI can expose. Avoid inferring trip type from free text alone.

If the evidence supports it, design an editable estimate or range that shows its comparable events. When evidence is sparse, ask for an amount. Accepting an estimate is an explicit draft choice and leaves approved snapshots intact.

## Queued delivery and integrations

### ANDROID-1 · Installable package

**Needs:** App ID, target runtime and device support, and owner-controlled signing setup.

Produce an installable Android build. Record source commit, build profile, and signing ownership. Keep credentials and compiled artifacts out of Git. A Hermes bundle is only a compilation check.

### ANDROID-2 · Physical-device QA

**Depends on:** ANDROID-1 and access to a physical phone.

Test installation and upgrade, offline startup, storage recovery, file picker and sharing, decimal input, keyboard resize, Android back navigation, safe areas, TalkBack, font scaling, and planning rollover. Record the device, build, results, and reproducible failures. Fix and retest release blockers.

### DRIVE-1 · Shared-file decisions

**Needs:** Owner decisions on OAuth and sign-in, file ownership and discovery, revocation, and personal-account visibility.

Document who can find, read, and update the file and how access changes. Verify the agreed access model before implementing transport.

### DRIVE-2 · Shared Drive sync

**Depends on:** DRIVE-1.

Use the reviewed merge engine with revision-aware writes, offline retry and recovery, and visible conflict review. Verify two devices with independent edits, same-field edits, deletion, concurrent plan revisions, interrupted writes, and stale writes. Confirm the agreed account visibility.

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

- **Branch:** `codex/forecast-comparable-costs`, open and unmerged; nothing pushed to `develop`. Discovery only: `src/comparableCosts.js` is not imported by the app and nothing reaches the UI, the ledger or approved snapshots. `tests/comparableCosts.test.js` holds the synthetic evidence.
- **What the data supports today.** A named cost is `{ id, name, month, amount, year? }`. Payments link to one occurrence (`plannedCost: { eventId, month }`) and paybacks link to payments. The H09 complete-month confirmation exists. There is no field that says what kind of cost an event is. The owner's earlier estimate for a cost is not kept: editing the amount overwrites it, and frozen plans store only each month's total of named costs.
- **Measured actual of an occurrence** (`plannedCostOccurrences`): the linked payments net of linked paybacks, using only entries dated by the evaluation date, so a backtest sees only what was known then. It counts as evidence (*completed*) only when (a) the owner has confirmed its month complete, (b) no payment is still linked to a moved month, (c) no linked payment has an open or partly received payback task, and (d) at least one payment is linked. A confirmed month without linked payments is reported as *no payments*, not as a €0 cost. Unlinked spending in the same category never counts.
- **Comparable rule tested:** only occurrences of the same recurring cost (same event ID) are compared. Names, payment categories and free text are not used, so one-off trips (each a separate event with a year) have no comparables yet.
- **Estimate tested** (`comparableCostEstimate`): with at least two completed occurrences, the median in whole cents plus the lowest-to-highest range and the occurrences used. With fewer, there is no estimate and the owner enters an amount.
- **Synthetic backtest** (each December predicted from what was known on 1 December, against the stored amount as the baseline): (1) if the stored amount is consistently low (€300 against €380–€450), the median's errors are €55/€10/€15 against €150/€120/€100; (2) if the stored amount is already accurate, the median is slightly worse (€10/€20/€0 against €10/€10/€0); (3) one unusual €1,200 year moves the median by only €5 and it stays €10 off, while an average would be €202.50 off; (4) for a cost that rises steadily, the median lags (€60 off, against €90 for the stored amount and €30 for the latest year alone).
- **Conclusion:** comparing past occurrences helps only when the owner's amount is off, and it can hurt slightly when the amount is accurate. Synthetic data cannot show which case applies to your costs, so the comparison should be an optional suggestion beside your amount with its occurrences visible, never a replacement. Real benefit can only be measured on your own history, on your device. No estimate UI was built because the questions below decide its behaviour.
- **Owner questions (blocking implementation):**
  1. **Comparability for one-off costs.** Should named costs get an explicit group that you choose and can edit (for example *Domestic trip* or *International trip*), stored with the cost? Or should only repeats of the same recurring cost be compared? A group field is a schema change (validation, backups, merge and migration).
  2. **When an occurrence counts.** Is (a)–(d) above right? In particular, should a confirmed month with no linked payments mean "skipped" (excluded, current behaviour) or a real €0?
  3. **Payments after the occurrence.** Validation only lets a payment link to its own month or a later one. A trip settled after it happened (for example on a later card bill) can't be linked, so its measured actual comes out low. Should a payment be linkable to an earlier occurrence?
  4. **Accepting an estimate for a recurring cost.** A recurring cost has one amount for every year (PLAN-3's start-year question is still open), so accepting a suggestion would also change this year's forecast and other years. Should the accepted amount apply only to the draft year (a per-year amount), or from that year onwards?
  5. **Evidence threshold and estimator.** Is it acceptable to show a median and range from two completed occurrences, or should it need more? Should older years count equally, or only the last few?
  6. **Real-data check.** Do you want a local, read-only "how past estimates compared" view so you can judge the benefit on your own data before suggestions appear in the interview?
- **Checks:** `npm run test:coverage` 362/362 with thresholds met (`comparableCosts.js` 100% lines). Each status guard was checked by removing it and seeing a test fail. The browser suite, build and Hermes check were not run, because no app code imports the module and nothing will be integrated until the questions are answered.
- **Review:** see the review line added after the Claude review below.
