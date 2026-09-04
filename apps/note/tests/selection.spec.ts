import { test, expect } from '@playwright/test';

/**
 * **블록을 가로지르는 선택** — `docs/specs/selection.md` 의 다섯 결함 중 마지막 하나.
 *
 * 이 파일이 있는 이유는 그 결함의 모양이다. `Shift+→` 를 눌러 문단 경계를 넘으면 모델의 범위가
 * **뒤집혀** 있었다 — `startOffset: 10`, `endOffset: 6` 인데 `direction: 'forward'` 이고, DOM 선택은
 * 비어 있었다. 화면에는 아무 표시가 없고, 그 상태에서 굵게를 누르면 아무 일도 안 난다.
 *
 * 원인은 `editor-view-dom` 의 `isTextContainer` 가 `data-text-container` 라는 속성을 물었고
 * **어떤 렌더러도 그 속성을 쓰지 않는다**는 것이었다. 그래서 그 함수는 한 번도 참이 아니었고, 범위의
 * 두 끝을 담는 그릇을 찾는 일이 늘 실패했다. 있는데 못 닿는 것 — 이 저장소가 반복해서 찾는 그 모양.
 *
 * 이 검사는 그 자리를 **모델로** 지킨다. 앞 회차에는 같은 자리를 콘솔에 찍는 프로브(`zz-sh`,
 * `zz-tc`)가 있었고, 아무것도 단정하지 않아서 `every-test-asserts` 가 잡았다. 프로브는 원인을 찾는
 * 데 쓰고, 찾은 뒤에는 단정으로 바꾼다.
 */

/** 문서를 훑어 글자를 담은 노드의 순서를 낸다 — sid 의 숫자는 만든 순서이지 문서 순서가 아니다. */
const ORDER = `(() => {
  const ed = window.__notes.long.editor;
  const out = [];
  const walk = (sid) => {
    const node = ed.dataStore.getNode(sid);
    if (!node) return;
    if (typeof node.text === 'string') out.push(sid);
    for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
  };
  walk(ed.getRootId());
  return out;
})()`;

test.describe('블록을 가로지르는 범위', () => {
  test('Shift+→ 로 문단을 넘어도 뒤집히지 않고, DOM 에 표시가 남는다', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1400 });
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-note-body] .on-doc').length === 3
    );
    await page.waitForTimeout(400);

    const one = page.locator('[data-case="long"]');
    await one.locator('[data-note-body] p').first().click();
    await page.waitForTimeout(250);

    /** 지금 범위를 문서 순서로 읽는다: 시작이 끝보다 뒤면 뒤집힌 것이다. */
    const read = () =>
      page.evaluate(
        (source) => {
          const order: string[] = eval(source);
          /*
           * 픽스처가 창에 걸어 둔 것을 그 자리에서 형태로 적는다. 편집기를 통째로 밀어 버리는
           * 캐스트를 쓰지 않는 이유는 `editor-is-typed.test.ts` 가 그 개수를 잠가 두었기 때문이고,
           * 그 잠금이 겨누는 것이 이런 자리다 — 필요한 것은 `selection` 하나이고 `Editor` 는 그것을
           * 공개로 선언한다. 그 검사는 자기 프로세가 패턴을 인용하는 것까지 세므로 여기서도 적지
           * 않는다.
           */
          type Held = {
            __notes: Record<
              string,
              {
                editor: {
                  selection?: {
                    startNodeId?: string;
                    startOffset?: number;
                    endNodeId?: string;
                    endOffset?: number;
                    direction?: string;
                    type?: string;
                  };
                };
              }
            >;
          };
          const sel = (window as unknown as Held).__notes.long.editor.selection;
          const at = (sid?: string) => (sid ? order.indexOf(sid) : -1);
          return {
            type: sel?.type,
            startAt: at(sel?.startNodeId),
            endAt: at(sel?.endNodeId),
            startOffset: sel?.startOffset ?? -1,
            endOffset: sel?.endOffset ?? -1,
            direction: sel?.direction,
            drawn: (document.getSelection()?.toString() ?? '').length
          };
        },
        ORDER
      );

    /*
     * 예순 번. 첫 문단을 다 지나 다음 블록으로 넘어가기에 충분하고, 넘는 그 한 번이 결함이 나던
     * 자리다 — 열 번만 누르면 한 문단 안에서만 걷고 그건 늘 되던 쪽이다.
     */
    let crossed = 0;
    let firstBlock = -1;

    for (let press = 1; press <= 60; press += 1) {
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(50);
      const said = await read();

      if (said.type !== 'range') continue; // 블록 선택으로 바뀐 것은 이 검사의 대상이 아니다
      if (firstBlock < 0) firstBlock = said.startAt;
      if (said.endAt !== said.startAt) crossed += 1;

      /** 문서 순서로 시작이 끝보다 앞이어야 한다 — 같은 노드면 오프셋으로 같은 것을 묻는다. */
      const inverted =
        said.startAt > said.endAt ||
        (said.startAt === said.endAt && said.startOffset > said.endOffset);
      expect(
        inverted,
        `${press}번째 Shift+→ 에서 범위가 뒤집혔습니다: ${JSON.stringify(said)}`
      ).toBe(false);

      /** 그리고 골랐다면 화면에도 있어야 한다. 모델만 맞고 DOM 이 비면 독자에게는 아무 일도 없다. */
      expect(
        said.drawn,
        `${press}번째 Shift+→ 에서 DOM 선택이 비었습니다: ${JSON.stringify(said)}`
      ).toBeGreaterThan(0);
    }

    expect(crossed, '예순 번을 눌렀는데 블록 경계를 한 번도 넘지 않았습니다').toBeGreaterThan(0);
  });

  /**
   * **`data-text-container` 는 아무도 쓰지 않는다** — 위 결함의 원인이던 그 속성.
   *
   * 고친 방식이 *속성을 쓰기 시작하는 것* 이 아니라 *모델에 묻는 것* 이었으므로, 그 속성이 다시
   * 나타나면 두 가지 답이 생긴 것이고 그건 원래 결함의 재발 조건이다. 없음을 지킨다.
   */
  test('글자 그릇을 속성으로 표시하지 않는다 — 모델이 답한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-note-body] .on-doc').length === 3
    );
    await page.waitForTimeout(400);

    const said = await page.evaluate(() => {
      const body = document.querySelector('[data-case="long"] [data-note-body]')!;
      const run = body.querySelector('p')?.firstElementChild;
      return {
        marked: body.querySelectorAll('[data-text-container]').length,
        runTag: run?.tagName ?? '(없음)',
        runHasSid: run?.hasAttribute('data-bc-sid') ?? false
      };
    });

    expect(said.marked, '`data-text-container` 를 쓰는 렌더러가 생겼습니다').toBe(0);
    // 그릇을 찾는 길은 이것이다: 그려진 것에 sid 가 있고, 그 sid 의 노드가 `text` 를 갖는지 묻는다.
    expect(said.runTag).toBe('SPAN');
    expect(said.runHasSid, 'sid 가 없으면 모델에 물을 수 없습니다').toBe(true);
  });
});
