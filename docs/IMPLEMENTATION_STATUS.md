# Handoff implementation status

## Workflow and baseline

- Git Flow is local: `develop` integrates completed task branches; `master` is reserved for owner-requested releases. No push or remote default-branch change has been made.
- Test hardening is integrated: the original 25 tests became 113 Node tests and 57 browser checks before feature work. See TESTING.md and REVIEWS.md for scope and limits.

## Current handoff work

| Item | Status |
| --- | --- |
| Collision-resistant IDs for newly created records | Implemented on `codex/collision-resistant-identifiers`; 113 Node tests and 72 browser checks pass, along with web build and Hermes compilation. Claude review attempted but blocked by its weekly usage limit; branch remains open and unmerged. |
| Explicit state schema migration and recovery protection | Implemented on `codex/state-migration-recovery`, from `develop`; schema 1 → 2 validation and original ledger/baseline recovery retention. 126 Node tests, coverage gates, 69 browser checks, web build and Android Hermes compilation pass. Claude review deferred until available after 12:00 on 18 November, per owner instruction. Branch stays unmerged. See STATE_MIGRATIONS.md. Full restore/recovery UI remains pending. |
| Independent Expected savings | Pending; owner confirmed historical occasional reserve with known-cost absorption, explicit cancellation of missing fixed costs, and manually confirmed complete months with labelled partial estimates otherwise |
| Havensum rename and vector/logo assets | Pending |
| CSV primary export, template and reviewed import identity | Pending |
| Expected-payback tasks | Pending |
| Bank-specific adapters | Pending sanitized samples and agreed normalized results when that stage is reached |

On the identifier branch, new-record IDs use browser cryptographic random bytes and the Expo SDK 54-compatible native crypto provider. Existing IDs, original expense/payback links, deterministic interest IDs, imported identities and both legacy storage keys are preserved. The migration branch does not contain the identifier implementation.

Android compilation is distinct from installation and device QA. No release, APK, Drive sync, pricing feed or verified bank/Cashew adapter is implied by this progress record.

No task branch may be merged or closed before Claude completes its review. The identifiers branch remains pending that gate; master and develop do not contain these identifier changes yet.
