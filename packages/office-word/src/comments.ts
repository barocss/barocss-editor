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
import type { ModelSelection } from '@barocss/editor-core';
import { childOfType, childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';

export interface CommentAnchor {
  sid: string;
  start: number;
  end: number;
}

export interface CommentRange {
  paragraphSid: string;
  anchors: CommentAnchor[];
  /** Display evidence only. Never use this to find a comment. */
  quote: string;
}

/** Direct native paragraph children define order; runtime SID values never do. */
export function collectCommentRange(doc: DocumentAccess, selection: ModelSelection | null | undefined): CommentRange | null {
  if (!selection || selection.type !== 'range' || selection.collapsed) return null;
  const parents = new Map<string, DocumentNode>(), blocked = new Set<string>(), seen = new Set<string>();
  let invalid = false;
  const visit = (node: DocumentNode | undefined, parent: DocumentNode | undefined, protectedPath: boolean, depth: number): void => {
    if (!node || !node.sid || depth > 64 || seen.has(node.sid)) { invalid = true; return; }
    seen.add(node.sid);
    if (parent) parents.set(node.sid, parent);
    const protectedNode = protectedPath || node.attributes?.locked === true || node.attributes?.protected === true || ['resources', 'commentThread', 'contentControl'].includes(node.stype ?? '');
    if (protectedNode) blocked.add(node.sid);
    // Coverage belongs to the text flow. Resource children can contain a new
    // pending thread in the operation overlay while public nodes remain the
    // committed source; their graph cannot invalidate this captured body range.
    if (node.stype === 'resources' || node.stype === 'commentThread') return;
    for (const child of node.content ?? []) visit(typeof child === 'string' ? doc.getNode(child) : child, node, protectedNode, depth + 1);
  };
  visit(doc.getNode(doc.rootId), undefined, false, 0);
  const paragraph = parents.get(selection.startNodeId), endParent = parents.get(selection.endNodeId);
  if (invalid || !paragraph?.sid || paragraph !== endParent ||
    selection.startNodeId !== selection.endNodeId && paragraph.stype !== 'paragraph') return null;
  const runs = childrenOf(doc, paragraph), startIndex = runs.findIndex(node => node.sid === selection.startNodeId), endIndex = runs.findIndex(node => node.sid === selection.endNodeId);
  if (startIndex < 0 || endIndex < 0) return null;
  const forward = startIndex < endIndex || startIndex === endIndex && selection.startOffset <= selection.endOffset;
  const first = forward ? startIndex : endIndex, last = forward ? endIndex : startIndex;
  const from = forward ? selection.startOffset : selection.endOffset, to = forward ? selection.endOffset : selection.startOffset;
  const anchors: CommentAnchor[] = [], text: string[] = [];
  for (let index = first; index <= last; index++) {
    const node = runs[index], start = index === first ? from : 0, end = index === last ? to : node.text?.length;
    if (!node.sid || blocked.has(node.sid) || node.stype !== 'inline-text' || typeof node.text !== 'string' ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end! > node.text.length || end! < start) return null;
    if (start === end) { if (index !== first && index !== last) return null; continue; }
    anchors.push({ sid: node.sid, start, end: end! }); text.push(node.text.slice(start, end));
  }
  return anchors.length ? { paragraphSid: paragraph.sid, anchors, quote: text.join('') } : null;
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


/** Every native occurrence matters when an external result names a thread. */
function commentOccurrences(doc: DocumentAccess, id: string) {
  const threads: DocumentNode[] = [], anchors: CommentAnchor[] = [], parts: unknown[] = [], attrs: Record<string, unknown>[] = [];
  let invalid = false;
  const seen = new Set<string>();
  const visit = (node: DocumentNode | undefined, resource: boolean, depth: number): void => {
    if (!node || depth > 64 || (node.sid && seen.has(node.sid))) { invalid = true; return; }
    if (node.sid) seen.add(node.sid);
    if (node.stype === 'commentThread' && node.attributes?.id === id) threads.push(node);
    for (const mark of node.marks ?? []) {
      if (mark.stype !== 'commentRef' || mark.attrs?.id !== id) continue;
      const [start, end] = mark.range ?? [];
      if (resource || !node.sid || typeof node.text !== 'string' || typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end <= start || end > node.text.length) invalid = true;
      else { anchors.push({ sid: node.sid, start, end }); parts.push(mark.attrs?.part); attrs.push(mark.attrs ?? {}); }
    }
    for (const child of childrenOf(doc, node)) visit(child, resource || node.stype === 'resources', depth + 1);
  };
  visit(doc.getNode(doc.rootId), false, 0);
  return { threads, anchors, parts, attrs, invalid };
}

export function commentIdentityInUse(doc: DocumentAccess, id: string): boolean {
  const found = commentOccurrences(doc, id);
  return found.invalid || found.threads.length > 0 || found.anchors.length > 0;
}

export type CommentTargetResolution =
  | { status: 'located'; thread: CommentThread; anchor: CommentAnchor; anchors: CommentAnchor[] }
  | { status: 'missing' | 'ambiguous' };

/** Never substitute a matching quote or choose the first of several anchors. */
export function resolveCommentTarget(doc: DocumentAccess, id: string): CommentTargetResolution {
  const found = commentOccurrences(doc, id);
  if (found.threads.length > 1) return { status: 'ambiguous' };
  if (found.invalid || found.threads.length !== 1) return { status: 'missing' };
  const coverage = found.threads[0].attributes?.coverage;
  if (coverage === undefined) {
    if (found.anchors.length > 1) return { status: 'ambiguous' };
    if (found.anchors.length !== 1 || found.parts[0] !== undefined) return { status: 'missing' };
  } else {
    if (!Array.isArray(coverage) || coverage.length < 2 || coverage.some(part => !part || typeof part !== 'object' ||
      Object.keys(part).length !== 1 || typeof part.text !== 'string' || !part.text.length)) return { status: 'missing' };
    if (found.anchors.length > coverage.length || new Set(found.parts).size !== found.parts.length) return { status: 'ambiguous' };
    if (found.anchors.length !== coverage.length) return { status: 'missing' };
    if (found.attrs.some(attrs => Object.keys(attrs).length !== 2 || !Object.hasOwn(attrs, 'part'))) return { status: 'missing' };
    if (found.parts.some((part, index) => part !== index)) return { status: 'ambiguous' };
    const first = found.anchors[0], last = found.anchors.at(-1)!;
    const range = collectCommentRange(doc, { type: 'range', startNodeId: first.sid, startOffset: first.start,
      endNodeId: last.sid, endOffset: last.end, collapsed: false });
    if (!range || JSON.stringify(range.anchors) !== JSON.stringify(found.anchors)) return { status: 'missing' };
    if (found.anchors.some((anchor, index) => doc.getNode(anchor.sid)?.text?.slice(anchor.start, anchor.end) !== coverage[index].text)) return { status: 'missing' };
  }
  const thread = commentThreads(doc).find(thread => thread.sid === found.threads[0].sid);
  return thread ? { status: 'located', thread, anchor: found.anchors[0], anchors: found.anchors } : { status: 'missing' };
}
