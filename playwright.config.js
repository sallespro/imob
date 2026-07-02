import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 150000,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
