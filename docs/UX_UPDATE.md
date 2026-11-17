> Historical implementation record. Latest requirements in HAVENSUM_REQUIREMENTS.md supersede the plan-derived forecast formula below.

# Interaction and Plan update

17 November 2026. Implemented following the independent UI audit and owner request to make the Plan understandable. This is a working implementation, not physical Android certification.

## Interaction contract

Tap an entity to inspect it. Editing is a separate, explicit action.

- Account cards open an all-time account ledger, reconciling opening balance plus movements. The balance is explicitly **recorded across all dates**, including future entries; it is not represented as today's available bank balance.
- Transaction rows open details, including linked reimbursement context and original-month net cost. Edit opens the existing editor.
- Category legend rows open filtered expense activity including descendants. Wheel slices select visibly and expose a transaction action below the wheel.
- Income/net-spending summaries drill into filtered Activity. See all carries the active recent-activity type filter.
- Magnifier navigates and focuses search. Category/account drilldowns do not request the keyboard.
- Re-selecting the current navigation destination scrolls to top. More stays selected for secondary destinations, and no longer repeats primary destinations.
- Native Android Back returns account detail to Accounts and secondary pages to Home; actual-device verification is outstanding.
- Chart range has two explicit choices. Month bars and 48 dp month chips select persistent actual/plan values with an expense-list action.
- Modal drag handles were removed because there is no drag gesture. Closing changed transaction, category, account, loan or plan inputs opens discard review; saving bypasses this guard. Calendar year browsing is a draft until a month is selected.

## Plan information model

| Section | Meaning |
| --- | --- |
| This month | Predicted/recorded savings; actual, frozen plan and forecast comparison; spending headroom; category outlook; model explanation and explicit revision action |
| Averages | Observed income, net spending and savings per recorded completed month, plus category averages including occasional spending |
| Year ahead | Planned versus recorded savings by month; selecting a month opens its detailed view |

Color is redundant with labels: **blue = recorded actual**, **purple = frozen plan**, **amber = forecast**, **green/red = favorable/unfavorable difference from planned savings**. Custom category colors remain unchanged. Manual overrides are marked in the plan breakdown. A narrow layout stacks each metric with its three labeled values to avoid truncating euro amounts.

`src/planInsights.js` computes a **read-only outlook**, separate from `buildPlan` and persistent state:

- Current actuals use entries dated through today. Historical net spending retains original-month reimbursement attribution.
- Fixed cost bucket outlook = max(recorded + known future bucket costs, frozen bucket plan).
- Variable bucket outlook = recorded bucket cost + max(known future bucket costs, round(frozen bucket plan × remaining days / days in month)).
- Loan outlook = max(recorded + known future repayments, frozen loan allowance). Loans are not added twice.
- Occasional outlook = max(recorded + known future occasional costs, cushion + planned one-off reserve).
- Income outlook = max(recorded + known future income, frozen planned income).
- Predicted savings = income outlook − expense outlook. Difference = predicted savings − frozen planned savings.
- Past months show recorded results. Future months show their frozen plan. No plan produces no invented forecast.

These are transparent working assumptions, not a scheduled-payment recognizer or statistical confidence model. For example, a paid monthly gym membership classified Variable retains some remaining daily allowance. Changing its behavior to Fixed changes that interpretation. Missing income is assumed still due up to the plan; missed/extra spending and incomplete records can change the result. Known future entries in the current month set a floor for its outlook without becoming current actuals. Future paybacks are not assumed received; until they arrive they do not reduce the current-month outlook. Account balances and Activity continue to show explicitly recorded entries.

Averages use the plan's history-window length ending before the selected month, restricted to completed calendar months with any recorded entry. Missing months are excluded, not treated as zero. This is **observed history**, not the fixed baseline used by `buildPlan`. The historical window and sample count are visible, with incomplete-history limits. No plan or past month is modified by viewing these figures.

## Motion review and implementation

Reviewed upstream Emil Kowalski `find-animation-opportunities` and `animate-expo`, including Expo press recipes. These references were used for this task, not installed as persistent skills.

| Location | Opportunity / purpose | Frequency | Implementation |
| --- | --- | --- | --- |
| Buttons, icon buttons and existing Squish controls | Press feedback | Frequent | 0.97 scale; 120 ms; cubic-bezier(0.23,1,0.32,1). Reanimated native CSS transition, web CSS transition. No scale when reduced motion is enabled. |
| Forecast explanation | Prevent abrupt content appearance | Occasional | 140 ms opacity entrance; no entrance when reduced motion is enabled. Reanimated native FadeIn / web CSS. |
| Spending meter | Indicate a real value change | Occasional | Clamped scaleX, 180 ms strong ease-out, anchored left; immediate in reduced motion. No animated text values. |
| Save notices and companion | Existing confirmation / optional play | Occasional / opt-in | Preserved existing notice and companion behavior with reduced-motion handling. |

Rejected: slide/fade on routine tab navigation (frequency and false depth); decorative bar-growth on financial charts (data readability); count-up euro figures (precision/readability); swipe-to-delete (accidental destructive actions, no demonstrated need); drag-to-dismiss sheets (a larger gesture/navigation change needing device verification). No invented haptic support or frame-rate claims.

## Validation

- 25 tests pass: 17 existing accounting/merge/import tests plus 8 outlook and drilldown tests, including transfer/reimbursement neutrality, remaining-variable allowance, loan non-duplication, occasional reserve excess, future-date separation and known-cost forecast floors, historical/future/no-plan modes and parent-category matching.
- Web production build and Android Metro/Hermes compilation succeed. Compilation is not an APK or a device performance test.
- Actual browser preview checks: account card → ledger; More selected; category → filtered activity; search focused; details → explicit edit; dirty close → Keep editing retained draft → discard; calendar browse-year cancellation preserved selected month; chart selection; active Home return-to-top.
- Added €12.34 example expense with category picker, observed save notice and recent row. Predicted savings moved €727.00 → €714.66; frozen planned savings stayed €675.85. Reload reset isolated demo data.
- Home wheel/legend containment and zero document horizontal overflow checked at 320/360/396/412 px. Plan/Averages visually inspected at compact and large phone widths, light and dark. A compact comparison truncation found during QA was repaired.
- Physical Android keyboard, TalkBack, hardware Back, enlarged text and release-build animation performance remain unverified. No Drive/ETF/import/annual-onboarding claims were added.
