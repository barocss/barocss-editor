import { childrenOf, DeckAccess, DeckNode } from './deck';

/**
 * Animating text by the piece: a paragraph at a time, a word at a time, a letter
 * at a time.
 *
 * ## Why it is an option on a build and not a kind of step
 *
 * `docs/specs/motion-model.md` first said this would need a `text` kind of its
 * own. It does not, and the reason is worth keeping: **every one of the twelve
 * effects works on a piece of text exactly as it works on a box.** Letters that
 * fade in, words that fly in from the left, a paragraph that wipes — the effect
 * vocabulary is the same one, and a `text` kind would have to hold a copy of it.
 *
 * What is actually new is *what the effect is applied to*: the box, or the
 * pieces of its text. So a build gains a `unit` and a `stagger`, which is also
 * how PowerPoint stores it — an entrance effect with "group text: by paragraph /
 * by word / by letter" beside it — and the twelve effects and six curves come
 * along untouched.
 *
 * ## Where the split happens
 *
 * In the **view**, not the model. The document holds `inline-text` runs, and a
 * run is one node however many characters it holds; a model that stored a node
 * per letter would make every text operation — typing, marks, selection offsets
 * — walk a tree of graphemes, which is the cost the run model exists to avoid.
 *
 * So the renderer's output is split at play time and put back afterwards, the
 * same way the caret filler is a rendered thing no node describes. What the
 * model owns is *how many pieces there are*, because the timeline needs it: a
 * step's bar is `duration + stagger × (pieces - 1)` wide, and whatever follows it
 * has to wait for the last letter rather than the first.
 *
 * ## Graphemes, not characters
 *
 * `for (const ch of text)` splits an emoji with a skin-tone modifier into pieces
 * that are not letters, and a Hangul syllable typed in jamo into pieces that are
 * not syllables. `Intl.Segmenter` with `granularity: 'grapheme'` is the correct
 * split and is available in every browser this product runs in — measured, along
 * with the rest of the motion research.
 */

/** What a build applies its effect to. */
export const TEXT_UNITS = ['box', 'paragraph', 'word', 'letter'] as const;

export type TextUnit = (typeof TEXT_UNITS)[number];

/**
 * How long between one piece and the next, when a step does not say.
 *
 * 60ms is the interval at which a run of letters reads as *one* thing arriving
 * in sequence rather than as many things arriving separately: below about 30 the
 * stagger stops being visible, and above about 120 a title of twenty letters
 * takes two and a half seconds to finish, which is longer than anybody holds a
 * slide for its first line.
 */
export const DEFAULT_STAGGER = 60;

/** What a reader calls each of them. */
export const TEXT_UNIT_LABELS: Record<TextUnit, string> = {
  box: '상자 전체',
  paragraph: '문단마다',
  word: '단어마다',
  letter: '글자마다'
};

const segmenter = (granularity: 'grapheme' | 'word'): Intl.Segmenter | undefined => {
  // Available everywhere this product runs, and guarded anyway: a browser
  // without it gets a coarser split rather than no animation.
  if (typeof Intl === 'undefined' || typeof (Intl as never as { Segmenter?: unknown }).Segmenter !== 'function') {
    return undefined;
  }
  return new Intl.Segmenter(undefined, { granularity });
};

/**
 * The graphemes of a string — what a reader means by "letters".
 *
 * Not `text.split('')`, which breaks a surrogate pair in half, and not
 * `[...text]`, which splits an emoji with a modifier into its parts. Falls back
 * to code points where `Intl.Segmenter` is missing, which is wrong for exactly
 * the strings nobody animates letter by letter.
 */
export function graphemes(text: string): string[] {
  const segments = segmenter('grapheme');
  if (!segments) return [...text];
  return [...segments.segment(text)].map((entry) => entry.segment);
}

/**
 * The words of a string, with the space that follows each one attached to it.
 *
 * The space matters: a word animated without its trailing space is a word whose
 * gap to the next one appears before it does, so a line assembles with holes in
 * it. Keeping the space with the word it follows means the pieces concatenate
 * back to exactly the original string, which is also what makes the split
 * reversible.
 */
export function words(text: string): string[] {
  const segments = segmenter('word');
  const pieces: string[] = [];

  if (segments) {
    for (const entry of segments.segment(text)) {
      if (entry.isWordLike || pieces.length === 0) {
        pieces.push(entry.segment);
      } else {
        // Punctuation and spaces belong to the word they follow.
        pieces[pieces.length - 1] += entry.segment;
      }
    }
    return pieces.filter((piece) => piece.length > 0);
  }

  // Without a segmenter: split on spaces and keep them.
  return text.split(/(?<=\s)/).filter((piece) => piece.length > 0);
}

