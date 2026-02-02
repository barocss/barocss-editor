export interface TextRun {
  domTextNode: Text;
  start: number; // inclusive
  end: number;   // exclusive
}

export interface ContainerRuns {
  runs: TextRun[];
  total: number;
  byNode?: Map<Text, { start: number; end: number }>;
}

const runIndexByElement = new WeakMap<Element, ContainerRuns>();
const runIndexById = new Map<string, ContainerRuns>();

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
  const byNode = options?.buildReverseMap ? new Map<Text, { start: number; end: number }>() : undefined;

  const childNodes = Array.from(containerEl.childNodes);

  for (const child of childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const textNode = child as Text;
      const textContent = textNode.textContent ?? '';
      const textForLength = options?.normalizeWhitespace !== false ? textContent.trim() : textContent;

      if (textForLength.length > 0) {
        const length = textForLength.length;
        const start = total;
        const end = start + length;
        const run: TextRun = { domTextNode: textNode, start, end };
        runs.push(run);
        if (byNode) byNode.set(textNode, { start, end });
        total = end;
      }
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
        const textContent = textNode.textContent ?? '';
        const textForLength = options?.normalizeWhitespace !== false ? textContent.trim() : textContent;

        if (textForLength.length > 0) {
          const length = textForLength.length;
          const start = total;
          const end = start + length;
          const run: TextRun = { domTextNode: textNode, start, end };
          runs.push(run);
          if (byNode) byNode.set(textNode, { start, end });
          total = end;
        }
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
