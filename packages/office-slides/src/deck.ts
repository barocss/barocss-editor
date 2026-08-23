import {
  connectorBoxOf,
  connectorChanges,
  connectorPoints,
  connectorSpecOf,
  connectorTrack,
  hasOwnBend,
  pairKeyOf,
  pointOnPath,
  readWaypoints,
  separationBend,
  type ConnectorBox,
  type ConnectorSpec
} from '@barocss/office-word';
/**
 * Reading a deck: which slides it has, and what belongs to each.
 *
 * The app needs this and so will the presenter view, the exporter and the
 * outline, so it lives here rather than in one of them — the same reason
 * `tocEntries` lives in `office-word` and not in Word's navigation pane. It is
 * a read of the document and nothing else: no DOM, no editor, no rendering, so
 * it is testable in milliseconds and usable from any of them.
 */

/** The little of a document this needs, so a caller can pass anything. */
export interface DeckAccess {
  getNode: (sid: string) => DeckNode | undefined;
  rootId: string;
}

export interface DeckNode {
  sid?: string;
  stype?: string;
  attributes?: Record<string, unknown>;
  /**
   * The characters, for the one node type that is text rather than a box.
   *
   * Read here already — `firstText` in `layers.ts` labels a shape by its first words
   * and reached for it through `(node as { text?: unknown }).text`, because this
   * interface did not say a node could have any. So every fixture that built an
   * inline-text was writing a property the type denied, which the compiler said the
   * first time it was allowed to read the tests.
   */
  text?: string;
  /** Child sids, which is how a loaded document holds its children. */
  content?: unknown;
}

/** One slide, as the chrome around a deck needs it. */
export interface Slide {
  sid: string;
  /** Position in the deck, from 1, which is what a slide is called. */
  number: number;
  /** What the author named it, or what its title says, or nothing. */
  name: string;
  /** Kept in the deck, skipped while presenting. */
  hidden: boolean;
  /** The layout it takes its placeholder formatting from. */
  layoutId?: string;
}

/**
 * A node's children, as sids.
 *
 * Exported because it was written **seven times** in this package — deck, deck
 * file, layout format, motion, text units, theme, timeline — with two spellings of
 * the same filter. Nothing had gone wrong yet, and that is the point: seven copies
 * of a predicate is seven chances for one of them to decide differently about a
 * node whose `content` holds something that is not a sid.
 */
export const childrenOf = (node: DeckNode | undefined): string[] =>
  Array.isArray(node?.content)
    ? (node!.content as unknown[]).filter((child): child is string => typeof child === 'string')
    : [];

