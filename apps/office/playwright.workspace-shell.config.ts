import base from './playwright.config';

/** Bind Workspace acceptance to this checkout. Never reuse another task's Vite listener. */
export default {
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5391' },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5391 --strictPort',
    url: 'http://127.0.0.1:5391', reuseExistingServer: false, timeout: 60_000,
  },
};
