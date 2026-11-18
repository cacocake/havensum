import { test as baseTest, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const k_fontSources = [
  ['DM Sans', new URL(import.meta.resolve('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'))],
  ['Fredoka', new URL(import.meta.resolve('@expo-google-fonts/fredoka/400Regular/Fredoka_400Regular.ttf'))]
];
const k_fontStyles = await Promise.all(k_fontSources.map(async ([family, path]) => {
  const font = await readFile(path);
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:400 700;font-display:swap;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');}`;
}));

// Font delivery is an external network boundary. Use the fonts already shipped
// with the native app so browser behavior tests also work when Google is offline.
export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
      contentType: 'text/css', body: k_fontStyles.join('\n')
    }));
    await use(page);
  }
});

export { expect };
