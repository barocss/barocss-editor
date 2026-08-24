import { childrenOf, deckSlides, type DeckAccess, type DeckNode } from './deck';
import { isContainerType } from './selection';

/**
 * A deck that is **not a line**: a shape a reader presses, and the page it shows.
 *
 * ## Why this is a model
 *
 * Everything a jump has to answer is a question about the document: which shapes on this page
 * are buttons, which page each one leads to, whether that page still exists, and which pages
 * nothing leads to. All of it is answerable with no DOM and no show running — so all of it is
 * tested in milliseconds, and the presenting layer is left with one job: when a press lands on a
 * button, go where it says.
 *
 * ## What was already there, measured before any of this was written
 *
 * The click is not new. `present.tsx` already collects the shapes whose press *runs* something
 * (`triggers`, by sid) and already has the rule a jump needs: **a press that fires a trigger
 * does not also advance the deck** — written when a build could be triggered, with the reason
 * that a quiz answer must not advance past its own tick. And `advanceShow` already answers with
 * a `slide` to show. So a jump is a new kind of thing to trigger, not a new mechanism.
 *
 * ## What is deliberately not here
 *
 * **Going back is not a link.** It is the reader's own history — which page they came from — so
 * it is runtime state, held by whatever is running the show, and this file only says that a
 * button asked for it (`kind: 'back'`).
 */

/**
 * How a reader moves through this deck: by pressing on, or by its links only.
 *
 * The deck-level answer, read from the document's own attribute — one decision, because a deck
 * where half the pages advance and half do not is a deck nobody can present. `links` is Keynote's
 * *links only*: a press plays the next build and then stops, and the deck moves when a reader
 * presses a button.
 */
export function deckAdvance(doc: DeckAccess): 'press' | 'links' {
  return doc.getNode(doc.rootId)?.attributes?.advance === 'links' ? 'links' : 'press';
}

/** What one button says. */
export interface Jump {
  /** The shape a reader presses. */
  sid: string;
  /**
   * What kind of press it is: a named page, or one of the ones with no page to name.
   *
   * `page` is the ordinary case and needs `to`. The rest are the buttons every non-linear deck
   * puts in a corner, plus `back`, which is history rather than a link.
   */
  kind: 'page' | 'back' | 'next' | 'previous' | 'first' | 'last';
  /** The durable id of the page it shows, for `kind: 'page'`. */
  to?: string;
  /** Where that page is *now*, or nothing when the deck no longer has it. */
  toSid?: string;
}

const KINDS = ['page', 'back', 'next', 'previous', 'first', 'last'] as const;

/** The page a durable id names, or nothing. */
export function slideById(doc: DeckAccess, id: string | undefined): string | undefined {
  if (!id) return undefined;
  for (const slide of deckSlides(doc)) {
    if (doc.getNode(slide.sid)?.attributes?.id === id) return slide.sid;
  }
  return undefined;
}

/** What a shape says about being pressed, or nothing when it says nothing. */
export function jumpOf(doc: DeckAccess, node: DeckNode | undefined): Jump | undefined {
  const sid = node?.sid;
  if (typeof sid !== 'string') return undefined;

  const attrs = node?.attributes ?? {};
  const declared = attrs.goToKind;
  const kind = KINDS.includes(declared as never) ? (declared as Jump['kind']) : undefined;
  const to = typeof attrs.goTo === 'string' && attrs.goTo.length > 0 ? attrs.goTo : undefined;

  /*
   * A `goTo` with no kind is a page — which is the common case and what a reader means by
   * choosing a page from a list. A kind with no `goTo` is one of the others. Neither is a jump.
   */
  if (!kind && !to) return undefined;
  if ((kind ?? 'page') === 'page') {
    if (!to) return undefined;
    return { sid, kind: 'page', to, toSid: slideById(doc, to) };
  }
  return { sid, kind: kind as Jump['kind'] };
}

/**
 * Every button on one page, in the order they are drawn.
 *
 * Into the containers too — a button is very often a shape inside a frame or a placed card, and a
 * menu of four sections is exactly that. `isContainerType` is the one list of what to go into,
 * which is what stopped this being a fourth answer to that question.
 */
export function jumpsOn(doc: DeckAccess, slideSid: string | undefined): Jump[] {
  const found: Jump[] = [];
  const walk = (sid: string, depth: number) => {
    if (depth > 16) return;
    const node = doc.getNode(sid);
    if (!node) return;
    const jump = jumpOf(doc, { ...node, sid } as DeckNode);
    if (jump) found.push(jump);
    if (!isContainerType(node.stype)) return;
    for (const child of childrenOf(node)) walk(child, depth + 1);
  };
  if (!slideSid) return found;
  for (const child of childrenOf(doc.getNode(slideSid))) walk(child, 0);
  return found;
}

/** Every button in the deck, with the page it is on. */
export function deckJumps(doc: DeckAccess): Array<Jump & { from: string }> {
  return deckSlides(doc).flatMap((slide) =>
    jumpsOn(doc, slide.sid).map((jump) => ({ ...jump, from: slide.sid as string }))
  );
}

