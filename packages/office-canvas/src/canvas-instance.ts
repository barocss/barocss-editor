import {
  childrenToLayOut,
  fillChildren,
  laysOut,
  layoutChildren,
  type LaidOutPlace
} from './canvas-layout';
import { childrenOf, type CanvasAccess, type CanvasNode } from './canvas-access';
import {
  componentsOf,
  instanceValues,
  slotNameOf,
  type ComponentBind
} from './canvas-component';

/**
 * What a **placement draws**: the definition's parts, with this placement's values in them.
 *
 * ## Why this is resolved and not copied
 *
 * A component has to follow its definition **as it is edited**. A template is the other thing: a
 * document you copy and then own. So a placement holds no parts — it names a definition, says what
 * its variables are, and what a reader sees is the definition itself.
 *
 * The engine can do this in exactly one place: the proxy the view reads children through
 * (`DataStore.setContentResolver`). It has to be there rather than in a renderer, and that was
 * measured — a renderer that built the parts' elements itself evaluated every one of them against
 * the *placement*, so two parts came out with the placement's box and the placement's sid. Resolved
 * here, each part arrives as itself: its own coordinates, its own words, its own children.
 *
 * The save is untouched, because the save walks the stored nodes. So a file says what a reader has:
 * a placement and the values it was given.
 *
 * ## What a reader's own things do
 *
 * They go **in the slot**, which is a part the definition marks (§10b-8). A placement's own children
 * are put inside the resolved slot rather than beside the parts, so a card with a list in it is a
 * card whose list the reader owns and whose frame the definition owns.
 *
 * ## The one thing this must refuse
 *
 * A definition that contains a placement of itself. Drawing that is an infinite descent, so the
 * resolution carries the definitions it is already inside and stops.
 *
 * ## Why the arrangement happens here as well
 *
 * A card that can be resized is a card whose parts were told to fill it, and until now a
 * *reaction* wrote those sizes into the document. It cannot any more: a resolved part is not a
 * document node, and nothing in a transaction can touch it.
 *
 * So the same arithmetic runs here instead — `fillChildren` for what fills the placement,
 * `layoutChildren` for a frame that arranges what is in it — over the resolved tree, parent before
 * child, so a frame given the placement's new width arranges its own rows against **that** width
 * rather than the one still stored in the definition.
 *
 * This is better rather than worse, and the reason is the write cost: resizing a placement now
 * changes nothing in the document at all, so twenty placements of one card cost twenty
 * arrangements at draw time and **zero** document writes — where before, one drag wrote a box into
 * every part of every placement, and the drawing could disagree with the document until the
 * reaction had caught up.
 */

/**
 * What a caller may say about a placement it is drawing **more than once**.
 *
 * Both fields exist for one case, and it is worth naming: a **repeated** placement — a card drawn
 * once per row of data. Everything else about that card is the definition's, which is why the hook
 * is this small: the values it is given, and what the parts it draws are named after.
 */
export interface PlacementOptions {
  /**
   * The values this drawing uses, given the ones the placement resolved.
   *
   * Where a repeater puts a row in. The document still holds one placement saying `field:제목`; what
   * the *drawing* gets is that row's title, and nothing was written to say so.
   */
  rewrite?: (values: Map<string, string>) => Map<string, string>;
  /**
   * What the drawn parts are named after, instead of the placement's own sid.
   *
   * One placement drawn twenty times would otherwise draw twenty elements claiming one sid, and
   * `querySelector` would answer the first for all of them — measured once already, on three
   * placements of one card, and written up below.
   */
  owner?: string;
}

