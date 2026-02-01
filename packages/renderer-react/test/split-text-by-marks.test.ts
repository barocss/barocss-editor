import { describe, it, expect } from 'vitest';
import { splitTextByMarks } from '../src/utils/marks';

describe('splitTextByMarks', () => {
  it('returns empty array for empty text', () => {
    expect(splitTextByMarks('', [])).toEqual([]);
    expect(splitTextByMarks('', [{ stype: 'bold' }])).toEqual([]);
  });

  it('returns single run when no marks', () => {
    const runs = splitTextByMarks('hello', []);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ start: 0, end: 5, text: 'hello', types: [] });
  });

  it('applies global mark to entire text', () => {
    const runs = splitTextByMarks('hello', [{ stype: 'bold' }]);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('hello');
    expect(runs[0].types).toEqual(['bold']);
  });

  it('splits by single range mark', () => {
    const runs = splitTextByMarks('hello', [{ stype: 'bold', range: [1, 4] }]);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toEqual({ start: 0, end: 1, text: 'h', types: [] });
    expect(runs[1]).toEqual({ start: 1, end: 4, text: 'ell', types: ['bold'] });
    expect(runs[2]).toEqual({ start: 4, end: 5, text: 'o', types: [] });
  });

  it('clamps range beyond text length', () => {
    const runs = splitTextByMarks('hi', [{ stype: 'bold', range: [0, 100] }]);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('hi');
    expect(runs[0].types).toEqual(['bold']);
  });

  it('overlapping marks produce correct types per run', () => {
    const runs = splitTextByMarks('abcdef', [
      { stype: 'bold', range: [1, 4] },
      { stype: 'italic', range: [2, 5] },
    ]);
    expect(runs).toHaveLength(5);
    expect(runs[0].text).toBe('a');
    expect(runs[0].types).toEqual([]);
    expect(runs[1].text).toBe('b');
    expect(runs[1].types).toEqual(['bold']);
    expect(runs[2].text).toBe('cd');
    expect(runs[2].types).toContain('bold');
    expect(runs[2].types).toContain('italic');
    expect(runs[3].text).toBe('e');
    expect(runs[3].types).toEqual(['italic']);
    expect(runs[4].text).toBe('f');
    expect(runs[4].types).toEqual([]);
  });

  it('range with end <= start is skipped (no extra boundary)', () => {
    const runs = splitTextByMarks('ab', [{ stype: 'bold', range: [3, 1] }]);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('ab');
    expect(runs[0].types).toEqual([]);
  });
});
