# Havensum feature backlog

**Next implementation ticket: PLAN-3.** Work through PLAN-1 to PLAN-4 in order, one ticket per session, then SAVINGS-1. The later tickets are queued. ETF work is parked. This board is the handoff for Luna and future sessions.

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

**Status:** Queued. **Depends on:** PLAN-2.

- Reuse the three-step interview. Prefill recurring income, applicable income and loan changes, history window, and review thresholds from the latest earlier plan. Use amounts effective at the start of the period and show later changes in their applicable months. Preserve deliberately entered zeros.
- Show earlier manual overrides beside fresh suggestions. Apply the ones the owner chooses to keep. For a same-year revision, prefill that year's current overrides. Surface assumptions for removed categories or closed loans without applying them.
- Carry recurring events into applicable years and leave one-off events in their original year. Preview draft targets and available forecasts month by month before **Freeze my plan**. Adding a named cost supplies new evidence to the forecast. Editing only a draft target leaves the forecast unchanged.
- Cover no prior plan, zero amounts, applicable changes carried once, keep/drop override, stale category and loan references, a one-off trip, a recurring event, history-window edits, and abandoning a draft. Verify older snapshots and same-year past months remain intact on save.

### PLAN-4 · Offer the interview and verify rollover

**Status:** Queued. **Depends on:** PLAN-3.

- In Year Plan, offer the existing interview on first use and when the current calendar year has no plan. **Later** suppresses the invitation for that calendar year on the installation. Keep manual entry and future-year selection available. Approval removes the invitation once that year has a plan.
- Opening, dismissing, deferring, or restarting the interview changes no financial records. Cover a fresh ledger, January rollover, a prebuilt new-year plan, deferral across reload, and manual entry after deferral.
- Use shared web and Android UI. Verify narrow layouts, long names, and large amounts, the browser rollover flow, and Android compilation.

### SAVINGS-1 · Schedule savings interest by period

**Status:** Queued after annual planning. **Depends on:** PLAN-4 for sequencing.

- Allow effective annual percentage rates per savings account, each with a unique start month. Display the period through the month before the next rate starts. Display the final rate as ongoing. A promotional rate ends when the successor starts, including a successor of 0%.
- Preserve legacy single rates and start behavior. Use the existing monthly compounding convention, round to integer cents, and generate at most one interest entry per account and completed month. Allow scheduling current and future months. Keep recorded interest intact. Historical corrections belong to LEDGER-2.
- Version the schedule schema and retain exact pre-migration ledger and baseline bytes in recovery slots for the source version. Keep prior recovery copies. Represent a legacy single rate as the first period when the account has a start month. Without a legacy start month, retain the saved rate as an unscheduled value and show it when setting up the schedule. Generate no historical entries until the owner sets a start month. Include rate schedules in validation, JSON backups, and reviewed merge. For legacy backups that cannot represent the schedule, preserve an existing schedule and review any conflicting legacy rate rather than collapsing it. If BACKUP-1 is already implemented, verify it restores rates along with the rest of the ledger. Cover migration of legacy rates both with and without a start month, invalid percentages and month keys, duplicate starts, a zero-rate period, a December-to-January change, non-positive eligible balances, and repeat reloads.
- On €1,000 at a 12% effective annual rate, the existing convention gives €9.49 for one completed month. A following month at 0% adds no interest. FORECAST-1 uses future rates for estimated interest without posting them.

## Queued recovery, import, and accounting

### BACKUP-1 · Full JSON restore

**Depends on:** PLAN-1.

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

**Depends on:** Annual planning and SAVINGS-1. Coordinate posting-dependent changes with LEDGER-1.

- Show recorded, expected, and planned annual income, expenses, and savings together. Combine recorded past months with expected totals for current and future months. The current-month estimate includes recorded activity, so count it once. Label unavailable months and partial evidence. When there's no frozen target, display the forecast without a variance.
- Explain income changes, bills, loans, named costs, reserves, and scheduled savings rates. For accounts with scheduled-rate estimates, replace the historical interest component for forecast periods and include recorded interest once. Estimates stay out of the ledger.
- Test a midyear forecast, incomplete history, a partial-year frozen plan, changed obligations, late paybacks, and a target-only edit. Where evidence allows, backtest from an earlier date using only information available then and compare with later actuals.

### FORECAST-2 · Learn from comparable completed costs

**Depends on:** FORECAST-1. **Status:** Discovery before implementation.

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
