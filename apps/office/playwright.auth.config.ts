import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'auth-entry.spec.ts',
  timeout: 45_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5191' },
  webServer: {
    command: 'VITE_OFFICE_AUTH_MODE=oidc VITE_OFFICE_OIDC_ISSUER=http://127.0.0.1:18180/realms/wonffice-local VITE_OFFICE_OIDC_CLIENT_ID=wonffice-browser OFFICE_API_PROXY_TARGET=http://127.0.0.1:14100 npx vite --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191', reuseExistingServer: true, timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
