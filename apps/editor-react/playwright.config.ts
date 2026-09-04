import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  /**
   * **`--strictPort`.** 전에는 `command: 'pnpm dev'` 였고 그 스크립트는 맨 `vite` 다 — 포트를 안 못
   * 박으므로 5175 가 막혀 있으면 다음 빈 포트를 잡는데 playwright 는 5175 를 기다리고
   * `reuseExistingServer: true` 다. 그러면 **그 포트에 있는 아무 앱이나 시험한다.**
   *
   * 짐작이 아니다: 같은 결함이 `apps/editor-test` 에서 실제로 일어났고, 그 스위트는 5173 에 남아
   * 있던 **사이트 빌더**를 시험하고 있었다. 제품 넷은 다 자기 포트를 못 박는다.
   */
  webServer: {
    command: 'pnpm exec vite --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
