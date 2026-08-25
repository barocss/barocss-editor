import {
  componentSignature,
  componentsOf,
  copyOf,
  documentVars,
  isVarRef,
  varNameOf,
  type ComponentDef
} from '@barocss/office-canvas';
import { documentChildSpot } from '@barocss/schema';
import { accessOfTree } from './tree-access';
import { childrenOf, type DeckAccess, type DeckNode } from './deck';

/**
 * What a copied **card** has to travel with, and what a paste does with it.
 *
 * ## The hole this closes, measured
 *
 * A placement holds no parts: it names a definition (§10b-2a). So copying one into a deck that does
 * not define that name pasted an **invisible empty box** — measured on the sample deck against a
 * fresh one: the paste succeeded, the placement drew **0 parts**, and the deck's own check said
 * *nothing*. Silent, and it looked like it had worked, which is the worst shape a fault can take.
 *
 * Two answers, and both were needed:
 *
 * - The clipboard carries the definitions the copied boxes point at, and the paste adds the ones the
 *   destination has not got. That is what makes a card portable at all.
 * - The audit reports a placement whose definition is missing (`missing-card`), because a clipboard
 *   is not the only way to get one: a deck saved by an earlier version, a definition somebody
 *   deleted, a hand-written file.
 *
 * ## Why this is not the brand-kit import
 *
 * `importComponentPlan` exists and does nearly this — and it records **where the definition came
 * from** (`fromDeck`, a library name or an address the host can resolve, §11i), which is what makes
 * "the library has moved on" a question anyone can ask later.
 *
 * A clipboard has no such name. What was copied may have come from a deck that was never saved, in
 * another window, by another person. Writing the source document's *title* into `fromDeck` would be
 * a reference nothing can resolve, and this repository's rule about references is that they are
 * durable or they are not written. So a pasted card is a **plain copy**: it says nothing about where
 * it came from, and nothing later claims it can be brought up to date.
 *
 * ## What happens when the destination already has that name
 *
 * Compared by **signature**, not by id, because an id is a name and a name is not the card:
 *
 * - The same card → the pasted placement points at the deck's own. Nothing is added, which is the
 *   common case (two slides of one deck, two windows on one file).
 * - A *different* card with the same id → the pasted one arrives under a **new id** and the pasted
 *   placements are repointed at it. Overwriting the destination's card would change every slide
 *   that already used it, from a paste — the same refusal find-and-replace makes about a card's own
 *   words (§10i).
 */

/** What a copy carries besides the boxes themselves. */
export interface CardsCarried {
  /** The definitions the copied boxes name, and the ones *those* name, deep-copied. */
  cards: DeckNode[];
  /**
   * The document variables the copy needs, deep-copied.
   *
   * A card's binding may name one (§10h), and a copied shape's fill may be a `var:` reference. A
   * paste that carried the cards and not these would land a card that draws no colour.
   */
  vars: DeckNode[];
}

/**
 * What the given boxes need, gathered from the deck they are in.
 *
 * Transitive: a card may hold a placement of another card, which is the ordinary case for a badge,
 * and carrying only the first would paste the same hole one level down.
 */
export function cardsFor(doc: DeckAccess, boxes: DeckNode[]): CardsCarried {
  const wanted = new Set<string>();
  const varNames = new Set<string>();

  /** Every `componentId` and every `var:` reference in a tree of plain nodes. */
  const scan = (node: DeckNode | undefined, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 32) return;

    const id = node.attributes?.componentId;
    if (typeof id === 'string' && id) wanted.add(id);
    for (const value of Object.values(node.attributes ?? {})) collectVars(value, varNames);

    for (const child of ((node as { content?: unknown }).content ?? []) as unknown[]) {
      if (typeof child === 'string') scan(doc.getNode(child), depth + 1);
      else scan(child as DeckNode, depth + 1);
    }
  };

  for (const box of boxes) scan(box, 0);

  const defined = componentsOf(doc as never);
  const cards: DeckNode[] = [];
  const carried = new Set<string>();

  /** One definition, with the ones it names after it. */
  const take = (id: string, depth: number) => {
    if (carried.has(id) || depth > 8) return;
    const found = defined.find((one) => one.id === id);
    if (!found) return;
    carried.add(id);

    const copy = copyOf(doc as never, found.sid);
    if (copy) cards.push(copy as never as DeckNode);

    /*
     * What the definition itself needs: the variables its bindings name, and the cards its own
     * parts place. Read from the *document* rather than from the copy, because a copy has no sids
     * to walk with.
     */
    for (const bind of found.binds) {
      if (!found.vars.some((one) => one.name === bind.var)) varNames.add(bind.var);
    }
    for (const part of found.parts) scanDocument(doc, part, wanted, varNames, 0);
    for (const nested of [...wanted]) take(nested, depth + 1);
  };

  for (const id of [...wanted]) take(id, 0);

  const declared = documentVars(doc as never);
  const vars: DeckNode[] = [];
  for (const name of varNames) {
    const found = declared.find((one) => one.name === name);
    if (!found) continue;
    const copy = copyOf(doc as never, found.sid);
    if (copy) vars.push(copy as never as DeckNode);
  }

  return { cards, vars };
}

