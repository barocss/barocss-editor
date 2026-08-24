import { transaction } from '@barocss/model';
import type { Editor } from '@barocss/editor-core';
import {
  componentOf,
  findMatches,
  replaceOperations,
  instanceParts,
  instanceVars,
  isVarRef,
  type FindOptions,
  type Match
} from '@barocss/office-word';
import { CANVAS_NAMES } from '@barocss/office-controls';
import { childrenOf, deckSlides, noteFor, type DeckAccess, type DeckNode } from './deck';

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
 * ## What a **card** draws is searched too, and it took a decision
 *
 * A placement holds no parts: what it draws is the definition, resolved where children are read
 * (§10b-2a). So the ordinary walk went blind the day components became references — measured on the
 * sample deck, where every word a card puts on a slide came back with **no matches**:
 *
 * | query | on the screen | found, before |
 * | --- | --- | --- |
 * | `매출` | a card's title, from the placement's own value | 0 |
 * | `1,240만` | the same | 0 |
 * | `지표` | the card's own default text | 0 |
 * | `One card` | an ordinary title on the slide | 1 |
 * | `목표 1.5%` | a row the reader put in the card's slot | 1 |
 *
 * A search that cannot find words a reader is looking at is not a search. So the resolved tree is
 * searched as well — the same answer the deck's own check needed (`auditDeck`) — and every match in
 * one says **which of two things it is**, because replacing them are two different acts:
 *
 * - The words are this **placement's answer** to a question the card asks (a `componentBind` on
 *   `text`, and this placement's value). Replaceable: the write is that placement's value, so
 *   fixing a product name on slide 6 changes slide 6.
 * - The words are the **card's own**. Replacing them would rewrite every placement of the card in
 *   the deck, from a find box, without saying so. Refused — reported, taken to, and named "카드 안",
 *   with the fix where the card is. The same division the audit makes.
 *
 * A value that is itself a reference to a document variable (`var:주의`) is refused for the same
 * reason one layer along: writing a literal over it would quietly stop that card following the
 * document, which is not what "replace" means.
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
   *
   * `card` is text a **placement draws**: it is on the slide and it is not in the document there,
   * so `sid` names a piece of the drawing rather than a node anything can write to.
   */
  where: 'text' | 'note' | 'card';
  /**
   * For a `card` match: the placement drawing it.
   *
   * What a reader can actually be taken to and select — a resolved part's sid is synthetic
   * (`card~…`) and no command accepts one, so a row that offered it would go nowhere.
   */
  placementSid?: string;
  /**
   * For a `card` match whose words are this placement's **answer**: the variable to write.
   *
   * Absent when the words are the card's own, which is what makes the match unreplaceable from
   * here — see the header. `whole` is the value the offsets are into, so a replacement can be
   * spliced without reading the drawing again.
   */
  varName?: string;
  whole?: string;
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

    /** And what the slide's **cards** draw, which is not in the document there. */
    for (const placement of placementsOn(doc, slide.sid)) {
      found.push(...cardMatches(doc, placement, slide.sid, query, options));
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
 * Every placement on a slide, however deep — a card inside a group is still a card.
 *
 * Stops at a placement rather than descending into it: what is inside one is the resolution's
 * business, and a nested placement is resolved there too (`instanceParts` carries the cycle guard).
 */
function placementsOn(doc: DeckAccess, slideSid: string): string[] {
  const found: string[] = [];

  const walk = (sid: string, depth: number) => {
    if (depth > 16) return;
    const node = doc.getNode(sid);
    if (!node) return;
    if (node.stype === 'instance') {
      found.push(sid);
      return;
    }
    for (const child of childrenOf(node)) walk(child, depth + 1);
  };

  for (const child of childrenOf(doc.getNode(slideSid))) walk(child, 0);
  return found;
}

/**
 * What one placement **draws**, searched.
 *
 * The resolved tree, skipping every node that is a real one: the reader's own things in a card's
 * slot keep their own sids and are found by the ordinary walk, so searching them here would report
 * every one of them twice.
 *
 * `partId` is carried down the walk because a bound run is three levels under the part that names
 * it — a run inside a paragraph inside a text frame — and the binding is written about the part.
 */
function cardMatches(
  doc: DeckAccess,
  placement: string,
  slideSid: string,
  query: string,
  options: FindOptions
): DeckMatch[] {
  const node = doc.getNode(placement);
  const definition = componentOf(doc as never, node as never);
  if (!definition) return [];

  /** Which part takes its words from which variable, and what this placement answers. */
  const bound = new Map<string, string>();
  for (const bind of definition.binds) {
    if (bind.attr === 'text') bound.set(bind.part, bind.var);
  }
  const said = new Map(
    instanceVars(doc as never, node as never, definition).map((one) => [one.name, one.value])
  );

  const found: DeckMatch[] = [];
  const needle = options.caseSensitive ? query : query.toLowerCase();

  const walk = (part: DeckNode, partId: string | undefined, depth: number) => {
    if (depth > 32) return;
    // A real node: the reader's own, inside the slot, and already found once.
    if (typeof part.sid === 'string' && !part.sid.includes('~')) return;

    const named = typeof part.attributes?.partId === 'string' ? part.attributes.partId : partId;
    const text = (part as { text?: unknown }).text;

    if (typeof text === 'string' && text.length > 0 && part.sid) {
      const hay = options.caseSensitive ? text : text.toLowerCase();
      for (let from = 0; ; ) {
        const at = hay.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;

        const whole =
          !options.wholeWord || (!isWordChar(text[at - 1]) && !isWordChar(text[end]));
        if (whole) {
          /*
           * Whether this run's words are the placement's **answer**, which is the only case a
           * replace can write. A value that is itself a reference to a document variable is not: a
           * literal written over it would quietly stop this card following the document.
           */
          const variable = named ? bound.get(named) : undefined;
          const value = variable ? said.get(variable) : undefined;
          const own = variable !== undefined && value !== undefined && !isVarRef(value) && value === text;

          found.push({
            sid: part.sid,
            start: at,
            end,
            slideSid,
            where: 'card',
            placementSid: placement,
            ...(own ? { varName: variable, whole: value } : {})
          });
        }
        from = end > at ? end : at + 1;
      }
    }

    for (const child of ((part as { content?: unknown }).content ?? []) as DeckNode[]) {
      if (child && typeof child === 'object') walk(child, named, depth + 1);
    }
  };

  for (const part of instanceParts(doc as never, node as never) as never as DeckNode[]) {
    walk(part, undefined, 0);
  }
  return found;
}

/** A letter, a digit or an underscore — the same rule Word's whole-word search uses. */
function isWordChar(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
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
 * The whole match, not a stripped one: it used to hand back `{sid, start, end}` so a caller could
 * pass it straight to Word's `replaceOperations`, and that stopped being enough the day a match
 * could be in a **card** — where the write is a placement's value and the sid names a piece of the
 * drawing. `replacePlan` is what reads the difference now, so this stays a filter and nothing else.
 */
export function matchesOn(matches: DeckMatch[], slideSid: string): DeckMatch[] {
  return matches.filter((match) => match.slideSid === slideSid);
}

/**
 * What replacing a set of matches would **write**, and what it cannot.
 *
 * Two kinds of write, because a deck now holds two kinds of text: a run of characters in the
 * document, and a value a placement answers a card's question with. One plan for both, so a caller
 * commits once and one press of undo takes the whole replacement back — a slide with half its
 * occurrences replaced is not a state anybody asked for.
 *
 * And a third kind that is **refused**: words a card owns. Rewriting those from a find box would
 * change every placement of the card in the deck without saying so, which is the one thing this
 * feature must not do quietly. They come back in `refused` so the panel can say the number and
 * point at the card.
 */
export interface ReplacePlan {
  /** Ready for a transaction: the run rewrites and the value rewrites, in one list. */
  steps: unknown[];
  /** How many matches this plan writes, which is what a panel reports. */
  written: number;
  /** The matches nothing here can write — a card's own words. */
  refused: DeckMatch[];
}

export function replacePlan(
  doc: DeckAccess,
  matches: DeckMatch[],
  replacement: string
): ReplacePlan {
  const runs: Match[] = [];
  const refused: DeckMatch[] = [];
  /** One entry per placement and variable, because two matches in one value are one write. */
  const values = new Map<string, { nodeId: string; name: string; whole: string; spans: Match[] }>();

  for (const match of matches) {
    if (match.where !== 'card') {
      runs.push({ sid: match.sid, start: match.start, end: match.end });
      continue;
    }
    if (!match.varName || match.whole === undefined || !match.placementSid) {
      refused.push(match);
      continue;
    }

    const key = `${match.placementSid}\u0000${match.varName}`;
    const held = values.get(key) ?? {
      nodeId: match.placementSid,
      name: match.varName,
      whole: match.whole,
      spans: []
    };
    held.spans.push({ sid: match.sid, start: match.start, end: match.end });
    values.set(key, held);
  }

  const steps: unknown[] = [...replaceOperations(runs, replacement)];
  let written = runs.length;

  for (const value of values.values()) {
    /*
     * Spliced from the **end**, like the run rewrites: replacing at 3 moves every offset after it,
     * and going backwards is what makes two matches in one value arithmetic rather than bookkeeping.
     */
    const spans = [...value.spans].sort((a, b) => b.start - a.start);
    let text = value.whole;
    for (const span of spans) text = text.slice(0, span.start) + replacement + text.slice(span.end);
    written += spans.length;

    /** The answer node, when this placement has already given one. */
    const answer = childrenOf(doc.getNode(value.nodeId)).find((sid) => {
      const node = doc.getNode(sid);
      return node?.stype === 'componentValue' && node.attributes?.name === value.name;
    });

    if (answer) {
      steps.push({ type: 'setAttrs', payload: { nodeId: answer, attrs: { value: text } } });
    } else {
      /*
       * A placement drawing the card's **default** and being replaced: the answer is written for
       * the first time, which is exactly what an override is here. Only reachable when the default
       * is a literal — a card's own static words are refused above — so the words being replaced
       * really are this placement's to change.
       */
      steps.push({
        type: 'addChild',
        payload: {
          parentId: value.nodeId,
          child: { stype: 'componentValue', attributes: { name: value.name, value: text } }
        }
      });
    }
  }

  return { steps, written, refused };
}

/**
 * Replace, in one edit.
 *
 * Here rather than in the panel because building a transaction is model work — the same division
 * Word's `replaceMatches` makes, and this is that function plus the two things a deck adds: a
 * placement's value, and the matches it must refuse.
 */
export async function replaceInDeck(
  editor: Editor,
  doc: DeckAccess,
  matches: DeckMatch[],
  replacement: string
): Promise<{ ok: boolean; written: number; refused: DeckMatch[] }> {
  const plan = replacePlan(doc, matches, replacement);
  if (plan.steps.length === 0) return { ok: false, written: 0, refused: plan.refused };

  const result = await transaction(editor, plan.steps as never).commit();
  return { ok: result.success === true, written: plan.written, refused: plan.refused };
}
