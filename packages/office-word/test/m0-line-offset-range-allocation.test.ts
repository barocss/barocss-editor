import { afterEach, describe, expect, it, vi } from 'vitest';
import { lineStartOffsets } from '../src/line-offsets';

type Probe = { text: string; start: number; end: number; top?: number; height?: number; error?: string };

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

/** Keep real DOM Range endpoint operations; control only its geometry query. */
function observe(geometry: (text: Text, offset: number) => { top: number; height: number }) {
  const create = document.createRange.bind(document);
  const ranges: Range[] = [];
  const queries: Probe[] = [];
  const detached: Range[] = [];
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = create(); ranges.push(range);
    const detach = range.detach.bind(range);
    vi.spyOn(range, 'detach').mockImplementation(() => { detached.push(range); detach(); });
    Object.defineProperty(range, 'getBoundingClientRect', { configurable: true, value: () => {
      expect(range.startContainer).toBeInstanceOf(Text);
      expect(range.endContainer).toBe(range.startContainer);
      expect(range.endOffset).toBe(range.startOffset + 1);
      const text = range.startContainer as Text;
      const endpoints = { text: text.data, start: range.startOffset, end: range.endOffset };
      try {
        const result = geometry(text, range.startOffset);
        queries.push({ ...endpoints, ...result });
        return new DOMRect(20, result.top, 8, result.height);
      } catch (error) {
        queries.push({ ...endpoints, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    } });
    return range;
  });
  return { ranges, queries, detached };
}

function paragraph(html: string): HTMLElement {
  const el = document.createElement('p'); el.innerHTML = html; document.body.append(el); return el;
}

function proof(name: string, anchors: unknown, observed: ReturnType<typeof observe>) {
  console.info('RANGE_PROOF', JSON.stringify({ case: name, anchors, queries: observed.queries,
    constructed: observed.ranges.length, detached: observed.detached.length }));
}

describe('M0 actual lineStartOffsets Range allocation', () => {
  it('bounds Range construction while preserving the actual multiline probe sequence', () => {
    const el = paragraph('<span data-bc-sid="run">abcdefghijkl</span>');
    const observed = observe((_text, offset) => ({ top: 10 + Math.floor(offset / 4) * 20, height: 16 }));
    const anchors = lineStartOffsets(el);
    const offsets = [0, 6, 3, 5, 4, 4, 8, 6, 7, 8, 10, 11];
    expect(anchors).toEqual([{ sid: 'run', offset: 4 }, { sid: 'run', offset: 8 }]);
    expect(observed.queries).toEqual(offsets.map(start => ({ text: 'abcdefghijkl', start, end: start + 1,
      top: 10 + Math.floor(start / 4) * 20, height: 16 })));
    proof('multiline', anchors, observed);
    expect(observed.ranges, 'one invocation must construct at most one actual DOM Range').toHaveLength(1);
    expect(observed.detached).toEqual(observed.ranges);
  });

  it('preserves cumulative offsets in marked runs sharing a SID and across different SIDs', () => {
    const el = paragraph('<span data-bc-sid="s">AABB<strong>CCDD</strong></span><span data-bc-sid="t">EEFFGGHH</span>');
    const tops: Record<string, number[]> = { AABB: [10, 10, 10, 30], CCDD: [30, 30, 50, 50], EEFFGGHH: [50, 70, 70, 70, 90, 90, 90, 110] };
    const observed = observe((text, offset) => ({ top: tops[text.data][offset], height: 16 }));
    const anchors = lineStartOffsets(el);
    expect(anchors).toEqual([{ sid: 's', offset: 3 }, { sid: 's', offset: 6 },
      { sid: 't', offset: 1 }, { sid: 't', offset: 4 }, { sid: 't', offset: 7 }]);
    proof('marked-and-multiple-sids', anchors, observed);
    expect(observed.ranges).toHaveLength(1);
    expect(observed.detached).toEqual(observed.ranges);
  });

  it('uses current float bands while keeping the measured probe algorithm', () => {
    const el = paragraph('<span data-bc-sid="float">abcdefghijklmnop</span>');
    const observed = observe((_text, offset) => ({ top: 10 + Math.floor(offset / 4) * 20, height: 16 }));
    const grouped = lineStartOffsets(el, [10, 50]);
    const separate = lineStartOffsets(el, [10, 30, 50, 70]);
    expect(grouped).toEqual([{ sid: 'float', offset: 8 }]);
    expect(separate).toEqual([4, 8, 12].map(offset => ({ sid: 'float', offset })));
    const half = observed.queries.length / 2;
    expect(observed.queries.slice(0, half)).toEqual(observed.queries.slice(half));
    proof('float-bands', { grouped, separate }, observed);
    expect(observed.ranges).toHaveLength(2);
    expect(new Set(observed.ranges).size).toBe(2);
    expect(observed.detached).toEqual(observed.ranges);
  });

  it('excludes display-only page and table-cell breaks but retains highlighted document text', () => {
    const el = paragraph('<span data-bc-sid="run">abcd<span class="w-page-break">DISPLAY PAGE</span><em>efgh</em><span class="w-table-cell-break"><b>DISPLAY CELL</b></span><mark data-bc-chrome="true">ijkl</mark></span>');
    const tops: Record<string, number> = { abcd: 10, efgh: 30, ijkl: 50 };
    const observed = observe(text => {
      expect(text.data.startsWith('DISPLAY')).toBe(false);
      return { top: tops[text.data], height: 16 };
    });
    const anchors = lineStartOffsets(el);
    expect(anchors).toEqual([{ sid: 'run', offset: 4 }, { sid: 'run', offset: 8 }]);
    proof('display-only-breaks', anchors, observed);
    expect(observed.ranges).toHaveLength(1);
    expect(observed.detached).toEqual(observed.ranges);
  });

  it('does not construct a Range for empty text', () => {
    const el = paragraph('<span data-bc-sid="empty"></span>');
    const observed = observe(() => ({ top: 10, height: 16 }));
    const anchors = lineStartOffsets(el);
    expect(anchors).toEqual([]);
    proof('empty', anchors, observed);
    expect(observed.ranges).toEqual([]);
    expect(observed.queries).toEqual([]);
    expect(observed.detached).toEqual([]);
  });

  it.each([{ name: 'one-line', height: 16 }, { name: 'missing-rectangle', height: 0 }])('keeps $name honest', ({ name, height }) => {
    const el = paragraph('<span data-bc-sid="run">abcdefghijkl</span>');
    const observed = observe(() => ({ top: 10, height }));
    const anchors = lineStartOffsets(el);
    expect(anchors).toEqual([]);
    proof(name, anchors, observed);
    expect(observed.ranges).toHaveLength(1);
    expect(observed.detached).toEqual(observed.ranges);
  });

  it('reads changed text, geometry and bands on fresh calls without retaining a Range', () => {
    const el = paragraph('<span data-bc-sid="current">abcdefghijkl</span>');
    let width = 4, origin = 10;
    const observed = observe((_text, offset) => ({ top: origin + Math.floor(offset / width) * 30, height: 16 }));
    const first = lineStartOffsets(el);
    el.querySelector('span')!.firstChild!.textContent = 'abcdefghijklmnop';
    width = 8; origin = 80;
    const changed = lineStartOffsets(el, [80, 110]);
    const regrouped = lineStartOffsets(el, [80]);
    expect(first).toEqual([4, 8].map(offset => ({ sid: 'current', offset })));
    expect(changed).toEqual([{ sid: 'current', offset: 8 }]);
    expect(regrouped).toEqual([]);
    proof('fresh-text-geometry-bands', { first, changed, regrouped }, observed);
    expect(observed.ranges).toHaveLength(3);
    expect(new Set(observed.ranges).size).toBe(3);
    expect(observed.detached).toEqual(observed.ranges);
  });

  it('cleans up a throwing geometry query and lets the next invocation read fresh endpoints', () => {
    const el = paragraph('<span data-bc-sid="recover">abcdefghijkl</span>');
    let throwing = true;
    const observed = observe((_text, offset) => {
      if (throwing) throw new Error('controlled geometry failure');
      return { top: 10 + Math.floor(offset / 4) * 20, height: 16 };
    });
    expect(() => lineStartOffsets(el)).toThrow('controlled geometry failure');
    throwing = false;
    const anchors = lineStartOffsets(el);
    expect(anchors).toEqual([{ sid: 'recover', offset: 4 }, { sid: 'recover', offset: 8 }]);
    proof('throw-and-recover', anchors, observed);
    expect(observed.ranges).toHaveLength(2);
    expect(new Set(observed.ranges).size).toBe(2);
    expect(observed.detached).toEqual(observed.ranges);
  });
});
