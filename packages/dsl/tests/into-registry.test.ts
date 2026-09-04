import { describe, it, expect } from 'vitest';
/*
 * **`../src/index` 에서 가져온다.** `registry.ts` 와 `template-builders.ts` 는 서로를 import 하는
 * 순환이고, `registry.ts` 를 먼저 가져오면 `new RendererRegistry(...)` 가 그 파일이 아직 평가되지
 * 않은 시점에 불려서 `RendererRegistry is not a constructor` 로 죽는다 — 처음 이 파일을 그렇게 쓰고
 * 확인했다. 입구를 통하면 제품이 가져가는 순서와 같아진다. `tests/registry.test.ts` 도 그래서 그렇게
 * 되어 있다.
 */
import {
  RendererRegistry,
  getGlobalRegistry,
  intoRegistry,
  registryInScope,
  renderer
} from '../src/index';

/**
 * **`intoRegistry`** — 두 제품이 한 화면에 서게 한 그 한 줄.
 *
 * 이 검사가 늦게 생긴 이유가 그 자체로 발견이다. `intoRegistry` 를 시험하는 파일이 저장소에 하나
 * 있었고 `packages/office-note/test/note.test.ts` 였다 — 즉 **쓰는 쪽에서만** 지켜지고 있었다. 노트가
 * 그 검사를 지우거나 다른 방식으로 마운트하면 이 장치는 아무도 안 보는 것이 된다.
 *
 * ## 무엇이 문제였나
 *
 * 렌더러는 **stype 으로 전역에 등록되고 나중 것이 이긴다.** 그래서 Word 와 사이트를 한 화면에
 * 띄우면 Word 가 사이트의 125개 중 117개를 덮었다 — 두 제품이 같은 `paragraph` 를 다르게 그리기
 * 때문이다. 아래쪽은 이미 다 준비돼 있었고(`EditorViewDOM` 이 `registry` 를 받고, `{ global: false }`
 * 인 레지스트리는 **자기 것을 먼저 보고 전역으로 물러선다**) 길이 없는 것은 **쓰는 끝** 하나였다.
 *
 * ## 그리고 `target` 이 모듈 수준의 변수인 것
 *
 * 이 저장소가 방금 `DataStore` 에서 걷어낸 모양이라 구별을 적어 둔다. 그쪽은 **시간을 건너 결과가
 * 기대는 상태**였다(id 카운터를, 다른 인스턴스가 옮긴 것을 모른 채로 나중에 읽는다). 이쪽은 **동적
 * 바인딩**이다 — 한 동기 호출 안에서 세우고 쓰고 되돌리며, 던지는 제품이 새게 하지 않도록 `finally`
 * 가 붙어 있다. 마지막 것이 이 파일의 두 번째 검사다.
 */

const template = { type: 'element' as const, tag: 'div' };

/**
 * **레지스트리가 든 것을 읽는다** — 그리고 그건 함수다.
 *
 * `renderer()` 는 `{ type: 'element' }` 템플릿을 **컴포넌트로 감싸** 등록한다(`define()` 이 언제나
 * 컴포넌트를 만들게 해서 빌드를 단순하게 하려고). 그래서 `get(stype)?.template.tag` 는 언제나
 * `undefined` 다 — 처음 이 파일을 그렇게 쓰고 확인했다. 원래 템플릿에 닿으려면 감싼 것을 불러야 한다.
 */
const drawnTag = (registry: RendererRegistry, stype: string): string | undefined => {
  const held = registry.get(stype)?.template as
    | { component?: (props: unknown, ctx: unknown) => { tag?: string } }
    | undefined;
  return held?.component?.({}, {})?.tag;
};

describe('intoRegistry', () => {
  it('두 레지스트리가 같은 stype 을 각자 갖는다 — 나중 것이 앞의 것을 덮지 않는다', () => {
    const word = new RendererRegistry({ global: false });
    const site = new RendererRegistry({ global: false });

    intoRegistry(word, () => renderer('paragraph', { ...template, tag: 'p' }));
    intoRegistry(site, () => renderer('paragraph', { ...template, tag: 'section' }));

    expect(drawnTag(word, 'paragraph'), 'Word 의 문단이 덮였습니다').toBe('p');
    expect(drawnTag(site, 'paragraph'), '사이트의 문단이 덮였습니다').toBe('section');
  });

  it('던져도 되돌린다 — 그 finally 가 이 장치의 안전장치다', () => {
    const was = registryInScope();
    const mine = new RendererRegistry({ global: false });

    expect(() =>
      intoRegistry(mine, () => {
        expect(registryInScope()).toBe(mine);
        throw new Error('제품이 등록 도중에 던졌다');
      })
    ).toThrow('제품이 등록 도중에 던졌다');

    expect(registryInScope(), '던진 뒤에 범위가 남아 있습니다').toBe(was);
  });

  it('겹쳐도 안쪽이 끝나면 바깥으로 돌아온다', () => {
    const outer = new RendererRegistry({ global: false });
    const inner = new RendererRegistry({ global: false });

    intoRegistry(outer, () => {
      expect(registryInScope()).toBe(outer);
      intoRegistry(inner, () => expect(registryInScope()).toBe(inner));
      expect(registryInScope(), '안쪽이 끝난 뒤 바깥으로 안 돌아왔습니다').toBe(outer);
    });
  });

  it('범위 밖의 등록은 전역으로 간다 — 제품 하나만 쓰는 쪽이 그대로 돌아가는 이유', () => {
    expect(registryInScope()).toBe(getGlobalRegistry());
    renderer('bcTestOnlyOutsideScope', template);
    expect(getGlobalRegistry().get('bcTestOnlyOutsideScope')).toBeDefined();
  });

  it('자기 것이 없으면 전역으로 물러선다 — 호스트의 문단이 살아남는 길', () => {
    renderer('bcTestOnlyGlobalFallback', template);
    const mine = new RendererRegistry({ global: false });

    expect(mine.has('bcTestOnlyGlobalFallback'), '전역으로 물러서지 않았습니다').toBe(true);

    intoRegistry(mine, () => renderer('bcTestOnlyGlobalFallback', { ...template, tag: 'span' }));
    expect(drawnTag(mine, 'bcTestOnlyGlobalFallback'), '자기 것이 전역에 가려졌습니다').toBe('span');
    expect(drawnTag(getGlobalRegistry(), 'bcTestOnlyGlobalFallback'), '전역이 덮였습니다').toBe('div');
  });
});
