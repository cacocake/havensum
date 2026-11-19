# Havensum — decision register

As of 17 November 2026. Latest requirements in docs/HAVENSUM_REQUIREMENTS.md supersede conflicting historical rows below. In particular, Havensum replaces Melo, CSV replaces XLSX as the primary transaction exchange format, and Expected savings must become independent of the frozen plan. “Requirement” is an owner-stated constraint; “working choice” describes this prototype; “open” requires a product/integration decision. Implementation is not evidence that an open choice was approved.

## Product and accounting

| ID | Status | Decision | Reason / consequence |
| --- | --- | --- | --- |
| P01 | Requirement | React Native, Android first | Browser/PC display adapts the same application; no native PC product |
| P02 | Requirement | EUR only; no bank link | Manual data entry and import are sufficient |
| P03 | Requirement | No savings objectives or bill splitting | Keep the scope on tracking, cash accuracy and planning |
| P04 | Owner decision (19 November 2026, PLAN-3 follow-up) | A new planned cost marked "Repeats every year" in the Year Plan interview counts from the year of the plan being drafted onwards | Stored as `fromYear` on the recurring planned cost; earlier years, their forecasts/Expected savings and frozen plans are untouched. Recurring planned costs without `fromYear` keep applying to every year |
| P05 | Owner decision (19 November 2026), queued | When a carried loan change differs from a newer payment entered on the loan itself, a new draft starts from the newer loan payment | Loans store no edit date, so "newer" cannot be told apart yet; queued as its own backlog ticket (PLAN-3 follow-up b) rather than guessed |
| P06 | Owner confirmed, current behaviour | After a same-year revision, Outlook settings' "Copy existing scheduled changes" sees only the later income/loan changes and the restated loan payment that revision stores | No change |
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
| L02 | Owner confirmed (19 November 2026, in chat) | "Today" is the device's local calendar date everywhere: what has posted, the starting month, and the default dates of new entries and loans | Replaces the UTC dates recorded in PLAN-4 Q4 and FORECAST-1 Q3 for balances, reports, forecasts, the starting month and new-entry dates |

## LEDGER-2 — historical interest corrections (owner answers, 19 November 2026)

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| L03 | Owner approved | Past interest is corrected only through a reviewed "Correct past interest" flow on the savings account | A corrected past balance is recorded as an ordinary dated entry or an explicit balance adjustment; the flow then shows its interest effect. Past rate periods can be changed only inside this flow, never in the normal rate editor |
| L04 | Owner approved | A correction keeps every recorded interest entry and adds one marked *Interest correction* entry per affected month for the difference, dated that month's end | Nothing recorded is rewritten. A downward correction is a negative interest-income entry, so income, cash and the month total stay consistent. A completed month that never had an app entry gets its ordinary app entry instead |
| L05 | Owner approved | When bank-posted interest (an imported or typed Interest income entry) exists for an account and month that also has, or would get, an app interest entry, the owner chooses per month: use the bank amount only, or keep both | Until chosen, the app posts no interest of its own for that month and the account shows the month as needing a choice. *Bank only* offsets an existing app entry with a correction; *keep both* keeps or posts the app entry. Each choice is stored on the account so it is asked once |
| L06 | Owner approved | The review lists every affected completed month (recorded, corrected, difference) with later months marked *compounding effect*, plus a total; Apply corrects all listed months at once and Cancel changes nothing | A stale or repeated Apply is refused and re-reviewed, so corrections are never duplicated |
| L07 | Owner approved (19 November 2026, follow-up answers) | Corrections are not edited directly (review again instead); later months stay previewed while a bank choice is pending; only the *Interest* category itself (not subcategories) counts as bank interest; a correction cannot start before the account's first recorded entry or first rate period | The first three confirm LEDGER-2 as built. The earliest-month limit is the follow-up LEDGER-2a |

## ANDROID-1 — installable package (owner answers, 19 November 2026)

