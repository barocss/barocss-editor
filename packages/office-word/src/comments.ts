/**
 * Comments: what somebody said about a piece of the document.
 *
 * A comment is two things that have to stay together. The *thread* is a
 * resource — who wrote it, when, what it says, whether it is settled — and it
 * lives with the other resources rather than in the flow, because a note about
 * a paragraph is not part of the paragraph and must not print with it. The
 * *anchor* is a `commentRef` mark over the text it is about, which is the only
 * thing that survives the text moving: an offset would be wrong the moment
 * anyone typed above it.
 *
 * The shared kit's `insertComment` does neither of these. It puts the thread in
 * the flow immediately after the block, applies no mark, and records no author —
 * so the comment has nothing to point at, nothing to point at it, and nobody who
 * wrote it. Same story as the lists: the shared command was written against a
 * different model.
 */
import { childOfType, childrenOf, type DocumentAccess, type DocumentNode } from './document-access';

export interface CommentAnchor {
  sid: string;
  start: number;
  end: number;
}

export interface CommentEntry {
  /** The node this entry is, so it can be edited or removed. */
  sid: string;
  author: string;
  date: string;
  text: string;
}

export interface CommentThread {
  /** The id the anchoring mark names. */
  id: string;
  /** The thread node, for commands that change it. */
  sid: string;
  resolved: boolean;
  /** The first entry is the comment; the rest are replies, in order. */
  entries: CommentEntry[];
  /** Where in the text it is about, if the anchoring mark is still there. */
  anchor?: CommentAnchor;
}

/** The text of a block, however deeply its runs are nested. */
function textOf(doc: DocumentAccess, node: DocumentNode | undefined, depth = 0): string {
  if (!node || depth > 32) return '';
  if (typeof node.text === 'string') return node.text;
  return childrenOf(doc, node)
    .map((child) => textOf(doc, child, depth + 1))
    .join('');
}

/**
 * Where each comment is anchored, found by walking the document for the marks.
 *
 * One pass for all of them: a document with fifty comments would otherwise be
 * walked fifty times, and the walk is the expensive part.
 */
function anchorsOf(doc: DocumentAccess): Map<string, CommentAnchor> {
  const anchors = new Map<string, CommentAnchor>();

  const visit = (node: DocumentNode | undefined, depth: number): void => {
    if (!node || depth > 64) return;
    for (const mark of node.marks ?? []) {
      if (mark?.stype !== 'commentRef') continue;
      const id = mark.attrs?.id;
      if (typeof id !== 'string' || !node.sid || !mark.range) continue;
      // The first one wins: a comment anchored twice is a document fault, and
      // picking the later would move the comment when the earlier text is
      // edited.
      if (!anchors.has(id)) {
        anchors.set(id, { sid: node.sid, start: mark.range[0], end: mark.range[1] });
      }
    }
    for (const child of childrenOf(doc, node)) visit(child, depth + 1);
  };

  visit(doc.getNode(doc.rootId), 0);
  return anchors;
}

/**
 * Every comment in the document, in the order the threads are stored.
 *
 * Not in the order they appear on the page: a thread whose anchor has been
 * deleted has no place on the page at all, and dropping it from the list would
 * lose what someone wrote. A pane can sort by anchor and still show the rest.
 */
export function commentThreads(doc: DocumentAccess): CommentThread[] {
  const root = doc.getNode(doc.rootId);
  const resources = childOfType(doc, root, 'resources');
  if (!resources) return [];

  const anchors = anchorsOf(doc);
  const threads: CommentThread[] = [];

  for (const node of childrenOf(doc, resources)) {
    if (node.stype !== 'commentThread') continue;
    const id = node.attributes?.id;
    if (typeof id !== 'string' || !node.sid) continue;

    threads.push({
      id,
      sid: node.sid,
      resolved: node.attributes?.resolved === true,
      entries: childrenOf(doc, node)
        .filter((entry) => entry.sid)
        .map((entry) => ({
          sid: entry.sid!,
          author: typeof entry.attributes?.author === 'string' ? entry.attributes.author : '',
          date: typeof entry.attributes?.date === 'string' ? entry.attributes.date : '',
          text: textOf(doc, entry)
        })),
      anchor: anchors.get(id)
    });
  }

  return threads;
}

/** An id no thread is using yet. */
export function freeThreadId(doc: DocumentAccess): string {
  const taken = new Set(commentThreads(doc).map((thread) => thread.id));
  for (let n = 1; ; n++) {
    const id = `comment-${n}`;
    if (!taken.has(id)) return id;
  }
}
