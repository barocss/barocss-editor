import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests', outputDir: './test-results', fullyParallel: false, workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5194', headless: true, viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.CLOUD_CHROMIUM_PATH ?? '/usr/bin/chromium' },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node cloud-workspace/test-server.mjs', cwd: '..',
    url: 'http://127.0.0.1:5194', reuseExistingServer: false, timeout: 15000 }
});
