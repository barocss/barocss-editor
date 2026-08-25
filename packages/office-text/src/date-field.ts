/**
 * The date a document shows.
 *
 * Word's DATE field shows today; a renderer that reads the clock is one whose
 * output changes between two runs, which makes it untestable and makes the
 * layout signature — which decides whether anything moved — differ every pass.
 *
 * So the instant comes from the host. A document rendered without one shows
 * nothing rather than a guess, which is also what a document printed on a server
 * with no clock of its own should do.
 */

/** How a date field is written, in the subset of Word's picture strings we honour. */
const PATTERNS: Record<string, (date: Date) => string> = {
  'yyyy-MM-dd': (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  'd MMMM yyyy': (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  'MMMM d, yyyy': (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
  'dddd': (d) => DAYS[d.getDay()],
  'HH:mm': (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Format an instant the way a field asks for.
 *
 * An unrecognised picture string falls back to the ISO date rather than showing
 * the picture itself, which is what Word does with a field it cannot parse and
 * is less alarming to a reader than seeing "yyyy" in their document.
 */
export function formatDateField(instant: Date | undefined, format?: string): string {
  if (!instant) return '';
  const pattern = format ? PATTERNS[format] : undefined;
  return (pattern ?? PATTERNS['yyyy-MM-dd'])(instant);
}
