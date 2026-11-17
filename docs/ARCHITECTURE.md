# Architecture and data contracts

## Stack and execution

React 19.1, React Native 0.81.5 and Expo SDK 54 form the native application. Vite and React Native Web render the same component tree in a browser. Metro resolves `.native` modules for Android; Vite resolves `.web` modules and aliases `react-native` to React Native Web.

| Entry / module | Responsibility |
| --- | --- |
| `index.native.js` | Expo root and safe-area provider |
| `src/main.jsx`, `index.html` | Browser root, global styles and web font loading |
| `src/App.jsx` | State ownership, screen routing, navigation, dialogs, current month, persistence, notices |
| `src/context.js` | UI access to state, update functions and navigation |
| `src/engine.js` | Compatibility exports for the financial core; compounding, merge and legacy import deduplication |
| `src/ledger.js`, `src/money.js`, `src/transactionValidation.js` | Cash/net-spending calculations, decimal conversion and shared transaction constraints |
| `src/planning.js`, `src/calendar.js`, `src/reportingHistory.js` | Frozen plan/drift, calendar boundaries and relevant recorded-month selection |
| `src/AccountForm.jsx`, `src/useDirtyForm.js` | Account editor and shared dirty-form tracking |
| `src/identifiers.web.js`, `src/identifiers.native.js` | Cryptographically random IDs for newly created user records; preserve legacy and imported IDs |
| `src/importFiles.js`, `src/storageKeys.js`, `src/domainConstants.js` | Shared file parsing, legacy storage identities and named domain constants |
| `src/Dashboard.jsx` | Activity-first home; quick entry, transactions, pockets, wheel and chart |
| `src/Screens.jsx` | Transactions, accounts, categories, reimbursements, loans, plan, settings/import/merge UI |
| `src/Forms.jsx` | Transaction/category/account/loan editors and the planning interview |
| `src/ui.jsx` | Themes, typography, buttons, inputs, sheets, cards and icons |
| `src/Playful.jsx` | Spring press controls, companion, notices, reduced-motion handling |
| `src/CategorySelect.jsx` | Searchable coloured category grid in a sheet |
| `src/CategoryGlyph.jsx` | Shared flat Lucide symbol presentation |
| `src/categoryVisuals.js` | Conditional migration of the original example palette, preserving custom colours |
| `src/Charts.web.jsx`, `src/Charts.native.jsx` | Platform chart rendering and interaction |
| `src/chartGeometry.js` | Shared ring fractions and responsive bar geometry |
| `src/storage.*.js` | localStorage/AsyncStorage ports and separately stored merge baseline |
| `src/files.*.js`, `src/workbook.js` | File picker, JSON/XLSX import, download/share and workbook creation |
| `src/DateControl.*.jsx` | Browser date input / native Android date picker |
| `src/fonts.*.js`, `src/insets.*.js`, `src/Icon.*.jsx` | Platform font, safe-area and icon adapters |
| `src/seed.js` | Illustrative state; never a real user ledger |
| `tests/`, `tests/native/`, `tests/browser/` | Financial regressions, native boundary adapters and browser user flows; see TESTING.md |
| `public/phone.html` | Browser review shell, selectable phone widths, isolated demo iframe |

There is no server-side financial database, authentication model for two household members, Google Drive adapter, investment quote adapter or scheduled backend worker in this repo.

## State model

All values below are plain JSON. Objects are related by IDs; object IDs are currently a mix of example strings, time-derived strings, imported IDs and deterministic interest/import IDs.

| Record | Important fields / units |
| --- | --- |
| State | `version`, `demo`, `accounts[]`, `transactions[]`, `categories[]`, `loans[]`, `events[]`, `plan`, `theme`, `preferences` |
| Account | `id`, `name`, `tag`, `openingBalance` in cents, `interest` as effective annual %, `interestStart` as YYYY-MM, optional `ticker`, visual fields |
| Transaction | `id`, `type`, positive `amount` in cents, `date` as YYYY-MM-DD, `account`, `title`, `note`, optional `category`, `kind`, `linkedId`, `toAccount`, `loanId`, `externalId` |
| Category | `id`, `name`, `parentId`, `icon`, `color`, `kind`, `budget` in cents |
| Loan | `id`, `name`, `remaining`, `original`, `payment` in cents, `start`/`end` as YYYY-MM, `account` |
| Event | `id`, `name`, `month` as 1–12, `amount` in cents, optional `year` |
| Plan | `year`, `createdAt`, `revision`, `window`, `tolerance` in cents, `drift` as a fraction, `incomeChanges[]`, `loanChanges[]`, `months` map |
| Planned month | `income`, `expense`, `balance`, `cushion`, `loan`, `event` in cents; category/behaviour `lines[]` |
| Plan line | `id`, `category`, `name`, `kind`, `amount` in cents, `override` boolean |

