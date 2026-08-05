/**
 * A table of contents: which headings it lists, and what page each is on.
 *
 * Generated, never stored. A heading's page number is a fact about the current
 * layout, and writing it into the document would make the text describe a
 * layout it no longer has the moment anything above it changes — which is
 * exactly the failure mode of a table of contents pasted as plain text.
 *
 * The schema keeps `content` on the node anyway, for the last generated result:
 * a document opened without a layout, printed on a server, or read by something
 * that cannot paginate should still show a table of contents rather than a gap.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';

export interface TocEntry {
  sid: string;
  level: number;
  text: string;
  /** Zero-based, as the layout counts pages; undefined before anything is laid out. */
  page?: number;
}

/**
 * Parse Word's `levels` range, which is written "1-3".
 *
 * A single number means that level alone, which is how a table of figures ends
 * up listing one style.
 */
export function parseLevels(levels: string | undefined): { from: number; to: number } {
  const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(levels ?? '');
  if (!match) return { from: 1, to: 3 };

  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The text of a block, flattened. */
function textOf(doc: DocumentAccess, node: DocumentNode, depth = 0): string {
  if (depth > 32) return '';
  if (typeof node.text === 'string') return node.text;
  return childrenOf(doc, node)
    .map((child) => textOf(doc, child, depth + 1))
    .join('');
}

export interface TocOptions {
  doc: DocumentAccess;
  /** The section whose blocks are listed. */
  surface: DocumentNode;
  levels?: string;
  /** Only headings carrying this style, when a document uses styles to select. */
  styleFilter?: string;
  /** Where each block landed, from the layout. */
  pageOfBlock?: Map<string, number>;
}

/**
 * The entries a table of contents should show.
 *
 * Headings with no text are skipped: an empty line in the document should not
 * become an empty line with a page number next to it.
 */
export function tocEntries(options: TocOptions): TocEntry[] {
  const { doc, surface, styleFilter, pageOfBlock } = options;
  const range = parseLevels(options.levels);
  const entries: TocEntry[] = [];

  for (const block of childrenOf(doc, surface)) {
    if (block.stype !== 'heading' || !block.sid) continue;

    const level = Number(block.attributes?.level ?? 1);
    if (!Number.isFinite(level) || level < range.from || level > range.to) continue;
    if (styleFilter && block.attributes?.styleId !== styleFilter) continue;

    const text = textOf(doc, block).trim();
    if (!text) continue;

    entries.push({ sid: block.sid, level, text, page: pageOfBlock?.get(block.sid) });
  }

  return entries;
}

/** The number a reader sees for an entry, given the section's numbering. */
export function tocPageNumber(entry: TocEntry, pageNumberFor: (index: number) => number): string {
  return entry.page === undefined ? '' : String(pageNumberFor(entry.page));
}
