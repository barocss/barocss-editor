import { childrenOf, type DeckAccess, type DeckNode } from './deck';
import {
  deckComponents,
  instanceValues,
  slotNameOf,
  type ComponentBind
} from './components';

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
 */
export function instanceParts(
  doc: DeckAccess,
  instance: DeckNode | undefined,
  /** The definitions this resolution is already inside, which is how a cycle is refused. */
  inside: readonly string[] = []
): DeckNode[] {
  const id = instance?.attributes?.componentId;
  if (typeof id !== 'string' || !id) return childrenOf(instance).map((sid) => doc.getNode(sid) as DeckNode).filter(Boolean);

  const definition = deckComponents(doc).find((one) => one.id === id);
  // A definition that is gone: the placement draws its own children, which is nothing to look at
  // but is honest — and the deck's own check is what says the definition is missing.
  if (!definition) return [];
  // A card inside itself. Refused rather than drawn, and the depth is what catches the mutual case
  // (A holds B, B holds A) that a visited set alone does not.
  if (inside.includes(definition.id) || inside.length > 8) return [];

  const values = instanceValues(doc, instance, definition);
  const binds = definition.binds;
  const own = childrenOf(instance)
    .map((sid) => doc.getNode(sid) as DeckNode)
    .filter((node) => node && node.stype !== 'componentValue');

  const slot = definition.parts.find((part) => slotNameOf(doc, part));

  return definition.parts.map((part) =>
    resolvePart(doc, part, values, binds, {
      slotOf: slot,
      own,
      inside: [...inside, definition.id]
    })
  );
}

/** One part, with the values in it and the reader's own things in the slot. */
function resolvePart(
  doc: DeckAccess,
  sid: string,
  values: Map<string, string>,
  binds: ComponentBind[],
  where: { slotOf?: string; own: DeckNode[]; inside: readonly string[] },
  depth = 0
): DeckNode {
  const node = doc.getNode(sid) as DeckNode;
  const attrs = { ...((node?.attributes ?? {}) as Record<string, unknown>) };
  const partId = typeof attrs.partId === 'string' ? attrs.partId : undefined;

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
  const kids = childrenOf(node).map((child) =>
    resolvePart(doc, child, values, binds, where, depth + 1)
  );
  const mine = sid === where.slotOf ? where.own : [];
  const nested =
    node?.stype === 'instance'
      ? instanceParts(doc, { ...node, sid } as DeckNode, where.inside)
      : [];

  const resolved: DeckNode & { text?: string; content?: unknown } = {
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
function withText(node: DeckNode, text: string): Partial<DeckNode> & { text?: string } {
  const content = (node as { content?: unknown }).content;
  if (typeof (node as { text?: unknown }).text === 'string') return { text };
  if (!Array.isArray(content) || content.length === 0 || typeof content[0] !== 'object') return {};
  const first = content[0] as DeckNode;
  return { content: [{ ...first, ...withText(first, text) }] } as never;
}
