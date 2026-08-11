import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // The suite is split across files, so Playwright runs them side by side. Left
  // at the default (half the cores) the machine is loaded enough that a test
  // waiting on pagination to settle or a web font to arrive times out on a
  // healthy build — the assertions are about what the browser did, and under
  // load it does it later. Three is where it stopped flaking here and still
  // finishes in a third of the time the single file took.
  workers: 3,
  use: { baseURL: 'http://localhost:5180' },
  // Started here rather than by hand: a suite that depends on a server someone
  // remembered to run is a suite that fails for a reason unrelated to the code.
  webServer: {
    command: 'npx vite --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
