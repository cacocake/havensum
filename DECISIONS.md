# Havensum — decision register

As of 17 November 2026. Latest requirements in docs/HAVENSUM_REQUIREMENTS.md supersede conflicting historical rows below. In particular, Havensum replaces Melo, CSV replaces XLSX as the primary transaction exchange format, and Expected savings must become independent of the frozen plan. “Requirement” is an owner-stated constraint; “working choice” describes this prototype; “open” requires a product/integration decision. Implementation is not evidence that an open choice was approved.

## Product and accounting

| ID | Status | Decision | Reason / consequence |
| --- | --- | --- | --- |
| P01 | Requirement | React Native, Android first | Browser/PC display adapts the same application; no native PC product |
| P02 | Requirement | EUR only; no bank link | Manual data entry and import are sufficient |
| P03 | Requirement | No savings objectives or bill splitting | Keep the scope on tracking, cash accuracy and planning |
| M01 | Requirement | Four transaction types: expense, income, reimbursement, transfer | Inflows with different economic meanings remain distinguishable |
| M02 | Requirement | Link reimbursements by default, allow skipping | Entry must remain possible without finding an original expense |
| M03 | Requirement | Offset linked paybacks in the expense's original month | Net spending remains accurate across late repayments; account cash follows receipt date |
| M04 | Working choice | Unlinked reimbursements are balance adjustments | Excluded from income and expense statistics |
| M05 | Requirement | Transfers do not affect income, spending or averages | Moving money is not earning or consuming it |
| M06 | Requirement | Existing-loan creation does not credit cash by default | Ongoing loans must not corrupt current account balances |
| M07 | Working choice | Optional proceeds use a balance adjustment; repayment cash is manual | No invented loan earnings or silently created actual repayments |
| M08 | Requirement | Monthly loan payments belong in expense projections | A separate loan line forecasts active payments |
| M09 | Working choice | Integer euro cents and ISO calendar dates | Avoid binary-float monetary accumulation and date-to-month timezone shifts |
| M10 | Working choice / confirm | Savings rate is effective annual; compounded monthly on completed months | Formula is `(1 + annualRate / 100)^(1 / 12) - 1`; this is not nominal APR or a bank statement reconciliation |
| M11 | Requirement | Personal, Joint, Savings and Investment account tags | Current tags organize accounts; they do not enforce confidentiality |

## Categories and projections

| ID | Status | Decision | Reason / consequence |
| --- | --- | --- | --- |
| C01 | Requirement | Custom name, icon and colour; searchable icon choices | Categories should feel personal and recognizable |
| C02 | Requirement | Each subcategory setting can inherit or override independently | Null/empty setting inherits; zero is a real budget value |
| C03 | Working choice | One level of subcategories | UI currently limits nesting; arbitrary-depth hierarchy is not a finished feature |
| C04 | Requirement | Fixed / Variable / Occasional behaviour, overridable per transaction | Category defaults must not force every purchase into the same forecast behavior |
| C05 | Requirement | Optional budgets drive overspend bars only | A budget must not silently become a forecast input |
| C06 | Requirement | Twelve-hue category palette; red/green reserved for status | Current category hues use apricot, gold, teal, blue, lavender, pink and neutral families |
| F01 | Requirement | Explicit yearly initiation interview and a frozen plan | Ordinary entries must not keep moving the target |
| F02 | Requirement | Remaining-year revisions preserve past months | Approved plans are archived per year as immutable revisions (schema v3, PLAN-1). Past years are read-only |
| F03 | Requirement | Manual overrides win and are visibly marked | The owner's knowledge outranks a computed estimate |
| F04 | Requirement | Variable rolling average; default six months | PLAN-2: completed months before the first planned month; confirmed complete months (including zeros) win, otherwise a labelled partial estimate from recorded months |
| F05 | Requirement | Occasional spending feeds a cushion rather than the average | PLAN-2 suggests an editable cushion from average net occasional spending, excluding named-event payments |
| F06 | Working default / open | ±€2 fixed tolerance, 30% variable drift, two prior months | These operate today; final defaults were left open. No automatic recalculation |
| F07 | Working choice / open | Cushion is its own monthly plan line | Keeps it visible; owner originally left its presentation open |
| F08 | Working choice | Fixed plan lines total observed bills (account + category + normalized title) at their latest amount, minus explicit cancellations | PLAN-2. Still observed-history inference, not contract recognition: a renamed bill counts as a new bill until the old one is cancelled |
| F09 | Working choice | Interview is a three-step form launched manually | Automatic first-launch/annual prompting and interview completion state are not implemented |
| F11 | Owner approved, implemented | An early payment explicitly linked to a specific event occurrence counts toward spending in the event month | Cash follows each payment date. Linked payments reduce that occurrence's remaining amount. The frozen plan keeps the original estimate. When a cost moves, its linked payments require review. |

