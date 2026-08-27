import { describe, it, expect } from 'vitest';
import { readNumberField } from '../src/controls';

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
