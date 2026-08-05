import { describe, it, expect } from 'vitest';
import {
  paragraphCss, characterCss, pageCss, tableCss, tableCellCss,
  twipToCss, halfPointToCss, normalizeColor
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
});
