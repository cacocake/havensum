# Implementation plan and acceptance checks

## Milestone 1 — dependable offline Android build

1. Establish a matching Expo development runtime and install an APK on a physical Android phone.
2. Exercise date picking, decimal keyboard/IME resize, nested category sheets, native back navigation, safe areas, TalkBack, font scaling, reduced motion, document picking, JSON sharing and Excel sharing.
3. Add plan history keyed by year/revision. Creating a new year must preserve every prior frozen month and allow viewing its snapshot.
4. Model posted versus future/planned transactions. Today's balance must exclude future cash until its defined posting date.
5. Define fixed recurring costs and cancellation semantics; avoid relying only on the last non-zero aggregate. Add completeness gating to drift recommendations.
6. Add schema validation/migrations, collision-resistant IDs and a reviewed full-JSON restore path. Preserve a recovery copy before any replacement.
7. Decide savings accrual convention and how backdated edits/rate changes are reconciled.

Acceptance: an installable package; real-device verification recorded separately from compilation; no sample data silently mixed into a real ledger; no prior plan data loss; date/history/interest/import regressions covered by meaningful tests.

## Milestone 2 — onboarding and the annual interview

- Ask the owner's intended plan year, income, regular fixed costs, expected income/loan changes, trips, big purchases and seasonal costs.
- Persist interview completion and annual review state. Offer an explicit prompt for a new year rather than automatically replacing a plan.
- Let the owner review calculated amounts, missing history, manual overrides and the cushion before freezing.
- Clarify whether the occasional cushion is estimated from history, entered manually, or both, and whether its separate plan line remains the preferred presentation.
- Display review suggestions without recalculating. Preserve transaction overrides and past snapshots.

Acceptance: the initial interview can start from a genuinely empty ledger; a user can defer it; new-year creation is explicit and safe; no current or historical snapshot changes because of an ordinary transaction.

## Milestone 3 — actual Cashew compatibility and recovery

- Obtain a representative real export. Identify version, file shape, IDs, timestamp/date timezone, amount units/signs, account/category nesting, transfers and reimbursement representation.
- Create a sanitized fixture plus expected normalized records. Support account/category mapping and suggested spending behaviour.
- Namespace external identifiers by source. Specify handling for edited imported records and identical legitimate rows without IDs.
- Test a repeated import, a reimbursement imported with its original expense, a transfer with both accounts remapped, and Excel raw round trips.
- Distinguish transaction import from complete state restore in the UI.

Acceptance: importing the real fixture produces agreed totals and account balances; rerunning has no accidental duplicates or missing legitimate rows; all transformations are previewed.

## Milestone 4 — shared Drive file

Resolve scope/ownership/discovery and personal-account visibility with the owner before implementing transport. `drive.file` is a candidate, not a completed decision.

Implement OAuth, file identity, baseline persistence and a revision-aware read/merge/write flow. Add compare/retry behavior for simultaneous writes, offline queues, corruption recovery and visible sync states. Reuse the tested merge/conflict engine. Treat field conflicts, record deletion and concurrent plan revisions as explicit review tasks.

Acceptance: two independent devices merge unrelated edits silently; same-field and edit/delete conflicts are presented side by side; an interrupted or concurrent write cannot silently lose data; sharing does not expose accounts contrary to the chosen privacy policy.

## Milestone 5 — investment prices

Obtain the exact ETF ticker/exchange. Verify Twelve Data coverage, EOD entitlement, usage terms and credential placement. Define holdings/quantity/cost basis and how market valuation differs from cash income. Add freshness timestamps, an offline fallback and an explicit unconnected state.

Acceptance: no fabricated quotes, no market gain recorded as salary, a verified ticker fixture, and an agreed EOD update mechanism. Keep provider keys out of client bundles and Git.

## Ongoing UI quality

Maintain the approved playful/cozy activity-first direction. Category icons and colours must be visible in entry, activity and management. Keep the companion unobtrusive and all nonessential motion optional through reduced-motion settings.

For layout changes, inspect at least 320, 360, 396 and 412 dp and a PC width. Include long names, many categories, large currency amounts, dark mode, larger system fonts and an open keyboard. A card that clips overflowing content is not proof the underlying layout is correct. Check child bounds and following-section overlap as well.

Do not add bank linking, non-EUR support, savings objectives, bill splitting or a native PC application as incidental scope.

## Local-repository handoff update — Havensum

The latest owner requirements and near-term order are in [HAVENSUM_REQUIREMENTS.md](HAVENSUM_REQUIREMENTS.md). They supersede old Melo naming, XLSX-first exchange requirements and the plan-derived prediction model. Implement independent Expected savings, brand migration/logo, CSV/template append import, expected-payback tasks and verified bank CSV adapters with the listed regression tests. Preserve JSON backup/restore and the existing roadmap's accounting/device correctness work.
