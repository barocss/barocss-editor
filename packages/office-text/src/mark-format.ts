/**
 * Marks that carry a value.
 *
 * A mark whose meaning is fixed — bold, italic — renders fine as a class. One
 * that carries a value does not: `mark-fontSize` cannot say eleven points, and
 * `mark-charStyle` cannot say which style. Those need the value on the way out,
 * which is what this maps.
 *
 * Two unit conventions meet here. Word measures type in half-points and spacing
 * in twips and writes colours without a hash, because that is what a .docx says;
 * the shared schema's marks carry CSS strings, because a product that is not a
 * word processor has no reason to. A number is read as Word's unit and a string
 * as a CSS length, so a document from either side renders — rather than one of
 * them silently rendering at the wrong size.
 */
import { FONT_EFFECTS, characterCss, normalizeColor, twipToCss, type CssStyle } from './css';
import type { EffectiveFormat, StyleResolver } from './style-resolver';

type Attrs = Record<string, unknown>;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** A length in Word's unit, or a CSS length already. */
function length(value: unknown, wordUnit: (value: number) => string): string | undefined {
  const asNumber = num(value);
  if (asNumber !== undefined) return wordUnit(asNumber);
  return str(value);
}

/**
 * Marks that map onto character formatting, and so onto `characterCss`.
 *
 * Going through the same function the style cascade uses is what keeps a mark
 * and a style saying the same thing: eleven points is eleven points whether it
 * arrived as direct formatting or as a mark over a range.
 */
const AS_FORMAT: Record<string, (attrs: Attrs) => EffectiveFormat> = {
  fontSize: (attrs) => (num(attrs.size) !== undefined ? { fontSize: num(attrs.size) } : {}),
  fontFamily: (attrs) => ({ fontFamily: str(attrs.family) }),
  fontColor: (attrs) => ({ color: str(attrs.color) }),
  /*
   * Both of the schema's ways of painting behind text land on Word's one `highlight` format, and
   * they are not the same idea: `bgColor` is a background of any colour (Word's 음영), `highlight`
   * is the marker pen. `EffectiveFormat` has no shading yet, so a background is drawn as the
   * nearest thing Word has and says so here rather than being dropped.
   */
  bgColor: (attrs) => ({ highlight: str(attrs.bgColor) }),
  highlight: (attrs) => ({ highlight: str(attrs.color) }),
  letterSpacing: (attrs) => (num(attrs.spacing) !== undefined ? { spacing: num(attrs.spacing) } : {}),
  allCaps: () => ({ allCaps: true }),
  smallCaps: () => ({ smallCaps: true }),
  doubleStrike: () => ({ doubleStrike: true }),
  vanish: () => ({ vanish: true })
};

/**
 * Marks with no equivalent in Word's character formatting.
 *
 * Word draws outline, shadow, emboss and imprint with the font itself; on the
 * web they are approximated with a text shadow, which is what every other web
 * word processor does and is closer than ignoring them.
 */