## UI direction

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| U01 | Approved direction | Cashew-like playfulness mixed with cozy illustration | Expressive colour, friendly glyphs, tactile controls and a distinctive identity |
| U02 | Approved direction | Quick entry and recent activity lead the home screen | Compact accounts farther down; large account balances do not dominate |
| U03 | Approved direction | Preserve animation and make interactions more playful | Spring presses, a gentle companion and subtle chart/notice motion; respect reduced motion |
| U04 | Requirement | Prominent category icons and meaningful colour differences | Shared category glyphs across feed, picker, editor and wheel |
| U05 | Updated working choice | Flat Lucide vector symbols; Fredoka + DM Sans | One consistent symbol family across platforms; colours remain editable |
| U06 | Requirement | Monthly status is one coloured number with an arrow | Avoid judgmental “you overspent/saved” messaging |
| U07 | Working choice | Android bottom navigation with central add action; sheets for entry | Thumb reach and unobstructed activity rows; main touch targets at least 48 dp |
| U08 | Required repair | Wheel and legend remain bounded; charts cannot overlap | Column layout on phones, intrinsic card height, measured chart widths, correct SVG transform origin |
| U09 | Working choice | Account strip scrolls horizontally | Intentional overflow stays inside its own scroller; the page itself must not overflow |
| U10 | Latest owner requirement | Minimalistic, Apple-inspired icons with no glossy look | Flat line symbols, consistent weights, upright alignment and matte colour accents. Preserve the playful layout and motion. |

## Sharing, imports and integrations

| ID | Status | Decision | Missing input / implementation |
| --- | --- | --- | --- |
| S01 | Requirement | A shared Google Drive file for Hugo and Marina | OAuth client, consent, ownership and discovery flow still needed |
| S02 | Requirement | Three-way merge; no guessed same-field or delete conflicts | Manual backup merge implements the engine/review UI; Drive transport is absent |
| S03 | Working choice / open | Local last-synced baseline | Stored separately as `melo-sync-base`; durable revision and multi-device protocol unfinished |
| S04 | Candidate / open | `drive.file` scope | Verify shared-file discovery/ownership and both users' access before committing to the flow |
| S05 | Open | Whether personal accounts are visible to both people | Current full backup includes every account. Tags are not privacy controls |
| S06 | Working choice | Concurrent plan revisions reviewed as whole snapshots | Conservative conflict handling; preference/theme sharing is not fully modeled |
| I01 | Requirement | Cashew import matched to a real export, mapping and safe reruns | Real export has not been supplied; generic adapters are not proof of compatibility |
| I02 | Working choice | Stable IDs preferred; content fingerprint fallback | Identical legitimate rows without IDs are ambiguous; namespace external IDs before multi-source imports |
| I03 | Requirement | Styled Excel summary plus plain re-importable raw sheet | Implemented; full app restore belongs to JSON and needs a dedicated reviewed workflow |
| V01 | Candidate / open | Twelve Data for EOD investment prices | Need exact ETF ticker/exchange, entitlement and permitted usage verification |
| V02 | Working choice | Manual investment balance until a real feed exists | Never display fabricated “live” prices |
| D01 | Requirement | An Android app is the delivery target | APK, signing and physical-device validation remain unfinished; a Hermes bundle is not an APK |

## Questions to resolve before integrations or release

