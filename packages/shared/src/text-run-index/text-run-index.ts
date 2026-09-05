export interface TextRun {
  domTextNode: Text;
  start: number; // inclusive
  end: number;   // exclusive
  /**
   * The text this run contributes to the model, with renderer-owned filler
   * characters removed. Read this instead of `domTextNode.textContent`.
   */
  text: string;
  /**
   * Offset inside `domTextNode` at which `text` begins. Non-zero when the node
   * carries a leading filler, so model offset N maps to DOM offset
   * `domStart + N`. Ignoring it puts the caret before the zero-width character.
   */
  domStart: number;
}

export interface ContainerRuns {
  runs: TextRun[];
  total: number;
  /** Reverse lookup; `domStart` mirrors TextRun.domStart for DOM->model mapping. */
  byNode?: Map<Text, { start: number; end: number; domStart: number }>;
}

const runIndexByElement = new WeakMap<Element, ContainerRuns>();
const runIndexById = new Map<string, ContainerRuns>();

/** Zero-width no-break space used as the empty-block caret filler. */
export const FILLER_CHAR = '﻿';

/** Attribute marking a renderer-owned caret filler. */
export const FILLER_ATTR = 'data-bc-filler';

/**
 * Strip renderer-owned filler characters from a raw DOM string.
 *
 * Use wherever DOM text is read outside buildTextRunIndex (which excludes the
 * filler element wholesale). Without this the filler leaks into copied text and
 * shifts every offset by one.
 */
export function stripFiller(text: string): string {
  return text.includes(FILLER_CHAR) ? text.split(FILLER_CHAR).join('') : text;
}

/**
 * Attribute marking an element a template drew that is not content.
 *
 * Page sheets, rulers, grid lines, a slide's background — a template legitimately
 * draws things that correspond to nothing in the model. They are in the content
 * tree because that is where the geometry they align to lives, but they must not
 * behave like content: they cannot be copied, and they cannot be typed into.
 *
 * The caret filler is the same idea one element smaller, which is why the two
 * live together.
 */
export const CHROME_ATTR = 'data-bc-chrome';

/**
 * Remove renderer-owned chrome from a cloned fragment.
 *
 * Takes a detached clone, never live DOM: this is for rewriting what leaves the
 * editor, and removing chrome from the document itself would erase what it draws.
 */
export function stripChromeElements(root: Element | DocumentFragment): void {
  for (const el of Array.from(root.querySelectorAll(`[${CHROME_ATTR}]`))) {
    el.remove();
  }
}

/**
 * Check if element is a decorator
 */
function isDecoratorElement(el: Element): boolean {
  /*
   * **`data-bc-decorator-sid` 도 안다.** 이름이 넷인 것은 그리는 경로가 둘이고 각자 접두어가 다르기
   * 때문이다 — `editor-view-dom/decorator/decorator-renderer` 는 `data-bc-*`, `renderer-dom` 과
   * `renderer-react` 는 `data-decorator-*`. 여기 셋만 적혀 있어서 `data-bc-decorator-sid` 만 붙은
   * 요소가 데코레이터로 안 세어졌다.
   *
   * 실제로는 그 렌더러가 같은 요소에 `data-bc-decorator` 도 쓰므로 제품에서는 걸렸다. 걸리지 않는
   * 것은 그 하나만 세우는 **검사의 픽스처**였고, 그래서 이 결함은 검사에서만 보였다 — 픽스처가
   * 제품보다 좁은 모양을 세우면 그 좁음이 결함으로 보인다.
   */
  return !!(
    el.hasAttribute('data-decorator-sid') ||
    el.hasAttribute('data-bc-decorator') ||
    el.hasAttribute('data-bc-decorator-sid') ||
    el.hasAttribute('data-decorator-category')
  );
}

/**
 * Whether a decorator's text belongs to the document or to the decorator.
 *
 * The two kinds are not alike and the decorator system already says which is
 * which. An **inline** decorator wraps a range of text that is already there —
 * a search hit, a commented phrase — so the text inside it is the node's own
 * and has to be indexed like any other. Every other category draws something of
 * its own: a widget, a badge, a layer, none of which the model has a character
 * for, and indexing them would push every offset after them out of step.
 *
 * Skipping *all* of them was a silent, compounding fault. A commented phrase was
 * dropped from the index, so a paragraph of 68 characters indexed as 58 and
 * every model offset at or past the comment resolved to the wrong text node.
 * Measured after commenting on ten characters: the model held `[35..45]`, and
 * the DOM selection built from it landed in the *following* run at `[0..10]`.
 * Backspace then deleted a stretch nobody had selected.
 *
 * It stayed hidden because the DOM selection was the arbiter of what an edit
 * did, so the browser's own (correct) selection covered for the index being
 * wrong. It surfaces the moment the model is trusted to finish its own edits.
 */
