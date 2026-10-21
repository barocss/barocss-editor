import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests', outputDir: './test-results', fullyParallel: false, workers: 1,
  timeout: 45000, use: { baseURL: 'http://127.0.0.1:5394', headless: true,
    viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: '/usr/bin/chromium' },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `${process.execPath} sites/test-server.mjs`, cwd: '..',
    url: 'http://127.0.0.1:5394', reuseExistingServer: false, timeout: 20000 }
});
