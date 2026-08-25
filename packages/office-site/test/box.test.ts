import { describe, expect, it } from 'vitest';
import { stackCss } from '../src/renderers';

/**
 * The two things a page's box says that a canvas's does not.
 *
 * Both came out of one sweep — for each node type, which of its declared attributes the property
 * panel offers — and both turned out to be about the *model* rather than about the panel, which is
 * why they are tested here rather than in the browser.
 */
describe('a stack on a page', () => {
  it('does not clip unless it is asked to', () => {
    /*
     * `frameCss` writes `overflow: hidden` unless a node says otherwise, and on a canvas that is
     * what a frame is: a stated size, and a window onto what it holds. A page's box has no stated
     * size, so clipping shows up only when something deliberately leaves the box — and then it shows
     * by deleting it. Measured on the sample: nine stacks clipping on the desktop board, and no
     * control in the product to stop one, so an overlapping design was unreachable.
     */
    expect(stackCss({}).overflow).toBe('visible');
    expect(stackCss({ layoutMode: 'row', gap: 240 }).overflow).toBe('visible');
  });

  it('clips when it is', () => {
    // A reader asking for a window still gets one — the attribute means what it says.
    expect(stackCss({ clipsContent: true }).overflow).toBe('hidden');
    // And `false` is not the same as silence to the reader, even though it draws the same: it
    // survives a change of default, which is the whole reason to write it down.
    expect(stackCss({ clipsContent: false }).overflow).toBe('visible');
  });

  it('rounds its corners, in twips like every other length', () => {
    // 15 twips to the pixel. A frame had no radius at all until a page needed one — the shape that
    // could be rounded (`rectangle`) is the one that arranges nothing.
    expect(stackCss({ cornerRadius: 240 }).borderRadius).toBe('16px');
    expect(stackCss({ cornerRadius: 0 }).borderRadius).toBeUndefined();
    expect(stackCss({}).borderRadius).toBeUndefined();
  });

  it('still stretches its children unless it says otherwise', () => {
    // The default that was already here, kept in the same place as the new one.
    expect(stackCss({}).alignItems).toBe('stretch');
    /*
     * With an arrangement, because that is the only time there is a cross axis to sit on:
     * `frameCss` states `alignItems` in its row/column/grid branches and nowhere else, so a stack
     * that arranges nothing has no alignment to disagree about.
     */
    expect(stackCss({ layoutMode: 'row', alignItems: 'center' }).alignItems).toBe('center');
    expect(stackCss({ layoutMode: 'row' }).alignItems).toBe('stretch');
  });
});
