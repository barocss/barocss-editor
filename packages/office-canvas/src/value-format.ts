/**
 * **How a value reads**, which is not the same question as what it is.
 *
 * ## The finding this exists for
 *
 * A card's question was answered with a string and drawn exactly as stored, so the only way to make
 * a price read as `월 9,900원` was to *store* `'월 9,900원'`. Which is a value nothing can compare —
 * and the sample's own pricing page had been sorting its plans by that string, in a browser, wrongly,
 * for as long as it has existed: `월 9,900원` sorts above `월 19,900원`, because `9` is after `1`.
 * The page showed the wrong three plans in the wrong order and looked completely fine.
 *
 * The same fault in the blog is quieter and just as real: the feed sorts by an ISO date, correctly,
 * and then shows the reader `2026-08-02`, which is what a developer writes and not what anybody says.
 *
 * So: **the document stores the value, and the card says how it reads.** A number is a number, a date
 * is a date, and `format` is a fact about the *card* rather than about the data — which is what lets
 * one dataset feed a price list that says `9,900원` and a summary that says `9.9천`.
 *
 * ## Why a picture string and not a set of named formats
 *
 * `'월 #,##0원'` carries the literal text a reader wants around the number, which a fixed list of
 * named formats cannot: every product that offers `currency | percent | decimal` grows a second
 * attribute for the prefix within a month. The pattern is the one every spreadsheet has had for
 * forty years, narrowed to the two placeholders that earn their place.
 *
 * ## And an unreadable value reads as itself
 *
 * A date that is not a date and a number that is not a number come back **unchanged** rather than as
 * an error or an empty string. A card whose column has one bad row should draw that row's own text,
 * which a reader can see and go and fix; a blank is a row that has silently disappeared.
 */

/** The placeholder that becomes the grouped number. Everything else in a pattern is literal. */
const GROUPED = '#,##0';

/** The date pieces a pattern may name, longest first so `yyyy` is not eaten by `yy`. */
const DATE_TOKENS = ['yyyy', 'MM', 'dd', 'M', 'd'] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * An ISO date, or nothing.
 *
 * `yyyy-MM-dd` only, and deliberately not `new Date(value)`: that parses `'문서'` as an invalid date
 * on one engine and something else on another, and accepts `'2026'` as a January instant nobody
 * meant. A dataset writes ISO because ISO is the one date format that sorts as text, which is the
 * whole reason the column can be sorted at all.
 */
function isoOf(value: string): { year: number; month: number; day: number } | undefined {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!found) return undefined;
  const [, year, month, day] = found;
  const at = { year: Number(year), month: Number(month), day: Number(day) };
  if (at.month < 1 || at.month > 12 || at.day < 1 || at.day > 31) return undefined;
  return at;
}

/** A number with thousands separated, in the reader's own convention. */
function grouped(value: number): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

/**
 * The words a value is drawn as.
 *
 * `kind` decides which reading is even possible and `format` decides which one of it; silence in
 * either is the value itself, which is what every card drew before this existed and is why adding it
 * moved nothing.
 */
export function readValue(value: string, kind?: string, format?: string): string {
  const said = String(value ?? '');
  if (!format || !said.trim()) return said;

  if (kind === 'date') {
    const at = isoOf(said);
    if (!at) return said;
    const pieces: Record<(typeof DATE_TOKENS)[number], string> = {
      yyyy: String(at.year),
      MM: pad(at.month),
      dd: pad(at.day),
      M: String(at.month),
      d: String(at.day)
    };
    // Longest token first, and one pass — so the `d` inside a literal that a `dd` already consumed
    // is not replaced a second time.
    return said.length === 0
      ? said
      : format.replace(/yyyy|MM|dd|M|d/g, (token) => pieces[token as (typeof DATE_TOKENS)[number]]);
  }

  if (kind === 'number') {
    const asNumber = Number(said.replace(/,/g, ''));
    if (!Number.isFinite(asNumber)) return said;
    return format.includes(GROUPED) ? format.replace(GROUPED, grouped(asNumber)) : format;
  }

  return said;
}

/** The formats a panel offers, per kind — declared here so a surface cannot invent its own. */
export const VALUE_FORMATS: Record<string, { id: string; label: string }[]> = {
  date: [
    { id: '', label: '있는 그대로' },
    { id: 'yyyy년 M월 d일', label: '2026년 8월 2일' },
    { id: 'M월 d일', label: '8월 2일' },
    { id: 'yyyy.MM.dd', label: '2026.08.02' },
    { id: 'yyyy-MM-dd', label: '2026-08-02' }
  ],
  number: [
    { id: '', label: '있는 그대로' },
    { id: '#,##0', label: '9,900' },
    { id: '#,##0원', label: '9,900원' },
    { id: '월 #,##0원', label: '월 9,900원' }
  ]
};