1. Exact ETF ticker and exchange.
2. Google OAuth ownership and how the shared Drive file is created, selected and opened by both users.
3. Personal-account visibility and shared-backup contents.
4. Final tolerance/drift defaults and completed-month detection.
5. Cushion presentation and whether/how its amount is estimated from occasional history.
6. Effective-annual versus nominal savings rates and treatment of backdated corrections.
7. Full JSON restore, historical plan archives, and posted versus future/planned transactions.
8. Final Android application ID, signing/build account and supported device/runtime targets. *(Answered 19 November 2026: A01–A07 below.)*

## Interaction and Plan clarity update

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| U11 | Owner-authorized repair | Entity taps inspect; editing is explicit | Account ledger and transaction details precede their editors; categories and summaries drill into filtered activity |
| U12 | Owner-requested clarity | Separate actual, frozen plan and forecast, with text and color | Blue actual, purple plan, amber forecast; green/red only for above/below-plan status |
| U13 | Working choice | Plan tabs: This month, Averages, Year ahead | Expose historical monthly averages and predicted savings directly |
| F10 | Working estimate | Current-month outlook uses recorded costs plus remaining variable allowance; fixed/loans/reserves retain at least planned totals | Read-only estimate; never replaces frozen plan; model and limits in docs/UX_UPDATE.md |
| U14 | Working choice | Crisp 120 ms press feedback and restrained state transitions | Reanimated native and CSS web; routine destination entrance removed; reduced motion supported |


## Latest owner requirements — local-repo handoff

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| H01 | Owner requirement, pending | Product name Havensum, with a matching flat vector logo | Rename visible branding/metadata while preserving existing local data and import compatibility |
| H02 | Owner requirement, pending | Download a Havensum CSV template and append its entries on import | Preview, mappings and repeat-import identity; never replace the ledger implicitly |
| H03 | Owner requirement, samples needed | Adapt both owners' bank CSV exports | Real sanitized samples and expected normalized outputs required before claiming support |
| H04 | Owner preference, pending | CSV as the primary transaction export; JSON remains the full-state backup | Supersedes I03's XLSX-first requirement; CSV cannot preserve workbook styling or the entire state graph |
| H05 | Owner requirement, pending | Expense toggle “Expect a payback”; list “Awaiting paybacks” | Task can record a linked payback or close without one; task closure never invents money |
| H06 | Owner clarification, pending | Expected savings predicts the outcome independently of Planned savings | Supersedes F10 as the desired algorithm; target-only edits must not change prediction |

## Owner-confirmed implementation policies — 17 November 2026

These choices are approved requirements for the upcoming implementation, not claims that the behavior already exists.

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| H07 | Owner approved, pending implementation | Occasional reserve uses historical monthly average; known upcoming occasional costs use up the reserve | Do not add the entire reserve and all known costs as independent expenses |
| H08 | Owner approved, pending implementation | A missing fixed cost stays in Expected savings until explicitly marked cancelled | Missing transactions alone do not silently cancel an obligation |
| H09 | Owner approved, pending implementation | Owner marks historical months complete after entering/importing all income and expenses | Incomplete history supports a clearly labelled partial estimate; do not infer completeness from the presence of a transaction |
| H10 | Owner approved, pending implementation | Keep original ledger and merge-baseline recovery copies for each migrated version until explicitly removed | Migration must not overwrite or automatically prune those original recovery copies |
| H11 | Owner confirmed | Cancellation applies to an individual bill | Use account, category and title with an explicit effective month. |
| W01 | Owner approved workflow | Integrate task branches into develop; master is release-only | New task/bug branches start from develop; no release merge without owner instruction |
| W02 | Owner required review gate | Do not merge, delete or close a task branch before a completed Claude review | A usage limit leaves the branch open; commit locally for safekeeping and request review after access returns |

