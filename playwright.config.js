import { defineConfig } from '@playwright/test';

const k_previewPort = 5174;
const k_previewUrl = `http://127.0.0.1:${k_previewPort}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'compact-phone', use: { viewport: { width: 320, height: 850 } } },
    { name: 'phone', use: { viewport: { width: 396, height: 850 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
  ],
  use: {
    baseURL: k_previewUrl,
    viewport: { width: 396, height: 850 },
    reducedMotion: 'reduce',
    timezoneId: 'Europe/Lisbon',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${k_previewPort} --strictPort`,
    url: k_previewUrl,
    reuseExistingServer: false
  }
});