export function instanceParts(
  doc: CanvasAccess,
  instance: CanvasNode | undefined,
  /** The definitions this resolution is already inside, which is how a cycle is refused. */
  inside: readonly string[] = [],
  options?: PlacementOptions
): CanvasNode[] {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string' || !id) return childrenOf(instance).map((sid) => doc.getNode(sid) as CanvasNode).filter(Boolean);

  const definition = componentsOf(doc).find((one) => one.id === id);
  // A definition that is gone: the placement draws its own children, which is nothing to look at
  // but is honest — and the deck's own check is what says the definition is missing.
  if (!definition) return [];
  // A card inside itself. Refused rather than drawn, and the depth is what catches the mutual case
  // (A holds B, B holds A) that a visited set alone does not. `nestingOf` answers *why* it stopped,
  // so the deck's own check can say so rather than the tail going missing in silence.
  if (inside.includes(definition.id) || inside.length > NEST_LIMIT) return [];

  const resolved = instanceValues(doc, instance, definition);
  const values = options?.rewrite ? options.rewrite(resolved) : resolved;
  const binds = definition.binds;
  const own = childrenOf(instance)
    .map((sid) => doc.getNode(sid) as CanvasNode)
    .filter((node) => node && node.stype !== 'componentValue');

  const slot = definition.parts.find((part) => slotNameOf(doc, part));

  /**
   * The parts that were told to fill the placement take its box.
   *
   * A placement has no arrangement of its own — no mode, no gap, no order — and this one sentence
   * is what makes a card resizable: `fillChildren` is the same function the canvas uses for it, so
   * a card and a frame answer the question the same way.
   */
  const fills = fillChildren(
    { attributes: instance?.attributes as Record<string, unknown> },
    childrenToLayOut(doc.getNode as never, definition.parts)
  );

  return definition.parts.map((part) =>
    resolvePart(
      doc,
      part,
      values,
      binds,
      {
        slotOf: slot,
        own,
        inside: [...inside, definition.id],
        /**
         * **This placement**, which is what makes a drawn part's identity its own.
         *
         * It used to be the definition's id, and that was measured as exactly the fault the comment
         * below says it avoids: three placements of one card on the sample's slide drew
         * `metric-card~slides:138` three times, so `querySelector` found the first one and any motion,
         * hit test or lookup aimed at the third reached the first.
         */
        owner: options?.owner ?? instance?.sid ?? definition.id,
        /*
         * Carried down, so a placement *inside* a repeated one gets the same row: a card that holds
         * a badge is one card, and the badge is that row's badge.
         */
        rewrite: options?.rewrite
      },
      fills.get(part)
    )
  );
}

/** One part, with the values in it and the reader's own things in the slot. */
function resolvePart(
  doc: CanvasAccess,
  sid: string,
  values: Map<string, string>,
  binds: ComponentBind[],
  where: {
    slotOf?: string;
    own: CanvasNode[];
    inside: readonly string[];
    owner: string;
    rewrite?: PlacementOptions['rewrite'];
  },
  /** What the container above decided about this part, when it decided anything. */
  at?: LaidOutPlace,
  depth = 0
): CanvasNode {
  const node = doc.getNode(sid) as CanvasNode;
  const attrs = { ...((node?.attributes ?? {}) as Record<string, unknown>) };
  const partId = typeof attrs.partId === 'string' ? attrs.partId : undefined;

  // Only what the arrangement decided: a width it did not answer is the part's own, which is the
  // same contract `layoutChildren` has with the reaction that writes its answers.
  if (at) {
    attrs.x = at.x;
    attrs.y = at.y;
    if (typeof at.width === 'number') attrs.width = at.width;
    if (typeof at.height === 'number') attrs.height = at.height;
  }

  let text: string | undefined;
  for (const bind of partId ? binds.filter((one) => one.part === partId) : []) {
    const value = values.get(bind.var);
    if (value === undefined) continue;
    if (bind.attr === 'text') {
      text = value;
      continue;
    }
    if (value === 'true' || value === 'false') {
      if (value === 'false') attrs[bind.attr] = false;
      else delete attrs[bind.attr];
      continue;
    }
    // A number where the attribute means one: the document keeps a value as a string (one shape to
    // write, diff and check) and a length has to be a number by the time it is drawn.
    const asNumber = Number(value);
    attrs[bind.attr] = value.trim() !== '' && Number.isFinite(asNumber) ? asNumber : value;
  }

  /**
   * The children: the part's own, plus the reader's own inside the **slot**.
   *
   * A placement of a component *inside* a definition is resolved here too, which is what makes a
   * card that holds a badge work — and `inside` is what stops a card that holds itself.
   */
  /**
   * And this part's own arrangement, decided **before** its children are resolved.
   *
   * Parent before child, because a frame that has just been given the placement's width has to
   * arrange its rows against that width — reading the document here would give the width the
   * definition stores, and the rows would come out the size of the card as it was drawn in the
   * library. Measured as exactly that fault when the reaction did this work.
   */
  const inner =
    node?.stype === 'frame' && laysOut(attrs)
      ? layoutChildren({ attributes: attrs }, childrenToLayOut(doc.getNode as never, childrenOf(node)))
      : undefined;

  const kids = childrenOf(node).map((child) =>
    resolvePart(doc, child, values, binds, where, inner?.get(child), depth + 1)
  );
  const mine = sid === where.slotOf ? where.own : [];
  const nested =
    node?.stype === 'instance'
      ? // With the **drawn** sid as the placement, so a badge inside a card inside a card is still one
        // thing per outermost placement rather than one per definition.
        instanceParts(doc, { ...node, sid: `${where.owner}~${sid}` } as CanvasNode, where.inside, {
          rewrite: where.rewrite
        })
      : [];

  const resolved: CanvasNode & { text?: string; content?: unknown } = {
    ...node,
    attributes: attrs,
    /**
     * A **synthetic** sid, made of **this placement** and the part it draws.
     *
     * Two things at once, and the first was measured wrong before it was measured right:
     *
     * - *Unique per placement.* It was the definition's id, so three placements of one card drew
     *   three elements claiming `metric-card~slides:138`, and `querySelector` answered the first one
     *   for all three. The placement's own sid makes each drawn part its own thing, which is what any
     *   motion, hit test or lookup aimed at a part needs.
     * - *Recognisably not a document node.* Nothing in a store's own ids contains `~`, so a reader of
     *   the DOM can tell "a piece of a placement" from "a node in the document" — and a click on one
     *   selects the placement rather than something nobody can edit.
     */
    sid: `${where.owner}~${sid}`,
    content: node?.stype === 'instance' ? nested : [...kids, ...mine]
  } as never;

  if (text !== undefined) return { ...resolved, ...withText(resolved, text) } as never;
  return resolved as never;
}

