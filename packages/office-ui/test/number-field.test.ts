import { describe, it, expect } from 'vitest';
import { readNumberField, scrubbedTo, fieldKeeps } from '../src/controls';

/**
 * What **emptying a number field** means.
 *
 * A field that has been left with nothing in it is one of two completely different sentences, and
 * the field cannot tell them apart from the text alone:
 *
 * - *"several things are selected and they disagree"* — the field was already showing nothing, the
 *   reader clicked in and out, and nothing was said. Writing anything here would change every
 *   selected thing to one value nobody typed.
 * - *"take this value back"* — the field was showing a number, the reader deleted it. Which is the
 *   only gesture there is for removing an attribute, and until now it did nothing at all: the field
 *   read both cases as *leave it alone*, so no reader of any product in this suite could clear a
 *   number.
 *
 * The value the field is currently showing is what separates them, so the rule is here, as a
 * function, rather than inside a blur handler where it can only be checked by driving a browser.
 */
describe('what emptying a number field means', () => {
  it('is a number, when a number was typed', () => {
    expect(readNumberField('24', 16)).toEqual({ kind: 'value', value: 24 });
    expect(readNumberField('-3', null)).toEqual({ kind: 'value', value: -3 });
    expect(readNumberField('0.5', 1)).toEqual({ kind: 'value', value: 0.5 });
  });

  it('is nothing, when the number is the one already there', () => {
    // The commit runs on every blur, including the blur of a field nobody touched.
    expect(readNumberField('16', 16)).toEqual({ kind: 'nothing' });
  });

  it('is taking the value back, when a reader empties a field that had one', () => {
    expect(readNumberField('', 16)).toEqual({ kind: 'clear' });
    expect(readNumberField('   ', 16)).toEqual({ kind: 'clear' });
    // Zero is a value like any other, and a reader who deletes it means the same thing by it.
    expect(readNumberField('', 0)).toEqual({ kind: 'clear' });
  });

  it('is nothing, when the field was already showing nothing', () => {
    // `null` is what every control in this suite means by *mixed*, and by *not set*. Neither is
    // something a reader takes back by deleting it, because there is nothing there to delete.
    expect(readNumberField('', null)).toEqual({ kind: 'nothing' });
  });

  it('is nothing, when what is in the field is not a number', () => {
    // A half-typed exponent or a stray letter is not an instruction. It is also not a clear: the
    // reader is mid-word, and the field will be asked again when they finish.
    expect(readNumberField('e', 16)).toEqual({ kind: 'nothing' });
    expect(readNumberField('--', 16)).toEqual({ kind: 'nothing' });
    expect(readNumberField('Infinity', 16)).toEqual({ kind: 'nothing' });
  });
});

/**
 * And **where a drag of the field's handle lands**.
 *
 * The gesture every inspector of this kind has and this suite had none of: measured by watching a
 * padding get set, it took six actions to try one number — click, select the digits, type, tab out,
 * look at the page, click again — and trying numbers is most of what laying a page out *is*.
 *
 * One pixel is one `step`, which matters more here than it looks: this suite's model unit is the
 * twip, so a field that counted in pixels of screen would need a reader to drag fifteen of them to
 * move a point.
 */
describe('where a drag of a number field lands', () => {
  it('is a pixel a step, from where it started', () => {
    expect(scrubbedTo({ from: 16, dx: 8, step: 1 })).toBe(24);
    expect(scrubbedTo({ from: 16, dx: -20, step: 1 })).toBe(-4);
    expect(scrubbedTo({ from: 0, dx: 4, step: 15 })).toBe(60);
  });

  it('is ten times as fast with shift, and a tenth with alt', () => {
    // The arrow keys' own modifiers in this same field: a reader who knows one knows the other.
    expect(scrubbedTo({ from: 0, dx: 10, step: 1, shift: true })).toBe(100);
    expect(scrubbedTo({ from: 0, dx: 10, step: 1, alt: true })).toBe(1);
    // Shift wins when both are held, because a reader holding both wants the coarse one.
    expect(scrubbedTo({ from: 0, dx: 10, step: 1, shift: true, alt: true })).toBe(100);
  });

  it('stops where the field stops', () => {
    // A fast drag flies past a minimum in one frame, which is exactly where an unclamped rule shows.
    expect(scrubbedTo({ from: 4, dx: -400, step: 1, min: 0 })).toBe(0);
    expect(scrubbedTo({ from: 90, dx: 400, step: 1, max: 100 })).toBe(100);
  });

  it('lands on a number the field can draw', () => {
    /*
     * Rounded to what is *shown*, so the number released on is the number read under the pointer.
     * Without it a tenth-step drag lands on 4.300000000000001 and the field commits a value it never
     * drew — the kind of thing that reaches a document and is never noticed.
     */
    expect(scrubbedTo({ from: 4, dx: 3, step: 0.1, decimals: 2 })).toBe(4.3);
    expect(scrubbedTo({ from: 0, dx: 1, step: 0.001, decimals: 2 })).toBe(0);
  });
});

/**
 * And **which keys a field keeps for itself**.
 *
 * The rule two layers need and neither could see. A field stops a key from reaching the document
 * because *`Delete` in a number box is a digit* — true of bare keys and of almost no chord. Measured
 * by dragging a padding's handle in the panel and pressing ⌘Z: the field's own keydown handler
 * stopped the chord dead, the document kept the number, and a reader had to click the board before
 * they could undo what they had just done in the panel.
 */
describe('which keys a field keeps', () => {
  it('keeps every bare key, because that is what typing is', () => {
    expect(fieldKeeps({ key: 'Backspace' })).toBe(true);
    expect(fieldKeeps({ key: 'Delete' })).toBe(true);
    expect(fieldKeeps({ key: 'Enter' })).toBe(true);
    expect(fieldKeeps({ key: 'z' })).toBe(true);
    // Shift and Alt are still typing — a capital and an accented letter are letters.
    expect(fieldKeeps({ key: 'G' })).toBe(true);
  });

  it('keeps the clipboard and select-all, because those mean the box', () => {
    for (const key of ['c', 'x', 'v', 'a', 'C', 'A']) {
      expect(fieldKeeps({ key, metaKey: true }), key).toBe(true);
      expect(fieldKeeps({ key, ctrlKey: true }), key).toBe(true);
    }
  });

  it('gives up every other chord to the document', () => {
    // The one that was measured, and the ones beside it in this product's key map.
    expect(fieldKeeps({ key: 'z', metaKey: true })).toBe(false);
    expect(fieldKeeps({ key: 'z', metaKey: true, ctrlKey: false })).toBe(false);
    expect(fieldKeeps({ key: 'g', metaKey: true })).toBe(false);
    expect(fieldKeeps({ key: 'd', ctrlKey: true })).toBe(false);
    expect(fieldKeeps({ key: 's', metaKey: true })).toBe(false);
  });
});
