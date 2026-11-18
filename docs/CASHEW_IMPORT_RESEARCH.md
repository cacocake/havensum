# Cashew import structure research

Researched 18 November 2026 at public Cashew source revision `9cfbe50c16d95429891d44faf5f2c77a3abdb93b`. This establishes a published format, not compatibility with an owner's installed release. No real statement or financial backup was used or committed. No Cashew adapter has been implemented by this research task.

## Published CSV export

The [official exporter](https://github.com/jameskokoska/Cashew/blob/9cfbe50c16d95429891d44faf5f2c77a3abdb93b/budget/lib/widgets/exportCSV.dart) writes these columns, in order:

`account, amount, currency, title, note, date, income, type, category name, subcategory name, color, icon, emoji, budget, objective`

The exporter selects records whose `paid` flag is true, within the selected accounts/date range. Amount is the stored signed numeric value. Currency is the wallet's uppercase code. Date is the stored Dart DateTime string, which can include time and fractional seconds. Category/subcategory and account are names, rather than stable IDs. The CSV has no transaction primary key, transfer pairing reference or original-expense reimbursement link.

The [database model](https://github.com/jameskokoska/Cashew/blob/9cfbe50c16d95429891d44faf5f2c77a3abdb93b/budget/lib/database/tables.dart) defines special transaction types including upcoming, subscription, repetitive, credit and debt. The CSV `type` field is the string representation of that special type, including `null` when absent. It is not Havensum's four-way financial type. A blind `type` mapping can misclassify borrowing, lending or scheduled records. Historical `paid` handling for credit/debt also differs from ordinary transactions.

The [official guide](https://cashewapp.web.app/faq.html#import-csv-data) describes positive income / negative expenses and transfer movements represented as two balance-correction entries. It distinguishes CSV reports from full backups. Cashew's full data backup is a database copy that can be opened with an SQL viewer; it is not a Havensum JSON backup.

## Adapter design and verification still required

The separate `cashew-csv-v1` profile implements the published header signature. Synthetic verification covers signed EUR, literal calendar dates, explicit classification, account mapping and reviewed creation at zero, transfer pairing, source duplicate review, and linking credits to an expense. The account and any approved transactions are saved together after the pre-import recovery copy. The CSV leaves starting balances and original-expense links to the owner. No actual export from the owner's v6.7.5+524 beta has been checked. Rows marked as borrowing or lending are shown in review and can only be skipped until their ledger treatment is confirmed.

- Detect a versioned Cashew profile from the actual header signature; do not use the filename as identity.
- Parse signed EUR amounts exactly, validate the sign against explicit source fields, and require review for ambiguous inflows, special types and balance corrections. Never infer earnings from a positive sign alone.
- Preserve the literal calendar date from the agreed timestamp/date basis. Confirm timezone and locale with the owner's actual version; do not shift transaction dates by converting an ambiguous local timestamp to UTC.
- Map account names and parent/subcategory paths to existing IDs through preview. Keep Havensum custom icons/colours. Do not copy Cashew emoji into the Lucide category family.
- Reconcile the two sides of a transfer to one neutral Havensum transfer using explicit reviewed pairing. Do not guess from title/amount alone, or import them as income and spending.
- Use content/multiplicity review for ID-less records. The export omits stable IDs, so an unchanged filename or row number cannot prove identity. Matching manual purchases and repeated/overlapping exports need explicit duplicate decisions.
- Review refund/payback links separately; the CSV cannot restore omitted original-expense links. Loan/scheduled/budget/objective metadata must not silently become financial records or frozen targets.

To verify an adapter, obtain the Cashew app version and a small sanitized CSV exported by that version, retaining the original header, quoting, delimiters, signed amounts and date syntax. Include ordinary expense/income, subcategory, transfer pair, refund/payback and borrowing/lending examples where used, with the agreed Havensum interpretation for each. Replace identifying text with synthetic values. These files stay outside Git; commit only independently synthetic fixtures based on the confirmed structure. Do not request a full private database backup merely to establish the CSV format.
