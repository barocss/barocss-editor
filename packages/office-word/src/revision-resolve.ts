/**
 * Accepting and rejecting tracked changes.
 *
 * Every revision comes down to one of two acts: keep the text and drop the mark,
 * or drop the text. Which act belongs to which button is the whole of the
 * semantics, and it is not symmetric — accepting an insertion keeps text,
 * accepting a deletion removes it. The table below is the feature.
 *
 * What comes out of here is a list of operations, not a mutated store. A
 * reviewer who accepts a change and thinks better of it presses undo once, and
 * that only works if the whole resolution was one transaction. It also makes
 * this testable without an editor.
 */
import type { Revision, RevisionKind } from './revision-index';
import { moveCounterpart } from './revision-index';
import type { DocumentAccess } from './document-access';

/** A transaction operation, as the model's builder takes them. */
export interface RevisionOp {
  type: string;
  payload: Record<string, unknown>;
}

/** What resolving a revision does to the text it covers. */
export type Disposition = 'keep' | 'remove';

/**
 * Keep the text, or take it out.
 *
 * An insertion accepted is text that stays and stops being marked; rejected, it
 * is text that was never agreed to and goes. A deletion is the same statement
 * inverted — accepting it carries out the deletion the author proposed. Getting
 * these the wrong way round is the one bug in this feature that silently
 * destroys work, which is why it is a table rather than a chain of conditions.
 */
export function dispositionOf(kind: RevisionKind, action: 'accept' | 'reject'): Disposition {
  const accepting = action === 'accept';
  switch (kind) {
    case 'insertion':
      return accepting ? 'keep' : 'remove';
    case 'deletion':
      return accepting ? 'remove' : 'keep';
    case 'formatChange':
      // The text is not in question either way; only the formatting is.
      return 'keep';
    case 'moveFrom':
      // Accepting a move means the text is gone from where it left.
      return accepting ? 'remove' : 'keep';
    case 'moveTo':
      return accepting ? 'keep' : 'remove';
  }
}

/** Drop this revision's marks, leaving every other mark on the run alone. */
function unmark(doc: DocumentAccess, revision: Revision): RevisionOp[] {
  const byNode = new Map<string, unknown[]>();

  for (const span of revision.spans) {
    if (byNode.has(span.sid)) continue;
    const node = doc.getNode(span.sid);
    if (!node?.marks) continue;

    // By id, not by type: two reviewers can mark the same words, and removing
    // every `insertion` over the range would resolve somebody else's change
    // without them being asked.
    byNode.set(
      span.sid,
      node.marks.filter((mark: any) => mark?.attrs?.id !== revision.id)
    );
  }

  return [...byNode].map(([nodeId, marks]) => ({ type: 'setMarks', payload: { nodeId, marks } }));
}

/** Delete the text this revision covers. */
function cut(revision: Revision): RevisionOp[] {
  // Back to front. Deleting shifts every offset after the cut, so a revision
  // covering two ranges of one run would lose its place after the first.
  const spans = [...revision.spans]
    .filter((span) => span.end > span.start)
    .sort((a, b) => (a.sid === b.sid ? b.start - a.start : a.sid < b.sid ? 1 : -1));

  return spans.map((span) => ({
    type: 'deleteTextRange',
    payload: { nodeId: span.sid, start: span.start, end: span.end }
  }));
}

/**
 * Put back the formatting a formatChange replaced.
 *
 * `before` is the attributes as they were, as JSON. Nothing writes it yet — this
 * is what defines the encoding, and it is JSON so that a property nobody
 * anticipated survives the round trip rather than being flattened away by a
 * bespoke format that only thought of the common ones.
 *
 * A `before` that cannot be read is not a reason to abandon the reject: the mark
 * still comes off, and the formatting simply stays as it is.
 */
function restoreFormatting(doc: DocumentAccess, revision: Revision): RevisionOp[] {
  if (!revision.before) return [];

  let attributes: Record<string, unknown>;
  try {
    const parsed = JSON.parse(revision.before);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    attributes = parsed as Record<string, unknown>;
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const ops: RevisionOp[] = [];
  for (const span of revision.spans) {
    if (seen.has(span.sid)) continue;
    seen.add(span.sid);
    const node = doc.getNode(span.sid);
    if (!node) continue;
    ops.push({
      type: 'setAttrs',
      payload: { nodeId: span.sid, attributes: { ...node.attributes, ...attributes } }
    });
  }
  return ops;
}

/**
 * What it takes to resolve one revision — and the other half of it, if it is a
 * move.
 *
 * A move is one decision about two places. Resolving only the half the caret
 * happened to be in would leave the moved text in both.
 */
export function resolveRevisionOps(
  doc: DocumentAccess,
  revision: Revision,
  action: 'accept' | 'reject'
): RevisionOp[] {
  const counterpart = moveCounterpart(doc, revision);
  const both = counterpart ? [revision, counterpart] : [revision];

  const ops: RevisionOp[] = [];
  for (const each of both) {
    if (each.kind === 'formatChange' && action === 'reject') ops.push(...restoreFormatting(doc, each));

    // The mark comes off either way. When the text goes too it goes second: an
    // empty mark left behind is a revision that still shows in the list with
    // nothing to show for it.
    ops.push(...unmark(doc, each));
    if (dispositionOf(each.kind, action) === 'remove') ops.push(...cut(each));
  }

  return ops;
}

/**
 * Every revision resolved at once.
 *
 * Not a loop over the single-revision path: each resolution shifts the offsets
 * of everything after it in the same run, and the spans were all read from the
 * document as it is now. Sorted so the document is edited from the end
 * backwards, which leaves the offsets ahead of the cut untouched.
 */
export function resolveAllOps(
  doc: DocumentAccess,
  all: Revision[],
  action: 'accept' | 'reject'
): RevisionOp[] {
  const done = new Set<string>();
  const ops: RevisionOp[] = [];

  const ordered = [...all].sort((a, b) => {
    const first = (revision: Revision) => revision.spans[0];
    const left = first(a);
    const right = first(b);
    if (!left || !right) return 0;
    return left.sid === right.sid ? right.start - left.start : left.sid < right.sid ? 1 : -1;
  });

  for (const revision of ordered) {
    if (done.has(revision.id)) continue;
    const counterpart = moveCounterpart(doc, revision);
    done.add(revision.id);
    if (counterpart) done.add(counterpart.id);
    ops.push(...resolveRevisionOps(doc, revision, action));
  }

  return ops;
}
