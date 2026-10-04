import base from './playwright.config';
export default {
  ...base, outputDir: '../../.dev/artifacts/479/preview', testMatch: 'workspace-preview.spec.ts', workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5493' },
  webServer: { command: 'pnpm exec vite preview --host 127.0.0.1 --port 5493 --strictPort',
    url: 'http://127.0.0.1:5493', reuseExistingServer: false, timeout: 60_000 },
};
