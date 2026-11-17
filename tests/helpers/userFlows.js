import { expect } from '@playwright/test';

export async function addTransaction(page, { title, amount, type = 'expense', account, date, linkedExpenseId }) {
  await page.getByLabel('Add expense', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  const typeLabel = type === 'reimbursement' ? 'Payback' : type[0].toUpperCase() + type.slice(1);
  await dialog.getByRole('button', { name: typeLabel, exact: true }).click();
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill(amount);
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  if (account) {
    await dialog.getByLabel('Account', { exact: true }).selectOption(account);
  }
  if (date) {
    await dialog.getByLabel('Date', { exact: true }).fill(date);
  }
  if (linkedExpenseId) {
    await dialog.getByLabel('Original expense (optional)', { exact: true }).selectOption(linkedExpenseId);
  }
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

export async function editTransaction(page, title) {
  await page.getByLabel(`View ${title}`, { exact: true }).click();
  await page.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  return page.getByRole('dialog');
}

export async function openMoreSection(page, name) {
  const moreButton = page.getByRole('button', { name: 'More', exact: true });
  if (await moreButton.count()) {
    await moreButton.click();
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
    return;
  }
  await page.getByRole('button', { name, exact: true }).click();
}

export async function returnHome(page) {
  const homeButton = page.getByRole('button', { name: 'Home', exact: true });
  if (await homeButton.count()) {
    await homeButton.click();
    return;
  }
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
}
