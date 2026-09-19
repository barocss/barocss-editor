// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { visibleRangeRect } from '../src/range-anchor';

function fixture(rects: DOMRect[], collapsed = false) {
  const parent = document.createElement('div');
  parent.textContent = 'Selected text'; document.body.append(parent);
  const range = document.createRange(); range.selectNodeContents(parent.firstChild!);
  if (collapsed) range.collapse(true);
  range.getClientRects = () => rects as unknown as DOMRectList;
  range.getBoundingClientRect = () => rects[0];
  parent.style.overflowY = 'auto';
  parent.getBoundingClientRect = () => new DOMRect(10, 50, 300, 100);
  Object.defineProperties(parent, { clientHeight: { value: 100 }, clientWidth: { value: 300 } });
  return { parent, range };
}
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it('anchors to the first visible line and crops a partly clipped line', () => {
  const { range } = fixture([new DOMRect(20, 10, 80, 20), new DOMRect(20, 45, 90, 20)]);
  expect(visibleRangeRect(range)?.toJSON()).toMatchObject({ x: 20, y: 50, width: 90, height: 15 });
});

it('hides fully clipped, hidden and detached selections', () => {
  const { parent, range } = fixture([new DOMRect(20, 160, 80, 20)]);
  expect(visibleRangeRect(range)).toBeNull();
  parent.style.overflowY = 'visible'; expect(visibleRangeRect(range)).not.toBeNull();
  parent.style.visibility = 'hidden'; expect(visibleRangeRect(range)).toBeNull();
  parent.style.visibility = ''; parent.remove(); range.selectNodeContents(parent.firstChild!); expect(visibleRangeRect(range)).toBeNull();
});

it('preserves zero-width caret anchors and respects the visual viewport', () => {
  const { range } = fixture([new DOMRect(20, 80, 0, 20)], true);
  expect(visibleRangeRect(range)?.width).toBe(0);
  vi.stubGlobal('visualViewport', { offsetLeft: 25, offsetTop: 0, width: 400, height: 300 });
  expect(visibleRangeRect(range)).toBeNull();
});