Category resolution skips null, undefined and empty-string fields so each can inherit independently. Zero is retained. A transaction's explicit `kind` takes precedence over resolved category behaviour. Current UI nesting is one level even though the resolver is recursive.

## Data paths

An edit validates a record, updates the App state, then persists the serialized state. Browser writes are synchronous storage operations wrapped in promises; native writes are queued so a slower earlier save cannot overwrite a later save. A failed save produces a visible warning.

Startup loads local state or seeds an example, applies completed-month savings interest idempotently, and upgrades only matching legacy example category colours. Browser `?demo=1` skips state reads/writes, but the ordinary app root persists independently for each origin. Native storage is separate from all browser origins. The app does not add storage encryption.

The merge baseline uses `melo-sync-base`; the active state uses `melo-state-v1`. Manual full-backup export records a local baseline. Manual merge compares base/local/remote by collection and record ID, then by field. Independent edits merge. Same-field changes, edit/delete conflicts and concurrent plan revisions require a choice. Validation runs before applying reviewed results. This does not constitute a complete Drive synchronization protocol.

## Projection boundary

`monthStats` returns income, net spending and their difference. `accountBalance` follows cash movements. `buildPlan` is an explicit snapshot operation. These must remain separate. In particular, retroactive reimbursement netting must not move the cash receipt date or rewrite a frozen forecast.

Same-year plan revisions retain earlier month objects. The model needs an archived plan collection before safe year rollover. See HANDOFF.md for further limitations around future-dated balances, fixed contract recognition, missing history and interest corrections.

## Files and units

Excel raw transaction amounts are written in euros for human-readable reimport. Account opening balances and category budgets in their metadata sheets retain internal cent values. The import UI has an explicit amount-unit mapping; a full versioned JSON backup uses internal cents. Do not infer Cashew sign/date/unit conventions without a real fixture.

Exported JSON contains all local accounts and settings. Personal/Joint tags do not filter those exports. Native uses Expo's document picker, filesystem and share sheet; browser uses file input and downloads. Native file execution has not been tested on a physical device.

## Layout and motion constraints

- The root and primary scroll area must have a bounded viewport height. Bottom navigation stays outside the scrolling content.
- Use `minWidth: 0` and explicit text constraints in rows containing names, icons and amounts.
- The wheel legend takes its own full-width column on a phone. Its card height grows with every row.
- Do not set equal `flex: 1` heights on intrinsic-height chart wrappers stacked in a column; this caused overlap.
- Charts receive measured content width. Bar geometry is not derived solely from device width.
- SVG bar growth uses `transform-box: fill-box` and each bar's bottom as its origin.
- Preserve at least 48 dp for primary controls, readable labels, safe-area insets, reduced motion, and the central navigation add action.
- Category icons use the same Lucide vector family on Android and web, with a 1.85 stroke weight. Keep upright alignment, flat matte tints and a single backplate; do not introduce glossy emoji or stack decorative icon containers.

## Read-only insights and inspection routes

`planInsights.js` calculates historical averages and a current-month outlook without changing the stored plan. `PlanScreen.jsx` presents Actual / Plan / Forecast, history and the year ahead. `activity.js` centralizes type/account/category/search matching, including parent-category descendants and inbound transfers. `Details.jsx` contains account ledger and transaction inspection surfaces. `Motion.native.jsx` / `Motion.web.jsx` share the press/reveal/meter contract with platform-specific animation implementations. See [UX_UPDATE.md](UX_UPDATE.md) for assumptions, exact interaction behavior and verification limits.
