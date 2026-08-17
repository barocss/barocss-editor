/**
 * A mark changes how text looks and never how much of it there is.
 *
 * This is the one property the rest of the mark tests cannot check. They compare
 * normalized HTML, and `normalizeHTML` runs every text node through
 * `.replace(/\s+/g, ' ').trim()` and then strips whitespace between tags — so a
 * marked space, a doubled space and no space at all all serialize identically.
 * The suite was structurally blind to the size of the text it was asserting on.
 *
 * It cost a real defect. A whitespace-only run — what a mark applied to a single
 * space produces, and a double-click between two words selects exactly that —
 * was pruned as an empty wrapper, so bolding a space *deleted* it. The model
 * kept the paragraph's 68 characters and the DOM drew 67: "this one is centred"
 * came out "this one iscentred". Every mark test passed throughout.
 *
 * Downstream it was worse than a missing space. The DOM was a character shorter
 * than the model from the mark onwards, so the run index built from the DOM
 * disagreed with the model at every later offset, and a selection converted
 * through it landed in the wrong place.
 *
 * So these tests assert on characters, not structure: whatever the wrappers turn
 * out to be, the text inside them is the model's, exactly. Nothing here is
 * normalized.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, defineMark, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';

/** One line of ordinary prose, with the spaces that broke it. */
const SENTENCE = 'this one is centred';

describe('a mark keeps every character', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    const registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    defineMark('bold', element('strong', { className: 'mark-bold' }, [data('text')]));
    defineMark('italic', element('em', { className: 'mark-italic' }, [data('text')]));
  });

  afterEach(() => {
    container.remove();
  });

  /** Render one text node with the given marks and hand back what was drawn. */
  const drawn = (text: string, marks: Array<{ stype: string; range: [number, number] }>) => {
    renderer.render(container, {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{ sid: 'text-1', stype: 'inline-text', text, marks }]
    } as never);
    return container.textContent ?? '';
  };

  it('draws unmarked text as it stands', () => {
    expect(drawn(SENTENCE, [])).toBe(SENTENCE);
  });

  it('keeps the text when a mark covers a word', () => {
    expect(drawn(SENTENCE, [{ stype: 'bold', range: [13, 19] }])).toBe(SENTENCE);
  });

  /**
   * The failing case, at its smallest: the mark covers one space and nothing
   * else. Double-clicking between two words in the browser selects precisely
   * this, so it is two clicks from any reader, not a corner.
   */
  it('keeps a space that is all a mark covers', () => {
    expect(drawn(SENTENCE, [{ stype: 'bold', range: [12, 13] }])).toBe(SENTENCE);
  });

  it('keeps the spaces between marked words', () => {
    // Two marks with one space left plain between them — that gap is its own
    // run, and its own chance to be pruned.
    expect(
      drawn(SENTENCE, [
        { stype: 'bold', range: [0, 4] },
        { stype: 'italic', range: [5, 8] }
      ])
    ).toBe(SENTENCE);
  });

  it('keeps a run of several spaces', () => {
    const spaced = 'a   b';
    expect(drawn(spaced, [{ stype: 'bold', range: [1, 4] }])).toBe(spaced);
  });

  it('keeps a leading and a trailing space', () => {
    const padded = ' middle ';
    expect(drawn(padded, [{ stype: 'bold', range: [1, 7] }])).toBe(padded);
  });

  it('keeps a tab and a newline', () => {
    const mixed = 'a\tb\nc';
    expect(drawn(mixed, [{ stype: 'bold', range: [1, 4] }])).toBe(mixed);
  });

  it('keeps the text when two marks overlap across a space', () => {
    expect(
      drawn(SENTENCE, [
        { stype: 'bold', range: [0, 13] },
        { stype: 'italic', range: [8, 19] }
      ])
    ).toBe(SENTENCE);
  });

  /**
   * Every single-character range in turn. The bug was one range wide, and the
   * cheapest way not to have to guess which one is to try all of them.
   */
  it('keeps the text whatever single character is marked', () => {
    for (let at = 0; at < SENTENCE.length; at += 1) {
      expect(drawn(SENTENCE, [{ stype: 'bold', range: [at, at + 1] }])).toBe(SENTENCE);
    }
  });

  /**
   * Zero-length ranges are the case the pruning was written for, and it should
   * still hold: a mark covering nothing draws nothing extra, and the text is
   * still the text.
   */
  it('keeps the text when a mark covers nothing at all', () => {
    expect(drawn(SENTENCE, [{ stype: 'bold', range: [5, 5] }])).toBe(SENTENCE);
  });
});

