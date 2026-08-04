/**
 * Rendering a counter in a named number format.
 *
 * The document stores *which* format ("upperRoman"), never the rendered result:
 * "1." and "I." are the same data seen through different definitions, and a list
 * renumbers itself when items move. Something has to turn the counter into
 * characters, and that something is this.
 *
 * It lives in shared rather than in a product because the same format names are
 * referenced from several places in the schema — list levels, page numbering,
 * footnote and endnote numbering, caption sequences — and every product that
 * renders any of those needs the identical mapping. Duplicating it would let two
 * products disagree about what "lowerLetter" means at 27.
 *
 * The names follow OOXML's `w:numFmt` so a .docx round-trip needs no translation.
 */

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
];

function toRoman(value: number): string {
  if (value <= 0) return '';
  let remaining = value;
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/**
 * 1 → a, 26 → z, 27 → aa.
 *
 * Bijective base-26, the way spreadsheet columns and Word both count — not
 * base-26 with a zero digit, which would give "ba" for 27.
 */
function toLetter(value: number): string {
  if (value <= 0) return '';
  let remaining = value;
  let out = '';
  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    out = String.fromCharCode(97 + index) + out;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return out;
}

function ordinalSuffix(value: number): string {
  // 11th, 12th, 13th break the last-digit rule.
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (value % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/** Number format names understood by {@link formatCounter}. */
export const NumberFormat = {
  Decimal: 'decimal',
  DecimalZero: 'decimalZero',
  UpperRoman: 'upperRoman',
  LowerRoman: 'lowerRoman',
  UpperLetter: 'upperLetter',
  LowerLetter: 'lowerLetter',
  Ordinal: 'ordinal',
  /** The level's literal text is the marker; the counter is not rendered. */
  Bullet: 'bullet',
  /** Numbered for counting purposes, but nothing is shown. */
  None: 'none'
} as const;

export type NumberFormatValue = (typeof NumberFormat)[keyof typeof NumberFormat];

/**
 * Render one counter value.
 *
 * Returns '' for `bullet` and for any unknown name: the caller supplies the
 * literal marker in those cases, and an unrecognised format must not fall back
 * to a number that looks authoritative but is wrong.
 */
export function formatCounter(value: number, format: string): string {
  switch (format) {
    case NumberFormat.Decimal:
      return String(value);
    case NumberFormat.DecimalZero:
      return value < 10 ? `0${value}` : String(value);
    case NumberFormat.UpperRoman:
      return toRoman(value).toUpperCase();
    case NumberFormat.LowerRoman:
      return toRoman(value);
    case NumberFormat.UpperLetter:
      return toLetter(value).toUpperCase();
    case NumberFormat.LowerLetter:
      return toLetter(value);
    case NumberFormat.Ordinal:
      return `${value}${ordinalSuffix(value)}`;
    default:
      return '';
  }
}
