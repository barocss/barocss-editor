/**
 * **How the two highlights that wrap the document's own words are drawn.**
 *
 * A commented phrase and a search hit are the same shape of thing: a decorator over a range of a
 * model node, drawn as a `<span>` around text that belongs to the document. Neither is *in* the
 * document — which thread a reader has open and what they last searched for survive no edit and
 * belong in no undo step — so both are decorators rather than marks.
 *
 * ## Why this file exists
 *
 * `CommentsPane` and `FindPanel` build these decorators and hand them to the view, and **the
 * templates that draw them lived in `apps/word/src/main.tsx`.** So the package owned half of its own
 * feature: anything that stood a Word view up without that app — a test, another host, `office-word`
 * used as a library — got
 *
 * > `Component not found for decorator type 'w-comment-anchor', using fallback div`
 *
 * and a bare `<div>` with none of the four things below on it. That fallback is also where the dead
 * `.w-comment-hit` selectors in the app's stylesheet came from.
 *
 * ## The four things a highlight has to carry
 *
 * Two are written here and two are added downstream, and all four have to survive:
 *
 * | | 어디서 | 없으면 |
 * |---|---|---|
 * | `class="w-comment-hit"` / `"w-find-hit"` | 이 템플릿 | 하이라이트가 안 보인다 |
 * | `data-bc-chrome="true"` | 이 템플릿 | 복사본에 크롬이 섞여 든다 |
 * | `data-decorator="true"` | `defineDecorator` | 렌더러가 데코레이터로 안 본다 |
 * | `data-decorator-type="target"` | 뷰가 `target` 을 가진 데코레이터에 붙인다 | **복사에서 글자가 사라지고**, 페이지네이션이 줄을 종이 밖에 놓는다 |
 *
 * The last row is the one that was fixed the night before this move.
 * `shared/text-run-index/strip-chrome.test.ts` says what it buys: `data-bc-chrome` alone means
 * *"not the document's"*, and `el.remove()` on a comment highlight took the commented words with
 * it — copying a paragraph with a comment in it silently dropped a word. `data-decorator-type`
 * is what tells the copy path to **unwrap** this kind rather than delete it, and what tells Word's
 * paginator to count the text underneath.
 *
 * `data-bc-chrome` stays for what it still buys — the highlight itself is not copied, only the
 * words inside it — so the two are needed together and neither replaces the other.
 *
 * ## Registered on import
 *
 * Rather than exposing a `register…()` the host has to remember, the way a page-break widget does.
 * A widget is optional — a host may paginate or not — but a product that draws a comment highlight
 * and cannot draw it is simply broken, and the thing this file is fixing is exactly a registration
 * a host had to remember. The call is still exported for a host that wants to be explicit, and
 * calling it twice is calling `defineDecorator` twice, which is last-write-wins with the same
 * template.
 */
import { data, defineDecorator, element } from '@barocss/dsl';

/** The decorator type commented text is drawn under. */
export const ANCHOR_STYPE = 'w-comment-anchor';

/** The decorator type a search hit is drawn under. */
export const MATCH_STYPE = 'w-find-match';

/**
 * The attribute that says *"this element is chrome, not the document"*.
 *
 * Spelled out rather than imported from `@barocss/shared` so the template reads as what it emits;
 * `strip-chrome.test.ts` imports the constant and asserts on this exact string.
 */
const CHROME = 'data-bc-chrome';

/** Draw both highlights. Idempotent; called once when this module is imported. */
export function registerHighlightDecorators(): void {
  /**
   * Commented text.
   *
   * The `commentRef` mark is what the *document* records; this is the highlight a reader sees while
   * the pane is open. Writing the highlight into the document would put "somebody has this pane
   * open" into everything the document is saved to.
   *
   * `data('text')` is the child, and it is the whole reason this is not an empty span: the words
   * inside the highlight are the document's, and a template that drew nothing would draw a
   * highlight over nothing.
   */
  defineDecorator(
    ANCHOR_STYPE,
    element(
      'span',
      {
        // The decorator's own data arrives flattened — the same way the page break widget reads its
        // height. `selected` is the thread the pane has open.
        className: (d: Record<string, any>) => (d?.selected ? 'w-comment-hit is-selected' : 'w-comment-hit'),
        [CHROME]: 'true'
      },
      [data('text')]
    )
  );

  /**
   * A search result.
   *
   * A decorator rather than a mark: which words a reader is looking for is not part of the
   * document, and writing it in would put a search in the undo stack and in anything the document
   * was saved to.
   */
  defineDecorator(
    MATCH_STYPE,
    element(
      'span',
      {
        className: (d: Record<string, any>) => (d?.current ? 'w-find-hit is-current' : 'w-find-hit'),
        [CHROME]: 'true'
      },
      [data('text')]
    )
  );
}

registerHighlightDecorators();