/**
 * Which page a press on this button shows, given where the reader is.
 *
 * The whole of a jump's arithmetic, in one place, so the show and the editor's preview cannot
 * disagree about where a button goes. `history` is the reader's own — the pages they have been
 * on, oldest first — and is the only thing here that is not in the document, because "back" is
 * not a link (see the header).
 */
export function jumpTarget(
  doc: DeckAccess,
  jump: Jump | undefined,
  where: { at?: string; history?: string[] } = {}
): string | undefined {
  if (!jump) return undefined;
  if (jump.kind === 'page') return jump.toSid;

  const slides = deckSlides(doc);
  /*
   * The pages a show moves through, which is the deck less what it skips. A hidden page is not
   * somewhere 다음 can land — the same rule the presenter's own stepping follows — and it is
   * still somewhere a **named** jump can go, because a reader who linked to it meant it.
   */
  const shown = slides.filter((slide) => !slide.hidden);
  if (shown.length === 0) return undefined;

  const at = shown.findIndex((slide) => slide.sid === where.at);

  switch (jump.kind) {
    case 'first':
      return shown[0].sid;
    case 'last':
      return shown[shown.length - 1].sid;
    case 'next':
      // Nothing at the end rather than wrapping round: a deck is not a carousel, and a button
      // that quietly went back to the start would be a reader's talk starting again.
      return at >= 0 && at + 1 < shown.length ? shown[at + 1].sid : undefined;
    case 'previous':
      return at > 0 ? shown[at - 1].sid : undefined;
    case 'back': {
      /*
       * The page the reader came from, from *their* history — not the previous page in the deck,
       * which is the mistake this exists to avoid: a reader who jumped from the menu to section
       * four means the menu when they press 돌아가기, not section three.
       */
      const been = where.history ?? [];
      for (let index = been.length - 1; index >= 0; index -= 1) {
        if (been[index] !== where.at) return been[index];
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * What is wrong with the deck's links: a button pointing nowhere, and a page nothing reaches.
 *
 * Both are invisible while the deck is being made and certain to be found by an audience, which
 * is the whole shape of thing the deck's own check exists for (`audit.ts` reads this).
 */
export interface JumpFault {
  kind: 'dead-jump' | 'unreachable';
  /** The page the fault is on: the button's page, or the page nothing reaches. */
  slideSid: string;
  /** The button, for a dead jump. */
  sid?: string;
  /** What it pointed at, for a dead jump. */
  to?: string;
}

export function jumpFaults(doc: DeckAccess): JumpFault[] {
  const faults: JumpFault[] = [];
  const jumps = deckJumps(doc);

  for (const jump of jumps) {
    if (jump.kind !== 'page') continue;
    if (jump.toSid) continue;
    faults.push({ kind: 'dead-jump', slideSid: jump.from, sid: jump.sid, to: jump.to });
  }

  /**
   * A page nothing can reach — which is **narrower** than it first looks, and a browser test is
   * what found that out.
   *
   * The first rule here was "once a deck has a button, every page has to be named by something",
   * and it reported five of the sample deck's six pages the moment one button was added. Which is
   * nonsense: **pressing on still reaches them.** A deck with buttons is not automatically a deck
   * that is *only* buttons — Keynote has a mode for that and this product does not (yet), so the
   * order is alive whatever else the deck has in it.
   *
   * So the flow reaches every page a show moves through, and what is left is the real island: a
   * **hidden** page — one the flow skips by design — that nothing links to. That is a page kept
   * for the questions afterwards and never wired up, which is exactly the thing a reader cannot
   * see in a filmstrip and will find out about in front of a room.
   *
   * When "links only" exists, the flow edges stop existing and this same function answers the
   * larger question with no change.
   */
  /**
   * With **links only**, the order is not alive and the question grows.
   *
   * The flow is what reaches a page in an ordinary deck, so an island is a hidden page nothing
   * links to (below). Once a deck says its links are the only way through, *every* page a button
   * does not name is an island — which is the larger question this function was always going to
   * have to answer, and the reason it is one function rather than two.
   */
  const linksOnly = deckAdvance(doc) === 'links';

  const named = new Set<string>();
  for (const jump of jumps) {
    if (jump.kind === 'page' && jump.toSid) named.add(jump.toSid);
    if (jump.kind === 'first') {
      const first = deckSlides(doc).filter((slide) => !slide.hidden)[0];
      if (first) named.add(first.sid);
    }
    if (jump.kind === 'last') {
      const shown = deckSlides(doc).filter((slide) => !slide.hidden);
      const last = shown[shown.length - 1];
      if (last) named.add(last.sid);
    }
  }

  const shownSlides = deckSlides(doc).filter((slide) => !slide.hidden);
  for (const slide of deckSlides(doc)) {
    // Where the deck is walked, only a hidden page can be an island: the show reaches the rest.
    if (!linksOnly && !slide.hidden) continue;
    if (named.has(slide.sid)) continue;
    /*
     * And the page a links-only show **starts on** is reached by starting: it is where the reader
     * arrives, not somewhere they have to be sent.
     */
    if (linksOnly && shownSlides[0]?.sid === slide.sid) continue;
    faults.push({ kind: 'unreachable', slideSid: slide.sid });
  }

  return faults;
}
