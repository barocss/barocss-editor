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
