// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { stripChromeElements, CHROME_ATTR } from '@barocss/shared';
/*
 * Imported through the **panes**, not from the decorator module, on purpose. The claim being made
 * is that a host which reaches for `CommentsPane` or `FindPanel` gets the drawing with them — so
 * the import in this file is the same one a host writes, and if the wiring were only inside
 * `highlight-decorators.ts` and nothing pulled it in, the registry below would be empty.
 */
import { ANCHOR_STYPE, MATCH_STYPE } from '../src/ui';

/**
 * **`office-word` draws its own highlights**, and they still carry all four attributes.
 *
 * The templates for the comment anchor and the search hit lived in `apps/word/src/main.tsx`, so the
 * package owned half of two of its features: a view built anywhere but that app logged
 * *"Component not found for decorator type 'w-comment-anchor', using fallback div"* and drew a bare
 * `<div>`. They moved to `src/highlight-decorators.ts`.
 *
 * The move is only safe if nothing is dropped on the way, and the pair of attributes that says
 * *"chrome, but chrome holding the document's own words"* had just been split apart the night
 * before — `data-decorator-type="target"` is what stops the copy path from deleting a commented
 * word along with its highlight (`shared/text-run-index/strip-chrome.test.ts`) and what stops the
 * paginator from putting a line off the paper.
 *
 * So this asserts on the **registered template** rather than on a copy of it: the class the
 * stylesheet paints, the chrome flag, and `defineDecorator`'s own two — and then walks the copy
 * path with the result, in both directions, so the check can tell whether it is looking at
 * anything.
 */
describe('the two highlights the package now draws', () => {
  /** What the registered template puts on its element, with the data a live decorator carries. */
  const attributesOf = (stype: string, decoratorData: Record<string, unknown>) => {
    const definition = getGlobalRegistry().get(stype);
    expect(definition, `${stype} 를 그리는 것이 없습니다 — fallback div 가 그려집니다`).toBeTruthy();

    /*
     * `defineDecorator` wraps an element template in a component, so the element — and the two
     * attributes the wrapping adds — only exists once it is built. Built the way `math-drawn`
     * builds a renderer's, with the decorator's own flattened data as the node.
     */
    const template = definition!.template as never as {
      component?: (a: unknown, b: unknown, c: unknown) => { attributes?: Record<string, unknown>; children?: unknown[] };
    };
    const built = template.component!(decoratorData, decoratorData, {});
    const bag = built.attributes ?? {};
    const read = (key: string): unknown => {
      const value = bag[key];
      return typeof value === 'function' ? (value as (d: unknown) => unknown)(decoratorData) : value;
    };
    return { read, bag, children: built.children ?? [] };
  };

  it('marks a comment with the class the stylesheet paints, selected or not', () => {
    expect(attributesOf(ANCHOR_STYPE, { selected: false }).read('className')).toBe('w-comment-hit');
    expect(attributesOf(ANCHOR_STYPE, { selected: true }).read('className')).toBe('w-comment-hit is-selected');
  });

  it('marks a search hit the same way, current or not', () => {
    expect(attributesOf(MATCH_STYPE, { current: false }).read('className')).toBe('w-find-hit');
    expect(attributesOf(MATCH_STYPE, { current: true }).read('className')).toBe('w-find-hit is-current');
  });

  /*
   * The three attributes that are not the class. Two are written by the template and one by
   * `defineDecorator`, and a template that forgot `data-bc-chrome` would put a highlight into every
   * copy taken out of the editor.
   */
  it('says it is chrome, and says it is a decorator', () => {
    for (const stype of [ANCHOR_STYPE, MATCH_STYPE]) {
      const { read } = attributesOf(stype, {});
      expect(read(CHROME_ATTR), `${stype}: 크롬 표식이 없습니다`).toBe('true');
      expect(read('data-decorator'), `${stype}: 데코레이터 표식이 없습니다`).toBe('true');
      expect(read('data-skip-reconcile')).toBe('true');
    }
  });

  /*
   * And it draws the words it covers. An empty span would be a highlight over nothing — the
   * fallback `<div>` this move exists to stop was exactly that.
   */
  it('draws the text underneath it rather than an empty box', () => {
    for (const stype of [ANCHOR_STYPE, MATCH_STYPE]) {
      const { children } = attributesOf(stype, {});
      expect(children.length, `${stype}: 감쌀 글자가 템플릿에 없습니다`).toBe(1);
      expect(JSON.stringify(children[0])).toContain('text');
    }
  });

  /*
   * The other door into the package. `apps/word/src/main.tsx` imports `@barocss/office-word`, not
   * the panes, so the front door has to carry the module too — otherwise the app that used to draw
   * these would stop drawing them and nothing here would notice.
   */
  it('arrives through the package front door as well as through the panes', async () => {
    const front = await import('../src/index');
    expect(front.ANCHOR_STYPE).toBe(ANCHOR_STYPE);
    expect(front.MATCH_STYPE).toBe(MATCH_STYPE);
    expect(typeof front.registerHighlightDecorators).toBe('function');
  });

  /**
   * **The fourth attribute, walked rather than asserted.**
   *
   * `data-decorator-type` is stamped by the view on any decorator that names a `target`, which both
   * of these do — so it is not in the template and cannot be read off it. What can be checked is
   * that the template's own attributes, plus that one, still survive the copy path: the highlight
   * is unwrapped and the commented word stays.
   *
   * The second half is the control. Without `data-decorator-type` the same markup loses the word —
   * which is the defect that was fixed the night before this move, reproduced here so this test is
   * known to be able to see it. A guard that only ever looks at the passing case is a guard that
   * has never been shown to work.
   */
  it('is copied as the word it wraps, and would lose the word without the target flag', () => {
    const { read } = attributesOf(ANCHOR_STYPE, { selected: false });
    const chrome = `${CHROME_ATTR}="${read(CHROME_ATTR)}" class="${read('className')}"`;

    const kept = document.createElement('div');
    kept.innerHTML = `<p><span ${chrome} data-decorator-type="target">Revisions</span> are drawn.</p>`;
    stripChromeElements(kept);
    expect(kept.textContent, '복사본에서 주석 걸린 낱말이 사라졌습니다').toBe('Revisions are drawn.');
    expect(kept.querySelector('.w-comment-hit'), '하이라이트 자체는 남으면 안 됩니다').toBeNull();

    const lost = document.createElement('div');
    lost.innerHTML = `<p><span ${chrome}>Revisions</span> are drawn.</p>`;
    stripChromeElements(lost);
    expect(lost.textContent, '이 검사는 무엇도 못 보고 통과하고 있습니다').toBe(' are drawn.');
  });
});
