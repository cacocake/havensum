# Havensum — technical spec (short)

For the full detail behind each area, see `ARCHITECTURE.md` (partly dated), `STATE_MIGRATIONS.md`, `DRIVE_ACCESS_MODEL.md`, `ANDROID_BUILD.md`, `TESTING.md`, `DECISIONS.md` and the per-ticket notes in `FEATURE_BACKLOG.md`.

## 1. Shape of the app

- **One codebase, two targets.** React Native + Expo SDK 54 builds the Android app. Vite + React Native Web builds the browser version. Shared components live in `src/*.jsx`. Platform-specific files end in `.native.js(x)` or `.web.js(x)`: storage, files, icons, charts, dates, fonts, motion and safe areas.
- **No server.** All data is one JSON "ledger" saved on the device. Sharing happens through backup files today, and through a Google Drive file later.
- **Money is integer euro cents everywhere.** Dates are `YYYY-MM-DD` strings and months are `YYYY-MM`. "Today" is the phone's local date (`useLocalDate`, `localCalendarDate`).
- **Layers:**
  - **UI:** `App.jsx` holds state, navigation and dialogs, exposed through `context.js`. The screens are `Dashboard`, `Screens`, `PlanScreen`, `YearOutlook` and `Details`, with editors in `Forms` and `AccountForm`.
  - **Domain logic:** pure functions in `src/*.js`, with no UI and no storage. This is where nearly all the rules live and what the tests target.
  - **Persistence:** `persistedState.js` → `storage.native.js` / `storage.web.js`.

## 2. Data model (schema version 5)

The ledger is `{ version, demo, accounts, transactions, categories, loans, events, plans, theme, preferences }`. Optional parts are `outlook`, `paybackTasks` with `paybackTasksVersion`, and `migrationCategoryWarnings`. Every write is validated by `stateSchema.js`.