const AS_CSS: Record<string, (attrs: Attrs) => CssStyle> = {
  /*
   * ── The plain ones, which drew nothing at all ────────────────────────────
   *
   * `bold`, `italic`, `underline`, `strikethrough`, `code`, `subscript`, `superscript`, `kbd`,
   * `mention`, `spoiler` and `footnoteRef` have been in the standard schema since it was written,
   * settable by a registered command each, and in **none** of these three tables. A mark with no
   * entry becomes `<span class="mark-bold">` and nothing styles that class in any of the three
   * products, so pressing 굵게 made a span and left the text at weight 400.
   *
   * Measured rather than reasoned: `.mark-bold` in Word, computed `font-weight: 400`. No test in
   * the suite had ever asked — the two weight assertions it has are about a *style's* formatting,
   * which resolves through a different road entirely. `every-mark-is-drawn` is the check that asks
   * now, and this is what it found.
   */
  bold: () => ({ fontWeight: 'bold' }),
  italic: () => ({ fontStyle: 'italic' }),
  /*
   * One declaration, not two. `text-decoration` is a shorthand, so a run that is both underlined and
   * struck through would keep whichever mark was applied second if each wrote its own — the value
   * has to name both at once, which is what `decorationFor` does below.
   */
  underline: (attrs) => decorationFor('underline', attrs),
  strikethrough: (attrs) => decorationFor('line-through', attrs),
  /*
   * Monospace and a quiet ground — the shape every editor draws inline code as, and the reason it is
   * legible in a proportional paragraph at all.
   */
  code: () => ({
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '0.92em',
    background: 'rgb(0 0 0 / 0.06)',
    borderRadius: '3px',
    padding: '0.1em 0.3em'
  }),
  /*
   * `vertical-align` and a smaller face, rather than `<sub>` / `<sup>`.
   *
   * The elements would be more semantic and are not available here: a mark wraps a run of text that
   * may already be inside anything, and the two elements carry a line-height of their own that
   * shifts the line they are on. Word's own subscript is a font size and a raise, which is what this
   * is.
   */
  subscript: () => ({ verticalAlign: 'sub', fontSize: '0.75em' }),
  superscript: () => ({ verticalAlign: 'super', fontSize: '0.75em' }),
  footnoteRef: () => ({ verticalAlign: 'super', fontSize: '0.75em' }),
  // The same shape as a footnote's, because a reader reads them the same way — the difference is
  // where the note sits, not how the number is drawn.
  endnoteRef: () => ({ verticalAlign: 'super', fontSize: '0.75em' }),
  /** A key on a keyboard, which is what the mark is named after. */
  kbd: () => ({
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '0.85em',
    border: '1px solid rgb(0 0 0 / 0.2)',
    borderBottomWidth: '2px',
    borderRadius: '4px',
    padding: '0.05em 0.35em',
    background: 'rgb(0 0 0 / 0.03)'
  }),
  /** A name that refers to somebody, drawn as the chip every product draws one as. */
  mention: () => ({
    background: 'rgb(37 99 235 / 0.12)',
    color: 'rgb(37 99 235)',
    borderRadius: '4px',
    padding: '0.05em 0.25em'
  }),
  /*
   * Hidden until a reader asks. Drawn as a block of colour rather than as blurred text, because
   * blurred text is still readable at a large size and a spoiler that can be read is not one.
   */
  spoiler: () => ({ background: 'currentColor', color: 'transparent', borderRadius: '3px' }),

  fontSize: (attrs) => {
    const asCss = num(attrs.size) === undefined ? str(attrs.size) : undefined;
    return asCss ? { fontSize: asCss } : ({} as CssStyle);
  },
  letterSpacing: (attrs) => {
    const asCss = num(attrs.spacing) === undefined ? str(attrs.spacing) : undefined;
    return asCss ? { letterSpacing: asCss } : ({} as CssStyle);
  },
  wordSpacing: (attrs) => {
    const value = length(attrs.spacing, twipToCss);
    return value ? { wordSpacing: value } : ({} as CssStyle);
  },
  lineHeight: (attrs) => {
    const value = str(attrs.height) ?? (num(attrs.height) !== undefined ? String(attrs.height) : undefined);
    return value ? { lineHeight: value } : ({} as CssStyle);
  },
  textShadow: (attrs) => {
    const value = str(attrs.shadow);
    return value ? { textShadow: value } : ({} as CssStyle);
  },
  border: (attrs) => {
    const width = str(attrs.width) ?? '1px';
    const style = str(attrs.style) ?? 'solid';
    const color = normalizeColor(str(attrs.color) ?? '000000');
    return { border: `${width} ${style} ${color}` };
  },
  /**
   * The four Word draws with the font itself, from the one place they are
   * written — a mark and a style saying the same thing have to draw the same,
   * and these used to be stated here and nowhere else, which is why the
   * character *format* attributes of the same names drew nothing at all.
   */
  outlineText: () => FONT_EFFECTS.outline,
  shadowText: () => FONT_EFFECTS.shadow,
  emboss: () => FONT_EFFECTS.emboss,
  imprint: () => FONT_EFFECTS.imprint
};

/** Marks whose value belongs on the element rather than in its style. */
const AS_ATTRIBUTES: Record<string, (attrs: Attrs) => Record<string, string>> = {
  spanLang: (attrs) => {
    const out: Record<string, string> = {};
    const lang = str(attrs.lang);
    const dir = str(attrs.dir);
    if (lang) out.lang = lang;
    if (dir) out.dir = dir;
    return out;
  }
};

/**
 * A text decoration that can be **combined**.
 *
 * `text-decoration-line` takes more than one value, and a run that is underlined *and* struck
 * through is an ordinary thing in a tracked-changes document. Written as the long-hand property so
 * two marks over one run merge instead of the second silently replacing the first — the shorthand
 * would, and the bug would look like "underline stopped working" rather than like a cascade.
 */
function decorationFor(line: string, attrs: Attrs): CssStyle {
  const colour = str(attrs.color);
  return {
    textDecorationLine: line,
    ...(colour ? { textDecorationColor: colour } : {})
  } as CssStyle;
}

/** Every mark type that carries a value worth rendering. */
export const VALUED_MARKS = [
  ...new Set([...Object.keys(AS_FORMAT), ...Object.keys(AS_CSS), ...Object.keys(AS_ATTRIBUTES), 'charStyle'])
];

/**
 * What a mark contributes to the text it covers.
 *
 * `charStyle` is resolved rather than mapped: it names a style, and what that
 * style means is the cascade's answer — the same one a paragraph gets — so
 * resolving it anywhere else would let a run and its paragraph disagree.
 */
export function markCss(
  type: string,
  attrs: Attrs | undefined,
  styles: StyleResolver | undefined
): CssStyle {
  const values = attrs ?? {};

  if (type === 'charStyle') {
    const styleId = str(values.styleId);
    if (!styleId || !styles) return {};
    return characterCss(styles.resolveStyle(styleId, 'character'));
  }

  return {
    ...characterCss(AS_FORMAT[type]?.(values) ?? {}),
    ...(AS_CSS[type]?.(values) ?? {})
  };
}

/** What a mark contributes as element attributes, if anything. */
export function markAttributes(type: string, attrs: Attrs | undefined): Record<string, string> {
  return AS_ATTRIBUTES[type]?.(attrs ?? {}) ?? {};
}
