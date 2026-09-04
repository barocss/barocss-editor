import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5184',
    trace: 'on-first-retry'
  },
  /**
   * **`--strictPort`, 그리고 자기 포트.**
   *
   * 전에는 `command: 'pnpm dev'` 였고 그 스크립트는 맨 `vite` 였다 — 포트를 안 못 박으므로 5173 이
   * 막혀 있으면 vite 는 **5174 를 잡는다.** 그런데 playwright 는 5173 을 기다리고
   * `reuseExistingServer: true` 다. 그래서 **그 포트에 있는 아무 앱이나 시험한다.**
   *
   * 실제로 그랬다: 이 스위트가 *콘텐츠 층이 안 보인다* 고 실패했고, 재보니 그 콘텐츠 층의 글자가
   * `Barocss제품가격소개블로그…` 이고 클래스에 `st-main` 이 있었다 — **사이트 빌더**다. 5173 에
   * `apps/site` 의 개발 서버가 남아 있었고 이 스위트가 그것을 시험하고 있었다. 커밋된
   * `test-results/.last-run.json` 이 `{"status":"passed"}` 인 것도 같은 이유로 믿을 수 없다.
   *
   * 제품 넷은 다 `--port N --strictPort` 로 자기 포트를 못 박는다(5180 word · 5181 slide ·
   * 5182 site · 5183 note). 기능성 테스트 앱 둘만 안 하고 있었다. **5184** 를 준다 — 5173 은
   * vite 의 기본값이라 아무나 잡는 자리다.
   */
  webServer: {
    command: 'pnpm exec vite --port 5184 --strictPort',
    url: 'http://localhost:5184',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