These answer question 8 above and settle the open part of D01. The build steps are in [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md).

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| A01 | Owner approved, configured | The final Android application ID is `com.havensum.app` (was `com.melo.money`) | No installed build under the old ID is recorded (none was ever delivered), so no installed data is lost. Once published on Play the ID can never change. The Expo `slug` stays `melo-money` (unused by local builds) |
| A02 | Owner approved, configured | Minimum Android 7.0 (API 24), portrait phones; target and compile SDK 36 | Expo SDK 54 defaults, not overridden. Tablets run the phone layout and are not a QA target |
| A03 | Owner approved, configured | First delivery is a release APK for sideloading; the Play AAB path stays configured for later | `assembleRelease` for APKs, `bundleRelease` for an AAB. `eas.json` keeps its preview (APK) and production (AAB) profiles but is unused |
| A04 | Owner approved, configured | The owner builds on their own PC with a local Gradle build and keeps the upload keystore | `plugins/withHavensumReleaseSigning.cjs` signs release builds from four `HAVENSUM_UPLOAD_*` properties in the owner's user Gradle properties. Without them a release build fails instead of using the debug key. No Expo account, EAS build or cloud-held key |
| A05 | Derived from A04 | `expo.android.versionCode` in `app.json` is the only version-code source. The first package ships as 1. It rises by 1 in a `develop` commit before each later package that reaches a phone or Play, and is never reused | `eas.json` reads it too (`appVersionSource: local`). `expo.version` is the version name people see |
| A06 | Derived from A04 | The native `android/` project is regenerated by `expo prebuild` and not committed; APKs, AABs and keystores are ignored | Native changes go through `app.json` or config plugins, never hand edits to `android/` |
| A07 | Owner approved, configured | Android Auto Backup is off (`allowBackup: false`) | The ledger stays on the phone and in exported Havensum backups only. A reinstall or new phone starts empty until a backup is restored |
| A08 | Technical choice, configured | Remove permissions Havensum does not use: legacy external storage read/write and drawing over other apps | File picking and sharing use the system picker and share sheet, which need neither permission. ANDROID-2 must confirm this on a device |

## DRIVE-1 — shared Drive file access (owner answers, 19 November 2026)

