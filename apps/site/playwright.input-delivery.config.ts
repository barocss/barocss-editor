import base from './playwright.config';

/** Bind embedded-input verification to this checkout without reusing another task's server. */
export default {
  ...base, workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5382' },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5382 --strictPort',
    url: 'http://127.0.0.1:5382', reuseExistingServer: false, timeout: 60_000,
  },
};
