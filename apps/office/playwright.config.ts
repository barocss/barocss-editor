import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 45_000, workers: 2,
  use: { baseURL: 'http://localhost:5186' },
  webServer: { command: 'npx vite --port 5186 --strictPort', url: 'http://localhost:5186', reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
