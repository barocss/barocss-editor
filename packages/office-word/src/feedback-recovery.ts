import type { DocumentAccess } from '@barocss/office-text';
import { collectCommentRange, resolveCommentTarget } from './comments';

export type CommittedWordCommentStatus = 'located' | 'missing' | 'ambiguous' | 'changed';

/** Inspect the saved native identity. This never recreates or relocates a comment. */
export function inspectCommittedWordComment(
  doc: DocumentAccess,
  target: { kind: string; id: string; quote: string },
  body: string
): CommittedWordCommentStatus {
  if (target.kind !== 'word-comment' || !target.id) return 'missing';
  const found = resolveCommentTarget(doc, target.id);
  if (found.status !== 'located') return found.status;
  const first = found.anchors[0], last = found.anchors.at(-1);
  if (!first || !last) return 'missing';
  // The legacy resolver also accepts single-run anchors. Apply the same native
  // ownership/protection boundary used for ordered body ranges to that case.
  const range = collectCommentRange(doc, {
    type: 'range', startNodeId: first.sid, startOffset: first.start,
    endNodeId: last.sid, endOffset: last.end, collapsed: false
  });
  if (!range || JSON.stringify(range.anchors) !== JSON.stringify(found.anchors)) return 'missing';
  if (found.thread.entries[0]?.text !== body || range.quote !== target.quote) return 'changed';
  return 'located';
}