## FORECAST-2 — comparable planned costs (owner answers, 19 November 2026)

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| F12 | Owner approved, implemented in UI and docs | "Planned cost" is the single term for the plan item that expenses link to | UI, docs and questions use it; code keeps `events` |
| F13 | Owner approved, implemented | Planned costs compare by the same top category of their linked expenses (subcategories roll up); recurring costs compare with their own past years; a new cost is matched by the owner's one-time "like" choice | No free-text inference; the like choice serves only the draft suggestion and is not stored |
| F14 | Owner approved, implemented | Evidence skips confirmed months without linked expenses and fully refunded (cancelled) costs; older eventPayments matches don't count | Median and range from 3+ completed comparables, five most recent |
| F15 | Owner approved, implemented | An expense dated after an occurrence may link to it | Spending follows the occurrence month; cash follows the payment date |
| F16 | Owner approved, implemented | Accepting a suggestion sets that draft year's amount only; moving a recurring cost applies from a chosen year | Stored as optional `yearAmounts` in schema v4. The move is stored as optional `monthFromYear` (FORECAST-2 follow-up, see F17–F18) |
| F17 | Owner approved (19 November 2026) | Move a recurring planned cost from a *Planned costs* card in Year ahead, from this year or a later year; expenses linked to the old month in a moved year stay linked and are flagged for review | Saved at once; earlier years, frozen plans and recorded transactions are unchanged |
| F18 | Owner approved (19 November 2026) | A move from this year needs both its old and its new month to be this month or later; otherwise it starts next year | Past occurrences are never moved; the dialog offers only allowed years and months |

## LEDGER-1 — posted versus future-dated activity (owner answer, 19 November 2026)

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| L01 | Owner approved | An entry dated after today counts in current account balances and monthly reports from its date, by the device's local date | Until its date it is shown as upcoming/scheduled and still feeds forecasts. From that day it is included automatically, with no manual confirmation step |
| L02 | Derived from L01, owner to confirm | "Today" is the device's local calendar date everywhere a view decides what has posted | Replaces the UTC dates recorded in PLAN-4 Q4 and FORECAST-1 Q3 for balances, reports, forecasts, the starting month and new-entry dates |

## ANDROID-1 — installable package (owner answers, 19 November 2026)

These answer question 8 above and settle the open part of D01. The build steps are in [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md).

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| A01 | Owner approved, configured | The final Android application ID is `com.havensum.app` (was `com.melo.money`) | No build was ever installed under the old ID, so no installed data is lost. Once published on Play the ID can never change. The Expo `slug` stays `melo-money` (unused by local builds) |
| A02 | Owner approved, configured | Minimum Android 7.0 (API 24), portrait phones; target and compile SDK 36 | Expo SDK 54 defaults, not overridden. Tablets run the phone layout and are not a QA target |
| A03 | Owner approved, configured | First delivery is a release APK for sideloading; the Play AAB path stays configured for later | `assembleRelease` for APKs, `bundleRelease` for an AAB. `eas.json` keeps its preview (APK) and production (AAB) profiles but is unused |
| A04 | Owner approved, configured | The owner builds on their own PC with a local Gradle build and keeps the upload keystore | `plugins/withHavensumReleaseSigning.cjs` signs release builds from four `HAVENSUM_UPLOAD_*` properties in the owner's user Gradle properties. Without them a release build fails instead of using the debug key. No Expo account, EAS build or cloud-held key |
| A05 | Derived from A04 | `expo.android.versionCode` in `app.json` is the only version-code source. It rises by 1 in a `develop` commit before any package that reaches a phone or Play, and is never reused | `eas.json` reads it too (`appVersionSource: local`). `expo.version` is the version name people see |
| A06 | Derived from A04 | The native `android/` project is regenerated by `expo prebuild` and not committed; APKs, AABs and keystores are ignored | Native changes go through `app.json` or config plugins, never hand edits to `android/` |
| A07 | Owner approved, configured | Android Auto Backup is off (`allowBackup: false`) | The ledger stays on the phone and in exported Havensum backups only. A reinstall or new phone starts empty until a backup is restored |
| A08 | Technical choice, configured | Remove permissions Havensum does not use: legacy external storage read/write and drawing over other apps | File picking and sharing use the system picker and share sheet, which need neither permission. ANDROID-2 must confirm this on a device |
