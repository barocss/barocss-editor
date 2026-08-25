import { describe, it, expect } from 'vitest';
import {
  paragraphCss, characterCss, pageCss, tableCss, tableCellCss, tableRowCss, rowClipHeight,
  twipToCss, halfPointToCss, normalizeColor, flowCss, mirroredIndents, hyphenationCss, shadingCss
} from '../src/css';

/**
 * The model keeps Word's units so a .docx round-trip is lossless; conversion to
 * CSS happens here, at the edge. These pin the arithmetic — an off-by-20 in
 * twips is a page-wide layout error that looks plausible.
 */
describe('unit conversion', () => {
  it('converts twips to points', () => {
    expect(twipToCss(1440)).toBe('72pt');   // 1 inch
    expect(twipToCss(720)).toBe('36pt');
    expect(twipToCss(240)).toBe('12pt');    // one line at 12pt
  });

  it('converts half-points to points', () => {
    expect(halfPointToCss(22)).toBe('11pt');
    expect(halfPointToCss(24)).toBe('12pt');
  });

  it('normalizes Word colours', () => {
    expect(normalizeColor('FF0000')).toBe('#FF0000');
    expect(normalizeColor('auto')).toBe('currentColor');
    expect(normalizeColor('rebeccapurple')).toBe('rebeccapurple');
  });
});