/**
 * A bound part draws the value and nothing else: the runs collapse to one, keeping the first one's
 * formatting, so the definition's font survives and the value is all the part says.
 */
function withText(node: CanvasNode, text: string): Partial<CanvasNode> & { text?: string } {
  const content = (node as { content?: unknown }).content;
  if (typeof (node as { text?: unknown }).text === 'string') return { text };
  if (!Array.isArray(content) || content.length === 0 || typeof content[0] !== 'object') return {};
  const first = content[0] as CanvasNode;
  return { content: [{ ...first, ...withText(first, text) }] } as never;
}

/**
 * The children a node draws when its **words** come from a variable.
 *
 * The same rule a bound part follows — the runs collapse to one, keeping the first one's formatting,
 * so the shape's font survives and the value is all it says. Written into resolved *copies*, so the
 * document still holds whatever the reader typed and taking the binding off brings it back.
 *
 * Children resolved from their sids first, because a bare shape's are stored ids where a resolved
 * part's are already objects: one function, both callers, and the walk is where the difference lives.
 */
export function contentWithWords(
  doc: CanvasAccess,
  node: CanvasNode | undefined,
  words: string
): CanvasNode[] {
  const kids = childrenOf(node)
    .map((sid) => doc.getNode(sid))
    .filter((child): child is CanvasNode => !!child);

  // Nothing to write into: a text frame with no paragraph draws nothing either way, and inventing
  // one here would be this function deciding what a paragraph looks like.
  if (kids.length === 0) return kids;

  const [first] = kids;
  const rewritten = { ...first, ...withText(deepen(doc, first), words) };
  return [rewritten as CanvasNode];
}

/**
 * A node with its children as objects, one level at a time, so `withText` can walk into it.
 *
 * A stored node's `content` is sids and `withText` reads objects — it was written for the resolved
 * tree, where children already are. Resolving lazily rather than copying the whole subtree keeps a
 * long paragraph from being rebuilt to change one run.
 */
function deepen(doc: CanvasAccess, node: CanvasNode, depth = 0): CanvasNode {
  if (depth > 8) return node;
  const kids = childrenOf(node).map((sid) => doc.getNode(sid));
  if (kids.length === 0) return node;
  return {
    ...node,
    content: kids.filter(Boolean).map((child) => deepen(doc, child as CanvasNode, depth + 1))
  } as never;
}

/**
 * How deep a card may hold a card, and it is the **cycle guard** rather than a taste.
 *
 * A card holding a badge is ordinary, so nesting cannot be refused outright; a card holding *itself*
 * is an infinite descent, so it must be. A depth limit catches the mutual case a visited set alone
 * does not (A holds B, B holds A, drawn from C).
 *
 * Eight is arbitrary in the way every such number is, and what makes it honest is that the deck's own
 * check reports a document that reaches it — measured: a chain twelve deep drew nine levels and lost
 * the rest with no word about it.
 */
export const NEST_LIMIT = 8;

/** Why a chain of placements stopped, when it stopped for a reason. */
export type NestingCut = 'cycle' | 'deep';