/**
 * The same property across two renders, with the wrappers both being spans.
 *
 * Two things above are deliberately different here, and the defect needed both.
 *
 * The marks are `<span class="mark-bold">` and `<span class="mark-italic">`,
 * which is how Word and Slides define theirs — not the `<strong>`/`<em>` of the
 * tests above. And the second mark arrives in a *second* render, the way a
 * reader applies it: bold, look at it, then italic.
 *
 * Nesting the second wrapper then pairs the new inner span with the outer one,
 * which is holding the text, and it kept it while the new inner span drew it
 * again — `"a bb c"` came out `"a bbbb c"`, and with an observer importing the
 * DOM back, into the model and round again. `<strong>` and `<em>` cannot pair
 * with a plain `<span>`, so every test that defined its marks that way was
 * blind to it.
 */
describe('a second mark, applied later, keeps every character', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    renderer = new DOMRenderer(getGlobalRegistry());
    container = document.createElement('div');
    document.body.appendChild(container);

    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    defineMark('bold', element('span', { className: 'mark-bold' }, [data('text')]));
    defineMark('italic', element('span', { className: 'mark-italic' }, [data('text')]));
  });

  afterEach(() => {
    container.remove();
  });

  /** Render into the same container, so the second call reconciles the first. */
  const redrawn = (text: string, marks: Array<{ stype: string; range: [number, number] }>) => {
    renderer.render(container, {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{ sid: 'text-1', stype: 'inline-text', text, marks }]
    } as never);
    return container.textContent ?? '';
  };

  const bold = (range: [number, number]) => ({ stype: 'bold', range });
  const italic = (range: [number, number]) => ({ stype: 'italic', range });

  it('nests a second mark over the same word', () => {
    expect(redrawn('a bb c', [bold([2, 4])])).toBe('a bb c');
    expect(redrawn('a bb c', [bold([2, 4]), italic([2, 4])])).toBe('a bb c');
  });

  it('nests a second mark over the same space', () => {
    expect(redrawn('a bb c', [bold([1, 2])])).toBe('a bb c');
    expect(redrawn('a bb c', [bold([1, 2]), italic([1, 2])])).toBe('a bb c');
  });

  it('nests a third', () => {
    defineMark('underline', element('span', { className: 'mark-underline' }, [data('text')]));
    expect(redrawn('a bb c', [bold([2, 4])])).toBe('a bb c');
    expect(redrawn('a bb c', [bold([2, 4]), italic([2, 4])])).toBe('a bb c');
    expect(
      redrawn('a bb c', [bold([2, 4]), italic([2, 4]), { stype: 'underline', range: [2, 4] }])
    ).toBe('a bb c');
  });

  it('takes a mark back off again', () => {
    expect(redrawn('a bb c', [bold([2, 4])])).toBe('a bb c');
    expect(redrawn('a bb c', [bold([2, 4]), italic([2, 4])])).toBe('a bb c');
    expect(redrawn('a bb c', [bold([2, 4])])).toBe('a bb c');
    expect(redrawn('a bb c', [])).toBe('a bb c');
  });

  it('nests a second mark that only partly overlaps the first', () => {
    expect(redrawn('a bb c', [bold([0, 4])])).toBe('a bb c');
    expect(redrawn('a bb c', [bold([0, 4]), italic([2, 6])])).toBe('a bb c');
  });

  it('keeps a whole sentence through four rounds of marking', () => {
    expect(redrawn(SENTENCE, [])).toBe(SENTENCE);
    expect(redrawn(SENTENCE, [bold([13, 19])])).toBe(SENTENCE);
    expect(redrawn(SENTENCE, [bold([13, 19]), italic([13, 19])])).toBe(SENTENCE);
    expect(redrawn(SENTENCE, [bold([13, 19]), italic([0, 19])])).toBe(SENTENCE);
    expect(redrawn(SENTENCE, [bold([12, 13]), italic([0, 19])])).toBe(SENTENCE);
  });
});