describe('paragraph CSS', () => {
  it('maps alignment, indentation and spacing', () => {
    const css = paragraphCss({
      alignment: 'center', indentLeft: 720, spacingBefore: 240, spacingAfter: 120
    });
    expect(css.textAlign).toBe('center');
    expect(css.marginLeft).toBe('36pt');
    expect(css.marginTop).toBe('12pt');
    expect(css.marginBottom).toBe('6pt');
  });

  it('expresses a hanging indent as CSS needs it', () => {
    // One idea in Word, two properties in CSS
    const css = paragraphCss({ indentHanging: 360 });
    expect(css.textIndent).toBe('-18pt');
    expect(css.paddingLeft).toBe('18pt');
  });

  it('reads auto line spacing as a multiplier and exact spacing as a length', () => {
    expect(paragraphCss({ spacingLine: 360, spacingLineRule: 'auto' }).lineHeight).toBe('1.5');
    expect(paragraphCss({ spacingLine: 360, spacingLineRule: 'exact' }).lineHeight).toBe('18pt');
  });

  /**
   * `mirrorIndents` makes the left and right indents an *inside* and an
   * *outside* one — the inside being the edge the binding is on, which changes
   * side every page. It is what makes a bound document look right, and nothing
   * read it.
   */
  describe('indents on a bound document', () => {
    const both = { indentLeft: 1440, indentRight: 720, mirrorIndents: true };

    it('leaves a right-hand page alone', () => {
      expect(paragraphCss(mirroredIndents(both, false))).toMatchObject({
        marginLeft: '72pt',
        marginRight: '36pt'
      });
    });

    it('swaps them on a left-hand page', () => {
      expect(paragraphCss(mirroredIndents(both, true))).toMatchObject({
        marginLeft: '36pt',
        marginRight: '72pt'
      });
    });

    it('leaves a paragraph that did not ask alone on either side', () => {
      const plain = { indentLeft: 1440, indentRight: 720 };
      expect(mirroredIndents(plain, true)).toBe(plain);
      expect(mirroredIndents(plain, false)).toBe(plain);
    });

    it('keeps the text exactly as wide, which is why the paginator ignores it', () => {
      const swapped = mirroredIndents(both, true);
      expect((swapped.indentLeft as number) + (swapped.indentRight as number)).toBe(
        both.indentLeft + both.indentRight
      );
    });
  });

  /**
   * Hyphenation, which needs three attributes and had readers for none.
   *
   * The switch is the document's (`hyphenationAuto`), the exception is a
   * paragraph's (`suppressAutoHyphens`), and neither is any use without the
   * third — a browser hyphenates by dictionary and has to be told which
   * language the text is in, which is `lang`, on the run.
   */
  describe('breaking a word at the end of a line', () => {
    it('says nothing at all until the document asks', () => {
      expect(hyphenationCss(false, {})).toEqual({});
      expect(hyphenationCss(false, { suppressAutoHyphens: true })).toEqual({});
    });

    it('hyphenates when the document asks', () => {
      expect(hyphenationCss(true, {}).hyphens).toBe('auto');
    });

    it('lets a paragraph opt out of a document that opted in', () => {
      // `manual` rather than `none`: a soft hyphen the author typed is still a
      // place they chose
      expect(hyphenationCss(true, { suppressAutoHyphens: true }).hyphens).toBe('manual');
    });
  });

  it('does not emit pagination properties', () => {
    // These instruct the paginator, which reads them from the model directly.
    // CSS has near-equivalents (break-inside, orphans, widows) but they only
    // apply to printing and to columns, so emitting them would look like the
    // rules were being honoured while the on-screen layout ignored them.
    const css = paragraphCss({ keepNext: true, widowControl: true, pageBreakBefore: true });
    expect(css.breakInside).toBeUndefined();
    expect(css.breakBefore).toBeUndefined();
    expect(css.widows).toBeUndefined();
    expect(css.orphans).toBeUndefined();
  });

  it('always states the vertical margins, so the UA stylesheet cannot add any', () => {
    // A `<p>` has a 1em margin by default. Left unstated, every paragraph got
    // spacing no style asked for — and the layout, which reads spacing from the
    // model, measured a document taller than it believed it to be.
    const css = paragraphCss({});
    expect(css.marginTop).toBe('0pt');
    expect(css.marginBottom).toBe('0pt');
  });

  it('maps borders from eighths of a point', () => {
    const css = paragraphCss({ borderTopStyle: 'single', borderTopWidth: 8, borderTopColor: '000000' });
    expect(css.borderTop).toBe('1pt solid 000000');
  });

  /**
   * The room a border leaves the text.
   *
   * `*Space` was declared on paragraphs, tables, cells and pages and read by nothing,
   * so every bordered paragraph had its line hard against the letters — found by
   * `every-attribute-is-read`.
   */
  describe('the space between a border and the text', () => {
    it('is drawn as padding, in the points Word stores it in', () => {
      const css = paragraphCss({ borderTopStyle: 'single', borderTopSpace: 6 });
      expect(css.paddingTop).toBe('6pt');
    });

    it('is nothing without a border to be spaced from', () => {
      // Word's reading too: a space with no line is not an indent by another name.
      const css = paragraphCss({ borderTopSpace: 6, borderLeftSpace: 4 });
      expect(css.paddingTop).toBeUndefined();
      expect(css.paddingLeft).toBeUndefined();
    });

    it('adds to a padding that is already there', () => {
      // A hanging indent is a `padding-left` and it is applied first. Replacing it
      // would make a left-bordered list item lose its hang.
      const css = paragraphCss({
        indentLeft: 720,
        indentHanging: 360,
        borderLeftStyle: 'single',
        borderLeftSpace: 5
      });
      expect(css.paddingLeft).toBe('calc(18pt + 5pt)');
    });

    it('ignores a space of nothing', () => {
      const css = paragraphCss({ borderBottomStyle: 'single', borderBottomSpace: 0 });
      expect(css.borderBottom).toBeDefined();
      expect(css.paddingBottom).toBeUndefined();
    });
  });
});