const attrString = (node: DeckNode | undefined, key: string): string | undefined => {
  const value = node?.attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * The text a node holds, however deep it is.
 *
 * Used only to name a slide that the author never named, which is most of them:
 * a slide is known by its title, and a rail listing "Slide 4" five times is a
 * rail nobody reads. Depth-limited because this walks an author's document and
 * a malformed one should not hang the chrome.
 */
function textOf(doc: DeckAccess, sid: string, depth = 0): string {
  if (depth > 6) return '';
  const node = doc.getNode(sid);
  if (!node) return '';

  const own = (node as { text?: unknown }).text;
  if (typeof own === 'string') return own;

  return childrenOf(node)
    .map((child) => textOf(doc, child, depth + 1))
    .join('');
}

/**
 * What to call a slide.
 *
 * The author's name wins, because they said it. Otherwise the title
 * placeholder, because that is what the slide is about and what every
 * presentation tool shows in its rail. A slide with neither gets nothing rather
 * than a made-up name, and the caller draws "Slide 4" — a name invented here
 * would be indistinguishable from one the author chose.
 */
function nameOf(doc: DeckAccess, surface: DeckNode): string {
  const given = attrString(surface, 'name');
  if (given) return given;

  for (const child of childrenOf(surface)) {
    const node = doc.getNode(child);
    if (node?.stype !== 'textFrame') continue;
    if (attrString(node, 'role') !== 'title') continue;

    const text = textOf(doc, child).trim();
    if (text) return text;
  }

  return '';
}

/**
 * Every slide in the deck, in order.
 *
 * A slide is a `surface`, and the deck is the surfaces the document holds —
 * which is the same walk Word does for its sections, because a deck and a
 * document are the same document shape. `resources` is skipped: a layout is a
 * `slideLayout` full of `textFrame`s and is not a slide, and the walk that
 * missed that would put every layout in the rail.
 */
/**
 * The kinds of surface that are **not** pages of the deck.
 *
 * A component's definition is edited on a surface of its own — which is what gives it the
 * whole editing apparatus for nothing — and it is not a slide: it is not in the sequence, it
 * is never presented, and it is drawn only when a reader opens it.
 */
const DEFINITION_KINDS = new Set(['component']);

/**
 * Whether a surface is one of the deck's **slides**.
 *
 * ## Why this is not `kind === 'slide'`
 *
 * Measured: a deck this product writes always says `kind: 'slide'`, and plenty of documents
 * do not — most of this package's own fixtures leave it out, and so would a converter or an
 * older version. Filtering *for* `'slide'` would make those documents look like decks with no
 * slides in them, which is the worst possible answer for a file somebody already had.
 *
 * So a surface is a page unless it says it is a **definition**. Named in one place because
 * six readers ask this question, and the day a second kind of definition arrives they should
 * not each have to learn about it.
 *
 * This is also the fault that decided the component design: `deckSlides` asked only about
 * `stype`, so the moment a document held any surface that was not a slide it appeared in the
 * filmstrip, in the count, in the presenter's *next slide* — and would have been presented.
 */
export function isSlideSurface(node: DeckNode | undefined): node is DeckNode {
  if (node?.stype !== 'surface') return false;
  const kind = node.attributes?.kind;
  return typeof kind !== 'string' || !DEFINITION_KINDS.has(kind);
}

/**
 * The surface a reader's action applies to: a slide, or a **definition** they have opened.
 *
 * ## The fault this exists for
 *
 * Every insert command took a `slideId` and validated it against `deckSlides`. Measured, and
 * both halves are wrong the moment a definition can be edited: a caller that passed the
 * definition's sid was **refused** (a definition is not one of the deck's slides), and a
 * caller that passed nothing inserted onto **slide 1** while the reader was looking at a
 * component — silently, which is the worse of the two.
 *
 * So there is one question, asked in one place: *is this a surface a reader can edit?* A
 * slide is, and so is a component's definition. What is not is anything that is not a
 * surface at all.
 *
 * The default stays the first **slide**, because a command with no argument is answering
 * "put it on the deck" — which is what a console, a test and a toolbar with nothing open all
 * mean.
 */
export function editableSurface(doc: DeckAccess, sid?: string): string | undefined {
  if (sid) {
    const node = doc.getNode(sid);
    return node?.stype === 'surface' ? sid : undefined;
  }
  return deckSlides(doc)[0]?.sid;
}

export function deckSlides(doc: DeckAccess): Slide[] {
  const root = doc.getNode(doc.rootId);
  if (!root) return [];

  const slides: Slide[] = [];
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (!isSlideSurface(node)) continue;

    slides.push({
      sid,
      number: slides.length + 1,
      name: nameOf(doc, node),
      hidden: node.attributes?.hidden === true,
      layoutId: attrString(node, 'layoutId')
    });
  }

  return slides;
}

/**
 * A subtree, copied as a plain tree with no identity.
 *
 * Sids are deliberately dropped. A sid is `session:counter` and belongs to one
 * node; a copy is a different node, and carrying the original's sid across
 * would give two nodes one identity — which every mapping from a DOM position
 * back to the model, and every reference by id, resolves through.
 *
 * Depth-limited for the same reason the text walk is: this reads an author's
 * document, and a malformed one must not take the editor down with it.
 */
