/**
 * A deck as a file: what is written, what is refused, and what is left out.
 *
 * ## Why this is the last thing Deck 4 needed
 *
 * Everything the timeline can express — a slide's steps, their order, the presses,
 * a film in the sequence, a title that arrives a letter at a time — lasted until
 * the page was reloaded. A deck that cannot leave the screen is a demo of a deck.
 *
 * ## Sids are left out, and that is the design being paid off
 *
 * A sid is `session:counter`, handed out at load in document order, so it means
 * nothing in another session and *collides* in the same one. So they are stripped
 * on the way out and the loader hands out its own.
 *
 * Which is only safe because nothing in a deck refers to a node by sid. A build
 * names its shape by a **name** the shape carries (`shape-3`), a slide names its
 * layout by `layoutId`, a layout its master by `masterId`, a slide its track by
 * `trackId` — every one of them an identifier the document owns rather than one
 * the session lends it. That was decided when the first build was written, for
 * exactly this reason, and this file is the first thing to depend on it.
 *
 * If a future node *does* point at a sid, this is where it breaks: the reference
 * survives and the target does not.
 *
 * ## An envelope, not a bare tree
 *
 * A file says what it is. `{ format, version, document }` costs three lines and
 * buys the two things a bare tree cannot do: a reader can refuse somebody else's
 * JSON with a sentence rather than a stack trace, and a version can be migrated
 * when the model moves. A `.json` full of `stype` and no name is a file nobody
 * can identify a year later.
 */

import { childrenOf, deckSlides, type DeckAccess } from './deck';


/** What every deck file says it is. */
export const DECK_FORMAT = 'barocss-slides';

/**
 * The shape of the file, which is one number.
 *
 * Bumped when a document written by this product would be *misread* by an older
 * one — not when the schema grows an attribute, which is the whole point of
 * attributes being optional and read with defaults.
 */
export const DECK_FILE_VERSION = 1;

export interface DeckFile {
  format: typeof DECK_FORMAT;
  version: number;
  /** When it was written, so a reader can tell two files apart. */
  savedAt?: string;
  document: unknown;
}

interface TreeNode {
  stype?: string;
  sid?: string;
  parentId?: string;
  text?: string;
  attributes?: Record<string, unknown>;
  content?: unknown;
}

/**
 * A tree with the session's own bookkeeping taken out.
 *
 * `sid` and `parentId` are the store's, not the document's. Leaving them in is
 * how a file becomes unloadable in the session that wrote it: the loader would be
 * asked to mint ids that already exist.
 */
export function forFile(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forFile);
  if (!node || typeof node !== 'object') return node;

  const { sid, parentId, ...rest } = node as TreeNode;
  void sid;
  void parentId;

  const out: Record<string, unknown> = { ...rest };
  if (Array.isArray((node as TreeNode).content)) {
    out.content = ((node as TreeNode).content as unknown[]).map(forFile);
  }
  return out;
}

/** The envelope for a document, ready to be written. */
export function deckFile(document: unknown, savedAt?: string): DeckFile {
  return {
    format: DECK_FORMAT,
    version: DECK_FILE_VERSION,
    ...(savedAt ? { savedAt } : {}),
    document: forFile(document)
  };
}

/**
 * The text of the file.
 *
 * Indented, because a deck file is a thing a person will open in an editor, diff
 * in a pull request and paste into a bug report. The bytes saved by one line are
 * worth less than any of those.
 */
export function deckFileText(document: unknown, savedAt?: string): string {
  return `${JSON.stringify(deckFile(document, savedAt), null, 2)}\n`;
}

export type DeckFileRead =
  | { document: unknown; version: number }
  | { error: string };

/**
 * Reading a file, and saying why not.
 *
 * Four refusals, each with the sentence a reader needs rather than the one a
 * parser produces: it is not JSON, it is not this product's file, it is from a
 * newer version of this product, or it holds no document. A message that names
 * *which* is the difference between a reader trying another file and a reader
 * filing a bug.
 *
 * What it does **not** do is check the document against the schema. `loadDocument`
 * already does that and reports every fault with its path — and a deck that is
 * *nearly* right should open with a warning rather than be refused, because the
 * alternative is a reader with a file they cannot get their work out of.
 */
export function readDeckFile(text: string): DeckFileRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: '이 파일은 JSON이 아닙니다.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: '이 파일은 슬라이드 파일이 아닙니다.' };
  }

  const file = parsed as Partial<DeckFile>;
  if (file.format !== DECK_FORMAT) {
    return { error: '이 파일은 Barocss 슬라이드 파일이 아닙니다.' };
  }

  const version = typeof file.version === 'number' ? file.version : 0;
  if (version > DECK_FILE_VERSION) {
    return {
      error: `이 파일은 더 새로운 버전(${version})으로 저장되었습니다. 프로그램을 업데이트하세요.`
    };
  }

  const document = file.document as TreeNode | undefined;
  if (!document || typeof document !== 'object' || typeof document.stype !== 'string') {
    return { error: '이 파일에는 문서가 없습니다.' };
  }

  return { document, version };
}

/**
 * What the deck is *about*: the words in the first slide's title.
 *
 * Not the first slide's `name`, which is the author's label for the slide
 * ("Title", "Agenda") and reads as a filename nobody chose. What a reader would
 * have typed into a save dialog is the sentence on the opening slide, which is
 * what this reads.
 */
export function deckTitle(doc: DeckAccess): string | undefined {
  const slides = deckSlides(doc);
  if (slides.length === 0) return undefined;

  const textOf = (sid: string, depth: number): string => {
    if (depth > 16) return '';
    const node = doc.getNode(sid);
    if (!node) return '';
    const own = (node as { text?: unknown }).text;
    if (typeof own === 'string') return own;
    return childrenOf(node)
      .map((child) => textOf(child, depth + 1))
      .join('');
  };

  const find = (sid: string, depth: number): string | undefined => {
    if (depth > 16) return undefined;
    const node = doc.getNode(sid);
    if (!node) return undefined;

    if (node.attributes?.role === 'title') {
      const text = textOf(sid, 0).trim();
      if (text) return text;
    }
    for (const child of childrenOf(node)) {
      const found = find(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  return find(slides[0].sid, 0);
}

/**
 * What to call the file, from the deck itself.
 *
 * A deck with no title gets `슬라이드`, and either way the name is made safe for
 * a filesystem: no separators, no leading dots, and short enough that the browser
 * does not truncate it into nonsense.
 */
export function deckFileName(title: string | undefined): string {
  const cleaned = (title ?? '')
    .replace(/[\\/:*?"<>|\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 60)
    .trim();

  return `${cleaned || '슬라이드'}.slides.json`;
}