describe('character CSS', () => {
  it('maps the common run properties', () => {
    const css = characterCss({ fontFamily: 'Georgia', fontSize: 28, bold: true, color: 'FF0000' });
    expect(css.fontFamily).toBe('Georgia');
    expect(css.fontSize).toBe('14pt');
    expect(css.fontWeight).toBe('bold');
    expect(css.color).toBe('#FF0000');
  });

  it('emits an explicit off rather than omitting the property', () => {
    // Omitting it would inherit bold back from an enclosing heading
    expect(characterCss({ bold: false }).fontWeight).toBe('normal');
    expect(characterCss({ italic: false }).fontStyle).toBe('normal');
    expect(characterCss({}).fontWeight).toBeUndefined();
  });

  it('combines decorations and their style', () => {
    const css = characterCss({ underline: 'wave', strike: true });
    expect(css.textDecoration).toBe('underline line-through');
    expect(css.textDecorationStyle).toBe('wavy');
  });

  /**
   * The effects Word draws with the font itself.
   *
   * All four were unread, and the sweep that finds unread attributes said
   * otherwise: it counts a name read for a *different* meaning as read, and the
   * marks `shadowText`, `emboss` and `imprint` made the character *format*
   * attributes of the same names look answered. A run that arrived embossed from
   * a style drew flat.
   */
  describe('the effects a font would draw', () => {
    it('hollows the glyphs for an outline', () => {
      const css = characterCss({ outline: true });
      expect(css.color).toBe('transparent');
      expect(css.textShadow).toContain('currentColor');
    });

    it('lights emboss from above and imprint from below', () => {
      // Which is the whole difference between them
      expect(characterCss({ emboss: true }).textShadow).toBe(
        '0 1px 0 rgba(255,255,255,.7), 0 -1px 0 rgba(0,0,0,.3)'
      );
      expect(characterCss({ imprint: true }).textShadow).toBe(
        '0 -1px 0 rgba(255,255,255,.7), 0 1px 0 rgba(0,0,0,.3)'
      );
    });

    it('draws a shadow', () => {
      expect(characterCss({ shadow: true }).textShadow).toBeDefined();
    });

    it('leaves a run that asks for none of them alone', () => {
      expect(characterCss({}).textShadow).toBeUndefined();
      expect(characterCss({ outline: false }).color).toBeUndefined();
    });
  });

  /**
   * Kerning is not a switch. `w:kern` is the *minimum font size* it applies
   * from, in half-points, and zero means off — so the run's own size decides.
   */
  describe('kerning, which Word stores as a size', () => {
    it('turns it on for a run at or above the size', () => {
      expect(characterCss({ kerning: 16, fontSize: 24 }).fontKerning).toBe('normal');
      expect(characterCss({ kerning: 16, fontSize: 16 }).fontKerning).toBe('normal');
    });

    it('turns it off for a run below it', () => {
      expect(characterCss({ kerning: 32, fontSize: 20 }).fontKerning).toBe('none');
    });

    it('reads zero as off, which is what Word means by it', () => {
      expect(characterCss({ kerning: 0, fontSize: 24 }).fontKerning).toBe('none');
    });

    it('says nothing when the document says nothing', () => {
      expect(characterCss({ fontSize: 24 }).fontKerning).toBeUndefined();
    });
  });

  it('raises text without resizing it, unlike sup/sub', () => {
    expect(characterCss({ position: 6 }).verticalAlign).toBe('3pt');
  });
});

describe('page CSS', () => {
  it('lays out US Letter with one-inch margins', () => {
    const css = pageCss({
      pageWidth: 12240, pageHeight: 15840,
      marginTop: 1440, marginRight: 1440, marginBottom: 1440, marginLeft: 1440
    });
    expect(css.width).toBe('612pt');      // 8.5in
    expect(css.minHeight).toBe('792pt');  // 11in
    expect(css.padding).toBe('72pt 72pt 72pt 72pt');
  });

  it('swaps the axes in landscape', () => {
    const css = pageCss({ pageWidth: 12240, pageHeight: 15840, orientation: 'landscape' });
    expect(css.width).toBe('792pt');
    expect(css.minHeight).toBe('612pt');
  });

  it('maps multi-column sections', () => {
    const css = pageCss({ columnCount: 2, columnSpacing: 720, columnSeparator: true });
    expect(css.columnCount).toBe('2');
    expect(css.columnGap).toBe('36pt');
    expect(css.columnRule).toBeDefined();
  });
});

