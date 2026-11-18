# Havensum — developer handoff

## Independent Expected savings — 18 November 2026

Implementation is on `codex/independent-expected-savings`, created from `develop` while the two foundation branches remain open and unmerged. The owner clarified that Claude availability blocks merging, not implementation, and that fixed-cost cancellation always applies to an individual bill. See [docs/EXPECTED_SAVINGS_STATUS.md](docs/EXPECTED_SAVINGS_STATUS.md) for the new model, persistence and integration notes. The historical plan-derived statements below describe the imported baseline, not this task branch. Do not merge this or either foundation branch before completed Claude review.

## Local test hardening — 17 November 2026

The imported baseline now has additional financial, file, storage/native-adapter and browser regression coverage. Tests exposed and fixed validation, history/receipt-date, persistence, CSV decoding, monetary conversion and account-edit defects. See [docs/TESTING.md](docs/TESTING.md) for the test boundaries, commands and limits. Financial code touched by these fixes has been separated into readable modules; `src/engine.js` retains its public compatibility exports. The new Havensum handoff features remain pending. The historical package/source verification statements below describe the imported baseline.

Prepared 17 November 2026. Verified published source baseline: `0ac7b234bab14ea7fd80926e48466ab7aa808117`.

**Read [docs/HAVENSUM_REQUIREMENTS.md](docs/HAVENSUM_REQUIREMENTS.md) first for the latest owner requests.** The source still displays Melo. Havensum is the new product name; rename/logo, CSV export/template/bank adapters, expected-payback tasks, and independent expected-savings calculation are specified but not implemented in this snapshot. Preserve this distinction in progress reports.

The last conversation began an independent forecast correction but it was not completed, tested or published before this handoff. That unfinished scratch edit is not included. This package deliberately uses the coherent, tested published baseline, whose forecast still depends on its frozen plan. Complete that correction first in the local repo.

## Start here

Melo is an Android-first personal expense tracker for Hugo and Marina. It is implemented in React Native/Expo with a browser adaptation for PC viewing. This is a working prototype with a tested accounting core, not a finished or device-certified finance product.

Read this file, [DECISIONS.md](DECISIONS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) before changing behavior. [NEXT_AGENT_PROMPT.md](NEXT_AGENT_PROMPT.md) is a paste-ready continuation brief. [AGENTS.md](AGENTS.md) records repository-specific constraints.

The fresh-repo ZIP includes source, the lockfile, tests, Expo/Vite configuration, these documents, and implementation specifications. Example browser screenshots are omitted from this source package. It excludes Git history/remotes, the previous hosting identity, dependencies, compiled outputs, local runtime data, and credentials. `BUNDLE-MANIFEST.json` identifies the packaged source revision. No GitHub repository has been created by this handoff.

## Product contract

- Android is the primary target. PC support is a responsive browser view; a native PC application is out of scope.
- EUR only. No bank linking, savings objectives, or bill splitting.
- Accurate income and net expenses are central. Borrowing, transfers, and reimbursements must not inflate earnings.
- Reimbursements offer expense linking by default, while allowing an unlinked balance adjustment.
- The Year Plan is an explicit frozen snapshot. Transactions can produce review suggestions but cannot silently rewrite it. The current live outlook is plan-derived; the required independent prediction is pending. Earlier plan months must be preserved.
- Account tags: Personal, Joint, Savings, Investment. These are currently labels, not privacy enforcement.
- Categories support a custom name, icon, colour, budget and spending behaviour; subcategories inherit each setting independently.

## Latest approved UX direction

The owner chose Cashew-like playfulness mixed with cozy illustration. The app should be pleasant and quick to use. Keep the animation, make interactions tactile, and give categories prominent icons and distinct colours. The latest refinement is restrained, Apple-inspired iconography: flat line symbols, no glossy emoji. Recent activity and quick entry lead the home screen. Large account summaries must not dominate it.

The current revision implements:

- Expense, Income and Payback quick-entry tiles, then recent activity with type filters.
- A persistent central add button in the bottom navigation. It does not float over transaction rows.
- Compact, horizontally scrollable account pockets below the activity feed.
- A small, gently floating companion with a tap interaction; spring press feedback and animated notices.
- Clean, flat vector category symbols with consistent strokes and matte colour accents, shared across the feed, picker and editor.
- A searchable, colour-coded category grid. User-selected colours are preserved; only the original example palette is upgraded.
- A tappable spending wheel, an independently laid-out full-width category legend, and responsive bar charts.
- Rounded Fredoka headings, DM Sans body text, light/dark themes, safe-area-aware navigation and reduced-motion handling.

The prior narrow-layout defects were reproduced and repaired: a fixed wheel plus a minimum-width side legend exceeded available space; flex sizing let the next chart overlap the legend; SVG growth transforms used the wrong origin. Avoid bringing those layout patterns back.

