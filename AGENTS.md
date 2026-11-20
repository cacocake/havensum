# Working on Havensum

Read HANDOFF.md, DECISIONS.md and docs/HAVENSUM_REQUIREMENTS.md first. Current implementation is a React Native/Expo Android app with a React Native Web browser adaptation. Keep native and browser ports aligned.

- Use integer euro cents. EUR is the only currency.
- Keep cash balances, net spending, income and frozen forecasts separate.
- Linked reimbursements net against their original expense month; they never become earnings. Transfers never enter income or spending averages.
- Existing loans do not credit an account unless explicitly selected. Actual repayments remain recorded transactions.
- Never silently recalculate a plan or rewrite its historical months. Manual overrides take priority and must be marked.
- Owner-approved exception (P09/P22): after a loan payment change, a revision the owner approves may restate only the loan line (and its totals) of passed months of the current year. It is marked on the revision, earlier revisions stay intact, and past years stay read-only.
- Category budgets only drive overspend bars. Per-field inheritance and transaction behaviour overrides must remain intact.
- Preserve custom category names/icons/colours. Use one clean, flat Lucide symbol family with consistent stroke weights. No emoji or glossy category icons.
- UI is mobile first, playful and cozy, with quick entry and activity before account summaries. Respect reduced motion and safe areas.
- Verify chart/legend bounds at narrow widths. Avoid equal flex heights for intrinsic-height content stacked in a column.
- Do not claim Google Drive, ETF pricing, exact Cashew compatibility, an APK, or physical-device verification without implementing and checking them.
- Read the open decisions before choosing Drive scope, shared-account visibility, accrual conventions or investment identifiers.
- No bank linking, non-EUR support, savings objectives, bill splitting or native PC app without explicit scope change.
- Run relevant checks from package.json. Domain changes need tests that exercise real invariants; a successful Hermes export is compilation, not an Android install or device test.
- Never commit credentials, runtime financial data, downloaded dependencies or compiled outputs.

The new-repo handoff intentionally excludes the original hosting project identity and Git configuration. Do not recreate those bindings unless the owner requests them.

- The current code is the last verified Melo baseline. New Havensum requirements are pending, not finished features.
- Keep Planned savings (frozen target) distinct from Expected savings (independent prediction). Add a regression proving target-only edits cannot move the prediction.
- CSV imports append through preview and explicit merge/deduplication; never silently replace existing records or classify every bank inflow as earnings.
- Closing an expected-payback task without payment changes task metadata only. Only recorded reimbursements change cash/net spending.
- Treat bank statement samples and real financial backups as private runtime data. Commit only synthetic or carefully sanitized fixtures.
- Preserve old melo-state-v1/melo-sync-base data through an explicit migration. Do not lose data merely to complete the rename.

## Owner's code style

- Use clear, obvious, descriptive variable and function names. Prefer a longer name when it makes the intent easier to understand.
- Use camelCase for JavaScript variables and functions, and PascalCase for React components and classes.
- Keep logic shallow and human readable. Prefer early returns and guard clauses over nested conditionals.
- Put opening braces on the same line as the statement or declaration. Put the body on subsequent lines and the closing brace on its own line. Do not compress functions or control flow into one line.
- Apply DRY pragmatically. When something is used in more than one place, consider centralizing it in a shared utility module named for its responsibility. Avoid a miscellaneous utilities god file.
- Keep files focused and responsibilities separate. Do not introduce god files.
- Replace magic numbers and strings with clearly named constants.
- Prefix private members with `_`, globals with `g_`, static members with `s_`, and constants with `k_`. Use SNAKE_UPPERCASE for preprocessor defines where the language supports them.
- Use inheritance where applicable and where it represents a clear relationship. Follow React's component and hook conventions for the existing functional UI.
- Leave touched logic better than you found it: when modifying existing logic that does not follow these conventions, clean up the affected code as part of the work, preserving behavior and test coverage. Keep unrelated formatting or structural rewrites separate from test-driven defect fixes.

## Agreed testing workflow

- Use the owner's TDD skill: public behavior tests, one failing test followed by the minimal fix, one slice at a time. Do not mock internal collaborators or derive expected results by repeating the implementation.
- The owner approved these test boundaries: ledger calculations/validation; frozen plans/drift alerts; outlook/historical averages; savings interest; import/export/merge; storage/startup; user transaction flows.
- Strengthen coverage of the existing behavior before implementing the pending handoff features. Minimal fixes for defects exposed by the tests are authorized.
- Keep unimplemented requirements explicit. Do not turn known limitations into accepted product contracts merely to make tests pass, and do not claim exhaustive correctness from a coverage percentage.

## Branches, fixes and review

- Fix bugs exposed by coverage or review immediately, before beginning the next feature or task. Add a failing regression first and verify the fix.
- A bug discovered between tasks becomes its own bug task on a new branch from `develop`; fixing it does not require starting a feature task first.
- Use Git Flow: `develop` is the integration branch and `master` is reserved for releases. Create each dedicated `codex/` task or bug branch from `develop`, then merge it back into `develop` after completion. Do not merge development work into `master` unless the owner requests a release.
- Keep all bugs caught by a task's tests or review on that same task branch; do not split those fixes into separate branches.
- The owner's flow routes bug fixes through `develop` too. Do not create a release-hotfix exception from `master` without the owner's explicit instruction.
- Request a read-only Claude review of the local branch at the end of each task when Claude is available; this does not require a push. Resolve actionable findings and rerun the affected checks before merging. If Claude cannot review, report the attempt and the reason; do not imply that an independent review happened.
- Claude review is a required merge/branch-closure gate. If its usage limit or another problem prevents a completed review, commit work on the task branch for safekeeping but leave the branch open, unmerged and undeleted until Claude can review it. Passing tests or an agent's own review do not waive this gate.
- Do not push changes or recreate hosting bindings unless the owner requests it.
- Ask the owner before resolving ambiguous product behavior or open decisions. Continue independent work while waiting, but do not implement behavior that depends on an unanswered required choice.
- Owner clarification takes precedence over immediate implementation: record a finding that depends on an unanswered product decision and keep that dependent work unimplemented/unmerged until the owner answers. Do not guess a fix merely to satisfy the merge gate.
