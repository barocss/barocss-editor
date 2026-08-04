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
  options?: { buildReverseMap?: boolean; excludePredicate?: (el: Element) => boolean; normalizeWhitespace?: boolean }
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
    const textForLength = options?.normalizeWhitespace !== false ? stripped.trim() : stripped;
    if (textForLength.length === 0) return;

    let domStart = 0;
    while (domStart < raw.length && raw[domStart] === FILLER_CHAR) domStart++;

    const start = total;
    const end = start + textForLength.length;
    runs.push({ domTextNode: textNode, start, end, text: textForLength, domStart });
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
