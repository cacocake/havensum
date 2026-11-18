import { test, expect } from '@playwright/test';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

test('Averages shows booked category spending from completed history', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    transactions: [createTransaction({ amount: 30000, date: '2026-10-10' })]
  });
  await page.addInitScript(initialState => localStorage.setItem('melo-state-v1', JSON.stringify(initialState)), state);
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan Averages', exact: true }).click();
  await expect(page.getByText('Average spending by category', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(page.getByText('Groceries', { exact: true })).toBeVisible();
});

test('individual bill cancellation survives reload without changing the plan or another bill', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00') });
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    transactions: [
      createTransaction({ id: 'old-rent', title: 'Rent', category: 'rent', amount: 80000, date: '2026-10-01' }),
      createTransaction({ id: 'internet', title: 'Internet', category: 'rent', amount: 3500, date: '2026-10-02' }),
      createTransaction({ id: 'rent', title: 'Rent', category: 'rent', amount: 80000, date: '2026-11-01' })
    ],
    plan: { months: { '2026-11': { income: 100000, expense: 83500, balance: 16500, lines: [] } } }
  });
  await page.addInitScript(initialState => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
    }
  }, state);
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByText('Expected savings', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Inspect expected bill Internet', exact: true }).click();
  await page.getByRole('button', { name: 'Mark this cost as cancelled', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect expected bill Internet', exact: true })).toContainText('Cancelled');
  await expect(page.getByRole('button', { name: 'Inspect expected bill Rent', exact: true })).toContainText('Recorded');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(saved.plan).toEqual(state.plan);
  expect(saved.transactions).toEqual(state.transactions);
  await page.reload();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect expected bill Internet', exact: true })).toContainText('Cancelled');
});

test('history completeness and independent income assumptions persist without creating a plan', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00') });
  const state = createFinancialState({ transactions: [createTransaction({ amount: 30000, date: '2026-10-10' })] });
  await page.addInitScript(initialState => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
    }
  }, state);
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Edit prediction assumptions', exact: true }).click();
  await page.getByRole('switch', { name: 'October 2026 complete', exact: true }).click();
  await page.getByLabel('Known monthly income · EUR', { exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Save prediction assumptions', exact: true }).click();
  await expect(page.getByText('Estimate from confirmed history.', { exact: false })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(saved.outlook.completeMonths).toEqual(['2026-10']);
  expect(saved.outlook.incomeChanges).toEqual([{ since: '2026-11', amount: 200000 }]);
  expect(saved.plan).toBeNull();
});

test('an upcoming cost is explicitly matched to its recorded expense', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00') });
  const state = createFinancialState({
    events: [{ id: 'trip', name: 'Trip', year: 2026, month: 11, amount: 20000 }],
    transactions: [createTransaction({ id: 'purchase', title: 'Trip deposit', category: 'shopping', amount: 15000 })]
  });
  await page.addInitScript(initialState => localStorage.setItem('melo-state-v1', JSON.stringify(initialState)), state);
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByLabel('Recorded expense for Trip', { exact: true }).selectOption('purchase');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).outlook?.eventPayments?.trip)).toBe('purchase');
  await expect(page.getByText('Still upcoming €50.00', { exact: true })).toBeVisible();
});

test('adopting legacy dated changes retains existing independent assumptions', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00') });
  const state = createFinancialState({
    outlook: { incomeChanges: [{ since: '2026-12', amount: 250000 }] },
    plan: { months: {}, incomeChanges: [{ since: '2026-10', amount: 200000 }], loanChanges: [] }
  });
  await page.addInitScript(initialState => localStorage.setItem('melo-state-v1', JSON.stringify(initialState)), state);
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Edit prediction assumptions', exact: true }).click();
  await page.getByRole('switch', { name: 'Copy existing scheduled changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save prediction assumptions', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(saved.outlook.incomeChanges).toEqual(expect.arrayContaining([
    { since: '2026-10', amount: 200000 }, { since: '2026-12', amount: 250000 }
  ]));
});

test('expected costs stay bounded with long bills at narrow and desktop widths', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00') });
  const state = createFinancialState({ transactions: [
    createTransaction({ title: 'Very long household internet and telephone subscription bill', category: 'rent', amount: 123456789, date: '2026-10-01' })
  ] });
  await page.addInitScript(initialState => localStorage.setItem('melo-state-v1', JSON.stringify(initialState)), state);
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  for (const width of [320, 360, 396, 412, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const card = page.getByTestId('expected-costs');
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.evaluate(element => {
      const outer = element.getBoundingClientRect();
      return [...element.querySelectorAll('*')].filter(child => child.getBoundingClientRect().width > 0).every(child => {
        const inner = child.getBoundingClientRect();
        return inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      });
    });
    expect(bounds).toBe(true);
    const amountsReadable = await page.getByTestId('month-comparison').evaluate(element => {
      const amounts = [...element.querySelectorAll('*')].filter(child => child.children.length === 0 && child.textContent.includes('1,234,567.89'));
      return amounts.length >= 2 && amounts.every(amount => amount.scrollWidth <= amount.clientWidth + 1);
    });
    expect(amountsReadable).toBe(true);
    expect(await page.getByTestId('expected-savings-amount').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (testInfo.project.name === 'compact-phone' && (width === 320 || width === 1280)) {
      await page.screenshot({ path: `test-results/expected-costs-${width}.png` });
    }
  }
});

test('conflicting outlook snapshots require a choice and apply the selected backup settings', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00') });
  const baseline = createFinancialState();
  const local = { ...baseline, outlook: { completeMonths: ['2026-10'] } };
  const remote = { ...baseline, outlook: { completeMonths: ['2026-09'] } };
  await page.addInitScript(({ baseline, local }) => {
    localStorage.setItem('melo-state-v1', JSON.stringify(local));
    localStorage.setItem('melo-sync-base', JSON.stringify(baseline));
  }, { baseline, local });
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'synthetic-outlook.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(remote)) });
  const review = page.getByRole('dialog');
  const apply = review.getByRole('button', { name: 'Apply reviewed merge', exact: true });
  await expect(apply).toBeDisabled();
  await review.getByText('BACKUP FILE', { exact: true }).click();
  await apply.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).outlook)).toEqual(remote.outlook);
});
