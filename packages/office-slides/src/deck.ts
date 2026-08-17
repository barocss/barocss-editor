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

const childrenOf = (node: DeckNode | undefined): string[] =>
  Array.isArray(node?.content) ? (node!.content as unknown[]).filter((c): c is string => typeof c === 'string') : [];

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
export function deckSlides(doc: DeckAccess): Slide[] {
  const root = doc.getNode(doc.rootId);
  if (!root) return [];

  const slides: Slide[] = [];
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'surface') continue;

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
