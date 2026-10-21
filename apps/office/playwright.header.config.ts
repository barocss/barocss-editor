import base from './playwright.config';
export default {
  ...base, testMatch: ['workspace-header.spec.ts', 'workspace-native-layout.spec.ts', 'workspace-shell.spec.ts', 'workspace.spec.ts'], outputDir: '../../.dev/artifacts/468/one-header', workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5495' },
  webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 5495 --strictPort', url: 'http://127.0.0.1:5495', reuseExistingServer: false, timeout: 60_000 },
};