describe('table CSS', () => {
  it('reads percentage widths as fiftieths of a percent', () => {
    expect(tableCss({ width: 2500, widthType: 'pct' }).width).toBe('50%');
    expect(tableCss({ width: 1440, widthType: 'dxa' }).width).toBe('72pt');
  });

  it('collapses borders and honours a fixed layout', () => {
    const css = tableCss({ layout: 'fixed' });
    expect(css.borderCollapse).toBe('collapse');
    expect(css.tableLayout).toBe('fixed');
  });

  it('maps cell alignment and padding', () => {
    const css = tableCellCss({
      verticalAlign: 'center',
      marginTop: 0, marginRight: 108, marginBottom: 0, marginLeft: 108
    });
    expect(css.verticalAlign).toBe('middle');
    expect(css.padding).toBe('0pt 5.4pt 0pt 5.4pt');
  });

  it('turns a cell’s text onto its side, the way Word names the directions', () => {
    // `tbRl` reads downwards, `btLr` upwards — and upwards is drawn as the
    // downward mode turned around, which renders where `sideways-lr` does not.
    expect(tableCellCss({ textDirection: 'tbRl' }).writingMode).toBe('vertical-rl');
    expect(tableCellCss({ textDirection: 'btLr' })).toMatchObject({
      writingMode: 'vertical-rl',
      transform: 'rotate(180deg)'
    });
    expect(tableCellCss({ textDirection: 'tbLrV' }).writingMode).toBe('vertical-lr');

    // Ordinary lines, and so is anything nobody can draw
    expect(tableCellCss({ textDirection: 'lrTb' }).writingMode).toBeUndefined();
    expect(tableCellCss({ textDirection: 'sideways' }).writingMode).toBeUndefined();
    expect(tableCellCss({}).writingMode).toBeUndefined();
  });

  it('gives a row the height it asks for, and only when the rule wants one', () => {
    expect(tableRowCss({ height: 720, heightRule: 'atLeast' }).height).toBe('36pt');
    expect(tableRowCss({ height: 720, heightRule: 'exact' }).height).toBe('36pt');

    // `auto` records a height Word ignores; honouring it would leave a row that
    // once had a fixed height still wearing it after the rule was set back.
    expect(tableRowCss({ height: 720, heightRule: 'auto' }).height).toBeUndefined();
    expect(tableRowCss({ height: 720 }).height).toBeUndefined();
    expect(tableRowCss({ height: 0, heightRule: 'exact' }).height).toBeUndefined();
  });

  it('shades a row', () => {
    expect(tableRowCss({ shadingFill: 'EDF2F7' }).backgroundColor).toBe('#EDF2F7');
    expect(tableRowCss({ shadingFill: 'auto' }).backgroundColor).toBeUndefined();
  });

  it('asks the cells to clip only for an exact row', () => {
    // A table cell treats any height as a minimum and ignores its own overflow,
    // so the only row rule that can be enforced in the cell is this one.
    expect(rowClipHeight({ height: 400, heightRule: 'exact' })).toBe('20pt');
    expect(rowClipHeight({ height: 400, heightRule: 'atLeast' })).toBeUndefined();
    expect(rowClipHeight({ heightRule: 'exact' })).toBeUndefined();
  });
});

describe('the flow, once pages are painted separately', () => {
  it('insets the text by the gutter as well as the margin', () => {
    // The same sum sheetMetrics makes: a gutter drawn here and not counted there
    // would break lines at one width and draw them at another.
    const css = flowCss({ pageWidth: 12240, pageHeight: 15840, marginLeft: 1440, marginRight: 1440, marginGutter: 720 });
    expect(css.paddingLeft).toBe('108pt');
    expect(css.paddingRight).toBe('72pt');
  });

  it('leaves a gutter at the top to the layout, which pushes the pages', () => {
    // The flow has no vertical padding at all — where a page starts is what the
    // computed break produces — so drawing it here would count it twice.
    const css = flowCss({
      pageWidth: 12240, pageHeight: 15840, marginLeft: 1440, marginRight: 1440,
      marginGutter: 720, gutterAtTop: true
    });
    expect(css.paddingLeft).toBe('72pt');
    expect(css.paddingTop).toBeUndefined();
  });
});

/**
 * Shading: three attributes, of which one was read.
 *
 * `shadingFill` was drawn and `shadingColor`/`shadingPattern` were on the list of
 * things the schema declares and nothing reads — so a document asking for a 25%
 * grey stipple over white drew as plain white, and the same two lines of
 * fill-only code were written out four times in this file.
 *
 * The mapping is Word's own reading, and two parts of it surprise people: a
 * `solid` shading shows the *pattern* colour and ignores the fill, and a pattern
 * with no colour is just the fill.
 */
