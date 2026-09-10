import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', timeout: 60000, expect: { timeout: 15000 },
  fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  outputDir: '../../test-results',
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium', viewport: { width: 1440, height: 1100 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start -- --hostname 127.0.0.1', cwd: fileURLToPath(new URL('../../', import.meta.url)), url: 'http://127.0.0.1:3000', timeout: 120000, reuseExistingServer: false },
});