These are owner decisions for DRIVE-2. They are not claims that Drive works: Havensum has no Drive code and nothing has been tested with real Google accounts. Who can find, read and update the file, how access changes, what DRIVE-2 must verify and the setup the owner must provide are in [docs/DRIVE_ACCESS_MODEL.md](docs/DRIVE_ACCESS_MODEL.md). These rows settle S01's ownership and discovery, S04 and S05, and questions 2 and 3 above. S03 (the local baseline and revision protocol) stays open for DRIVE-2.

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| G01 | Owner approved, not implemented | Request only the `drive.file` scope (supersedes S04's candidate) | Non-sensitive and per file, so no restricted-scope verification or security assessment. The app sees only a file it created or one the person picked. No `drive`, `drive.readonly`, `drive.metadata.readonly` or `drive.appdata` (app-data files cannot be shared) |
| G02 | Owner approved, not implemented | Either person may create the shared file from the app. The app shares it as editor with the partner's Google email | The partner opens it once through Google's picker (web Picker; Android desktop/mobile Picker), filtered to that file where possible. Each installation stores the file ID and its own baseline |
| G03 | Owner approved | The creator stays the owner | The app offers no ownership transfer. A manual transfer between personal accounts is a pending-owner request in Drive that the recipient must accept |
| G04 | Owner approved, not implemented | Sign-out, removed app access, removed sharing or a trashed file keep all local data and pause sync | Nothing is deleted locally or remotely. Unsynced edits wait and merge through the normal review on reconnect. A device that lost access keeps its copy. The app never silently switches, re-creates or overwrites the file |
| G05 | Owner approved (answers S05 and question 3) | Everything except per-device display preferences is in the shared file, visible to both people: every account and all financial data | It carries the same financial collections as the full backup, not its device keys (theme, preferences, demo). Personal/Joint tags and `preferences.visibility` are labels, not privacy controls. The file is unencrypted JSON in the creator's Drive |
| G06 | Owner approved, not implemented | Theme and display preferences stay on each device | The shared file carries financial data and plans only. `validateState` requires a theme and `mergeThreeWay` copies local top-level keys, so DRIVE-2 must keep device keys out of the file explicitly. DRIVE-2 must classify every top-level state key and ask the owner if one is unclear |
| G07 | Owner approved, not implemented | "Create shared file" is blocked while example (demo) data is loaded | Example accounts and records never reach the partner |
| G08 | Owner approved, not implemented | A partner with existing local entries chooses either to adopt the file (after a local recovery copy) or to merge with a review of every one-sided record | Without a common baseline, `mergeThreeWay` would silently union independently entered duplicates. The current merge UI refuses to run without a baseline. DRIVE-2 designs a dedicated first-join review |
| G09 | Owner approved, not implemented | Setup offers "Open shared file" before "Create", and Create warns to check with the partner | If two files exist anyway, the person opens the one to keep, picks the other, and merges it in through the G08 one-sided-record review (the files share no baseline). No file is deleted automatically |
| G10 | Owner approved, not implemented | Sync runs automatically (start, resume, shortly after edits when online) plus a "Sync now" button | Conflicts always wait for review. An expired web token (short-lived, no refresh token in the browser) shows "Reconnect" instead of an unprompted popup |

## FORECAST-2 — follow-up owner answers (19 November 2026)

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| F19 | Owner confirmed, current behaviour (implemented) | Accepting a suggested planned-cost amount also changes Expected savings | A planned cost's amount is forecast evidence (PLAN-3 convention); a target-only edit still leaves Expected savings unchanged |
| F20 | Owner approved, not implemented | A merge conflict on a planned cost's year amount uses readable wording, e.g. "December celebrations · amount for 2027: €410.00 here, €450.00 on the other device" | Queued as the "Readable year-amount merge conflicts" follow-up ticket; the merge decision itself is unchanged |

## IMPORT-2 — Cashew classifications (owner answers, 19 November 2026)

Built and tested against synthetic rows that mirror the published Cashew export. Everything beyond the verified ordinary EUR rows from v6.7.5+524 is unverified against a real export. K10–K12 follow the owner's own small test export of 19 November 2026 (newer layout, version not stated); the shapes listed in docs/CASHEW_IMPORT_RESEARCH.md were seen in that one export only.

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| K01 | Owner approved | Proceed with synthetic rows mirroring the documented Cashew export format | No claim of exact Cashew compatibility; unverified cases keep their review status |
| K02 | Owner approved | Cashew `debt` (borrowed) rows can be imported only after the owner picks an existing Havensum loan in review; `credit` (lent) rows stay blocked | No loan is created from a CSV row and borrowing never becomes income or spending |
| K03 | Owner approved | The sign of a linked `debt` row decides its meaning: positive = loan proceeds recorded as an unlinked balance adjustment tagged with the loan, negative = a loan repayment expense tagged with the loan | Proceeds stay out of income; repayments remain recorded transactions |
| K04 | Owner approved | Cashew scheduled rows (`upcoming`, `subscription`, `repetitive`) are treated as paid ordinary rows when `amount unpaid` is blank or 0 (v1 has no such column and exports only paid rows); review notes they came from a scheduled entry | They still need an explicit classification; a non-zero `amount unpaid` stays a row error |
| K05 | Owner approved | Two opposite `Balance Correction` rows with the same amount and timestamp in different accounts are preselected as a suggested transfer when the match is unique; the owner confirms or changes it | Ambiguous or non-unique candidates need manual pairing; the preselected pair is shown with a note (see K09) |
| K06 | Owner approved | Paybacks keep the manual link: the owner classifies a credit as a reimbursement and picks the original expense (recorded or in the same file) | No link is guessed from titles or amounts |
| K07 | Owner approved | Cashew color/icon/emoji are ignored; budget and objective are shown as read-only source information in review and never create records, budgets, goals or targets; a non-zero `amount unpaid` or any `extra` value stays a row error to skip | Havensum category styling is preserved |
| K08 | Owner approved | Ordinary Cashew rows keep requiring an explicit classification; nothing is prefilled from the sign | Matches the bank import review |
| K09 | Owner approved (after review) | A preselected Cashew transfer pair needs no separate per-row decision: confirming the import confirms it unless the owner changed it | The suggestion note shows only while the pair is kept; a borrowing (`debt`) credit is never a transfer leg |
| K10 | Owner approved (after a real test export, 19 November 2026) | Cashew `extra` (observed: recurrence text such as "repeat every 1 month", also on ordinary rows) is shown read-only in review and never blocks a row or creates a recurring entry | Supersedes the `extra` part of K07; a non-zero `amount unpaid` still blocks |
| K11 | Owner approved (after the real export) | A Cashew transfer leg is recognised by its note: first line `Transferred Balance`, second line `A → B` naming the debit's and the credit's source accounts; the category name is ignored | Supersedes the `Balance Correction` category rule of K05; works in any app language. Uniqueness, amount and timestamp rules of K05/K09 still apply |
| K12 | Owner approved (after the real export) | A row with a Cashew objective may be a loan (the real export shows borrowing/lending as `default` rows tagged with a loan objective, not `debt`/`credit`): review lets the owner optionally pick a Havensum loan, and then K03 applies; without a loan it is classified normally, with a note | Nothing is created from the objective; `debt`/`credit` type handling (K02) stays for older exports |