## Implementation status

| Area | Exists now | Boundary / missing work |
| --- | --- | --- |
| Transactions | Expense, income, reimbursement and transfer; title, note, account, date; edit/delete; behaviour override | No recurring-entry scheduler or posted/pending distinction |
| Reimbursements | Default optional link; original-month netting; multiple partial repayments; over-refund rejection; unlinked adjustment | No receivables/expected-payback tracking |
| Accounts | User-created accounts and tags; opening balance plus ledger; transfers | No bank connection; no account privacy controls |
| Savings | Effective-annual interest converted to monthly compounding; idempotent completed-month interest entries on app open | No background job, daily accrual or historical-rate schedule; accrual convention needs confirmation |
| Investments | Manual account valuation and optional ticker | Twelve Data is not connected; no quote polling, holdings model or EOD job |
| Loans | Create/edit existing loan; optional proceeds; payment account; monthly forecast line; payment-entry shortcut | Actual payments are entered manually; remaining principal is manual; no amortization engine |
| Categories | Editable name/icon/colour/behaviour/budget; one-level subcategories; per-field inheritance | Category transaction-direction separation is not a complete model |
| Year Plan | Frozen snapshot; category/behaviour buckets; rolling average; manual overrides; cushion; seasonal costs; income/loan changes; review suggestions | See algorithm caveats below; production year rollover is unfinished |
| Interview | Three-step form in Year Plan → Revise remaining year | Not an automatic first-launch or annual interview; not a conversational adviser |
| Persistence | Browser localStorage; native AsyncStorage with serialized state writes | Local-only, unencrypted by this application; no cross-device sync |
| File merge | Manual JSON baseline and three-way merge; field conflicts and edit-vs-delete review | Not Google Drive sync; no cross-device revision protocol |
| Import | CSV/XLSX/transaction-array JSON mapping, preview, validation and rerun deduplication | Exact Cashew export compatibility is unverified; real export not supplied |
| Export | Styled Excel summary, raw transactions, accounts/categories; full JSON backup | Excel is not a full-state restore; a dedicated full-JSON restore flow is missing |
| Android delivery | Expo source, native file/date/share ports, bundled fonts, Hermes bundle compilation | No APK/AAB delivered, no physical Android test, no EAS account or signing setup |

## Accounting invariants and examples

All money is represented as integer cents. `amount: 1234` means €12.34. Dates are calendar strings such as `2026-11-17`, and month keys are `2026-11`. Interest is a percentage number, not cents.

| Recorded movement | Cash effect | Income effect | Net spending effect |
| --- | --- | --- | --- |
| €100 expense on 10 November | −€100 in its account on that date | None | +€100 in November before reimbursements |
| Linked €40 reimbursement received 5 December | +€40 in its receiving account in December | None | −€40 in the original November expense; November net becomes €60 |
| Unlinked €40 reimbursement | +€40 in the receiving account | None | None |
| €100 account transfer | −€100 source, +€100 destination | None | None |
| Existing loan added with proceeds off | None | None | Forecast payment only; an actual repayment needs a transaction |
| Optional loan proceeds | Positive balance adjustment | None | None |

A linked reimbursement can arrive in a different account. Its cash belongs there, while netting still belongs to the original expense. Transfers and reimbursements must never become salary-like income.

## What the frozen Year Plan builder does

`buildPlan` in `src/engine.js` builds category × behaviour buckets over completed months preceding the revision month.

- Fixed: latest **non-zero** completed-month bucket total within the history window.
- Variable: arithmetic mean over months with any transaction history. Missing months are excluded globally, not separately per category.
- Occasional: excluded from those averages. A user-entered monthly cushion becomes its own plan line. The app does **not** currently estimate that cushion from occasional history.
- Loan payments: separate monthly line while a loan is active; scheduled payment changes apply from a chosen month.
- One-off events: added to their selected month. Income changes replace the monthly income assumption from their chosen month.
- Manual overrides: replace computed bucket amounts and are marked. The interview carries current override values forward.
- Remaining-year revisions: preserve existing month objects before `fromMonth` **within the same stored plan year**.
- Review: fixed movement outside the working tolerance, or variable drift outside the working threshold for two prior calendar months. Suggestions never apply a revision.

Working defaults are a six-month window, ±€2 fixed tolerance and 30% variable drift for two months. The interview exposes tolerance/drift/window settings. Defaults are still a product decision, as recorded in DECISIONS.md.

## Important caveats for the next developer

These are grounded in the present code; they have not been fixed by the handoff documentation.