| Record | Key points |
| --- | --- |
| Transaction | `type`: expense / income / reimbursement / transfer. `amount` is positive cents, except interest corrections. Optional fields: `linkedId` (payback → expense), `toAccount`, `loanId`, `kind` override, `plannedCost` link, `correctsInterestMonth`, `loanAdvance` (an advance payment). |
| Account | `tag`, `openingBalance`. Optional `interestSchedule` [{since, rate}], `unscheduledInterest`, `interestBankChoices`. |
| Category | `parentId`. Empty fields inherit from the parent; zero is a real value. |
| Event (planned cost) | `month`, `amount`. With a `year` it is one-off; without one it repeats. Repeating costs can add `fromYear`, `yearAmounts`, `monthFromYear`. |
| Loan | `payment` (from the start month), `remaining`, `start`/`end`, `paymentChanges` [{since, amount} or {since, until, amount}] (required from v5). Legacy `paymentEditedAt` is kept but no longer written. |
| `plans` | `{ "YYYY": [revision, …] }`. Each approved revision is an immutable snapshot with its own `id`. The last one is the latest. A revision may hold `loanRestatedFrom`; newer planned months hold `loanPayments` (each loan's share of `loan`). |
| `outlook` | Forecast settings: `window`, `completeMonths`, `billCancellations`, `incomeChanges`, `loanChanges`, `eventPayments` (validated in `outlookInputs.js`). |
| `paybackTasks` | Expected-payback tasks (validated in `paybackState.js`). |

## 3. Storage, migrations and recovery

- **Keys:** `melo-state-v1` holds the ledger and `melo-sync-base` the merge baseline. The names are legacy and deliberately unchanged.
- **Recovery copies:**
  - `…:recovery:vN` for migrations, and `…:recovery:invalid[:n]` for unreadable values;
  - `havensum-import-recovery-v1` and `havensum-merge-recovery-v1`;
  - `havensum-restore-recovery-v1`, `:1`, `:2`… with a `:latest-index` key;
  - `havensum-shared-file-join-recovery-v1`.
- **Other keys:** `havensum-shared-file-binding-v1` (Drive link) and `havensum-plan-invitation-deferral-v1` (this device's **Later** choice).
- **Rules:**
  - Saves are serialized.
  - An old version is migrated in memory and validated. Its exact original bytes are saved to a recovery key **before** the ledger is replaced.
  - A failed recovery write blocks the change.
  - Corrupt or newer-version data stops startup with a recovery screen rather than being overwritten.
- **Adding a field:** an optional, validated field needs no version bump; document it in `STATE_MIGRATIONS.md`. A breaking change needs a new version, a migration step in `stateSchema.js`, a recovery copy and tests with legacy data.

## 4. How the main systems work

| System | Files | In one line |
| --- | --- | --- |
| Balances and spending | `ledger.js`, `posting.js` | Cash follows the entry date. Spending is net of linked paybacks, counted in the expense's reporting month: its own month, or the linked planned cost's month (`expenseReportingMonth`). Transfers are neutral. Entries dated after today are *scheduled* and post on their date. |
| Expected savings (live forecast) | `expectedSavings.js` plus `expectedBills`, `expectedVariableSpending`, `expectedOccasionalSpending`, `expectedLoans`, `expectedInterest` | Per month, income is the history average or the latest income change, never less than what is already registered, plus scheduled interest. Spending is bills (stay expected until cancelled) + variable averages + loans + occasional, which is the larger of recorded occasional plus remaining planned costs, or the historical reserve. It never reads the frozen target. |
| History | `outlookHistory.js` | Uses completed months before the forecast. Months marked complete win; otherwise it gives a "partial" estimate. |
| Year outlook | `yearOutlook.js`, `yearOutlookDrivers.js`, `YearOutlook.jsx` | Recorded past months + expected current and future months + planned target, with the variance over months that have both. |
| Frozen plans | `planning.js`, `planArchive.js`, `planDraftEstimates.js`, `planCarryForward.js`, `planInvitation.js`, `Forms.jsx` (interview) | Draft from history, approve, append a revision. Months before a revision are copied exactly. Past years are read-only. |
| Planned costs | `plannedCosts.js`, `plannedCostMoves.js`, `comparableCosts.js` | Which month and year a cost occurs in, moves, and suggestions from comparable completed costs (median of recent ones, at least 3). |
| Savings interest | `savingsInterest.js`, `interestSchedule.js`, `interestEntries.js`, `interestCorrection.js` | Effective annual rate compounded monthly. The app posts at most one interest entry per account per completed month, at startup. Bank-posted interest and correction entries are separate, and corrections never edit old entries. |
| Loans | `loanPaymentHistory.js`, `loanPaymentMigration.js`, `loanPlanRevision.js`, `loanAdvancePayments.js`, `LoansScreen.jsx`, `LoanForm.jsx`, `LoanPlanPrompt.jsx`, `AdvancePaymentForm.jsx` | Each loan's payment in a month comes from its history (temporary change, else latest lasting change, else `payment`). After a change the owner picks Keep my plan or Revise from <month>; a revision restates only that loan's share in passed months. Advances lower `remaining` in the same save. |
| Paybacks | `paybackTasks.js`, `paybackState.js`, `AwaitingPaybacks.jsx` | Expected-payback tasks. Closing without payment changes task metadata only. |
| Import | `importReview.js`, `importNormalization.js`, `realBankCsv.js`, `cashewCsv.js`, `csvExchange.js`, `ImportDialog.jsx` | Parse → normalize → editable preview → explicit decisions. New rows are appended; a matching existing record changes only when its edit is approved. Duplicates are scoped by source and account. |
| Backup, merge, restore | `engine.js` (merge), `mergeReview.js`, `planMerge.js`, `interestMerge.js`, `fullRestore.js`, `RestoreBackup.jsx` | Three-way merge by record and field; conflicts are reviewed. A restore keeps a pre-restore copy first. |
| Shared Drive file | `sharedFile*.js`, `SharedFileStatus.jsx` | Sync core (protocol, merge, join) is built and tested against a stand-in. Google sign-in and transport (DRIVE-2b) are not built, so the UI shows "Not connected". |

## 5. Where to change what

| I want to… | Go to |
| --- | --- |
| Change a screen's layout or text | The `.jsx` file named after it. Shared pieces (buttons, cards, inputs) are in `ui.jsx` and `Playful.jsx`. |
| Change how a number is calculated | The domain module in §4, and its tests in `tests/` (search for the function name: test files are grouped by area, not one per module). |
| Change a forecast assumption | `expected*.js`, plus the settings shape in `outlookInputs.js` (validation). |
| Add a stored field | `stateSchema.js` (validate), `fullRestore.js` / merge if needed, `STATE_MIGRATIONS.md`. |
| Add an import format | A new parser like `realBankCsv.js` feeding `importNormalization.js`, plus synthetic fixtures. |
| Change Android build or version | `app.json` (`versionCode` must go up), `plugins/withHavensumReleaseSigning.cjs`, `ANDROID_BUILD.md`. |
| Change a constant | `domainConstants.js`, `money.js` (formatting), `calendar.js` / `monthLabels.js` (dates). UI labels are written inline in the `.jsx` files. |

## 6. Running and checking

```sh
nvm use 24 && npm ci   # Node 24.18 or later
npm run dev             # browser version at :5173 (?demo=1 for example data that is never saved)
npm test                # unit tests
npm run test:coverage   # unit tests + coverage thresholds (95% lines, 90% branches, 90% functions)
npm run test:browser    # Playwright at 320 / 396 / 1280 px (~6 min)
npm run build           # web build
npm run check:android   # Hermes compile only; not an install or device test
```

Workflow: branch `codex/<ticket>` from `develop` → failing test first → fix → `test:coverage`, `test:browser`, `build` and `check:android` → separate read-only review → `--no-ff` merge into `develop`. `master` is for releases only.

## 7. Known gaps

- Plans normally never rewrite passed months; the only exception is the owner-chosen loan restatement above (recorded in AGENTS.md).
- Deleting or editing an advance payment doesn't restore the loan's remaining balance, and CSV/Excel exports don't carry the advance mark.
- Google Drive sync is not built yet (DRIVE-2b, needs your Google OAuth client).
- Physical-phone QA is not done (ANDROID-2); only startup has been confirmed on your phone.
- Cashew support is verified only for the cases in `CASHEW_IMPORT_RESEARCH.md`.
- ETF prices are parked.
- `ARCHITECTURE.md` predates the newer features; trust this file and the module names in §4.
