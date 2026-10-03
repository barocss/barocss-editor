import base from './playwright.config';

/** Bind header acceptance to this checkout without reusing another editor listener. */
export default {
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5392' },
  webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 5392 --strictPort',
    url: 'http://127.0.0.1:5392', reuseExistingServer: false, timeout: 60_000 },
};
