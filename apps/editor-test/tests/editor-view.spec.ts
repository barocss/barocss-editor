import { test, expect } from '@playwright/test';

/**
 * **`editor-view-dom` 을 제품 없이 그리게 해 보는 앱** — 기능성 테스트이고 제품이 아니다.
 *
 * 그래서 여기서 실패하는 것은 엔진의 것이다: 제품 크롬이 없으므로 사이 어딘가에서 가려질 것이 없다.
 * 대신 이 앱은 **자기 렌더러**를 손으로 정의한다(`main.ts` 의 `define('paragraph', element('p', …))`),
 * 그래서 무엇이 그려지는지도 이 앱의 것이다.
 *
 * ## 이 파일이 오래 거짓이었던 두 가지
 *
 * **하나 — 포트가 안 묶여 있어서 다른 앱을 시험하고 있었다.** `webServer.command` 가 맨 `vite` 여서
 * 5173 이 막히면 5174 를 잡는데 playwright 는 5173 을 기다렸고 `reuseExistingServer: true` 였다.
 * 실제로 5173 에 `apps/site` 의 개발 서버가 남아 있었고, *콘텐츠 층이 안 보인다* 는 실패의 내용을
 * 재보니 그 콘텐츠 층의 글자가 `Barocss제품가격소개블로그…` 였다 — **사이트 빌더다.** 설정에
 * `--port 5184 --strictPort` 를 줘서 막았다.
 *
 * **둘 — `data-bc-stype` 으로 세고 있었다.** 엔진은 그 속성을 **일부러 안 쓴다**:
 * `renderer-dom/reconcile/utils/portal-handler.ts` 가 *"no longer exposed in DOM (sid is sufficient
 * for model lookup)"* 이라고 적어 뒀고, `dsl/template-builders.ts` 도 *"No schema type attribute
 * injection at DSL layer; model carries stype"* 라고 적어 뒀다. `src` 의 어느 곳도 그것을 세우지
 * 않는다.
 *
 * 그래서 문단 개수 단정은 **0을 세고 실패**했고, *document 래퍼가 콘텐츠 층의 직계 자식이면 안 된다*
 * 는 단정은 **0을 세고 공허하게 통과**했다 — 실제로는 `div.document` 가 직계 자식이다. 둘 다 같은
 * 원인이고, 하나는 빨갛고 하나는 초록이었다는 것이 이 모양의 위험이다.
 *
 * `apps/editor-react` 의 스펙 일곱은 `data-bc-stype` 을 쓰고 지나간다 — **그 앱의 렌더러가 자기 손으로
 * 그 속성을 붙이기 때문**이다(`register-renderers.tsx`). 즉 그쪽 검사는 그만큼 그 앱의 관례를
 * 시험하고 있고, 그건 알고 있으면 문제가 아니다.
 *
 * 여기서는 **모델에 닿는 길로** 센다: `data-bc-sid` 가 있고 클래스가 이 앱의 렌더러가 준 이름이다.
 */
test.describe('EditorViewDOM rendering', () => {
  test('renders content layer and initial document from editor-test app', async ({ page }) => {
    await page.goto('/');
    const content = page.locator('[data-bc-layer="content"]');
    await expect(content).toBeVisible();

    /*
     * **`div.document` 가 직계 자식이다** — 이 앱이 `define('document', element('div', …))` 을 하기
     * 때문이다. 전에 이 자리에는 *래퍼가 없어야 한다* 가 적혀 있었고 없는 속성을 세어 통과했다.
     * 없어야 한다면 이 앱이 그 렌더러를 등록하지 않아야 하고, 그건 다른 결정이다.
     */
    await expect(content.locator('> [data-bc-sid]')).toHaveCount(1);
    await expect(content.locator('> .document')).toHaveCount(1);

    // 처음 트리: heading 둘과 문단 둘.
    await expect(content.locator('.heading')).toHaveCount(2);
    await expect(content.locator('.paragraph')).toHaveCount(2);

    /* 그려진 것마다 sid 가 있어야 모델에 물을 수 있다 — 그게 엔진이 약속하는 하나다. */
    const withoutSid = await content.evaluate(
      (el) => [...el.querySelectorAll('.document, .heading, .paragraph, .text')].filter((one) => !one.hasAttribute('data-bc-sid')).length
    );
    expect(withoutSid, 'sid 없이 그려진 노드가 있습니다').toBe(0);

    // main.ts 의 initialTree 가 말하는 글자.
    await expect(content).toContainText('BaroCSS Editor Demo');
    await expect(content).toContainText('Rich Text Features');
    await expect(content).toContainText('This is a ');
    await expect(content).toContainText('bold text');
    await expect(content).toContainText('italic text');
  });
});