function isDecoratorOwnText(el: Element): boolean {
  /**
   * **종류를 적는 이름이 둘이다** — 그리기 경로가 둘이기 때문이다.
   *
   * | 누가 그리나 | 종류를 어디에 적나 |
   * |---|---|
   * | `renderer-dom` · `renderer-react` | `data-decorator-category` (`decorator.category` 그대로) |
   * | `editor-view-dom/decorator/decorator-renderer` | **`data-bc-decorator`** (`'layer'`·`'inline'`·`'block'`) |
   *
   * 여기서는 앞의 것만 보고 있었다. 그래서 `editor-view-dom` 의 데코레이터 렌더러가 그린 **인라인**
   * 데코레이터는 `data-bc-decorator="inline"` 인데 종류를 못 읽어 *자기 것을 그리는 것* 으로 세어졌고,
   * 그것이 감싼 **문서 자신의 글자가 색인에서 빠졌다.**
   *
   * 두 이름을 다 읽는다. 이름을 하나로 합치는 것이 옳지만 그건 렌더러 두 곳과 그 검사들의 일이고,
   * 여기서 한 이름만 아는 채로 두면 그 통합이 끝날 때까지 색인이 조용히 틀린다.
   */
  const said = el.getAttribute('data-decorator-category') ?? el.getAttribute('data-bc-decorator');
  return said !== 'inline';
}

export function buildTextRunIndex(
  containerEl: Element,
  containerId?: string,
  options?: { buildReverseMap?: boolean; excludePredicate?: (el: Element) => boolean }
): ContainerRuns {
  const runs: TextRun[] = [];
  let total = 0;
  const byNode = options?.buildReverseMap ? new Map<Text, { start: number; end: number; domStart: number }>() : undefined;

  const childNodes = Array.from(containerEl.childNodes);

  /**
   * Add a run for one text node. Renderer-owned filler characters are removed
   * here rather than by skipping the element that holds them: the browser types
   * and composes *into* the filler node, so once real text arrives the node
   * carries both and only the filler must be dropped.
   */
  const addRun = (textNode: Text): void => {
    const raw = textNode.textContent ?? '';
    const stripped = stripFiller(raw);
    /**
     * The run is as long as the text is. Whitespace is not trimmed and a run of
     * nothing but whitespace still counts.
     *
     * This used to take a `normalizeWhitespace` option, on by default, that
     * trimmed each run and skipped any that was only whitespace. Five of the six
     * callers passed `false`; the sixth — the DOM→model direction of the
     * selection handler — did not, so the two directions of the same conversion
     * were reading two different indexes, differing by exactly the whitespace.
     *
     * That is not a rounding error, it is a caret that will not move. Bold a
     * word and hold Shift and the right arrow: the selection grows to the end of
     * the marked run and stops dead, however many times it is pressed. The mark
     * splits the paragraph, one of the pieces is a lone space, and a lone space
     * got no run at all — so the browser's position inside it had no entry in
     * the reverse map, the conversion fell back to snapping to a run boundary,
     * and the model came back with the offset it started from. The app then
     * wrote that answer to the DOM, undoing the browser's move, once per press:
     *
     *     press 1   dom " "@1  ->  model 35  ->  dom " "@0
     *     press 2   dom " "@1  ->  model 35  ->  dom " "@0
     *
     * An index whose whole purpose is to say which character sits where cannot
     * hold a different text than the one on the page. So there is no option any
     * more, and no default to get wrong.
     */
    if (stripped.length === 0) return;

    let domStart = 0;
    while (domStart < raw.length && raw[domStart] === FILLER_CHAR) domStart++;

    const start = total;
    const end = start + stripped.length;
    runs.push({ domTextNode: textNode, start, end, text: stripped, domStart });
    if (byNode) byNode.set(textNode, { start, end, domStart });
    total = end;
  };

  for (const child of childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      addRun(child as Text);
      continue;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;

      // A decorator that wraps the document's own text is walked into; one that
      // draws its own content is skipped. See `isDecoratorOwnText`.
      if (isDecoratorElement(el) && isDecoratorOwnText(el)) continue;
      if (options?.excludePredicate && options.excludePredicate(el)) continue;

      const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node: Node) => {
            let parent: Node | null = node.parentNode;
            while (parent && parent !== el) {
              if (parent.nodeType === Node.ELEMENT_NODE) {
                const parentEl = parent as Element;
                if (isDecoratorElement(parentEl) && isDecoratorOwnText(parentEl)) {
                  return NodeFilter.FILTER_REJECT;
                }
              }
              parent = parent.parentNode;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) {
        addRun(textNode);
      }
    }
  }

  const result: ContainerRuns = { runs, total, byNode };
  runIndexByElement.set(containerEl, result);
  if (containerId) runIndexById.set(containerId, result);
  return result;
}

export function getTextRunsByElement(containerEl: Element): ContainerRuns | undefined {
  return runIndexByElement.get(containerEl);
}

export function getTextRunsById(containerId: string): ContainerRuns | undefined {
  return runIndexById.get(containerId);
}

export function invalidateRunsByElement(containerEl: Element): void {
  runIndexByElement.delete(containerEl);
}

export function invalidateRunsById(containerId: string): void {
  runIndexById.delete(containerId);
}

export function binarySearchRun(runs: TextRun[], offset: number): number {
  let lo = 0, hi = runs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = runs[mid];
    if (offset < r.start) {
      hi = mid - 1;
    } else if (offset >= r.end) {
      lo = mid + 1;
    } else {
      ans = mid;
      break;
    }
  }
  return ans;
}
