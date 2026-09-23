import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/scenarios',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/scenarios' }],
    ['json', { outputFile: 'test-results/scenarios/results.json' }]],
  outputDir: 'test-results/scenarios/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
    baseURL: 'http://127.0.0.1:5293',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-desktop' }],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5293 --strictPort',
    url: 'http://127.0.0.1:5293/scenarios.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
