import { findMatches, type FindOptions, type Match } from '@barocss/office-word';
import { CANVAS_NAMES } from '@barocss/office-controls';
import { deckSlides, noteFor, type DeckAccess } from './deck';

/**
 * Finding text across a deck.
 *
 * ## Why a deck needs its own, when Word already finds text
 *
 * Word's `findMatches` walks a document from its root and answers with node-and-
 * range matches, and none of that arithmetic is worth writing twice. What it cannot
 * answer is the question a *deck* asks: **which slide is this on**. In a hundred-page
 * document "the next match" is a scroll; in a hundred-slide deck it is a different
 * slide, and a match with no slide on it is a match a reader cannot be taken to.
 *
 * So this is a walk over the slides that asks Word's function about each one. The
 * text-finding stays in one place; what is added is where each answer came from.
 *
 * ## Why searching from the deck's root would not do
 *
 * It would work and be wrong in two directions at once. Word's walk skips
 * `resources`, which is where a deck keeps its **speaker notes** — so every note in
 * the deck would be invisible to a search. And it would search *nothing else* in
 * there only by luck: a layout's placeholder text and a master's are also under
 * `resources`, and offering to replace inside a layout is offering to break every
 * slide that follows it from a search box.
 *
 * ## What is searched
 *
 * A slide's shapes, the text in its table cells (both go down to paragraphs, so
 * both are free), and its **speaker notes**. Notes sit somewhere else in the model
 * and are the same thing to a person — correcting an old product name in the script
 * is not rarer than correcting it on the slide.
 *
 * Not a layout's or a master's text: a reader searching a deck means the deck.
 *
 * ## The limit, written down rather than worked around
 *
 * A match is found **inside one run of text**. Runs split where formatting changes,
 * so a word with its first half bold is two runs and will not be found. Joining a
 * paragraph's runs to search them would mean splitting them again to replace —
 * and *we* would be deciding which side's formatting the replacement keeps, which
 * is a decision the document should make and we cannot.
 */

/** A match, and where in the deck it is. */
export interface DeckMatch extends Match {
  /** The slide to be on to see it. */
  slideSid: string;
  /**
   * Which kind of text it is in.
   *
   * `note` is not on the slide, so a reader taken to it has to be shown the notes
   * pane as well as the slide — which is the host's business and the reason this
   * is on the match rather than left to be worked out.
   */
  where: 'text' | 'note';
}

/**
 * Every match in the deck, in the order a reader would meet them.
 *
 * Slide by slide, and within a slide the shapes first and the note after: a reader
 * stepping through matches goes through what is on the slide before what is said
 * about it.
 */
export function deckMatches(
  doc: DeckAccess,
  query: string,
  options: FindOptions = {}
): DeckMatch[] {
  if (!query) return [];

  const found: DeckMatch[] = [];

  for (const slide of deckSlides(doc)) {
    /**
     * Word's walk, rooted at the slide.
     *
     * `DeckAccess` and `DocumentAccess` are the same shape — a `getNode` and a
     * root — so scoping a search to one slide is handing it a different root.
     * Nothing had to be added to Word's function for a deck to use it.
     */
    for (const match of findMatches({ ...doc, rootId: slide.sid } as never, query, options)) {
      found.push({ ...match, slideSid: slide.sid, where: 'text' });
    }

    const note = noteFor(doc, slide.sid);
    if (!note) continue;
    for (const match of findMatches({ ...doc, rootId: note } as never, query, options)) {
      found.push({ ...match, slideSid: slide.sid, where: 'note' });
    }
  }

  return found;
}

/**
 * Which shape a match is in.
 *
 * A match's own sid is the **run of text** it was found in, which is three or four
 * levels below anything a reader has a name for: a run inside a paragraph inside a
 * text frame. A slide with nine text boxes on it needs to say *which*, and "the
 * fourth inline-text of the second paragraph" is not that.
 *
 * Walks up to the nearest thing a canvas places. `parentId` rather than a search
 * from the slide down, because the node knows where it is and the alternative is
 * walking the whole slide for every match in it.
 *
 * Nothing when the walk runs out — a match in a note has no shape, and neither
 * does one in a document whose parents are missing.
 */
export function boxOfMatch(doc: DeckAccess, sid: string): string | undefined {
  let at: string | undefined = sid;

  for (let depth = 0; at && depth < 32; depth += 1) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (node.stype && PLACED.has(node.stype)) return at;
    at = (node as { parentId?: string }).parentId;
  }
  return undefined;
}

/**
 * The node types a canvas places, which are the ones a reader can be told about.
 *
 * The shared scene names are the authority on what a canvas holds — this is the
 * subset that is a *thing on a slide* rather than a container of them, plus the two
 * containers, because "in the group" is a useful thing to be told.
 */
const PLACED = new Set(Object.keys(CANVAS_NAMES));

/**
 * How many of the matches are on each slide, for a reader deciding where to look.
 *
 * A count per slide rather than a total: "12 matches" in a sixty-slide deck says
 * nothing about where the work is, and the filmstrip is where a reader would want
 * to be told.
 */
export function matchesPerSlide(matches: DeckMatch[]): Map<string, number> {
  const counted = new Map<string, number>();
  for (const match of matches) {
    counted.set(match.slideSid, (counted.get(match.slideSid) ?? 0) + 1);
  }
  return counted;
}

/**
 * The matches on one slide, which is what a *replace all* on this slide needs.
 *
 * Filtered to the ones that can be written: a note's text is as replaceable as a
 * shape's, so both are here — this exists so a caller can hand the result straight
 * to Word's `replaceOperations` without having to know that a deck's matches carry
 * two extra fields.
 */
export function matchesOn(matches: DeckMatch[], slideSid: string): Match[] {
  return matches
    .filter((match) => match.slideSid === slideSid)
    .map(({ sid, start, end }) => ({ sid, start, end }));
}
