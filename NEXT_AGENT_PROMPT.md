# Paste this into Codex in the extracted repository

Continue this Android-first React Native/Expo expense tracker locally. Its new name is **Havensum**; source still uses the former name Melo. Read AGENTS.md, HANDOFF.md, DECISIONS.md, docs/HAVENSUM_REQUIREMENTS.md, docs/CSV_SPEC.md and docs/ARCHITECTURE.md before editing. These files contain the full product context and acceptance criteria; do not rebuild from a web mockup.

Start by running npm ci and npm test. There are 25 existing tests on the verified upstream source. Establish a clean baseline and preserve accounting behavior. No old remote/hosting binding or real financial data is included. Do not publish or create a remote without a request. No secrets should be necessary to work offline.

First fix the confusing prediction model: rename its UI concept to **Expected savings**, independent of **Planned savings** (the frozen target). Derive predictions from completed spending history, current actuals and explicit upcoming obligations/income. Use fixed-cost baselines, variable rolling averages, a separate occasional reserve, and loans without double-counting. Show the sample window, missing-history/uncertainty state and an understandable breakdown. Add a test proving changing only plan amounts/overrides cannot change the prediction. The existing planInsights.js still uses the plan to predict remaining spending; do not claim this correction already happened.

Then implement the Havensum name and a simple matching flat vector logo, preserving existing local data keys or migrating them safely. Follow the brand brief in docs/HAVENSUM_REQUIREMENTS.md; keep the playful/cozy mobile-first identity, matte category colors and line icons, reduced motion and bounded chart layout.

Next implement CSV export + downloadable quick-entry template + append import with preview/mapping/safe re-runs. Retain JSON for complete backup/restore. Add bank CSV adapter profiles only after actual sanitized samples for the owners' banks are available; finish generic adapters and tests meanwhile, never invent the bank format. Keep legacy XLSX import compatibility during the transition.

Expand reimbursements with expense toggle “Expect a payback” and an “Awaiting paybacks” task list. Support partial/full linked reimbursement entry from a task and an explicit completion-without-payment action. Closing a reminder without payment must not alter cash, expenses or income. It is receivable tracking, not bill splitting. See exact lifecycle and acceptance tests in the requirements.

Preserve integer cents, EUR-only accounting, original-expense-month reimbursement offsets, transfers excluded from averages, optional loan proceeds off by default, marked manual plan overrides, category inheritance and display-only budgets. Address the documented correctness gaps rather than assuming the prototype is production ready.

Work in coherent increments, updating decisions and migration notes. Test money/import invariants and verify UI at 320/360/396/412 px plus a PC width. A Hermes bundle is not an APK or on-device certification. Record what was actually tested. Keep Drive, ETF integration and unresolved privacy decisions explicit rather than simulated.