/**
 * How deep the chain of cards under a placement goes, and whether the drawing had to stop.
 *
 * Walks the **definitions** rather than the drawn tree, which is the only way to see past the point
 * the resolution gave up: from the outside, a placement that drew nothing because of a cycle and one
 * whose card has no parts look exactly alike.
 *
 * A card may hold several placements; the depth is the deepest of them, and the first reason found is
 * the one reported — a cycle is a fault in the document, where the limit is a fact about this
 * product.
 */
export function nestingOf(
  doc: CanvasAccess,
  instance: CanvasNode | undefined
): { depth: number; cut?: NestingCut } {
  let deepest = 0;
  let cut: NestingCut | undefined;

  const walk = (id: unknown, inside: readonly string[]) => {
    if (typeof id !== 'string' || !id) return;

    const definition = componentsOf(doc).find((one) => one.id === id);
    if (!definition) return;

    if (inside.includes(definition.id)) {
      cut ??= 'cycle';
      return;
    }
    if (inside.length > NEST_LIMIT) {
      cut ??= 'deep';
      return;
    }

    const chain = [...inside, definition.id];
    deepest = Math.max(deepest, chain.length);

    /** Every placement inside the definition, however deep among its parts. */
    const inParts = (sid: string, depth: number) => {
      if (depth > 32) return;
      const node = doc.getNode(sid);
      if (!node) return;
      if (node.stype === 'instance') {
        walk(node.attributes?.componentId, chain);
        return;
      }
      for (const child of childrenOf(node)) inParts(child, depth + 1);
    };
    for (const part of definition.parts) inParts(part, 0);
  };

  walk(instance?.attributes?.componentId, []);
  return { depth: deepest, ...(cut ? { cut } : {}) };
}

/**
 * Making a placement **draw its definition**, on whatever store a product hands over.
 *
 * ## Why this is here and not in a product
 *
 * The deck wrote it first, in its kit: a content resolver that answers `instanceParts` for an
 * `instance` and the node's own children for everything else. The site builder then needed the same
 * three lines on its first day — a reusable header is one definition placed on every page, which is
 * the mechanism doing the job it is most obviously for — and two products writing one resolver is
 * the test `docs/SHARED-LAYER.md` sets: *share what two implementations disagreeing about would be a
 * bug.* Two answers to "what does a placement draw" is one of them being wrong.
 *
 * ## What stays the product's
 *
 * Everything else a resolver does. The deck's also resolves a shape's **variable bindings** and its
 * theme references, which need the deck's own scope walk; a site has no theme slots yet. So this
 * takes the product's own resolver as a fallback and asks it whatever it does not answer itself —
 * which keeps the deck's behaviour exactly as it was while the site gets the half it needs.
 *
 * The **save is untouched**, and that is the whole design: `exportToTree` walks the stored nodes, so
 * a file says what a reader has — a placement and the values it was given, never the parts it drew.
 */
export function installInstanceResolution(
  editor: { dataStore?: unknown; getRootId?: () => string | undefined },
  /** What the product resolves that the shared answer does not. Asked second. */
  andThen?: (node: CanvasNode, getNode: (sid: string) => CanvasNode | undefined, doc: CanvasAccess) => unknown
): void {
  const store = editor.dataStore as
    | { setContentResolver?: (resolve: (node: CanvasNode, getNode: (sid: string) => CanvasNode) => unknown) => void }
    | undefined;

  store?.setContentResolver?.((node, getNode) => {
    const rootId = editor.getRootId?.();
    if (!rootId) return undefined;
    const doc = { rootId, getNode } as CanvasAccess;

    /*
     * A placement draws its definition — **unless it has already been drawn**.
     *
     * The proxy asks this for every node a reader reaches, including the ones a resolver just
     * returned. For a single placement that costs nothing: its parts are frames and headings, and
     * none of them is a placement. A **repeated** one is the case that measured it — a list draws one
     * placement per row, so each row *is* an instance, and asking again threw the row away and drew
     * the definition's defaults three times.
     *
     * `alreadyDrawn` is not a guess: a stored node's children are sids, and only a resolved one's are
     * nodes. So the question is "did this come out of the document", and the answer is in its shape.
     */
    if (node?.stype === 'instance') {
      return alreadyDrawn(node) ? undefined : (instanceParts(doc, node) as never);
    }
    return andThen?.(node, getNode, doc);
  });
}

/**
 * Whether this node's children are already nodes rather than the document's sids — which is what a
 * resolver's own output looks like, and what nothing stored ever looks like.
 */
function alreadyDrawn(node: CanvasNode | undefined): boolean {
  const content = (node as { content?: unknown })?.content;
  return Array.isArray(content) && content.length > 0 && typeof content[0] === 'object';
}
