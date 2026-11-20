import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

const k_ledgerKey = 'melo-state-v1';
const k_baselineKey = 'melo-sync-base';

async function openLedger(page, ledger, { baseline } = {}) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, baselineKey, ledger, baseline }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
      if (baseline) {
        localStorage.setItem(baselineKey, JSON.stringify(baseline));
      }
    }
  }, { key: k_ledgerKey, baselineKey: k_baselineKey, ledger, baseline });
  await page.goto('/');
}

async function editAccount(page, name) {
  await openMoreSection(page, 'Accounts');
  await page.getByLabel(`View ${name}`).first().click();
  await page.getByRole('button', { name: 'Edit account', exact: true }).click();
  return page.getByRole('dialog');
}

function savedAccount(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)).accounts[0], k_ledgerKey);
}

function scheduledLedger() {
  return createFinancialState({ accounts: [{ id: 'reserve', name: 'Rainy day reserve with a deliberately long name', tag: 'Savings', openingBalance: 123456789, interestSchedule: [{ since: '2026-05', rate: 3 }] }] });
}

test('a 0% period can be scheduled from next month while the past period stays fixed', async ({ page }) => {
  await openLedger(page, scheduledLedger());
  const dialog = await editAccount(page, 'Rainy day reserve with a deliberately long name');
  await expect(dialog.getByText('3% from May 2026, ongoing', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove the rate from May 2026', exact: true })).toHaveCount(0);

  await dialog.getByLabel('Effective annual interest · %', { exact: true }).fill('0');
  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: 'Add rate period', exact: true }).click();
  await expect(dialog.getByText('3% from May 2026, through November 2026', { exact: true })).toBeVisible();
  await expect(dialog.getByText('0% from December 2026, ongoing', { exact: true })).toBeVisible();
  const editor = await dialog.getByTestId('interest-schedule').boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(editor.x + editor.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect.poll(async () => (await savedAccount(page)).interestSchedule).toEqual([{ since: '2026-05', rate: 3 }, { since: '2026-12', rate: 0 }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a rate for a past month is refused once a schedule exists', async ({ page }) => {
  await openLedger(page, scheduledLedger());
  const dialog = await editAccount(page, 'Rainy day reserve with a deliberately long name');
  await dialog.getByLabel('Effective annual interest · %', { exact: true }).fill('5');
  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('2026-08');
  await dialog.getByRole('button', { name: 'Add rate period', exact: true }).click();

  await expect(dialog.getByText('New rates start in the current or a future month. Earlier months keep their recorded interest.', { exact: true })).toBeVisible();
  expect((await savedAccount(page)).interestSchedule).toEqual([{ since: '2026-05', rate: 3 }]);
});

function legacyRateLedger({ openingBalance = 100000, transactions = [] } = {}) {
  const accounts = [
    { id: 'imported', name: 'Imported savings', tag: 'Savings', openingBalance, interest: 12 },
    { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 200000 }
  ];
  return createFinancialState({ version: 3, accounts, transactions });
}

function storedTransactions(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)).transactions, k_ledgerKey);
}

function octoberTransferIn() {
  return createTransaction({ id: 'october-transfer', type: 'transfer', title: 'To savings', category: null, account: 'everyday', toAccount: 'imported', date: '2026-10-01', amount: 100000 });
}

test('an unscheduled legacy rate earns nothing until its start month is chosen, from the first entry at the earliest', async ({ page }) => {
  await openLedger(page, legacyRateLedger({ openingBalance: 0, transactions: [octoberTransferIn()] }));
  await expect.poll(async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey)).version).toBe(5);
  expect((await storedTransactions(page)).map(transaction => transaction.id)).toEqual(['october-transfer']);

  const dialog = await editAccount(page, 'Imported savings');
  await expect(dialog.getByText('Saved rate 12% has no start month yet, so no interest has been recorded. Choose when it started.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Effective annual interest · %', { exact: true })).toHaveValue('12');
  await expect(dialog.getByTestId('interest-schedule-earliest')).toHaveText("Rates can start from Oct 2026, the account's first entry or rate period.");
  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('2026-09');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText("Rates can start from Oct 2026, the account's first entry or rate period.");
  expect((await savedAccount(page)).interestSchedule).toBeUndefined();

  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();
  await expect.poll(async () => (await savedAccount(page)).interestSchedule).toEqual([{ since: '2026-10', rate: 12 }]);
  expect((await savedAccount(page)).unscheduledInterest).toBeUndefined();

  await page.reload();
  await expect.poll(async () => (await storedTransactions(page)).map(transaction => [transaction.date, transaction.amount]))
    .toEqual([['2026-10-01', 100000], ['2026-10-31', 949]]);
});

test('a mistyped year for a legacy rate on an account with only an opening balance is refused', async ({ page }) => {
  await openLedger(page, legacyRateLedger());
  const dialog = await editAccount(page, 'Imported savings');
  await expect(dialog.getByTestId('interest-schedule-earliest')).toHaveText('This account has no earlier entries or rate periods, so rates can start from Nov 2026.');
  const hintBox = await dialog.getByTestId('interest-schedule-earliest').boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('1026-01');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect(dialog.getByRole('alert')).toHaveText('This account has no earlier entries or rate periods, so rates can start from Nov 2026.');
  const account = await savedAccount(page);
  expect(account.interestSchedule).toBeUndefined();
  expect(account.unscheduledInterest).toBe(12);
  await page.reload();
  expect(await storedTransactions(page)).toEqual([]);
});