export function copyOf(doc: DeckAccess, sid: string, depth = 0): DeckNode | undefined {
  if (depth > 32) return undefined;
  const node = doc.getNode(sid);
  if (!node) return undefined;

  const copy: DeckNode & { text?: string } = {
    stype: node.stype,
    attributes: { ...(node.attributes ?? {}) }
  };

  const text = (node as { text?: unknown }).text;
  if (typeof text === 'string') copy.text = text;

  const children = childrenOf(node)
    .map((child) => copyOf(doc, child, depth + 1))
    .filter((child): child is DeckNode => child !== undefined);
  if (children.length > 0) copy.content = children;

  return copy;
}

/**
 * A payload-local name, so a copied line can point at a copied shape.
 *
 * `__ref` on every copied node and `__startRef`/`__endRef` on a connector whose end
 * holds something **inside the same copy**. Both are stripped before anything reaches
 * the document; they exist for the trip.
 */
interface Copied extends DeckNode {
  __ref?: number;
  __startRef?: number;
  __endRef?: number;
  text?: string;
}

/**
 * Copies, with the references inside them made local to the copy.
 *
 * ## The bug this is for
 *
 * Copy two shapes and the line joining them, paste, and the pasted line pointed at the
 * **originals** — so a duplicated diagram was two sets of shapes with both lines
 * attached to the first set. Measured in a browser, and it is the classic form of this
 * fault: an identity that means something in one place travelling to another where it
 * means something else.
 *
 * ## Why not by sid
 *
 * A sid is `session:counter`, handed out at load — so the same sid exists in *another*
 * deck open in the same session, and a paste there would attach the line to whatever
 * happens to hold that number. The copy carries its own numbering instead, which is the
 * same argument the coordinates already follow: what is on the clipboard is
 * self-contained.
 *
 * A reference **out** of the copy is kept as a sid, deliberately: a reader who copies
 * one line and not the shapes it joins means the shapes it joins. In another deck that
 * dangles, and the connector reaction releases it — leaving the line where it was drawn,
 * which is §8.2's rule.
 */
export function copyForPaste(doc: DeckAccess, sids: string[]): DeckNode[] {
  let next = 0;
  const refs = new Map<string, number>();

  const copy = (sid: string, depth = 0): Copied | undefined => {
    const node = doc.getNode(sid);
    if (!node || depth > 32) return undefined;

    const ref = next;
    next += 1;
    refs.set(sid, ref);

    const made: Copied = {
      stype: node.stype,
      attributes: { ...(node.attributes ?? {}) },
      __ref: ref
    };
    const text = (node as { text?: unknown }).text;
    if (typeof text === 'string') made.text = text;

    const children = childrenOf(node)
      .map((child) => copy(child, depth + 1))
      .filter((child): child is Copied => child !== undefined);
    if (children.length > 0) made.content = children;
    return made;
  };

  const boxes = sids
    .map((sid) => copy(sid))
    .filter((box): box is Copied => box !== undefined);

  /** A second pass, because a line may point at a shape copied after it. */
  const localise = (node: Copied): void => {
    if (node.stype === 'connector') {
      for (const which of ['start', 'end'] as const) {
        const held = (node.attributes ?? {})[`${which}NodeId`];
        if (typeof held === 'string' && refs.has(held)) {
          node[`__${which}Ref` as '__startRef'] = refs.get(held);
          delete (node.attributes as Record<string, unknown>)[`${which}NodeId`];
        }
      }
    }
    for (const child of (node.content ?? []) as Copied[]) localise(child);
  };
  for (const box of boxes) localise(box);

  return boxes as DeckNode[];
}

/**
 * Those copies, ready to be added: a fresh sid on every node and the local references
 * resolved to them.
 *
 * The sids are made **here** rather than read back after the commit, so the whole paste
 * is one transaction and one undo. `addChild` honours a `sid` a caller provides, which
 * is what makes that possible.
 */
