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
  return !!(
    el.hasAttribute('data-decorator-sid') ||
    el.hasAttribute('data-bc-decorator') ||
    el.hasAttribute('data-decorator-category')
  );
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

      if (isDecoratorElement(el)) continue;
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
                if (isDecoratorElement(parentEl)) return NodeFilter.FILTER_REJECT;
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