test('merging an older backup with a different single rate asks before touching the schedule', async ({ page }) => {
  const ledger = scheduledLedger();
  ledger.accounts[0].interestSchedule.push({ since: '2027-01', rate: 1 });
  await openLedger(page, ledger, { baseline: ledger });
  const { interestSchedule, ...legacyAccount } = ledger.accounts[0];
  const backup = createFinancialState({ version: 3, accounts: [{ ...legacyAccount, interest: 4, interestStart: '2026-05' }] });

  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'older-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  const review = page.getByRole('dialog');
  await expect(review.getByText('Savings interest rates · reserve (an older backup holds one rate; choosing it adds that rate as one period)', { exact: true })).toBeVisible();
  await review.getByText('THIS DEVICE', { exact: true }).click();
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();

  await expect.poll(async () => (await savedAccount(page)).interestSchedule).toEqual(interestSchedule);
});

test('removing the only current rate period saves the account without a schedule', async ({ page }) => {
  const ledger = scheduledLedger();
  ledger.accounts[0].interestSchedule = [{ since: '2026-11', rate: 3 }];
  await openLedger(page, ledger);
  const dialog = await editAccount(page, 'Rainy day reserve with a deliberately long name');
  await dialog.getByRole('button', { name: 'Remove the rate from November 2026', exact: true }).click();
  await dialog.getByLabel('Effective annual interest · %', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect.poll(async () => (await savedAccount(page)).interestSchedule).toBeUndefined();
});

test('a new savings account cannot be backdated into years of interest', async ({ page }) => {
  await openLedger(page, createFinancialState({ accounts: [] }));
  await openMoreSection(page, 'Accounts');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account name', { exact: true }).fill('Backdated savings');
  await dialog.getByLabel('Account type', { exact: true }).selectOption('Savings');
  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('2020-01');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect(dialog.getByText('New rates start in the current or a future month. Earlier months keep their recorded interest.', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).accounts, k_ledgerKey)).toEqual([]);
});

test('renaming an unscheduled legacy account keeps its rate unscheduled', async ({ page }) => {
  const legacyLedger = createFinancialState({ version: 3, accounts: [{ id: 'imported', name: 'Imported savings', tag: 'Savings', openingBalance: 100000, interest: 12 }] });
  await openLedger(page, legacyLedger);
  const dialog = await editAccount(page, 'Imported savings');
  await dialog.getByLabel('Account name', { exact: true }).fill('Imported savings, renamed');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect.poll(async () => (await savedAccount(page)).name).toBe('Imported savings, renamed');
  const account = await savedAccount(page);
  expect([account.interestSchedule, account.unscheduledInterest]).toEqual([undefined, 12]);
});

test('choosing an older backup rate during review inserts it as one period', async ({ page }) => {
  const ledger = scheduledLedger();
  ledger.accounts[0].interestSchedule.push({ since: '2027-01', rate: 1 });
  await openLedger(page, ledger, { baseline: ledger });
  const { interestSchedule, ...legacyAccount } = ledger.accounts[0];
  const backup = createFinancialState({ version: 3, accounts: [{ ...legacyAccount, interest: 4, interestStart: '2026-05' }] });

  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'older-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  const review = page.getByRole('dialog');
  await review.getByText('BACKUP FILE', { exact: true }).click();
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();

  await expect.poll(async () => (await savedAccount(page)).interestSchedule).toEqual([{ since: '2026-05', rate: 4 }, { since: '2027-01', rate: 1 }]);
});

test('renaming a savings account without any rate keeps it without a rate', async ({ page }) => {
  await openLedger(page, createFinancialState({ accounts: [{ id: 'plain', name: 'Plain savings', tag: 'Savings', openingBalance: 100000 }] }));
  const dialog = await editAccount(page, 'Plain savings');
  await expect(dialog.getByLabel('Effective annual interest · %', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Account name', { exact: true }).fill('Plain savings, renamed');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect.poll(async () => (await savedAccount(page)).name).toBe('Plain savings, renamed');
  expect((await savedAccount(page)).interestSchedule).toBeUndefined();
});

test('adding an unscheduled legacy rate without a start month asks for one and keeps the rate', async ({ page }) => {
  await openLedger(page, createFinancialState({ version: 3, accounts: [{ id: 'imported', name: 'Imported savings', tag: 'Savings', openingBalance: 100000, interest: 12 }] }));
  const dialog = await editAccount(page, 'Imported savings');
  await dialog.getByRole('button', { name: 'Add rate period', exact: true }).click();

  await expect(dialog.getByText('Choose a start month as YYYY-MM.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Effective annual interest · %', { exact: true })).toHaveValue('12');
});

test('adding a period with an empty rate asks for a rate instead of adding 0%', async ({ page }) => {
  await openLedger(page, scheduledLedger());
  const dialog = await editAccount(page, 'Rainy day reserve with a deliberately long name');
  await dialog.getByLabel('Rate starts · YYYY-MM', { exact: true }).fill('2027-02');
  await dialog.getByRole('button', { name: 'Add rate period', exact: true }).click();

  await expect(dialog.getByText('Enter a non-negative effective annual rate.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3% from May 2026, ongoing', { exact: true })).toBeVisible();
});
