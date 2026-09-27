import { defineConfig, devices } from '@playwright/test';

const officeOrigin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const officeUrl = new URL(officeOrigin);
if (officeUrl.protocol !== 'http:' || officeUrl.hostname !== '127.0.0.1' || !['5186', '5191'].includes(officeUrl.port) || officeUrl.pathname !== '/') {
  throw new Error('OFFICE_AUTH_ORIGIN must be the loopback Office candidate on port 5186 or 5191');
}
const officePort = officeUrl.port;
const apiPort = Number(process.env.OFFICE_AUTH_API_PORT ?? '14101');
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) {
  throw new Error('OFFICE_AUTH_API_PORT must be a local test port');
}
const apiOrigin = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: './tests', testMatch: 'auth-real-local.spec.ts', timeout: 90_000, workers: 1,
  use: { baseURL: officeOrigin },
  webServer: [
    {
      command: 'pnpm --filter @barocss/office-api build && node ../office-api/test/office-auth-ui.local.mjs',
      url: `${apiOrigin}/health/live`, reuseExistingServer: false, timeout: 90_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: `VITE_OFFICE_AUTH_MODE=oidc VITE_OFFICE_OIDC_ISSUER=http://127.0.0.1:18180/realms/wonffice-local VITE_OFFICE_OIDC_CLIENT_ID=wonffice-browser OFFICE_API_PROXY_TARGET=${apiOrigin} npx vite --host 127.0.0.1 --port ${officePort} --strictPort`,
      url: officeOrigin, reuseExistingServer: false, timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
