import { test, expect } from '@playwright/test';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

test('Real Bank statements cannot enter the generic transaction import', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(state => {
    localStorage.setItem('melo-state-v1', JSON.stringify(state));
  }, createFinancialState());
  await page.goto('/');
  await openMoreSection(page, 'Settings');

  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions' }).click();
  await (await fileChooser).setFiles({
    name: 'synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Consultar saldos e movimentos à ordem - 04-12-2031',
      'Conta,example',
      'Data de início,01-12-2031',
      'Data de fim,04-12-2031',
      'Data mov.,Data valor,Descrição,Débito,Crédito,Saldo contabilístico,Saldo disponível,Categoria',
      '03-12-2031,04-12-2031,Treino sintético,26,,,101,Lazer'
    ].join('\r\n'))
  });

  await expect(page.getByText('Real Bank CSV needs bank transaction review before it can be imported.')).toBeVisible({ timeout: 2500 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(savedState.transactions).toEqual([]);
});
