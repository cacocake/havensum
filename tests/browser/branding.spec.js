import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';

test('Havensum opens the legacy ledger and preserves its merge baseline across reload', async ({ page }) => {
  const state = createFinancialState({ transactions: [createTransaction({ title: 'Existing household purchase' })] });
  await page.clock.install({ time: new Date('2026-11-17T12:00:00') });
  await page.addInitScript(initialState => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
      localStorage.setItem('melo-sync-base', JSON.stringify(initialState));
    }
  }, state);
  await page.goto('/');
  await expect(page).toHaveTitle('Havensum · Overview');
  await expect(page.getByRole('img', { name: 'Havensum', exact: true })).toBeVisible();
  await expect(page.getByLabel('View Existing household purchase', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('View Existing household purchase', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => ({
    ledger: JSON.parse(localStorage.getItem('melo-state-v1')),
    baseline: JSON.parse(localStorage.getItem('melo-sync-base'))
  }));
  expect(saved.ledger).toEqual(state);
  expect(saved.baseline).toEqual(state);
  if (page.viewportSize().width >= 850) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('YOUR MONEY, IN RHYTHM', { exact: true })).toHaveCount(0);
  }
});

test('Android adaptive artwork fits inside the guaranteed circular safe area', async ({ page }) => {
  for (const layer of ['foreground', 'monochrome']) {
    const asset = await readFile(new URL(`../../assets/brand/adaptive-${layer}.png`, import.meta.url));
    const radius = await page.evaluate(async encoded => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let maximumRadius = 0;
      for (let index = 0; index < image.width * image.height; index++) {
        if (pixels[index * 4 + 3] > 0) {
          maximumRadius = Math.max(maximumRadius, Math.hypot(index % image.width + 0.5 - image.width / 2, Math.floor(index / image.width) + 0.5 - image.height / 2));
        }
      }
      return maximumRadius * 108 / image.width;
    }, asset.toString('base64'));
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThanOrEqual(33);
  }
});
