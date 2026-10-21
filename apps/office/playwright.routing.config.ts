import base from './playwright.config';

/** This checkout owns its listener and serial native renderer resources. */
export default {
  ...base, outputDir: '../../.dev/artifacts/479/routing', workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5491' },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5491 --strictPort',
    url: 'http://127.0.0.1:5491', reuseExistingServer: false, timeout: 60_000,
  },
};
