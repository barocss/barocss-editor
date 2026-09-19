import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Reuse the workspace Vite server to load the shared source in a real IndexedDB host.
export default defineConfig({
  testDir: '.', testMatch: 'document-library.browser.ts', workers: 1,
  use: { baseURL: 'http://localhost:5183' },
  webServer: {
    command: 'pnpm --dir apps/note dev --port 5183 --strictPort',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: 'http://localhost:5183', reuseExistingServer: true
  }
});
