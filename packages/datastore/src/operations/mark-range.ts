import type { IMark } from '../types';

/**
 * Room for a mark, made by taking it off the range it is going onto.
 *
 * ## The defect this exists for
 *
 * Applying a mark appended it. So a run that was red and was then made green
 * carried *both* `fontColor` marks over the same characters, and the reader kept
 * the red: **the colour of coloured text could not be changed.** Measured in the
 * deck on 2026-08-19 — red, then green, and the model held
 * `[{color:'FF0000',range:[0,24]}, {color:'00FF00',range:[0,24]}]` while the
 * screen showed red — and true of every product, since this is the path every
 * colour, highlight, font and size command takes. Word's colour palette shipped
 * the day before with the same fault behind it.
 *
 * A run has one colour. Two marks claiming otherwise is not a document anyone
 * can draw, and which of them wins would be whatever the renderer nested last.
 *
 * ## Trimmed, not dropped
 *
 * The blunt version — drop any same-type mark that overlaps — loses the
 * formatting *outside* the range: colouring one word of a red sentence would
 * take the red off the rest of it. So each overlap is cut, which can leave the
 * head, the tail, both, or nothing:
 *
 * ```
 * mark  ●━━━━━━━━━━━━━━━━━━━━●        [0, 24)
 * range         ●━━━━━●                [8, 14)
 * left  ●━━━━━━━●     ●━━━━━━━━●      [0, 8) and [14, 24)
 * ```
 *
 * Marks of other types are untouched: bold and a colour are different questions
 * and a run answers both at once.
 *
 * A mark with no range is a mark over the whole node — that is what the rest of
 * this file means by one — so it is cut like any other rather than left to
 * shadow what is being applied.
 *
 * ## Which marks this happens to
 *
 * Only the ones the schema calls `single`. Cutting every same-type mark would
 * destroy the ones that legitimately stack: two comments overlap on the same
 * sentence, and a tracked insertion overlaps everything under it. So the schema
 * says which marks are one value per character — a colour, a highlight, a size,
 * a family — and this runs for those and no others.
 */
export function clearMarkOverRange(
  marks: IMark[] | undefined,
  stype: string,
  range: [number, number],
  textLength: number
): IMark[] {
  const [start, end] = range;
  if (!marks || marks.length === 0) return [];
  if (start >= end) return [...marks];

  const kept: IMark[] = [];
  for (const mark of marks) {
    if (mark.stype !== stype) {
      kept.push(mark);
      continue;
    }

    const [markStart, markEnd] = mark.range ?? [0, textLength];
    // Disjoint: before the range, or after it. Untouched.
    if (markEnd <= start || markStart >= end) {
      kept.push(mark);
      continue;
    }

    // The part that reaches in front of the range, if any.
    if (markStart < start) kept.push({ ...mark, range: [markStart, start] });
    // And the part that reaches past it.
    if (markEnd > end) kept.push({ ...mark, range: [end, markEnd] });
    // A mark covered entirely by the range leaves nothing behind, which is the
    // whole point: the new one takes its place.
  }

  return kept;
}

/**
 * Whether applying this mark replaces one of its own kind.
 *
 * Asked of the schema rather than of a list kept here: a list would be a second
 * place to say what a mark means, and the two would disagree the first time a
 * product added one. A store with no active schema replaces nothing, which is
 * what this did before the schema was asked.
 */
export function markIsSingleValued(
  schema: { getMarkType?: (type: string) => { single?: boolean } | undefined } | undefined,
  stype: string
): boolean {
  return schema?.getMarkType?.(stype)?.single === true;
}
