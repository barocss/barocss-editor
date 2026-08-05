/**
 * Where a line begins, as a text offset.
 *
 * A paginated block knows it should break after its third line; to draw that
 * break the renderer needs a character position, because that is what a widget
 * anchors to. The browser knows where the lines are and will not say which
 * characters they hold, so the answer is found by asking it where a character is
 * and narrowing down — a binary search over the offsets of one line.
 *
 * Measured, like everything else about lines, because it depends on the width.
 */

/** A text node and the offset range it covers within its block. */
interface TextSpan {
  node: Text;
  start: number;
  end: number;
  /** The model node this text belongs to, which is what a widget anchors to. */
  sid: string | null;
  /** Where this text begins within that node. */
  sidOffset: number;
}

/** Where a line begins, as a model node and an offset inside it. */
export interface LineAnchor {
  sid: string;
  offset: number;
}

/** Text nodes of an element, with their offsets within it. */
function textSpans(el: Element): TextSpan[] {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const spans: TextSpan[] = [];
  const consumed = new Map<string, number>();
  let offset = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    if (length > 0) {
      // A widget anchors to a model node, so each run has to remember which one
      // it came from and how much of that node's text came before it — marks
      // split one node's text across several elements.
      const owner = node.parentElement?.closest('[data-bc-sid]') ?? null;
      const sid = owner?.getAttribute('data-bc-sid') ?? null;
      const sidOffset = sid ? (consumed.get(sid) ?? 0) : 0;
      if (sid) consumed.set(sid, sidOffset + length);

      spans.push({ node, start: offset, end: offset + length, sid, sidOffset });
      offset += length;
    }
    node = walker.nextNode() as Text | null;
  }
  return spans;
}

/** The model node and offset a block-relative offset falls at. */
function anchorAt(spans: TextSpan[], offset: number): LineAnchor | undefined {
  for (const span of spans) {
    if (offset < span.start || offset > span.end) continue;
    if (!span.sid) continue;
    return { sid: span.sid, offset: span.sidOffset + (offset - span.start) };
  }
  return undefined;
}

/** The top of the line the character at `offset` sits on. */
function lineTopAt(spans: TextSpan[], offset: number): number | undefined {
  for (const span of spans) {
    if (offset < span.start || offset >= span.end) continue;

    const range = span.node.ownerDocument.createRange();
    range.setStart(span.node, offset - span.start);
    range.setEnd(span.node, offset - span.start + 1);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    return rect.height > 0 ? rect.top : undefined;
  }
  return undefined;
}

/**
 * The text offset at which each line after the first begins.
 *
 * Returns one offset per line boundary, so a block of four lines gives three.
 * A block whose lines cannot be told apart — no text, or text the browser lays
 * out in one line — gives none, which is the honest answer: there is nowhere
 * inside it to break.
 */
export function lineStartOffsets(el: Element): LineAnchor[] {
  const spans = textSpans(el);
  if (spans.length === 0) return [];

  const total = spans[spans.length - 1].end;
  const offsets: LineAnchor[] = [];

  let lineTop = lineTopAt(spans, 0);
  if (lineTop === undefined) return [];

  let cursor = 0;
  while (cursor < total) {
    // Find the first offset after `cursor` whose line differs. Linear scanning
    // would be one range per character; this halves the interval instead, which
    // matters on a paragraph of several thousand characters.
    let low = cursor;
    let high = total;
    let found = -1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const top = lineTopAt(spans, mid);
      if (top !== undefined && top > lineTop + 1) {
        found = mid;
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    if (found < 0) break;
    const anchor = anchorAt(spans, found);
    if (anchor) offsets.push(anchor);
    lineTop = lineTopAt(spans, found) ?? lineTop;
    cursor = found;
  }

  return offsets;
}