/**
 * Scripts whose letters *join*, where a per-letter split is not a style choice.
 *
 * Splitting text into one span per letter stops the browser shaping across the
 * boundaries. For Latin and Hangul nothing changes — the glyphs are independent
 * either way — but Arabic, Persian, Urdu, Syriac, Devanagari and Thai *connect*,
 * and بيت split letter by letter renders as بـ يـ ت: not a different look, the
 * **wrong text**.
 *
 * So a letter unit on text like that is served as a *word* unit, which is the
 * nearest thing that is still correct. Cheap insurance rather than a feature: no
 * deck this product ships can reach it, and the first one that can would
 * otherwise reach it silently.
 *
 * The ranges are the joining scripts' own blocks. Not a complete list of the
 * world's connected scripts, and deliberately: a range added here is a range
 * somebody has seen break.
 */
const JOINS = /[\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0E00-\u0E7F\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function joinsUp(text: string): boolean {
  return JOINS.test(text);
}

/**
 * A string in the pieces a unit asks for.
 *
 * `box` is one piece, which is the whole point of it being in the same list as
 * the others: a step that animates the box is the same code path with one unit.
 */
export function splitText(text: string, unit: TextUnit): string[] {
  // A joining script animated letter by letter would be drawn with its letters
  // disconnected, which is wrong text rather than a different style. Words are
  // the nearest unit that stays correct.
  if (unit === 'letter' && joinsUp(text)) return words(text);
  if (unit === 'letter') return graphemes(text);
  if (unit === 'word') return words(text);
  return text.length > 0 ? [text] : [];
}

/**
 * The pieces that actually get an animation: the split, without the blanks.
 *
 * A space is drawn and never animated. Fading in a gap is invisible, and it
 * would spend a beat of the stagger doing it — so "One engine" is ten pieces
 * split and *nine* animated, and the wave arrives one beat sooner than the count
 * of graphemes says.
 *
 * This function exists because two places need that number and had drifted: the
 * timeline was sizing a bar from 24 letters while the stage was animating 21, so
 * a title's bar was 135ms too wide and whatever followed it waited for a letter
 * that was a space. One rule, read twice.
 */
export function animatedPieces(text: string, unit: TextUnit): string[] {
  return splitText(text, unit).filter((piece) => piece.trim().length > 0);
}


/** Every paragraph under a box, in order — the pieces `paragraph` animates. */
function paragraphsOf(doc: DeckAccess, sid: string, depth = 0): DeckNode[] {
  if (depth > 8) return [];
  const node = doc.getNode(sid);
  if (!node) return [];
  if (node.stype === 'paragraph') return [node];

  const found: DeckNode[] = [];
  for (const child of childrenOf(node)) found.push(...paragraphsOf(doc, child, depth + 1));
  return found;
}

/** The text of one node and everything under it, concatenated. */
function textOf(doc: DeckAccess, sid: string, depth = 0): string {
  if (depth > 12) return '';
  const node = doc.getNode(sid);
  if (!node) return '';

  const own = (node as { text?: unknown }).text;
  if (typeof own === 'string') return own;

  let text = '';
  for (const child of childrenOf(node)) text += textOf(doc, child, depth + 1);
  return text;
}

/**
 * How many pieces a box's text has, for a unit.
 *
 * The one thing about this that the *model* has to know, because the timeline
 * cannot draw a bar without it: a step's length is `duration + stagger × (pieces
 * - 1)`, and whatever follows it waits for the last piece rather than the first.
 *
 * A box with no text at all is one piece. Not zero: a step animating nothing
 * still takes its duration, and a zero would make the bar vanish and the next
 * step start on top of it.
 */
export function unitCount(doc: DeckAccess, sid: string | undefined, unit: TextUnit): number {
  if (!sid || unit === 'box') return 1;

  const paragraphs = paragraphsOf(doc, sid);
  if (paragraphs.length === 0) return 1;

  if (unit === 'paragraph') return paragraphs.length;

  let pieces = 0;
  for (const paragraph of paragraphs) {
    const text = textOf(doc, (paragraph as { sid?: string }).sid ?? '');
    pieces += animatedPieces(text, unit).length;
  }
  return Math.max(1, pieces);
}

/**
 * How long a step occupies, counting the stagger.
 *
 * One pass: the last piece starts `stagger × (pieces - 1)` in and takes the
 * duration, so the whole thing is over one stagger-span later than a box would
 * be. Everything that asks "when does this step end" goes through here.
 */
export function unitSpan(duration: number, stagger?: number, pieces?: number): number {
  /**
   * Missing means "a box", and a missing stagger means the default.
   *
   * Total arithmetic on purpose: these three numbers come from a document, and a
   * `NaN` reaching this would become a bar of no width and a step that starts at
   * no time — a timeline that draws nothing, for a step that is fine. Every
   * caller that had the numbers passes them; the ones that do not get the
   * behaviour a box has always had.
   */
  const gap = Number.isFinite(stagger) ? Math.max(0, stagger as number) : DEFAULT_STAGGER;
  const count = Number.isFinite(pieces) ? Math.max(1, Math.round(pieces as number)) : 1;
  return duration + gap * (count - 1);
}