1. **Year rollover:** state currently holds a single `plan`. Building a different year discards the previous plan's month map. Add archived plans/revisions keyed by year before claiming historical plans are preserved across years.
2. **Future-dated cash:** `accountBalance` defaults to an all-time cutoff, and the UI generally calls that default. A future-dated transaction can change today's displayed balance. Define posted/planned behavior and an explicit as-of date.
3. **Fixed-cost granularity:** fixed baselines and tolerance are category/behaviour totals, not individually recognized rent/contracts. Offsetting changes can mask each other, and a cancelled cost can retain its older non-zero baseline.
4. **Drift/data completeness:** no explicit complete-month marker exists. Missing/incomplete imported months can produce misleading drift recommendations. Suggestions are also relative to the selected month rather than a fully modeled reporting period.
5. **Interest corrections:** existing monthly interest IDs are deliberately not regenerated. Backdated transactions or rate edits do not revise past interest. There is no reconciliation workflow yet.
6. **Identifiers and import identity:** new objects often use `Date.now()` IDs. Adopt collision-resistant IDs before two-person sync. External import identifiers need a source namespace. Content deduplication cannot distinguish two legitimate identical rows lacking IDs.
7. **Full restore:** JSON export contains the state, but transaction import only imports transactions. Manual merge requires an established baseline. Add a reviewed full-state restore path with schema validation and recovery protection.
8. **Persistence schema:** JSON loading has limited structural validation. Add explicit migrations and robust invalid-data recovery before release.
9. **Repository maintainability:** several large components remain densely formatted. Split by feature as work proceeds; do not replace the shared React Native implementation with a separate web mockup.

Other unimplemented pieces include Drive OAuth/read-write retry handling, automatic annual onboarding, a real Cashew adapter/fixture, EOD investment pricing, and on-device accessibility/keyboard/back-button validation.

## Run and validate

```bash
npm ci
npm run dev
npm test
npm run build
npm run check:android
```

The browser app is at the Vite URL printed by `npm run dev`. `/phone.html` provides a PC review shell with 320/360/396/412 dp choices. Its iframe uses `?demo=1`, so sample state resets on reload. The normal root persists state per browser origin. Android persists independently.

`npm run android` invokes Expo for Android. Dependencies are pinned around Expo SDK 54 / React Native 0.81.5. Use a matching runtime or development build and verify target-device compatibility. The EAS preview profile requests an APK, but requires the owner's Expo account and build/signing setup. `npm run check:android` produces a Hermes JS bundle, **not an installable package**.

Validation completed during development:

- 17 domain tests passed, covering reimbursement attribution, transfer neutrality, validation, frozen plans, inheritance, behaviour overrides, budgets, scheduled changes, import reruns, compounding and merge conflicts.
- Web production build succeeded and Android Metro/Hermes compilation succeeded.
- Browser quick-income entry, activity filters, category selection and category editing were exercised.
- At 320/360/396/412 dp, measured wheel/legend bounds stayed inside their card, following content did not overlap, and document overflow was zero. A long custom category name was included in that check.
- Light/dark phone layouts and the PC adaptation were visually inspected.
- Excel download from the earlier implementation was opened programmatically to verify sheets, styling and summary values. Android share/export execution is not device-verified.

Prior browser screenshots used illustrative example data; they are not included in this source package.

## Next work

The new [Havensum requirements](docs/HAVENSUM_REQUIREMENTS.md) and [CSV specification](docs/CSV_SPEC.md) supersede older conflicting requirements. Then follow [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). The first release milestone is an installable, device-tested offline Android build with the accounting/date/history edge cases resolved. Configure Drive only after its shared-file and privacy decisions are explicit. Validate Cashew against an actual export before claiming compatibility. ETF integration depends on the owner's ticker and a verified provider entitlement.

## Latest UI and forecast update — 17 November 2026

See [docs/UX_UPDATE.md](docs/UX_UPDATE.md) for the complete interaction contract, forecast formula, motion choices and verification limits. Account cards now open a ledger and transaction rows open read-only details before explicit editing. Activity accepts account/type/category filters; the home summaries/category legend drill down. Search focus, Home reselect, More selection, range controls, chart month selection, draft calendar year and dirty-form dismissal were repaired.

The Plan screen is now `src/PlanScreen.jsx`: This month / Averages / Year ahead. `src/planInsights.js` supplies historical averages and a separate read-only month-end outlook. It does not rewrite the frozen plan; its working assumptions and known-future-entry handling are documented. Current-month pulse actuals use entries through today. Recorded account balances still include all dates and the account ledger states that explicitly. Native/web press motion is in `src/Motion.native.jsx` and `src/Motion.web.jsx`; Reanimated/worklets are SDK-compatible additions. Validation is now 25 tests plus web build, Hermes compilation and browser mobile-flow checks. Physical Android testing and the existing accounting/integration caveats remain outstanding.
