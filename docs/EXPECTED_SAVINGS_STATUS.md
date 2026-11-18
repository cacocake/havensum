# Independent Expected savings

Work is isolated on `codex/independent-expected-savings`, created from `develop` while the identifier and migration foundation branches remain open and unmerged. Claude availability gates merging, not implementation.

The dashboard and Plan screen use `expectedSavings` through the public `planInsights` boundary. Ledger activity and independent inputs determine Expected savings; frozen plan values supply only the comparison. Target-only edits cannot move the prediction. No ordinary transaction or prediction setting rewrites a frozen target.

## Calculation and UX

- The expense editor offers **Link to a planned cost** for the payment month or later. Multiple purchases can share one event occurrence. The ledger keeps cash dates, and spending reports use the selected event month. Expected costs shows paid, scheduled and still upcoming amounts. A payback reduces net spending without changing the settled portion of the planned cost. If a cost moves, its prior links stay in their original spending month until reviewed. Legacy one-payment matches remain readable.

- Income, variable allowances and occasional reserve use owner-confirmed complete months in the independent 3/6/12-month window. Confirmed empty months count as zero. Without confirmed months, observed financial months provide an explicitly partial estimate. No history or known activity/obligation produces “Not enough history.” Transfers and unlinked reimbursements do not supply financial history.
- Variable allowances are allocated per root category and honor per-transaction behavior overrides. Each category uses recorded costs plus its remaining-day allowance, with registered future costs as a floor. Calendar lengths handle leap months/year boundaries.
- Fixed bills use account ID + category ID + trimmed, case-insensitive title. Their latest observed monthly gross cost stays expected, even outside the averaging window, until explicitly cancelled. Recorded/scheduled payments cover the obligation once; received linked paybacks reduce net cost. Historical paybacks do not promise another future reimbursement. Different bills in one category stay separate. The bill detail exposes history and an explicit effective-month cancellation confirmation. Past results remain received ledger results.
- Loan coverage is matched per loan ID, with the existing exact account/title fallback only when unambiguous. Overpaying one loan cannot cover another. Registered repayments and dated obligations count once; unmatched loan expenses remain in the total.
- The historical monthly net occasional reserve absorbs registered occasional spending and remaining known events; excess raises spending. Explicit expense/event matching avoids counting a paid known cost again. Matching never creates or edits a transaction. Future paybacks stay excluded until receipt.
- Prediction income/repayment changes have independent dated inputs. The assumptions dialog can explicitly fill missing dated changes from a legacy plan while retaining current independent inputs. It never copies target amounts/overrides. Existing events remain shared known costs. Prediction works without a target.

Blue Recorded, purple Planned and amber Expected values remain distinct. Values stack on phones to keep large amounts readable. Card bounds and full comparison amounts are checked at 320, 360, 396, 412 and 1280 px; synthetic screenshots were visually inspected. Shared React Native components maintain both ports.

Bill identification is an observed-history approximation, not contract recognition: changing a title, account or category can infer a different bill; deleting source history can remove an inferred obligation. This limitation is explicit rather than silently treating missing months as cancellation.

## Persistence and foundation integration

Optional `state.outlook` contains `window`, `completeMonths`, `billCancellations`, `incomeChanges`, `loanChanges` and `eventPayments`. Old states without it still open without synthesized completeness or cancellations. Fields are additive: this branch does not bump versions, rename keys, rewrite legacy plans or automatically copy targets. JSON backups retain new metadata. Browser/native saves, reads, baselines and JSON imports validate new inputs before replacement.

Three-way merge treats outlook as a conservative whole snapshot. Concurrent changes require explicit review. An unchanged local snapshot accepts remote changes, including deletion. Merge application handles both plan and outlook snapshots. Clearing example data clears its prediction metadata.

After foundation reviews, integrate through `develop` and reconcile overlapping storage/import/schema code. Call `validateOutlookState` from the migration branch's `validateState` boundary and retain its serialized recovery-first persistence. Do not replace that implementation with this branch's older adapter structure. Preserve H10 recovery copies and all legacy IDs/keys. Rerun combined suites after resolving conflicts. This is required integration work; foundation code has not been merged here.

## Verification and limits

138 Node tests and coverage gates, 75 browser checks, the web build and Android Hermes compilation pass. Tests exercise public financial, storage, import/merge and user-flow boundaries with synthetic data. Superseded plan-derived fixtures now supply historical evidence; “future equals target/no target means no prediction” expectations were replaced by independent behavior. Legacy numeric-zero loan linkage and parent-category inheritance also have regressions and fixes.

Claude review is pending availability after 12:00 on 18 November. No independent review, release, push, Android installation or physical-device verification is claimed. Full restore/recovery UI, explicit recurring-contract records, archived plans, posting semantics, bank adapters, cloud sync and pricing feeds remain separate work.
