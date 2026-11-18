# Handoff implementation status

All development integration goes through `develop`; `master` is reserved for requested releases. No task branch below is merged or closed, and nothing has been pushed.

| Item | Status |
| --- | --- |
| Collision-resistant identifiers | Implemented at `b51034d` on `codex/collision-resistant-identifiers`; prior checks passed. Claude review previously hit its weekly usage limit and remains pending. |
| State migration/recovery | Implementation `e7d1285`, branch HEAD `7e47dbe` on `codex/state-migration-recovery`; the later commit removes a saved continuation prompt. Prior migration checks: 126 Node tests, 69 browser checks, web build and Hermes compilation. Claude review pending availability after 12:00 on 18 November. |
| Independent Expected savings | Implemented on `codex/independent-expected-savings`, created from `develop` while foundation review is pending. Individual-bill cancellation confirmed by owner. 138 Node tests and coverage gates, 75 browser checks, web build and Hermes compilation pass. See EXPECTED_SAVINGS_STATUS.md for behavior and required foundation integration checks. Claude review pending. |
| Rename/logo, CSV export/template/identity, expected-payback tasks, bank adapters | Pending; preserve the implementation order and private-data constraints in HAVENSUM_REQUIREMENTS.md. |

Policies H07–H10 remain approved; H11 records individual-bill cancellation. Foundation integration must reconcile additive outlook validation with recovery-first schema persistence before any merge of the feature. Hermes compilation is not Android installation or physical-device QA.
