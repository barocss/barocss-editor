import { describe, expect, it } from 'vitest';
import { selectionResizeHandles } from '../src/selection-handles';

describe('screen-space selection handles', () => {
  it('keeps all handles when the hit areas fit', () => expect(selectionResizeHandles(32, 32)).toHaveLength(8));
  it('keeps one useful corner on a tiny object', () => expect(selectionResizeHandles(12, 12)).toEqual(['se']));
  it('keeps the active handle on a tiny object', () => expect(selectionResizeHandles(4, 4, 'nw')).toEqual(['nw']));
  it('rejects invalid dimensions', () => expect(selectionResizeHandles(NaN, -1)).toEqual([]));
  it('does not overlap targets on thin or small objects', () => {
    for (const width of [0, 1, 12, 16, 20, 31, 32, 100]) for (const height of [0, 1, 12, 16, 20, 31, 32, 100]) {
      const handles = selectionResizeHandles(width, height);
      const point = (h: string) => [h.includes('w') ? 0 : h.includes('e') ? width : width / 2, h.startsWith('n') ? 0 : h.startsWith('s') ? height : height / 2];
      for (let i = 0; i < handles.length; i++) for (let j = i + 1; j < handles.length; j++) {
        const [x,y] = point(handles[i]), [u,v] = point(handles[j]);
        expect(Math.abs(x-u) >= 16 || Math.abs(y-v) >= 16).toBe(true);
      }
    }
  });
});
