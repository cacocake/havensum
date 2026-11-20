# Havensum — quick guide

Havensum is a household money app for Android, with a matching browser version. Everything stays on your phone unless you export it. Amounts are in euros.

## Getting around

- **Phone:** the bottom bar has **Home**, **Activity**, the orange **+** (add an entry), **Plan** and **More**. **More** holds Accounts, Categories, Reimbursements, Loans and Settings.
- **Computer:** the same screens are in the left sidebar.
- Change the month at the top of a screen. Tap any account, category or total to see the entries behind it. Editing is always a separate, explicit step.

## Everyday use

**Add an entry.** Tap **+**. Pick the type:
- **Expense**: money spent.
- **Income**: money earned.
- **Reimbursement**: money paid back to you for an expense. Link it to the original expense, so it lowers that expense's month, not the month it arrived. It never counts as income.
- **Transfer**: moving money between your own accounts. Never counts as income or spending.

Optional details: a note, a different behaviour (Fixed / Variable / Occasional) for just this entry, or a link to a **planned cost** (for example a deposit for a summer trip).

**Expect a payback.** On an expense, switch on *Expect a payback*. It appears under **Awaiting paybacks** on Reimbursements. Record the payback when it arrives, or **Close without payback**. Closing without one only closes the task; it adds no money.

**Future-dated entries.** An entry dated after today is **Scheduled**. It shows in lists and forecasts but counts in balances only from its date, by your phone's date. Nothing needs confirming.

## Accounts, categories and loans

- **Accounts:** tag each as Personal, Joint, Savings or Investment. Investment balances are entered by hand.
- **Savings interest:** in a savings account, add rate periods (yearly rate and start month). The app posts interest once a month for completed months. A 0% period ends a promotional rate. To fix past interest, open the account and use **Correct past interest**. It previews every affected month, then adds a marked correction entry. It never edits the old entries. When the bank posted interest itself, choose *Bank amount only* or *Keep both* for that month.
- **Categories:** your own names, icons and colours, with one level of subcategories. Each subcategory setting can inherit from its parent. A budget only drives the overspend bar.
- **Loans:** adding an existing loan does not add money to an account unless you choose to record the proceeds. Repayments are normal expenses you record.

## Year Plan

Three tabs:

- **This month:** Expected savings, the plan's target, costs still expected, and outlook settings. In outlook settings you mark months *complete* once everything is entered, and you can cancel a bill.
- **Averages:** your real monthly averages.
- **Year ahead:**
  - the year's **Recorded**, **Expected** and **Planned** totals;
  - **what shapes the forecast**;
  - a **Planned costs** card where you can **Move…** a repeating cost to another month from a chosen year;
  - one row per month.

**Building a plan.** Use the three-step interview, offered at the start of each year (tap **Later** to defer it).
1. Income and loan changes.
2. Bills, everyday spending, a cushion and planned costs. Repeating costs can start from the plan's year. Past costs can suggest an amount.
3. A month-by-month preview.

Nothing is saved until **Freeze my plan**. A frozen plan never moves on its own. **Revise remaining year** saves a new revision and leaves earlier months and revisions untouched. Past years are read-only.

**Expected vs Planned.** *Planned* is the target you froze. *Expected* is a live prediction from your history and known costs. Editing only a target never changes Expected. Months marked *partial* rest on history you haven't marked complete. *Unavailable* months have no evidence yet.

## Importing and exporting (Settings)

- **Import transactions:** from a bank CSV (the supported bank layout), a Cashew export, or the Havensum CSV template. You always get an editable preview first. Possible duplicates and unclear rows need a decision, and imports only ever add entries. A positive bank amount is not assumed to be income.
- **Export:** a transactions CSV, an Excel summary, or a **Full JSON backup**.
- **Review backup merge:** combine a backup from another device with this one. Conflicts are shown side by side for you to choose.
- **Restore full backup:** replaces everything with a backup, after a preview and a confirmation. A copy of your current data is kept first and can be downloaded.
- **Shared Drive file:** shown as *Not connected*. Syncing through Google Drive isn't available yet.

## Good to know

- Recovery copies are kept automatically before migrations, merges and restores.
- Clearing example data starts you on a fresh ledger.
- Keep your Android signing key and its password backed up (see `docs/ANDROID_BUILD.md`). Without them the app can't be updated.
