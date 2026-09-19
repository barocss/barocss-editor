import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: 'motion.browser.ts', workers: 1,
  use: { baseURL: 'http://localhost:5183', viewport: { width: 1280, height: 900 } },
  webServer: {
    command: 'pnpm --dir apps/note dev --port 5183 --strictPort',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: 'http://localhost:5183', reuseExistingServer: true
  }
});
