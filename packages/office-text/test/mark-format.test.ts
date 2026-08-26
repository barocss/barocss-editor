import { describe, it, expect } from 'vitest';
import { markAttributes, markCss, VALUED_MARKS } from '../src/mark-format';
import { createStyleResolver } from '../src/style-resolver';
import type { DocumentAccess } from '../src/document-access';

/**
 * A mark whose meaning is fixed renders fine as a class. One that carries a
 * value does not: `mark-fontSize` cannot say eleven points.
 */
describe('sizes and spacing, in whichever unit they arrived', () => {
  it('reads a number as Word’s half-points', () => {
    // Which is what a .docx says, and what the style cascade uses
    expect(markCss('fontSize', { size: 22 }, undefined).fontSize).toBe('11pt');
  });

  it('reads a string as a CSS length already', () => {
    // The shared schema's marks carry these, because a product that is not a
    // word processor has no reason to count half-points.
    expect(markCss('fontSize', { size: '14px' }, undefined).fontSize).toBe('14px');
  });

  it('does the same for letter spacing, which Word counts in twips', () => {
    expect(markCss('letterSpacing', { spacing: 20 }, undefined).letterSpacing).toBe('1pt');
    expect(markCss('letterSpacing', { spacing: '.1em' }, undefined).letterSpacing).toBe('.1em');
  });
});

describe('colours', () => {
  it('accepts a hex without a hash, as a .docx writes it', () => {
    expect(markCss('fontColor', { color: 'B22222' }, undefined).color).toBe('#B22222');
  });

  it('leaves a colour that is already CSS alone', () => {
    expect(markCss('fontColor', { color: 'rebeccapurple' }, undefined).color).toBe('rebeccapurple');
  });

  it('puts a highlight behind the text rather than on it', () => {
    expect(markCss('highlight', { color: 'FFFF00' }, undefined).backgroundColor).toBe('#FFFF00');
  });
});

describe('a character style', () => {
  const doc: DocumentAccess = {
    rootId: 'root',
    getNode: (id) =>
      ({
        root: { sid: 'root', stype: 'document', content: ['res'] },
        res: { sid: 'res', stype: 'resources', content: ['emph'] },
        emph: {
          sid: 'emph',
          stype: 'styleDef',
          attributes: { id: 'Emphasis', name: 'Emphasis', type: 'character', italic: true, color: '2C5282' }
        }
      })[id]
  };

  it('is resolved rather than mapped, so a run and its paragraph agree', () => {
    const css = markCss('charStyle', { styleId: 'Emphasis' }, createStyleResolver(doc));
    expect(css.fontStyle).toBe('italic');
    expect(css.color).toBe('#2C5282');
  });

  it('contributes nothing when the style is unknown', () => {
    expect(markCss('charStyle', { styleId: 'Nope' }, createStyleResolver(doc))).toEqual({});
  });

  it('contributes nothing without a cascade to ask', () => {
    expect(markCss('charStyle', { styleId: 'Emphasis' }, undefined)).toEqual({});
  });
});

describe('marks whose value is not a style', () => {
  it('puts a language on the element, where a screen reader looks', () => {
    expect(markAttributes('spanLang', { lang: 'ko', dir: 'ltr' })).toEqual({ lang: 'ko', dir: 'ltr' });
  });

  it('gives nothing for a mark with no attributes to place', () => {
    expect(markAttributes('fontSize', { size: 22 })).toEqual({});
  });
});

describe('the set that needs a renderer at all', () => {
  it('covers the marks that carry a value', () => {
    for (const type of ['fontSize', 'fontColor', 'charStyle', 'highlight', 'spanLang']) {
      expect(VALUED_MARKS).toContain(type);
    }
  });

  it('includes the plain ones, because a class said nothing', () => {
    /*
     * This test used to assert the opposite — *"bold and italic mean one thing; there is nothing to
     * read off them"* — on the assumption that the `mark-bold` class a mark gets by default was
     * styled somewhere. It was not, in any of the three products.
     *
     * Measured in Word: press 굵게, and `.mark-bold` exists as a `<span>` with computed
     * `font-weight: 400`. Eleven marks were in that state. The two weight assertions the browser
     * suite has are about a **style's** formatting, which resolves through a different road, so
     * nothing had ever asked this one.
     *
     * A mark that means one thing still has to say the one thing.
     */
    for (const type of ['bold', 'italic', 'underline', 'strikethrough', 'code']) {
      expect(VALUED_MARKS, type).toContain(type);
    }
    expect(markCss('bold', {}, undefined)).toEqual({ fontWeight: 'bold' });
  });

  it('lets an underline and a strike-through share one run', () => {
    /*
     * `text-decoration` is a shorthand: two marks each writing it would leave whichever was applied
     * second, and the bug would read as "underline stopped working" rather than as a cascade. The
     * long-hand merges, which is what a tracked-changes document needs — a deletion inside a link is
     * both.
     */
    expect(markCss('underline', {}, undefined)).toEqual({ textDecorationLine: 'underline' });
    expect(markCss('strikethrough', {}, undefined)).toEqual({ textDecorationLine: 'line-through' });
  });
});
