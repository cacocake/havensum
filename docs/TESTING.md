# Financial regression coverage

The owner approved seven public test boundaries before implementation. Tests observe results through those boundaries, use synthetic financial data, and keep expected amounts independent of the implementation. New defects are handled one failing regression and minimal fix at a time. Existing behavior can be characterized by tests that pass immediately; it does not need an artificial production-code change to manufacture a failure.

## Run the checks

Use Node 24.18 or later for this test harness. Native adapter tests use Node's experimental module mocking; its warning is expected. The app's React Native engine minimum is a separate constraint.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:coverage
npm run test:browser
npm run test:all
npm run build
npm run check:android
```

`test:all` runs coverage checks and browser tests. Browser tests start an isolated Vite server on port 5174, with separate browser storage per test, a fixed reporting date, reduced motion, and Europe/Lisbon time. They run at 320 px, 396 px and 1280 px. They do not use the owner's preview ledger on port 5173. Chromium installation is a development prerequisite; browser binaries, dependencies, reports, traces, downloaded backups and compiled bundles are excluded from Git.

## Coverage map

| Agreed boundary | Automated evidence | Limits |
| --- | --- | --- |
| Ledger calculations and validation | `ledger.test.js`, original `engine.test.js`: cash conservation through transfer sequences, original-month/year netting, partial/cross-account paybacks, edit constraints, validation, date cutoffs, custom inheritance and exact decimal conversion | Not full-state schema validation or arbitrary aggregate amounts beyond JavaScript's safe-integer range |
| Frozen plans and drift | `planning.test.js`, original engine tests: zero overrides, behavior buckets, budgets, window/year boundaries, loan schedule endpoints, changes/events, strict drift thresholds and input immutability | Missing-month completeness, recurring-contract cancellation and archived years remain product/model work |
| Outlook and historical averages | `outlook.test.js`, original `planInsights.test.js`: transfer/adjustment neutrality, receipt-date cutoff, missing history, leap months, paid rent, month end and scheduled loan/occasional floors | Current outlook still derives assumptions from the frozen plan; this suite does not certify independent Expected savings |
| Savings interest | `interest.test.js`: independent worked amounts, monthly compounding, leap/year boundaries, deposits/withdrawals, future cash exclusion, non-positive balances, multiple accounts and idempotence | Working effective-annual/month-end convention; no bank reconciliation or backdated correction model |
| Import/export/merge | `dataExchange.test.js`, native file tests and browser flows: real workbook serialization, cent/euro boundaries, Unicode/quoted CSV, JSON, validation atomicity, payback order, concurrent plan conflicts, deletion conflicts, preview/cancel/append/rerun and actual backup download | Legacy import identity and same-ID edit review remain incomplete; bank adapters and the new CSV export/template are pending |
| Storage/startup | `storage.test.js`, native storage tests and browser startup: old keys, separate baseline, demo isolation, failures, ordered saves, immutable saved snapshots and fail-closed corrupt startup; migration-branch additions below | Device storage APIs are substituted; a reviewed full restore remains pending |
| User transaction flows | Browser scenarios: create/inspect/reload/edit/delete/cancel, linked-payback safeguards, transfers, loan proceeds opt-in, invalid monetary inputs and preservation of zero interest on edit | Chromium browser adaptation, not Android installation, accessibility certification or physical-device QA |

Native tests substitute only the external AsyncStorage, Expo document-picker, filesystem and sharing APIs. They execute the real native adapter, shared parsers and workbook writer. The filesystem test resolver accommodates Expo's Metro-only TypeScript entry; it never replaces application logic.

## Interpreting coverage

Before review, 108 Node tests and 42 browser checks passed. Claude's review and subsequent fixes are recorded in [REVIEWS.md](REVIEWS.md); the review added regressions for reporting consistency, storage access/retry, merge-baseline guidance, preview copy, plan-month isolation and CSV row errors. These results do not establish Android installation or physical-device behavior.

Final verification after both reviews: 113 Node tests and 57 browser checks (19 scenarios across three viewport projects) passed. Measured loaded-JavaScript coverage is 98.33% lines, 94.99% branches and 95.17% functions. Web production build and Android Metro/Hermes export passed again.

The Node report measures **loaded JavaScript under `src`**. It excludes React components and modules not loaded by that runner. Browser scenarios exercise the real React Native Web application separately; their coverage must not be added to the Node percentage or described as whole-app coverage.

The checked thresholds are 95% lines, 90% branches and 90% functions across measured modules. These are regression gates, not proof of mathematical completeness. Literal examples, conservation checks, boundary tests, and failure/cancellation paths are the evidence for correctness. Synthetic fixture and expected-result literals are intentional domain examples.

## Defects found during this pass

- Shared validation allowed reducing or retyping an expense with received reimbursements; previously only the form guarded it.
- Transfer-only and adjustment-only months could dilute history averages.
- Future paybacks reduced historical averages and past recorded results before receipt.
- Failed startup could replace unreadable saved data with demo state. Startup now fails closed without writing sample data.
- Demo mode could read or replace the real merge baseline.
- CSV byte-mode decoding corrupted UTF-8 names. Both ports now use a shared parser and preserve textual CSV identifiers/dates.
- Floating-point multiplication could add a cent when converting a large, representable two-decimal euro amount.
- Loan/account forms accepted monetary values outside safe integer cents; non-finite loan amounts could be saved.
- Editing a zero-rate savings account changed the rate field to the default 3%.

## Reporting and file contracts

Current/past dashboard, plan and category reports use transactions through the reporting date, including only paybacks received by that date. Future-month entries views retain registered future entries; those are not a claim that future cash has posted. Account ledgers and raw transaction/export data retain their explicitly documented all-entry behavior. The posted/planned cash model remains an open decision.

CSV fields remain text so UTF-8 names, identifiers and ISO dates survive parsing; XLSX retains decoded cell types, including numeric euro values and Date cells. The reviewed import flow normalizes both. CSV dates must be ISO YYYY-MM-DD; locale-date coercion is deliberately not promised. Validation errors identify the one-based data row, excluding headers and physical line breaks inside quoted fields. An invalid batch cannot partially append.

Corrupt saved data and unavailable device storage have distinct startup messages and a retry action. Neither is treated as proof of an empty ledger, and neither automatically writes sample data. The full reviewed restore workflow remains pending.

## Pending requirements stay pending

Do not treat old plan-derived forecast tests as the final product specification. Replace the superseded expectations when implementing independent Expected savings, and add the required target-independence regression then. Payback tasks, CSV template/export and reconciliation, full restore, historical plan archives, bank adapters, Drive and investment quotes require their own test-first slices when implemented. No self-learning prediction model is implemented or verified by these tests.

The successful Hermes export checks Android compilation only. Native module substitutes and browser runs cannot establish Android installability or physical-device behavior.

## Migration branch — 18 November 2026

`codex/state-migration-recovery` adds schema 1 → 2 migration, retained raw recovery copies for ledger and merge baseline, legacy numeric import-ID/link compatibility, validation of supported saved/backup data, quota/interruption retry and ordering between migration and newer saves. Browser scenarios cover repeated legacy startup, blocked recovery and retry, current-schema export on first launch, and unsupported backup review. The identifier branch's separate changes are not included.

Claude review is deferred until after 12:00 at the owner's request; this branch remains unmerged. The final check results are recorded in IMPLEMENTATION_STATUS.md. No coverage figure certifies every possible legacy file or an Android device installation.
