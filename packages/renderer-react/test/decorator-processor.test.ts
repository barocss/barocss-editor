import { describe, it, expect } from 'vitest';
import {
  getDecoratorRange,
  findDecoratorsForNode,
  findInlineDecorators,
  categorizeDecorators,
  splitTextByDecorators,
  convertDecoratorRangesToMarkRunRelative,
} from '../src/decorator/processor';
import type { Decorator } from '../src/decorator/types';

function makeInline(sid: string, targetSid: string, start: number, end: number, position?: Decorator['position']): Decorator {
  return {
    sid,
    stype: 'chip',
    category: 'inline',
    target: { sid: targetSid, startOffset: start, endOffset: end },
    position,
  };
}

function makeBlock(sid: string, targetSid: string, position?: Decorator['position']): Decorator {
  return {
    sid,
    stype: 'comment',
    category: 'block',
    target: { sid: targetSid },
    position,
  };
}

describe('decorator processor', () => {
  describe('getDecoratorRange', () => {
    it('single-node target returns startOffset and endOffset', () => {
      const d: Decorator = {
        sid: 'd1',
        stype: 'chip',
        category: 'inline',
        target: { sid: 't1', startOffset: 2, endOffset: 5 },
      };
      expect(getDecoratorRange(d)).toEqual({ start: 2, end: 5 });
    });
    it('cross-node target returns startOffset and endOffset', () => {
      const d: Decorator = {
        sid: 'd1',
        stype: 'chip',
        category: 'inline',
        target: { startSid: 't1', startOffset: 0, endSid: 't2', endOffset: 3 },
      };
      expect(getDecoratorRange(d)).toEqual({ start: 0, end: 3 });
    });
    it('target without startOffset/endOffset returns undefined', () => {
      const d: Decorator = {
        sid: 'd1',
        stype: 'chip',
        category: 'inline',
        target: { sid: 't1' },
      };
      expect(getDecoratorRange(d)).toEqual({ start: undefined, end: undefined });
    });
  });

  describe('findDecoratorsForNode', () => {
    it('returns decorators whose target sid matches', () => {
      const list: Decorator[] = [
        makeInline('d1', 't1', 0, 5),
        makeBlock('d2', 't1'),
        makeInline('d3', 't2', 0, 1),
      ];
      expect(findDecoratorsForNode('t1', list).map((d) => d.sid)).toEqual(['d1', 'd2']);
    });
    it('returns empty when sid is undefined or empty', () => {
      expect(findDecoratorsForNode(undefined, [makeInline('d1', 't1', 0, 1)])).toEqual([]);
      expect(findDecoratorsForNode('', [makeInline('d1', 't1', 0, 1)])).toEqual([]);
    });
    it('returns empty when decorators is empty', () => {
      expect(findDecoratorsForNode('t1', [])).toEqual([]);
    });
    it('cross-node target: returns when node is startSid or endSid', () => {
      const d: Decorator = {
        sid: 'd1',
        stype: 'chip',
        category: 'inline',
        target: { startSid: 't1', startOffset: 0, endSid: 't2', endOffset: 1 },
      };
      expect(findDecoratorsForNode('t1', [d]).map((x) => x.sid)).toEqual(['d1']);
      expect(findDecoratorsForNode('t2', [d]).map((x) => x.sid)).toEqual(['d1']);
      expect(findDecoratorsForNode('t3', [d])).toEqual([]);
    });
    it('filters out decorators with missing or invalid target', () => {
      const list: Decorator[] = [
        makeInline('d1', 't1', 0, 1),
        // Deliberately malformed — the case under test — so it is cast once, here,
        // rather than by widening the array's type and losing the check on the rest.
        { sid: 'd2', stype: 'x', category: 'inline', target: null } as unknown as Decorator
      ].filter(Boolean);
      const withNull = [
        makeInline('d1', 't1', 0, 1),
        { sid: 'd2', stype: 'x', category: 'inline', target: undefined as any },
      ];
      expect(findDecoratorsForNode('t1', withNull as Decorator[]).map((d) => d.sid)).toEqual(['d1']);
    });
  });

  describe('findInlineDecorators', () => {
    it('returns only inline category decorators for the sid', () => {
      const list: Decorator[] = [
        makeInline('d1', 't1', 0, 5),
        makeBlock('d2', 't1'),
        makeInline('d3', 't2', 0, 1),
      ];
      expect(findInlineDecorators('t1', list).map((d) => d.sid)).toEqual(['d1']);
    });
  });

  describe('categorizeDecorators', () => {
    it('splits block, layer, inline', () => {
      const list: Decorator[] = [
        makeBlock('b1', 'p1'),
        makeInline('i1', 't1', 0, 1),
        { sid: 'l1', stype: 'x', category: 'layer', target: { sid: 'p1' } },
      ];
      const cat = categorizeDecorators(list);
      expect(cat.block.map((d) => d.sid)).toEqual(['b1']);
      expect(cat.inline.map((d) => d.sid)).toEqual(['i1']);
      expect(cat.layer.map((d) => d.sid)).toEqual(['l1']);
    });
    it('skips decorators without category or with unknown category', () => {
      const list: Decorator[] = [
        makeBlock('b1', 'p1'),
        { sid: 'noCat', stype: 'x', category: '' as any, target: { sid: 'p1' } },
        { sid: 'unknown', stype: 'x', category: 'other' as any, target: { sid: 'p1' } },
      ];
      const cat = categorizeDecorators(list);
      expect(cat.block.map((d) => d.sid)).toEqual(['b1']);
      expect(cat.inline.length).toBe(0);
      expect(cat.layer.length).toBe(0);
    });
  });

  describe('splitTextByDecorators', () => {
    it('empty text or no decorators returns single run', () => {
      expect(splitTextByDecorators('', [makeInline('d1', 't1', 0, 5)])).toEqual([
        { text: '', start: 0, end: 0 },
      ]);
      expect(splitTextByDecorators('Hello', [])).toEqual([{ text: 'Hello', start: 0, end: 5 }]);
    });
    it('single range splits into decorated and plain', () => {
      const text = 'Hello world';
      const runs = splitTextByDecorators(text, [makeInline('d1', 't1', 0, 5)]);
      expect(runs).toHaveLength(2);
      expect(runs[0]).toMatchObject({ text: 'Hello', start: 0, end: 5, decorator: expect.objectContaining({ sid: 'd1' }) });
      expect(runs[1]).toMatchObject({ text: ' world', start: 5, end: 11 });
      expect(runs[1].decorator).toBeUndefined();
    });
    it('two non-overlapping ranges produce three runs', () => {
      const text = 'ABC DEF GHI';
      const runs = splitTextByDecorators(text, [
        makeInline('d1', 't1', 0, 3),
        makeInline('d2', 't1', 8, 11),
      ]);
      expect(runs).toHaveLength(3);
      expect(runs[0].text).toBe('ABC');
      expect(runs[0].decorator?.sid).toBe('d1');
      expect(runs[1].text).toBe(' DEF ');
      expect(runs[1].decorator).toBeUndefined();
      expect(runs[2].text).toBe('GHI');
      expect(runs[2].decorator?.sid).toBe('d2');
    });
    it('adjacent ranges [0,3] and [3,6] produce two runs', () => {
      const text = 'ABCDEF';
      const runs = splitTextByDecorators(text, [
        makeInline('d1', 't1', 0, 3),
        makeInline('d2', 't1', 3, 6),
      ]);
      expect(runs).toHaveLength(2);
      expect(runs[0]).toMatchObject({ text: 'ABC', start: 0, end: 3 });
      expect(runs[1]).toMatchObject({ text: 'DEF', start: 3, end: 6 });
    });
    it('overlapping ranges produce boundaries at union of boundaries', () => {
      const text = 'ABCDEFGH';
      const runs = splitTextByDecorators(text, [
        makeInline('d1', 't1', 0, 5),
        makeInline('d2', 't1', 3, 8),
      ]);
      expect(runs.length).toBeGreaterThanOrEqual(2);
      const fullText = runs.map((r) => r.text).join('');
      expect(fullText).toBe(text);
    });
    it('range clamped to text length', () => {
      const text = 'Hi';
      const runs = splitTextByDecorators(text, [makeInline('d1', 't1', 0, 100)]);
      expect(runs).toHaveLength(1);
      expect(runs[0].text).toBe('Hi');
      expect(runs[0].decorator?.sid).toBe('d1');
    });
    it('single character text with decorator on [0,1]', () => {
      const text = 'X';
      const runs = splitTextByDecorators(text, [makeInline('d1', 't1', 0, 1)]);
      expect(runs).toHaveLength(1);
      expect(runs[0].text).toBe('X');
      expect(runs[0].decorator?.sid).toBe('d1');
    });
    it('range with start >= end is skipped (no boundary added)', () => {
      const text = 'Hello';
      const runs = splitTextByDecorators(text, [
        makeInline('d1', 't1', 2, 2),
        makeInline('d2', 't1', 3, 2),
      ]);
      expect(runs).toHaveLength(1);
      expect(runs[0].text).toBe('Hello');
      expect(runs[0].decorator).toBeUndefined();
    });
    it('non-inline decorators are ignored by splitTextByDecorators', () => {
      const text = 'Hello';
      const blockDec = makeBlock('b1', 't1');
      const runs = splitTextByDecorators(text, [blockDec as Decorator]);
      expect(runs).toHaveLength(1);
      expect(runs[0].text).toBe('Hello');
      expect(runs[0].decorator).toBeUndefined();
    });
  });

  describe('convertDecoratorRangesToMarkRunRelative', () => {
    it('converts full-text range to relative to mark run', () => {
      const decorators = [makeInline('d1', 't1', 2, 5)];
      const markRun = { start: 1, end: 6, text: 'ellow' };
      const out = convertDecoratorRangesToMarkRunRelative(decorators, markRun);
      expect(out).toHaveLength(1);
      expect(out[0].target).toMatchObject({ sid: 't1', startOffset: 1, endOffset: 4 });
    });
    it('filters out decorators that do not overlap mark run', () => {
      const decorators = [
        makeInline('d1', 't1', 0, 2),
        makeInline('d2', 't1', 10, 12),
      ];
      const markRun = { start: 3, end: 8, text: 'hello' };
      const out = convertDecoratorRangesToMarkRunRelative(decorators, markRun);
      expect(out).toHaveLength(0);
    });
    it('partial overlap clamps to mark run', () => {
      const decorators = [makeInline('d1', 't1', 1, 10)];
      const markRun = { start: 2, end: 6, text: 'abcd' };
      const out = convertDecoratorRangesToMarkRunRelative(decorators, markRun);
      expect(out).toHaveLength(1);
      expect(out[0].target).toMatchObject({ startOffset: 0, endOffset: 4 });
    });
    it('empty mark run (start === end): overlapping decorator yields relative range 0 to 0', () => {
      const decorators = [makeInline('d1', 't1', 0, 5)];
      const markRun = { start: 2, end: 2, text: '' };
      const out = convertDecoratorRangesToMarkRunRelative(decorators, markRun);
      expect(out).toHaveLength(1);
      expect(out[0].target).toMatchObject({ startOffset: 0, endOffset: 0 });
    });
  });
});