export function pastable(boxes: DeckNode[], newSid: () => string): DeckNode[] {
  const trees = JSON.parse(JSON.stringify(boxes)) as Copied[];
  const madeFor = new Map<number, string>();

  const stamp = (node: Copied): void => {
    const sid = newSid();
    (node as { sid?: string }).sid = sid;
    if (typeof node.__ref === 'number') madeFor.set(node.__ref, sid);
    for (const child of (node.content ?? []) as Copied[]) stamp(child);
  };
  for (const tree of trees) stamp(tree);

  const resolve = (node: Copied): void => {
    for (const which of ['start', 'end'] as const) {
      const ref = node[`__${which}Ref` as '__startRef'];
      if (typeof ref === 'number' && madeFor.has(ref)) {
        (node.attributes as Record<string, unknown>)[`${which}NodeId`] = madeFor.get(ref);
      }
    }
    // Off before it reaches the document: these are the trip's, not the deck's.
    delete node.__ref;
    delete node.__startRef;
    delete node.__endRef;
    for (const child of (node.content ?? []) as Copied[]) resolve(child);
  };
  for (const tree of trees) resolve(tree);

  return trees as DeckNode[];
}

/**
 * The boxes a new slide of this layout starts with.
 *
 * This is what makes `slideLayout` a definition rather than a decoration: it
 * was drawn (hidden) and read by nothing until a slide had to be created from
 * one. The placeholders are *copies* — a new slide owns its boxes, and editing
 * the title of slide four must not rewrite the layout every other slide follows.
 */
export function layoutPlaceholders(doc: DeckAccess, layoutId: string | undefined): DeckNode[] {
  return layoutPlaceholderSids(doc, layoutId)
    .map((placeholder) => copyOf(doc, placeholder))
    .filter((placeholder): placeholder is DeckNode => placeholder !== undefined);
}

/**
 * The same placeholders, as the sids the document actually holds.
 *
 * `layoutPlaceholders` copies, because its caller is putting them in a slide and
 * a shared node would make editing one slide's title rewrite the layout. A
 * caller that only wants to *read* a placeholder needs the opposite: a copy's
 * children are nested nodes rather than sids, so walking into one finds nothing.
 *
 * That difference cost a debugging session. Resolving a slide's font through its
 * layout came back empty for every slide, because the placeholder was found and
 * its paragraphs — the things carrying the formatting — were invisible.
 */
export function layoutPlaceholderSids(doc: DeckAccess, layoutId: string | undefined): string[] {
  if (!layoutId) return [];

  const root = doc.getNode(doc.rootId);
  if (!root) return [];

  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'resources') continue;

    for (const child of childrenOf(node)) {
      const layout = doc.getNode(child);
      if (layout?.stype !== 'slideLayout') continue;
      if (attrString(layout, 'id') !== layoutId) continue;
      return childrenOf(layout);
    }
  }

  return [];
}

/**
 * The note a slide shows its presenter.
 *
 * The slide names the note by the note's `id`, the same direction a surface
 * names its header — the only binding in this schema that anything actually
 * resolves, and the only one expressible before the document has sids.
 *
 * Returns the note's sid rather than its text, because a note is editable
 * content: a string would have thrown away the marks, the paragraphs and the
 * ability to put a caret in it.
 */
export function noteFor(doc: DeckAccess, surfaceSid: string): string | undefined {
  const surface = doc.getNode(surfaceSid);
  const noteId = attrString(surface, 'noteId');
  if (!noteId) return undefined;

  const root = doc.getNode(doc.rootId);
  if (!root) return undefined;

  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'resources') continue;

    for (const child of childrenOf(node)) {
      const resource = doc.getNode(child);
      if (resource?.stype !== 'surfaceNote') continue;
      if (attrString(resource, 'id') === noteId) return child;
    }
  }

  return undefined;
}

/**
 * The presenter's note as plain text.
 *
 * The note is a subtree of paragraphs and runs — the notes *pane* draws it with
 * the renderers, because it is editable there — and a presenter's screen wants
 * the words, at a size a person reads standing up, with no caret in them.
 *
 * A paragraph per line, because that is what the author typed. Joining them
 * with spaces would run a list of three points into one sentence, which is the
 * one thing notes are used for.
 */
