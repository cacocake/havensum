# Havensum CSV exchange — proposed contract

**Pending implementation.** This is a specification for the local developer, not documentation that the current importer already supports every field. Existing generic import recognizes only a subset; adapt it before advertising full Havensum CSV compatibility.

## Three distinct flows

1. Quick-entry template: human-friendly expense entry, usually blank IDs, mappings before append.
2. Canonical transaction export: stable IDs and explicit types for reliable round trips.
3. Bank CSV: bank-specific parsing into the same normalized preview; bank layouts are not the canonical Havensum schema.

Use a shared pure parsing/validation/normalization layer, with native/browser file I/O adapters. Never let CSV input execute spreadsheet formulas or application commands. Parsing must support quoted separators, escaped quotes, multiline notes, Unicode and BOMs. Test both Android document picking/sharing and browser downloads.

## Canonical columns

| Column | Contract |
| --- | --- |
| schema_version | Explicit CSV contract version, initially 1 |
| id | Stable Havensum transaction ID; blank accepted for genuinely new quick entry |
| type | expense, income, reimbursement, transfer |
| date | ISO calendar date YYYY-MM-DD, not a timezone-shifted timestamp |
| title | Non-empty transaction title |
| amount | Positive EUR decimal text with at most 2 decimal places; converted exactly to integer cents |
| currency | EUR; reject unsupported currencies |
| account_id / account_name | Stable source account ID plus readable name; map unfamiliar IDs to selected local account |
| category_id / category_path | Stable ID plus readable parent/subcategory path; resolve inheritance separately |
| to_account_id / to_account_name | Required mapped destination for a transfer; must differ from source |
| linked_id | Original expense ID for a linked reimbursement; resolve forward references within batch |
| kind | Optional Fixed / Variable / Occasional override; empty means use category default |
| note | Optional free text, correctly quoted |
| external_source / external_id | Optional provenance, namespaced and scoped to source account/profile |
| loan_id | Optional registered-loan relationship; map/review rather than inventing a loan |
| expect_payback | Optional true/false on expense; absent preserves compatibility with old files |
| expected_payback_amount | Optional total expected reimbursement in EUR; task metadata only |
| payback_due_date | Optional ISO date |
| payback_task_id | Optional stable task reference for reviewed repeat imports |

Task resolution/history and the complete settings/plan graph belong in full JSON backup. Do not claim a single transaction CSV is a full-state restore. A later task CSV is possible, but needs its own contract/version.

Quick-entry presentation may show only Date, Title, Amount, Account, Category, Note, with Type defaulting to expense; map these friendly headers to canonical fields. Extra advanced columns should be optional. Provide examples separately from the empty template so sample rows are not accidentally imported as real spending.

## Dialects and precision

Canonical export: UTF-8, comma-separated, quoted according to CSV rules, CRLF line endings, dot decimal and no thousands separators. Explicit EUR avoids currency inference. Support a documented spreadsheet-friendly semicolon/decimal-comma dialect or detect it in preview; do not silently reinterpret ambiguous numbers such as 1,234. Verify Portugal spreadsheet behavior with a fixture. Preserve ID text and leading zeros. Avoid binary floating accumulation: normalize to integer cents with explicit validation and bounds.

Spreadsheet programs can reinterpret dates/IDs and treat leading formula characters specially. Define a reversible safe-text export/import policy for titles/notes and test that quoting alone is not mistaken for formula neutralization. Do not mutate the accounting amount or stored text to work around spreadsheet display. Document the chosen policy and warn in the import preview when a value cannot be preserved safely.

## Append, deduplicate, reconcile

- Preview counts: new / same-ID unchanged / same-ID edited / possible duplicate / invalid.
- Same ID + same normalized record: skip safely.
- Same ID + changed fields: explicit conflict/edit review. Never silently overwrite or discard the update.
- Bank external ID: namespace by source/profile/account, not a global naked ID.
- No reliable ID: use conservative content/multiplicity matching; two legitimate identical purchases must remain possible. A filename or row number alone is not reliable across regenerated bank files. Review ambiguous matches, including existing manual entries.
- Transfers imported from both bank accounts must be paired/reconciled rather than duplicated. Loan proceeds/paybacks/refunds require classification review; a positive amount is not enough to infer earnings.
- Batch-validate references, including original expenses imported later in the same file. Unresolved links need review; no silent unlinking that changes economics.
- Validate all candidate rows before one explicit apply; preserve a recovery snapshot. If an import fails, do not leave a half-applied ledger.
- Re-running the same approved import must be safe. Canceling the preview must make no ledger changes.

CSV import is transaction exchange. Full JSON restore and three-way shared-file merge are different operations and should remain visibly separate in the UI.

## Bank profile fixture checklist

Obtain a sanitized sample of each actual bank/export variant and expected outputs. Cover headers/preamble/footer, delimiter, quoting, encoding, date formats, booking versus value date, signed amount versus debit/credit columns, thousands/decimal separators, stable references, currency, account selection and statement overlap. Keep source row references for errors, but minimize retained private raw data. Confirm the date basis and classification rules explicitly per adapter.

## Minimum acceptance suite

Round-trip four transaction types, partial linked repayments, category paths, behavior overrides and optional expected-payback metadata; exact-cent totals; BOM/accents/quotes/multiline text; malformed/ambiguous amounts and dates; unsupported currency; edited stable ID; repeated file/overlapping bank periods; identical legitimate purchases; two-sided transfer reconciliation; no fake income from refunds/borrowing; no financial changes from task closure.
