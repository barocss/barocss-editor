/**
 * Which chapter a page is under, and the page number that says so.
 *
 * Word's `1-1`, `1-2`, `2-1` — the page number with the current chapter's number
 * in front of it, which is how a manual numbers pages so that a chapter can be
 * revised and reprinted without renumbering the rest of the book. A section asks
 * for it with `pageNumberChapterStyle`: the name of the heading style whose
 * headings start chapters.
 *
 * ## Every part of this already existed
 *
 * `page-furniture.ts` resolves a page number, `toc.ts` finds the headings and
 * which page each is on, and `numbering-resolver.ts` computes what a heading is
 * *numbered*. What was missing was the join — which chapter a given page is under
 * — and `pageNumberChapterStyle` sat in the schema unread because of it. That is
 * the shape most of this product's gaps have had, and it is why the sweep that
 * finds them is worth re-running.
 *
 * ## What a chapter's number is
 *
 * The number the *numbering* gives its heading, not the heading's position. A
 * chapter is "2" because its heading is numbered 2, and a document whose chapter
 * headings are not numbered has no chapter numbers to print — Word behaves the
 * same way, and printing "1-" for an unnumbered chapter would be inventing one.
 *
 * The counter at level 0 rather than the rendered text: `numberFor` renders "2."
 * or "II." with the level's own format and suffix, and a chapter prefix wants the
 * bare number in the *page number's* format. `counters[0]` is that number before
 * anything is done to it.
 */
import { formatCounter, type NumberFormatValue } from '@barocss/shared';
import type { NumberingResolver } from './numbering-resolver';
import type { EffectiveFormat } from './style-resolver';
import type { TocEntry } from './toc';

/** The separators Word offers, by the name it stores. */
const SEPARATORS: Record<string, string> = {
  hyphen: '-',
  period: '.',
  colon: ':',
  emDash: '—',
  enDash: '–'
};

/**
 * Which of a document's chapter headings a page falls under.
 *
 * The last one at or before it. A page before the first chapter heading is under
 * no chapter — a title page and a contents page come before chapter one — and
 * gets a plain page number, which is what Word prints there too.
 *
 * `entries` is what `tocEntries` returns for the chapter style, so the caller
 * decides which style names a chapter and this decides nothing about styles.
 */
export function chapterAt(entries: TocEntry[], page: number): TocEntry | undefined {
  let found: TocEntry | undefined;

  for (const entry of entries) {
    if (entry.page === undefined || entry.page > page) continue;
    // In document order, so a later one at or before this page is the nearer.
    if (!found || (found.page ?? -1) <= entry.page) found = entry;
  }

  return found;
}

/**
 * The chapter's number as it should be printed, or nothing.
 *
 * Nothing when the page is under no chapter, or when the chapter's heading is
 * not numbered: a document may name a chapter style whose headings carry no
 * numbering at all, and there is no number to print. Inventing one from the
 * heading's position would be a page number that disagrees with the heading it
 * claims to be under.
 */
export function chapterNumber(
  entries: TocEntry[],
  page: number,
  numbering: NumberingResolver | undefined,
  format: EffectiveFormat
): string | undefined {
  const chapter = chapterAt(entries, page);
  if (!chapter || !numbering) return undefined;

  const numbered = numbering.numberFor(chapter.sid);
  const counter = numbered?.counters?.[0];
  if (typeof counter !== 'number') return undefined;

  const style =
    typeof format.pageNumberFormat === 'string' ? format.pageNumberFormat : 'decimal';
  return formatCounter(counter, style as NumberFormatValue);
}

/**
 * The separator between the chapter and the page.
 *
 * Word stores a name (`w:chapSep`) rather than the character. A hyphen when the
 * section says nothing, which is Word's default and the form everyone recognises
 * — `1-1` rather than `1.1`, which reads as a decimal.
 */
export function chapterSeparator(format: EffectiveFormat): string {
  const named = format.pageNumberChapterSeparator;
  if (typeof named !== 'string') return '-';
  return SEPARATORS[named] ?? named;
}

/**
 * The page number a section asks for, with its chapter in front when it asks for
 * one.
 *
 * The one function the furniture calls. A section that does not name a chapter
 * style gets exactly what it got before — this is not a mode, it is a prefix
 * that is usually absent.
 */
export function pageNumberWithChapter(
  page: number,
  format: EffectiveFormat,
  chapters: TocEntry[],
  numbering: NumberingResolver | undefined,
  /** The page the number is printed on, zero-based, as the layout counts them. */
  pageIndex: number
): string {
  const style =
    typeof format.pageNumberFormat === 'string' ? format.pageNumberFormat : 'decimal';
  const printed = formatCounter(page, style as NumberFormatValue);

  if (typeof format.pageNumberChapterStyle !== 'string' || !format.pageNumberChapterStyle) {
    return printed;
  }

  const chapter = chapterNumber(chapters, pageIndex, numbering, format);
  return chapter === undefined ? printed : `${chapter}${chapterSeparator(format)}${printed}`;
}
