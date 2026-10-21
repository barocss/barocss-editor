import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5330', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5330 --strictPort',
    url: 'http://127.0.0.1:5330',
    reuseExistingServer: false,
    timeout: 60_000
  }
});
