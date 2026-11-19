# Cashew import structure research

Researched 18 November 2026 at public Cashew source revision `9cfbe50c16d95429891d44faf5f2c77a3abdb93b`. This establishes a published format, not compatibility with an owner's installed release. No real statement or financial backup was used or committed. No Cashew adapter has been implemented by this research task.

## Published CSV export

The [official exporter](https://github.com/jameskokoska/Cashew/blob/9cfbe50c16d95429891d44faf5f2c77a3abdb93b/budget/lib/widgets/exportCSV.dart) writes these columns, in order:

`account, amount, currency, title, note, date, income, type, category name, subcategory name, color, icon, emoji, budget, objective`

The exporter selects records whose `paid` flag is true, within the selected accounts/date range. Amount is the stored signed numeric value. Currency is the wallet's uppercase code. Date is the stored Dart DateTime string, which can include time and fractional seconds. Category/subcategory and account are names, rather than stable IDs. The CSV has no transaction primary key, transfer pairing reference or original-expense reimbursement link.

The [database model](https://github.com/jameskokoska/Cashew/blob/9cfbe50c16d95429891d44faf5f2c77a3abdb93b/budget/lib/database/tables.dart) defines special transaction types including upcoming, subscription, repetitive, credit and debt. The CSV `type` field is the string representation of that special type, including `null` when absent. It is not Havensum's four-way financial type. A blind `type` mapping can misclassify borrowing, lending or scheduled records. Historical `paid` handling for credit/debt also differs from ordinary transactions.

The [official guide](https://cashewapp.web.app/faq.html#import-csv-data) describes positive income / negative expenses and transfer movements represented as two balance-correction entries. It distinguishes CSV reports from full backups. Cashew's full data backup is a database copy that can be opened with an SQL viewer; it is not a Havensum JSON backup.

## Adapter design and verification still required

The separate `cashew-csv-v1` profile implements the published header signature. Synthetic verification covers signed EUR, literal calendar dates, explicit classification, account mapping and reviewed creation at zero, transfer pairing, source duplicate review, and linking credits to an expense. The account and any approved transactions are saved together after the pre-import recovery copy. The CSV leaves starting balances and original-expense links to the owner. The owner's v6.7.5+524 (db-v48) export verified the separate `cashew-csv-v2` layout. It adds `amount unpaid` and `extra`, uses `default` for the ordinary rows in the sample, and is UTF-8 with intact accented text. The sample contained two ordinary EUR movements and one floating-point decimal tail. The adapter normalizes tails within EUR 0.0000000001 of a cent. Values in the two new columns require separate review because both were blank in the sample. Transfers and reimbursements are covered by synthetic review tests. IMPORT-2 widened borrowing and scheduled-entry handling after owner decisions K01–K08; see below. CSV layouts from the same Cashew source share duplicate matching for the same mapped account.

- Detect a versioned Cashew profile from the actual header signature; do not use the filename as identity.
- Parse signed EUR amounts exactly, validate the sign against explicit source fields, and require review for ambiguous inflows, special types and balance corrections. Never infer earnings from a positive sign alone.
- Preserve the literal calendar date from the agreed timestamp/date basis. Confirm timezone and locale with the owner's actual version; do not shift transaction dates by converting an ambiguous local timestamp to UTC.
- Map account names and parent/subcategory paths to existing IDs through preview. Keep Havensum custom icons/colours. Do not copy Cashew emoji into the Lucide category family.
- Reconcile the two sides of a transfer to one neutral Havensum transfer using explicit reviewed pairing. Do not guess from title/amount alone, or import them as income and spending.
- Use content/multiplicity review for ID-less records. The export omits stable IDs, so an unchanged filename or row number cannot prove identity. Matching manual purchases and repeated/overlapping exports need explicit duplicate decisions.
- Review refund/payback links separately; the CSV cannot restore omitted original-expense links. Loan/scheduled/budget/objective metadata must not silently become financial records or frozen targets.

To verify an adapter, obtain the Cashew app version and a small sanitized CSV exported by that version, retaining the original header, quoting, delimiters, signed amounts and date syntax. Include ordinary expense/income, subcategory, transfer pair, refund/payback and borrowing/lending examples where used, with the agreed Havensum interpretation for each. Replace identifying text with synthetic values. These files stay outside Git; commit only independently synthetic fixtures based on the confirmed structure. Do not request a full private database backup merely to establish the CSV format.

## IMPORT-2 synthetic verification (19 November 2026)

The owner chose to verify against synthetic rows that mirror the published export (K01). **Only the ordinary EUR rows from v6.7.5+524 are verified against a real export. Every behaviour below is unverified against a real export and must not be advertised as exact Cashew compatibility.** Tests: `tests/cashewVerification.test.js`, `tests/cashewImport.test.js` and `tests/browser/cashewImport.spec.js`.

- **Both layouts** (`cashew-csv-v1`, `cashew-csv-v2`) keep UTF-8 accents (with or without a byte order mark) and match an accented Havensum account name exactly.
- **Integer cents:** both layouts serialize a Dart double (`amount.toString()`), so both now accept floating-point tails within EUR 0.0000000001 of a cent (`-5.0`, `-12.340000000000002`). A real fraction of a cent, a comma, a zero-padded fraction such as `1.000` (read as a thousands separator), a currency symbol or a zero amount stays a row error.
- **Renames:** a repeated row is still offered as a possible match after Havensum renames the mapped account or category (the source fingerprint keeps the Cashew account name and timestamp). A Cashew-side account rename changes the fingerprint; the row is matched once it is classified like the recorded one.
- **Account creation** still happens only with the confirmed import, at a zero opening balance.
- **Original-expense links:** a payback can link to an expense recorded earlier or classified in the same file; it offsets the original expense month and never adds income (K06: manual link only).
- **Scheduled entries** (`upcoming`, `subscription`, `repetitive`) are treated as paid when `amount unpaid` is blank or zero, need an explicit classification and show a review note (K04). A non-zero `amount unpaid` stays a row error; `extra` is shown read-only (K10).
- **Borrowing** (`debt`) rows need an existing Havensum loan picked in review. A credit becomes loan proceeds (an unlinked balance adjustment tagged with the loan, never income); a debit becomes a repayment expense in the loan category tagged with the loan (K02/K03). **Lending** (`credit`) rows stay row errors. A borrowing row is never offered as a transfer leg. No loan is created or changed by an import. The loan tag on proceeds is metadata (kept on edit and in CSV export); it does not change loan forecasts. A repayment must use the exact loan category, as the transaction form does, and the Loans screen counts it only when it is in the loan's payment account.
- **Transfers:** when a debit has exactly one opposite credit with the same amount and timestamp in another mapped account (and vice versa), and both legs carry a `Transferred Balance` note whose `from → to` line names their source accounts in the right direction (K11, superseding the `Balance Correction` category rule of K05), the pair is preselected as a transfer with a visible suggestion note; the owner can change it, and confirming the import confirms it (K05/K09). The note shows only while the pair is kept. Known limit: a repeat import suggests the pair again even if the owner recorded the legs differently last time; the debit then lists those records as possible matches for an explicit Skip/Add decision. Ambiguous, differently timed or same-account legs are not suggested.
- **Metadata:** color, icon and emoji are ignored; budget and objective are shown read-only in review and never create records (K07). Classification is never prefilled from the sign (K08).

Some of these shapes were later seen in the owner's own test export (see the last section). Still needed to move the rest from synthetic to verified: a small sanitized Cashew export of the owner's version containing a transfer pair, a payback, a scheduled entry, a borrowing row and populated budget/objective, with the expected Havensum result for each.

## Owner's real test export (19 November 2026)

The owner exported a small test file from their Cashew app (the newer layout with `amount unpaid` and `extra`; app version not stated). It is private runtime data and is not in Git; `tests/cashewExportShape.test.js` uses synthetic rows with the same structure. Running the file through the importer showed these shapes in that one real export (not proof that every version writes them):

- Scheduled types are written bare (`repetitive`, `subscription`, `upcoming`), ordinary rows as `default`. A paid scheduled row has a negative `amount` and a blank `amount unpaid`; an unpaid one has a blank `amount` and the value in `amount unpaid`, and stays a row error (K04).
- `extra` carries recurrence text such as `repeat every 1 month`, even on ordinary rows. It is now shown read-only and never blocks a row (K10).
- A transfer is two `default` rows in the app-language balance-correction category (here `Correção do equilíbrio`) whose note reads `Transferred Balance` then `from → to` with both source account names. Havensum now suggests the pair from that note, not from the category (K11).
- Borrowing and lending appear as `default` rows tagged with a loan objective, not as `debt`/`credit` types. A row with an objective can be recorded against a chosen Havensum loan by its sign, or classified normally (K12). The CSV cannot tell a loan objective from a savings goal, so nothing is chosen automatically.
- Category styling is written as `0XFF…` colours and icon names; it is ignored.

Still unverified: older `debt`/`credit` type rows (K02), the published v1 layout beyond the earlier ordinary rows, and loan objectives used for lending (the owner confirmed for this export that the sign follows the cash on a loan objective: + = loan money received, − = a payment on the loan; K13). No exact Cashew compatibility is claimed.
