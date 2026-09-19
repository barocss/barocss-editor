import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', workers: 1, timeout: 45_000,
  use: { viewport: { width: 1280, height: 800 } },
  webServer: ['word', 'slide', 'site', 'note'].map((app, index) => ({
    command: `pnpm --dir apps/${app} exec vite --port ${5180 + index} --strictPort`,
    cwd: fileURLToPath(new URL('../..', import.meta.url)), url: `http://localhost:${5180 + index}`, reuseExistingServer: true
  }))
});
