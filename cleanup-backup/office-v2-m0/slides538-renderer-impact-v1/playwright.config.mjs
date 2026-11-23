import { createRequire } from 'node:module';
const root = "/Users/user/.codex/worktrees/slides-m0-baseline/barocss-editor";
const require = createRequire(root + '/package.json');
const { defineConfig, devices } = require('@playwright/test');
export default defineConfig({
  testDir: root + '/apps/slide/tests', testMatch: 'connector.spec.ts',
  grep: new RegExp("follows\ the\ shape\ when\ it\ moves$|is\ one\ undo,\ because\ it\ was\ one\ drag$|is\ typed\ where\ it\ will\ be,\ by\ double\-clicking\ the\ line$"),
  timeout: 30000, globalTimeout: 120000, workers: 1, retries: 0, maxFailures: 3, forbidOnly: true,
  reporter: [['line'], ['json', { outputFile: "/Users/user/barocss-editor/.omx/m0/slides538-renderer-impact-v1/result.json" }]],
  outputDir: "/Users/user/barocss-editor/.omx/m0/slides538-renderer-impact-v1/artifacts",
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:55261', headless: true,
    launchOptions: { executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell' },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: '/Users/user/.nvm/versions/node/v22.22.0/bin/node ' + root + '/apps/slide/node_modules/vite/bin/vite.js --config /Users/user/barocss-editor/.omx/m0/slides538-browser-v1/vite.config.mjs --host 127.0.0.1 --port 55261 --strictPort',
    cwd: root + '/apps/slide', url: 'http://127.0.0.1:55261', reuseExistingServer: false, timeout: 60000 }
});
