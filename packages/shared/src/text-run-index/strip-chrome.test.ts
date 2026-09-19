import { describe, expect, it } from 'vitest';
import { stripChromeElements, CHROME_ATTR } from './text-run-index';

/**
 * **복사할 때 무엇이 지워지고 무엇이 남는가.**
 *
 * ## 이 검사가 있는 이유
 *
 * `data-bc-chrome` 은 *"문서의 것이 아니다"* 를 뜻한다 — 페이지 종이, 눈금자, 페이지 나눔 자리.
 * 복사본에서 지우는 것이 맞다.
 *
 * 그런데 **글자를 감싸는 데코레이터도 같은 표식을 단다.** 주석 하이라이트와 찾기 하이라이트는
 * 문서의 진짜 낱말을 안에 담고 있고, `el.remove()` 는 그 낱말까지 가져간다.
 *
 * 2026-09-06 에 Word 샘플에서 쟀다. 주석이 걸린 문단을 복사하면:
 *
 * | | |
 * |---|---|
 * | 화면 | `Revisions are drawn, not applied: this w…` |
 * | 복사됨 | ` are drawn, not applied: this w…` |
 *
 * **`"Revisions"` 가 사라졌다.** 주석만이 아니다 — 찾기 하이라이트도 같은 모양이므로, 검색해 둔
 * 채로 문단을 복사하면 **찾은 낱말이 전부 빠진다.** 오늘 생긴 결함이 아니라 처음부터 있었고,
 * 픽스처가 주석을 입고 나서야 보였다.
 *
 * ## 무엇으로 가르는가
 *
 * `decoratorType: 'target'` — 모델 노드의 한 범위를 덮는 데코레이터다. 그것이 담은 글자는
 * 문서의 것이므로 **껍질만 벗긴다**. 그 밖의 크롬은 문서의 글자를 담지 않으므로 통째로 지운다.
 *
 * ## 브라우저가 필요 없다
 *
 * 답을 정하는 것은 우리 코드다 — 어떤 요소를 지우고 어떤 것을 벗기는가. `docs/specs/testing.md`
 * 의 기준대로 단위로 적는다. 이 결함은 브라우저에서 손으로 확인해서 찾았고, **e2e 가 잡은 것은
 * 단위로 내려 적는다.**
 */
const html = (markup: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host;
};

describe('복사본에서 크롬을 걷어낼 때', () => {
  it('글자를 감싼 데코레이터는 껍질만 벗기고 글자는 남긴다', () => {
    const host = html(
      `<p>` +
        `<span ${CHROME_ATTR}="true" data-decorator-type="target" class="w-comment-hit">Revisions</span>` +
        `<span> are drawn, not applied.</span>` +
        `</p>`
    );

    stripChromeElements(host);

    expect(host.textContent, '감싸인 낱말이 복사본에서 사라졌습니다').toBe(
      'Revisions are drawn, not applied.'
    );
    expect(host.querySelector('.w-comment-hit'), '하이라이트 자체는 남으면 안 됩니다').toBeNull();
  });

  it('찾기 하이라이트도 같다 — 검색해 둔 채 복사해도 낱말이 빠지지 않는다', () => {
    const host = html(
      `<p>This <span ${CHROME_ATTR}="true" data-decorator-type="target" class="w-find-hit">paragraph</span> matched.</p>`
    );

    stripChromeElements(host);

    expect(host.textContent).toBe('This paragraph matched.');
  });

  it('문서의 글자를 담지 않는 크롬은 통째로 지운다', () => {
    /*
     * 페이지 나눔 자리와 눈금자. 이것들이 담은 것은 그린 것이지 문서의 것이 아니므로, 벗겨서
     * 남기면 복사본에 눈금 숫자가 섞여 들어간다.
     */
    const host = html(
      `<p>Before` +
        `<span ${CHROME_ATTR}="true" class="w-page-break"></span>` +
        `<span ${CHROME_ATTR}="true" class="w-line-numbers">1 2 3</span>` +
        `After</p>`
    );

    stripChromeElements(host);

    expect(host.textContent, '크롬이 그린 것이 복사본에 남았습니다').toBe('BeforeAfter');
  });

  it('겹쳐 있어도 안쪽 글자를 잃지 않는다', () => {
    /*
     * 한 낱말에 주석과 찾기가 함께 걸릴 수 있다. 바깥을 먼저 벗기든 안쪽을 먼저 벗기든 글자는
     * 그대로여야 한다 — `querySelectorAll` 이 준 목록을 도는 동안 트리가 바뀌기 때문에, 이건
     * 순서에 대한 검사이기도 하다.
     */
    const host = html(
      `<p>` +
        `<span ${CHROME_ATTR}="true" data-decorator-type="target" class="w-find-hit">` +
        `<span ${CHROME_ATTR}="true" data-decorator-type="target" class="w-comment-hit">Revisions</span>` +
        `</span>` +
        ` are drawn.</p>`
    );

    stripChromeElements(host);

    expect(host.textContent).toBe('Revisions are drawn.');
  });

  it('이 검사가 아무것도 안 보고 통과하지 않는다', () => {
    /* 표식이 없는 것은 손대지 않는다 — 지우는 쪽만 세면 이 파일은 빈 문단에도 통과한다. */
    const host = html(`<p><span class="plain">kept</span></p>`);
    stripChromeElements(host);
    expect(host.textContent).toBe('kept');
    expect(host.querySelector('.plain')).not.toBeNull();
  });
});
