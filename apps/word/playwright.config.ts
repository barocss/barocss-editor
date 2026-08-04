import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5180' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
