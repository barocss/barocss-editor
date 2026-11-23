import { createRequire } from 'node:module';
const root = '/Users/user/.codex/worktrees/522-m0-integration/barocss-editor';
const require = createRequire(root + '/package.json');
const { defineConfig, devices } = require('@playwright/test');
export default defineConfig({
  testDir: root + '/apps/slide/tests',
  testMatch: 'connector.spec.ts',
  timeout: 30000,
  globalTimeout: 120000,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['line']],
  outputDir: '/Users/user/barocss-editor/.omx/m0/slide-impact-artifacts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:55261',
    headless: true,
    launchOptions: { executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: '/Users/user/.nvm/versions/node/v22.22.0/bin/node ' + root + '/apps/slide/node_modules/vite/bin/vite.js --host 127.0.0.1 --port 55261 --strictPort',
    cwd: root + '/apps/slide',
    url: 'http://127.0.0.1:55261',
    reuseExistingServer: false,
    timeout: 60000
  }
});
