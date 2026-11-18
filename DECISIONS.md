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
| F02 | Requirement | Remaining-year revisions preserve past months | Current same-year implementation works; cross-year archival is still a blocker |
| F03 | Requirement | Manual overrides win and are visibly marked | The owner's knowledge outranks a computed estimate |
| F04 | Requirement | Variable rolling average; default six months | Current estimator uses completed recorded months; missing-history semantics need strengthening |
| F05 | Requirement | Occasional spending feeds a cushion rather than the average | Current implementation separates it but uses a manually entered cushion; automatic estimation is incomplete |
| F06 | Working default / open | ±€2 fixed tolerance, 30% variable drift, two prior months | These operate today; final defaults were left open. No automatic recalculation |
| F07 | Working choice / open | Cushion is its own monthly plan line | Keeps it visible; owner originally left its presentation open |
| F08 | Working choice | Fixed baseline = latest non-zero category/behaviour total | A prototype approximation, not recurring-contract recognition; see HANDOFF caveats |
| F09 | Working choice | Interview is a three-step form launched manually | Automatic first-launch/annual prompting and interview completion state are not implemented |

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
8. Final Android application ID, signing/build account and supported device/runtime targets.

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

## Workflow clarification — 18 November 2026

The owner explicitly authorized pushing `codex/collision-resistant-identifiers`, `codex/state-migration-recovery` and `codex/independent-expected-savings`, then the reviewed integration to `develop`. The three named heads have been pushed and verified on the existing `origin`. The owner also reiterated that pending Claude reviews must not block development; branding proceeded on a separate branch from `develop`. Review still gates merging. Preserve the original application ID, Expo slug and legacy storage keys during the cosmetic rename; choosing a new install identity remains open. No hosting bindings were recreated. Branding remains local.
