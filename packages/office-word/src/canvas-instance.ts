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

export function instanceParts(
  doc: CanvasAccess,
  instance: CanvasNode | undefined,
  /** The definitions this resolution is already inside, which is how a cycle is refused. */
  inside: readonly string[] = []
): CanvasNode[] {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string' || !id) return childrenOf(instance).map((sid) => doc.getNode(sid) as CanvasNode).filter(Boolean);

  const definition = componentsOf(doc).find((one) => one.id === id);
  // A definition that is gone: the placement draws its own children, which is nothing to look at
  // but is honest — and the deck's own check is what says the definition is missing.
  if (!definition) return [];
  // A card inside itself. Refused rather than drawn, and the depth is what catches the mutual case
  // (A holds B, B holds A) that a visited set alone does not.
  if (inside.includes(definition.id) || inside.length > 8) return [];

  const values = instanceValues(doc, instance, definition);
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
      { slotOf: slot, own, inside: [...inside, definition.id] },
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
  where: { slotOf?: string; own: CanvasNode[]; inside: readonly string[] },
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
      ? instanceParts(doc, { ...node, sid } as CanvasNode, where.inside)
      : [];

  const resolved: CanvasNode & { text?: string; content?: unknown } = {
    ...node,
    attributes: attrs,
    /**
     * A **synthetic** sid: this piece is not in the document, and two placements of one card would
     * otherwise draw two elements claiming the same identity — which every lookup by sid would then
     * find twice.
     *
     * Distinguishable on purpose: nothing in a store's own ids contains `~`, so a reader of the DOM
     * can tell "a piece of a placement" from "a node in the document", and a click on one selects
     * the placement rather than something the reader cannot edit.
     */
    sid: `${(where.inside[where.inside.length - 1] ?? 'x')}~${sid}`,
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
