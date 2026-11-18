# Test-hardening review

Claude Code performed a read-only review of the initial coverage task. It read the new files, changed modules and relevant consumers; it did not run commands or modify files. Its review confirmed that the original defect fixes had matching public-boundary regressions, and identified follow-up issues before merge.

| Finding | Resolution on `codex/test-hardening` |
| --- | --- |
| Future-month entries were zeroed; report screens disagreed on receipt-date cutoffs | Retained registered entries in future-month views. Added shared `reportingMonthStats` for current/past report cutoffs across the outlook, dashboard charts, category budgets and year overview; raw ledger/account/export semantics stay separate. Added domain and browser regressions. |
| Storage unavailability was conflated with corrupt saved data, with no recovery route | Added distinct messages and an explicit Retry loading action. Both failure paths preserve saved data. A temporary access failure is **not** treated as an empty ledger: it may hide an existing private ledger, so seeding and saving automatically would risk data loss. Browser/native storage and browser retry regressions cover recovery. |
| Corrupt merge baselines surfaced raw parser messages | Both adapters now return a specific recovery message; the Settings flow has a regression. |
| Demo export claimed a saved baseline despite isolation | Preview mode explains the limitation, disables merge review and accurately reports example exports. Ordinary example data in the main app remains distinct from isolated preview mode. |
| Duplicated expense/payback validation and touched-code style gaps | Removed the dead form guard, moved dirty hooks out of JSX, imported AccountForm directly, used named cent/percentage units and moved planning constants together. |
| Returned plan months shared mutable line arrays/records | Each month now receives its own line array and records, with an isolation regression. |
| CSV raw-text/date behavior and per-format types needed an explicit contract | Documented textual CSV versus typed XLSX fields, retained ISO date requirements, and added data-row numbers to import validation errors with an atomic-rejection regression. |
| Runtime requirement was documented but not declared | Added the Node 24.18+ development-engine requirement to package metadata and lockfile. |

Independent Expected savings, task tracking, schema migrations/restore, historical archives, bank adapters and cloud integrations remain pending. Neither review nor Hermes export establishes Android installation or physical-device behavior.

## Focused follow-up

Claude reviewed the corrective changes and confirmed the startup retry/error split, shared validation cleanup, preview-mode behavior, import-row errors, hook cleanup and named unit constants. It found two remaining issues: the Transactions drill-down aggregate still used raw net expenses, and carried historical months still referenced the prior plan. Both were reproduced with failing regressions and fixed on the same branch. The drill-down now uses the shared reporting cutoff while retaining all registered rows, and carried JSON plan months are copied independently of the source revision.

All actionable review findings were addressed before merge. The final fixes were checked with the regression suite and both builds; this is not a claim that Claude independently executed those checks or issued a formal approval of the final commit.

## Identifier foundation task — review pending

A read-only Claude review was requested for `codex/collision-resistant-identifiers`. Claude read the two identifier adapters, then returned a weekly-usage-limit error without a completed review. This is not approval or a clean review. Per the owner's explicit merge gate, this branch remains open, unmerged and undeleted until Claude can review it after access returns. Local checks passed: 113 Node tests, 72 browser checks, web build and Android Hermes compilation. Native crypto execution on a physical device remains unverified.
