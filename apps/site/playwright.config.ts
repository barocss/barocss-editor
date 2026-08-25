import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // Three, matching Word's, and for the reason written there: at the default
  // the machine is loaded enough that a test waiting for a render to settle
  // times out on a healthy build.
  workers: 3,
  use: { baseURL: 'http://localhost:5182' },
  // Its own port, so a deck's suite and a document's can run at once.
  webServer: {
    command: 'npx vite --port 5182 --strictPort',
    url: 'http://localhost:5182',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