export function noteTextOf(doc: DeckAccess, surfaceSid: string): string[] {
  const note = noteFor(doc, surfaceSid);
  if (!note) return [];

  const lines: string[] = [];
  const text = (sid: string, depth: number): string => {
    if (depth > 32) return '';
    const node = doc.getNode(sid);
    if (!node) return '';
    const own = (node as { text?: unknown }).text;
    if (typeof own === 'string') return own;
    return childrenOf(node)
      .map((child) => text(child, depth + 1))
      .join('');
  };

  for (const child of childrenOf(doc.getNode(note))) {
    const node = doc.getNode(child);
    if (!node) continue;
    lines.push(text(child, 0));
  }

  // Trailing empty paragraphs are what a note looks like while it is being
  // written; they are not something to show a presenter.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

/**
 * The shapes a connector has to get past, in the container's coordinates.
 *
 * Everything beside it on the same slide, except the two it joins: a line is *there*
 * to reach those, and counting them would give a route that refuses to touch its own
 * ends. Groups and frames count as one box rather than being walked into — a route
 * around a group is what a reader means, and threading between the members of one
 * makes a diagram harder to read, not easier.
 *
 * Gathered here rather than in the arithmetic because it is a question about the
 * *document*: which siblings, which parent, and what a group is.
 */
export function obstaclesFor(doc: DeckAccess, connectorSid: string): ConnectorBox[] {
  const node = doc.getNode(connectorSid);
  if (!node) return [];
  const parent = doc.getNode((node as { parentId?: string }).parentId ?? '');
  if (!parent) return [];

  const spec = connectorSpecOf(node as never);
  const held = new Set([spec.start.nodeId, spec.end.nodeId, connectorSid].filter(Boolean));

  const boxes: ConnectorBox[] = [];
  for (const sid of childrenOf(parent)) {
    if (held.has(sid)) continue;
    const sibling = doc.getNode(sid);
    // A line is not an obstacle: two connectors crossing is ordinary in a diagram, and
    // routing around each other is how a diagram becomes a plate of spaghetti.
    if (!sibling || sibling.stype === 'connector') continue;
    const box = connectorBoxOf(sibling as never);
    if (box) boxes.push(box);
  }
  return boxes;
}

/**
 * How deep a chain of lines attached to lines is followed.
 *
 * A branch off a branch off a flow is ordinary; four deep is not, and a **cycle** is
 * reachable by hand — two lines each attached to the other. The cap is what makes that
 * a wrong-looking line rather than a hung tab.
 */
const CHAIN_LIMIT = 4;

/**
 * Where a node's own coordinates are measured **from**, in its surface's space.
 *
 * Every placed thing's `x` and `y` are its *container's*, so a shape inside a group is at
 * the group's origin plus its own — which is why a container is a coordinate space and
 * not just a box (`docs/specs/canvas-model.md` §2).
 *
 * Walks up to the surface, adding each container on the way. The surface itself
 * contributes nothing: it *is* the space.
 */
export function spaceOriginOf(doc: DeckAccess, sid: string | undefined): { x: number; y: number } {
  let at: string | undefined = sid ? (doc.getNode(sid) as { parentId?: string } | undefined)?.parentId : undefined;
  const origin = { x: 0, y: 0 };
  for (let depth = 0; at && depth < 32; depth += 1) {
    const node = doc.getNode(at);
    if (!node || node.stype === 'surface') break;
    const attrs = node.attributes ?? {};
    if (typeof attrs.x === 'number') origin.x += attrs.x;
    if (typeof attrs.y === 'number') origin.y += attrs.y;
    at = (node as { parentId?: string }).parentId;
  }
  return origin;
}

/**
 * A held shape's box, in the **connector's** coordinate space.
 *
 * The bug this exists for: group a shape a line is attached to, and the shape's `x`
 * becomes the *group's* — so the line, which lives on the slide, drew to a point a
 * group's width away from the shape. Measured: an end at (9000, 6500) jumped to
 * (1000, 5000) the moment the shape was grouped.
 *
 * Both origins are taken to the surface and subtracted, so it also holds for the other
 * direction — a connector inside a group joined to a shape outside it.
 */
function heldBoxOf(doc: DeckAccess, connectorSid: string, heldSid: string | undefined) {
  const box = heldSid ? connectorBoxOf(doc.getNode(heldSid) as never) : undefined;
  if (!box || !heldSid) return undefined;

  const mine = spaceOriginOf(doc, connectorSid);
  const theirs = spaceOriginOf(doc, heldSid);
  if (mine.x === theirs.x && mine.y === theirs.y) return box;
  return { ...box, x: box.x + theirs.x - mine.x, y: box.y + theirs.y - mine.y };
}

/**
 * A connector's route, with everything it depends on resolved.
 *
 * The one place the deck answers "where does this line actually go", so the renderer
 * and the overlay cannot disagree — and they would: the route depends on the shapes it
 * joins, the shapes in the way, and, when an end holds another line, on *that* line's
 * route. Three inputs and two callers is how a line and its own handles end up in
 * different places.
 *
 * `depth` is the recursion, and the cap is not tidiness: two lines attached to each
 * other is something a reader can build, and without it this would not return.
 */
export function connectorInputsOf(
  doc: DeckAccess,
  sid: string,
  depth = 0
): {
  spec: ConnectorSpec;
  boxes: { start?: ConnectorBox; end?: ConnectorBox };
  obstacles: ConnectorBox[];
  pinned: { start?: { x: number; y: number }; end?: { x: number; y: number } };
  bend: number;
  waypoints: { x: number; y: number }[];
} | undefined {
  const node = doc.getNode(sid);
  if (!node) return undefined;
  const spec = connectorSpecOf(node as never);

  // In *this* connector's space: a held shape may be inside a group, whose children's
  // coordinates are the group's rather than the slide's.
  const box = (nodeId: string | undefined) => heldBoxOf(doc, sid, nodeId);

  /**
   * An end held by another line, resolved to a point on it.
   *
   * The point rather than the line, because that is all the arithmetic takes — it must
   * not walk a document. See `resolveEnds`.
   */
  const heldOnLine = (end: { nodeId?: string; t?: number }) => {
    if (!end.nodeId || typeof end.t !== 'number' || depth >= CHAIN_LIMIT) return undefined;
    if (doc.getNode(end.nodeId)?.stype !== 'connector') return undefined;
    // The track, not the route: a fraction along a line means along the *curve*, and
    // walking a control triangle would put the branch beside the line it is on.
    const held = doc.getNode(end.nodeId);
    const route = connectorRouteOf(doc, end.nodeId, depth + 1);
    const track = connectorTrack(route, connectorSpecOf(held as never).kind);
    return track.length >= 2 ? pointOnPath(track, end.t) : undefined;
  };

  /**
   * How far this line bows, which is the reader's if they have said and ours if not.
   *
   * Two lines between the same pair of shapes are routed identically — drawn one on top
   * of the other, so the reader sees one line and cannot select the other. That is a
   * broken state rather than a styling choice, so they are fanned apart here, in the
   * drawing, with nothing stored. `hasOwnBend` is what keeps a reader's own bow: they
   * have said where this line goes.
   */
  const bend = hasOwnBend(node as never) ? (spec.bend ?? 0) : separationBend(...fanOf(doc, sid));

  return {
    spec,
    boxes: { start: box(spec.start.nodeId), end: box(spec.end.nodeId) },
    obstacles: obstaclesFor(doc, sid),
    pinned: { start: heldOnLine(spec.start), end: heldOnLine(spec.end) },
    bend,
    waypoints: readWaypoints(node as never)
  };
}

/**
 * A connector's route: where the line actually goes.
 *
 * Everything it depends on — the shapes it joins (in *its* coordinate space), the shapes
 * in the way, another line an end holds, and the bow, which may be the fan's rather than
 * the reader's — comes from `connectorInputsOf`, so the drawing, the overlay's handles
 * and the reaction that remembers the ends cannot disagree. They did: the drawing knew
 * about coordinate spaces and the reaction did not, so a line drawn correctly to a shape
 * inside a group *stored* an end at the corner of the slide — and that stored place is
 * what a deleted shape leaves behind.
 */
export function connectorRouteOf(
  doc: DeckAccess,
  sid: string,
  depth = 0
): { x: number; y: number }[] {
  const inputs = connectorInputsOf(doc, sid, depth);
  if (!inputs) return [];
  return connectorPoints(
    { ...inputs.spec, bend: inputs.bend },
    inputs.boxes,
    inputs.obstacles,
    inputs.pinned,
    inputs.waypoints
  );
}

/**
 * What to write on the connectors that hold a shape about to be **deleted**.
 *
 * Two things, and both have to happen while the shape still exists: where the end *is*
 * (so the line stays where it was drawn — §8.2) and the release of the hold.
 *
 * In the deleting transaction rather than in a reaction afterwards, which is the whole
 * point: it is part of the reader's own undo entry, and it is the only moment the live
 * position can still be read. A reaction doing it later has to have been keeping the
 * position fresh on **every** edit — which is what this replaces, and what a
 * collaborative board pays for four numbers at a time on every drag.
 */
export function connectorFreezeSteps(
  doc: DeckAccess,
  doomed: string[]
): { type: string; payload: Record<string, unknown> }[] {
  const going = new Set(doomed);
  if (going.size === 0) return [];

  const steps: { type: string; payload: Record<string, unknown> }[] = [];
  const seen = new Set<string>();

  const walk = (sid: string, depth: number): void => {
    if (depth > 32 || seen.has(sid)) return;
    seen.add(sid);
    const node = doc.getNode(sid);
    if (!node) return;

    if (node.stype === 'connector' && !going.has(sid)) {
      const spec = connectorSpecOf(node as never);
      const holds = [spec.start.nodeId, spec.end.nodeId].some((held) => held && going.has(held));
      if (holds) {
        const inputs = connectorInputsOf(doc, sid);
        if (inputs) {
          const changes = connectorChanges(
            node as never,
            { boxes: inputs.boxes, pinned: inputs.pinned },
            (held) => !going.has(held) && !!doc.getNode(held)
          );
          if (Object.keys(changes).length > 0) {
            steps.push({ type: 'setAttrs', payload: { nodeId: sid, attrs: changes } });
          }
        }
      }
    }

    for (const child of childrenOf(node)) walk(child, depth + 1);
  };
  walk(doc.rootId, 0);
  return steps;
}

/**
 * The same line as something to **measure along**.
 *
 * A route is what is drawn: for a curve or an arc that is control points, and the
 * straight lines between them are the triangle the curve sits inside rather than the
 * curve. Every question of the form "where along this line" — the label's place, an end
 * attached at a fraction, the point nearest a drop — has to walk the curve instead.
 *
 * One helper so the renderer, the overlay and the gesture cannot each answer it
 * differently, which is the same reason `connectorRouteOf` exists.
 */
export function connectorTrackOf(doc: DeckAccess, sid: string): { x: number; y: number }[] {
  const spec = connectorSpecOf(doc.getNode(sid) as never);
  return connectorTrack(connectorRouteOf(doc, sid), spec.kind);
}

/**
 * Which of the lines between this pair of shapes it is, and how many there are.
 *
 * In document order, so the answer is stable: the same two lines fan the same way every
 * time they are drawn, and adding a third moves them both — which is what fanning looks
 * like. A line with a free end is in no pair and stands alone.
 */
function fanOf(doc: DeckAccess, sid: string): [number, number] {
  const node = doc.getNode(sid);
  const key = pairKeyOf(connectorSpecOf(node as never));
  if (!key) return [0, 1];

  const parent = doc.getNode((node as { parentId?: string }).parentId ?? '');
  if (!parent) return [0, 1];

  const together: string[] = [];
  for (const child of childrenOf(parent)) {
    const sibling = doc.getNode(child);
    if (sibling?.stype !== 'connector') continue;
    if (pairKeyOf(connectorSpecOf(sibling as never)) === key) together.push(child);
  }
  const at = together.indexOf(sid);
  return at < 0 ? [0, 1] : [at, together.length];
}