/** A subtree in the document, scanned for what it names. */
function scanDocument(
  doc: DeckAccess,
  sid: string,
  ids: Set<string>,
  varNames: Set<string>,
  depth: number
) {
  if (depth > 32) return;
  const node = doc.getNode(sid);
  if (!node) return;

  const id = node.attributes?.componentId;
  if (typeof id === 'string' && id) ids.add(id);
  for (const value of Object.values(node.attributes ?? {})) collectVars(value, varNames);

  for (const child of childrenOf(node)) scanDocument(doc, child, ids, varNames, depth + 1);
}

/** Every variable name a value refers to — an attribute, a paint, a gradient stop. */
function collectVars(value: unknown, into: Set<string>, depth = 0) {
  if (isVarRef(value)) {
    into.add(varNameOf(value));
    return;
  }
  if (depth > 3 || !value || typeof value !== 'object') return;
  for (const inner of Array.isArray(value) ? value : Object.values(value)) {
    collectVars(inner, into, depth + 1);
  }
}

/** What a paste has to add to the document, and which ids moved. */
export interface PastePlan {
  /** Ready for the paste's own transaction, so one press of undo takes the whole paste back. */
  steps: unknown[];
  /** `componentId` a pasted placement must be rewritten to, when the name was taken. */
  renames: Record<string, string>;
}

/**
 * What the destination is missing, as steps — nothing when it already has everything.
 *
 * In the **paste's** transaction rather than in one of its own: a paste is one thing a reader did,
 * and a definition arriving in its own entry would mean two presses of undo to take back one
 * gesture, with a library left behind after the first.
 */
export function pasteCardsPlan(doc: DeckAccess, carried: CardsCarried | undefined): PastePlan {
  const steps: unknown[] = [];
  const renames: Record<string, string> = {};
  if (!carried) return { steps, renames };

  const here = componentsOf(doc as never);
  const library = childrenOf(doc.getNode(doc.rootId)).find(
    (sid) => doc.getNode(sid)?.stype === 'components'
  );

  /** The definitions to add, after the id clashes are settled. */
  const adding: DeckNode[] = [];

  for (const card of carried.cards ?? []) {
    const id = card.attributes?.id;
    if (typeof id !== 'string' || !id) continue;

    const mine = here.find((one) => one.id === id);
    if (mine && sameCard(doc, mine, card)) continue;

    if (mine) {
      /*
       * Two different cards, one name. The arriving one is renamed rather than overwriting the
       * deck's — overwriting would change every slide that already used it, from a paste.
       */
      const fresh = freeId(id, [...here.map((one) => one.id), ...Object.values(renames)]);
      renames[id] = fresh;
      adding.push({ ...card, attributes: { ...(card.attributes ?? {}), id: fresh } });
      continue;
    }
    adding.push(card);
  }

  if (adding.length > 0) {
    if (library) {
      for (const card of adding) {
        steps.push({ type: 'addChild', payload: { parentId: library, child: card } });
      }
    } else {
      steps.push({
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: { stype: 'components', content: adding },
          // Where the schema says, not at the end: `components? variables?` is an order, and a
          // container appended after `variables` is refused (§10h).
          position: documentChildSpot(
            childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype),
            'components'
          )
        }
      });
    }
  }

  /**
   * And the variables — only the ones this deck has never heard of.
   *
   * A name the destination already declares keeps **its own value**: a paste that re-coloured the
   * deck it landed in would be a paste changing slides nobody was looking at, which is the same
   * thing the rename above refuses. So the pasted card follows the destination's decision, which is
   * what a variable is for.
   */
  const declared = new Set(documentVars(doc as never).map((one) => one.name));
  const newVars = (carried.vars ?? []).filter((one) => {
    const name = one.attributes?.name;
    return typeof name === 'string' && name.length > 0 && !declared.has(name);
  });

  if (newVars.length > 0) {
    const container = childrenOf(doc.getNode(doc.rootId)).find(
      (sid) => doc.getNode(sid)?.stype === 'variables'
    );
    if (container) {
      for (const one of newVars) {
        steps.push({ type: 'addChild', payload: { parentId: container, child: one } });
      }
    } else {
      steps.push({
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: { stype: 'variables', content: newVars },
          position: documentChildSpot(
            childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype),
            'variables'
          )
        }
      });
    }
  }

  return { steps, renames };
}

/**
 * Whether the deck's own definition says the same thing as the arriving one.
 *
 * The arriving card is read through a **document** of its own — `componentsOf` looks for a
 * `components` container among a root's children, so handing it the bare definition finds nothing
 * and every card would look different from every card. Measured as exactly that: two identical decks
 * renamed each other's cards on paste.
 */
function sameCard(doc: DeckAccess, mine: ComponentDef, theirs: DeckNode): boolean {
  const tree = accessOfTree({
    stype: 'document',
    content: [{ stype: 'components', content: [theirs] }]
  } as never);
  const [arriving] = componentsOf(tree as never);
  if (!arriving) return false;
  return componentSignature(doc as never, mine) === componentSignature(tree as never, arriving);
}

/**
 * `card` → `card-2`, the same rule the brand-kit import follows.
 *
 * Counted rather than stamped with a time: an id is written into the document and a test has to be
 * able to say what it will be. A deck with a thousand cards of one name is a deck this gives up on
 * in a way a reader can read, which is better than a name nobody can predict.
 */
function freeId(id: string, taken: string[]): string {
  for (let at = 2; at < 1000; at += 1) {
    const candidate = `${id}-${at}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${id}-many`;
}