describe('the three parts of a shading', () => {
  it('draws a plain fill, which is nearly all real shading', () => {
    expect(shadingCss({ shadingFill: 'D9E2F3' })).toEqual({ backgroundColor: '#D9E2F3' });
    expect(shadingCss({ shadingFill: 'D9E2F3', shadingPattern: 'clear' })).toEqual({
      backgroundColor: '#D9E2F3'
    });
  });

  it('lets "auto" mean the reader decides', () => {
    expect(shadingCss({ shadingFill: 'auto' }).backgroundColor).toBeUndefined();
  });

  it('shows the pattern colour and not the fill, for solid', () => {
    // Word's reading. A solid shading is the pattern at full strength, so the
    // fill is not visible at all.
    expect(shadingCss({ shadingFill: 'FFFFFF', shadingColor: 'C00000', shadingPattern: 'solid' })).toEqual({
      backgroundColor: '#C00000'
    });
  });

  it('blends a percentage of the pattern colour over the fill', () => {
    const css = shadingCss({
      shadingFill: 'FFFFFF',
      shadingColor: '000000',
      shadingPattern: 'pct25'
    });
    expect(css.backgroundColor).toBe('color-mix(in srgb, #000000 25% , #FFFFFF)'.replace(' ,', ','));
  });

  it('takes the percentage from the name, whatever it is', () => {
    expect(shadingCss({ shadingColor: '000000', shadingPattern: 'pct5' }).backgroundColor).toContain('5%');
    expect(shadingCss({ shadingColor: '000000', shadingPattern: 'pct60' }).backgroundColor).toContain('60%');
    // No fill to blend into: white, which is the page.
    expect(shadingCss({ shadingColor: '000000', shadingPattern: 'pct60' }).backgroundColor).toContain('white');
  });

  it('draws stripes at the angle the name says', () => {
    expect(shadingCss({ shadingColor: '808080', shadingPattern: 'horzStripe' }).backgroundImage)
      .toContain('0deg');
    expect(shadingCss({ shadingColor: '808080', shadingPattern: 'vertStripe' }).backgroundImage)
      .toContain('90deg');
    expect(shadingCss({ shadingColor: '808080', shadingPattern: 'reverseDiagStripe' }).backgroundImage)
      .toContain('-45deg');
  });

  it('crosses two runs of stripes at right angles', () => {
    const css = shadingCss({ shadingColor: '808080', shadingPattern: 'diagCross' });
    expect(css.backgroundImage?.match(/repeating-linear-gradient/g)).toHaveLength(2);
    expect(css.backgroundImage).toContain('45deg');
    expect(css.backgroundImage).toContain('-45deg');
  });

  /**
   * A pattern with no colour has nothing to draw, and a pattern nobody has
   * mapped is drawn as its fill — the reader asked for a shaded cell and the
   * shade is the part we have. Neither is a reason to draw nothing.
   */
  it('falls back to the fill rather than to nothing', () => {
    expect(shadingCss({ shadingFill: 'EEEEEE', shadingPattern: 'pct25' })).toEqual({
      backgroundColor: '#EEEEEE'
    });
    expect(shadingCss({ shadingFill: 'EEEEEE', shadingColor: '000000', shadingPattern: 'trellis' })).toEqual({
      backgroundColor: '#EEEEEE'
    });
  });

  it('is what every level of the document uses', () => {
    // One function, four callers: a table, a row, a cell and a paragraph. It was
    // the same two lines four times, each reading the fill alone.
    for (const css of [
      tableCss({ shadingFill: 'EDF2F7' }),
      tableRowCss({ shadingFill: 'EDF2F7' }),
      tableCellCss({ shadingFill: 'EDF2F7' }),
      paragraphCss({ shadingFill: 'EDF2F7' })
    ]) {
      expect(css.backgroundColor).toBe('#EDF2F7');
    }
  });
});
