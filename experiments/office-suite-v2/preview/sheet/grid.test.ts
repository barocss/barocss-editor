import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID, cellRect, columnLabel, drawGrid, hitTest, visibleRange } from './grid.ts';
import type { Viewport } from './grid.ts';

const view: Viewport = { width: 408, height: 180, scrollLeft: 0, scrollTop: 0 };

test('visible range is bounded by CSS viewport and sheet dimensions', () => {
  assert.deepEqual(visibleRange(view, 40, 24), { rowStart: 0, rowEnd: 5, columnStart: 0, columnEnd: 3 });
  assert.deepEqual(visibleRange({ ...view, scrollLeft: 121, scrollTop: 31 }, 40, 24), { rowStart: 1, rowEnd: 7, columnStart: 1, columnEnd: 5 });
  assert.deepEqual(visibleRange({ ...view, scrollLeft: 23 * 120, scrollTop: 39 * 30 }, 40, 24), { rowStart: 39, rowEnd: 40, columnStart: 23, columnEnd: 24 });
  assert.deepEqual(visibleRange({ ...view, scrollLeft: 10000, scrollTop: 10000 }, 40, 24), { rowStart: 40, rowEnd: 40, columnStart: 24, columnEnd: 24 });
  assert.deepEqual(visibleRange({ ...view, width: GRID.rowHeader, height: GRID.columnHeader }, 40, 24), { rowStart: 0, rowEnd: 0, columnStart: 0, columnEnd: 0 });
});

test('fixed headers and viewport edges never hit cells', () => {
  for (const [x, y] of [[0, 0], [47, 31], [49, 29], [408, 31], [49, 180], [-1, 40], [NaN, 40]]) {
    assert.equal(hitTest(x!, y!, view, 40, 24), null);
  }
  assert.deepEqual(hitTest(48, 30, view, 40, 24), { row: 0, column: 0 });
  assert.deepEqual(hitTest(168, 60, view, 40, 24), { row: 1, column: 1 });
  assert.equal(hitTest(288, 120, view, 2, 2), null);
});

test('partial scroll preserves CSS cell rectangles and hit targets', () => {
  const scrolled = { ...view, scrollLeft: 135, scrollTop: 45 };
  assert.deepEqual(cellRect(1, 1, scrolled), { x: 33, y: 15, width: 120, height: 30 });
  assert.deepEqual(hitTest(48, 30, scrolled, 40, 24), { row: 1, column: 1 });
  assert.deepEqual(hitTest(153, 45, scrolled, 40, 24), { row: 2, column: 2 });
  assert.deepEqual(cellRect(2, 2, scrolled), { x: 153, y: 45, width: 120, height: 30 });
});

test('column labels use spreadsheet zero-based coordinates', () => {
  assert.deepEqual([0, 25, 26, 51, 52, 701, 702].map(columnLabel), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  assert.throws(() => columnLabel(-1), RangeError);
  assert.throws(() => columnLabel(0.5), RangeError);
});

test('DPR changes backing resolution only and reads only visible cells', () => {
  const transforms: number[][] = [];
  const context = {
    setTransform: (...args: number[]) => transforms.push(args),
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
  };
  const canvas = { width: 0, height: 0, style: { width: '', height: '' }, getContext: () => context } as unknown as HTMLCanvasElement;
  const scrolled = { ...view, scrollLeft: 135, scrollTop: 45 };
  const seen: string[] = [];
  const read = (row: number, column: number) => { seen.push(`${row}:${column}`); return { text: 'native value', state: 'fresh' }; };
  drawGrid(canvas, scrolled, 1, 40, 24, { row: 2, column: 2 }, read);
  const first = [...seen];
  seen.length = 0;
  drawGrid(canvas, scrolled, 2, 40, 24, { row: 2, column: 2 }, read);
  assert.deepEqual(seen, first);
  assert.equal(new Set(seen).size, 24);
  assert.equal(seen[0], '1:1');
  assert.equal(seen.at(-1), '6:4');
  assert.equal(canvas.width, view.width * 2);
  assert.equal(canvas.height, view.height * 2);
  assert.deepEqual(canvas.style, { width: '408px', height: '180px' });
  assert.deepEqual(transforms, [[1, 0, 0, 1, 0, 0], [2, 0, 0, 2, 0, 0]]);
  assert.deepEqual(hitTest(153, 45, scrolled, 40, 24), { row: 2, column: 2 });
});
