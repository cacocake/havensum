# Havensum — quick guide

Havensum is a household money app for Android, with a matching browser version. Everything stays on your phone unless you export it. Amounts are in euros.

## Getting around

- **Phone:** the bottom bar has **Home**, **Activity**, the orange **+** (add an entry), **Plan** and **More**. **More** holds Accounts, Categories, Reimbursements, Loans and Settings.
- **Computer:** the left sidebar lists the same screens as Overview, Transactions, Accounts, Categories, Year Plan, Reimbursements and Loans, with Settings at the bottom.
- Change the month at the top of a screen. Tap any account, category or total to see the entries behind it. Editing is always a separate, explicit step.

## Everyday use

**Add an entry.** Tap **+**. Pick the type:
- **Expense**: money spent.
- **Income**: money earned.
- **Payback**: money paid back to you for an expense. Linking it to the original expense (*Link to an expense*) lowers that expense's month, not the month it arrived. You can also link it later. An unlinked payback changes the account balance but no monthly report. It never counts as income.
- **Transfer**: moving money between your own accounts. Never counts as income or spending.

Optional details: a note, a different behaviour (Fixed / Variable / Occasional) for just this entry, or a link to a **planned cost** (for example a deposit for a summer trip). A linked expense counts as spending in the planned cost's month, while the cash leaves on the payment date.

**Expect a payback.** On an expense, switch on *Expect a payback*. It appears under **Awaiting paybacks** on Reimbursements. Record the payback when it arrives, or **Close without payback**. Closing without one only closes the task; it adds no money.

**Future-dated entries.** An entry dated after today is **Scheduled**. It shows in lists and forecasts but counts in balances only from its date, by your phone's date. Nothing needs confirming.

## Accounts, categories and loans

- **Accounts:** tag each as Personal, Joint, Savings or Investment. Investment balances are entered by hand.
- **Savings interest:** in a savings account, add rate periods (yearly rate and start month). The app posts interest once a month for completed months. A 0% period ends a promotional rate. To fix past interest, open the account and use **Correct past interest** (it reads **Review past interest** when months already differ). It previews every affected month, then adds a marked correction entry. It never edits the old entries. When the bank posted interest itself, choose *Bank amount only* or *Keep both* for that month.
- **Categories:** your own names, icons and colours, with one level of subcategories. Each subcategory setting can inherit from its parent. A budget only drives the overspend bar.
- **Loans:** adding an existing loan does not add money to an account unless you choose to record the proceeds. Repayments are normal expenses you record.
  - **Payment history:** in the loan form, change the monthly payment from any month of the loan's term, past or future. Add an *until* month for a temporary change; afterwards the earlier payment comes back. Forecasts and new plans follow this history.
  - **After a payment change** that affects a plan for this year or later, you choose **Keep my plan** or **Revise from <month>**. If the change starts in a month that has already passed, only that loan's share of the loan line (and the month's totals) changes in those months, the rest is revised in the interview as usual, and Year Plan marks the revision. A balance-only edit asks nothing.
  - **Record advance payment** on a loan card records the payment and lowers the remaining balance in one go, then asks whether the monthly payment changed. The app never works out the bank's new amount. A loan can be paid down to €0.
  - **One-off extras** such as a fee are just a recorded payment; they don't change the history or the plan.
  - Deleting or editing an advance later doesn't put the remaining balance back, so correct the balance by hand.

## Year Plan

Three tabs:

- **This month:** Expected savings, the plan's target, outlook settings and expected costs.
  - In outlook settings you mark months *complete* once everything is entered, and set the history window and income changes. A loan amount entered there overrides the loan's own history from its month, and is labelled with a **Clear** button.
  - In expected costs you tap a bill to mark it cancelled from a month.
- **Averages:** your real monthly averages.
- **Year ahead:**
  - the year's **Recorded**, **Expected** and **Planned** totals;
  - **what shapes the expected months**;
  - one row per month;
  - a **Planned costs** card where you can **Move…** a repeating cost to another month from a chosen year.

**Building a plan.** Use the three-step interview. It is offered whenever this year has no plan; **Later** hides it for this year on this device.
1. **Make room for your year:** expected monthly income, a cushion for occasional costs, the history window, and review thresholds.
2. **The things coming up:** income changes and planned costs. A repeating cost can start from the plan's year, and past costs can suggest an amount. Loan payments come from each loan's history and are shown read-only.
3. **Fine-tune:** adjust bill and category amounts, then check the month-by-month preview.

Nothing is saved until **Freeze my plan**. A frozen plan never moves on its own. **Revise remaining year** saves a new revision and leaves earlier months and revisions untouched. Past years are read-only. The one exception is **Revise from <month>** after a loan payment change, which can restate that loan's line in passed months of this year.

**Expected vs Planned.** *Planned* is the target you froze. *Expected* is a live prediction from your history and known costs. Editing only a target never changes Expected. Months marked *partial* rest on history you haven't marked complete. *Unavailable* months have no evidence yet.

## Importing and exporting (Settings)

- **Import transactions:** from a bank CSV (the supported bank layout), a Cashew export, the Havensum CSV template, or an Excel or JSON transaction list. You always get an editable preview first.
  - New rows are added.
  - A row matching an existing entry changes it only if you choose **Use the imported changes**.
  - Possible duplicates and unclear rows need a decision.
  - A positive bank amount is not assumed to be income.
  - **Download pre-import backup** gives you the data as it was before the last import.
- **Export:** **Export transactions CSV**, **Export Excel** (a summary that can also be imported again) or a **Full JSON backup**. The CSV template and guide download from the same place.
- **Review backup merge:** combine a backup from another device with this one. Conflicts are shown side by side for you to choose.
- **Restore full backup:** replaces everything with a backup, after a preview and a confirmation. A copy of your current data is kept first and can be downloaded.
- **Google Drive** (in the *A shared rhythm* card): shown as *Not connected*. Syncing isn't available yet.

## Good to know

- Recovery copies are kept automatically before migrations, merges and restores.
- **Clear example data** removes the example accounts, entries, loans, planned costs, plans, outlook settings and paybacks. It keeps the categories, theme and preferences.
- Keep your Android signing key and its password backed up (see `docs/ANDROID_BUILD.md`). Without them the app can't be updated.
