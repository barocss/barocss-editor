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
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';

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
 * Which level a block appears at, or nothing if it does not appear.
 *
 * Word lists two kinds of block. A heading, at the level it is — and any
 * paragraph at all that names an `outlineLevel`, which is how a document puts a
 * line in its contents without making it look like a heading: a figure caption,
 * a part title set in the body face, an appendix marker. The attribute has been
 * in the schema since paragraph formatting was, with a comment saying it drives
 * the navigation pane and the contents, and nothing read it.
 *
 * Word counts outline levels from zero and contents levels from one, so the two
 * are one apart. An explicit level wins over the heading's own, which is what
 * lets a document put a Heading 3 in the contents at level 1.
 *
 * Read from the block's own attributes, as `level` already is — a level
 * arriving from a *style* is the cascade's answer and this is not given the
 * resolver.
 */
function levelOf(block: DocumentNode): number | null {
  const outline = block.attributes?.outlineLevel;
  if (typeof outline === 'number' && Number.isFinite(outline)) {
    // 9 is Word's "body text": named, and deliberately not in the contents.
    return outline >= 0 && outline <= 8 ? outline + 1 : null;
  }
  if (block.stype !== 'heading') return null;
  const level = Number(block.attributes?.level ?? 1);
  return Number.isFinite(level) ? level : null;
}

/**
 * The entries a table of contents should show.
 *
 * Blocks with no text are skipped: an empty line in the document should not
 * become an empty line with a page number next to it.
 */
export function tocEntries(options: TocOptions): TocEntry[] {
  const { doc, surface, styleFilter, pageOfBlock } = options;
  const range = parseLevels(options.levels);
  const entries: TocEntry[] = [];

  for (const block of childrenOf(doc, surface)) {
    if (!block.sid) continue;

    const level = levelOf(block);
    if (level === null || level < range.from || level > range.to) continue;
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
