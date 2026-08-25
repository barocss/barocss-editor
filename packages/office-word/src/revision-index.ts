/**
 * Where the tracked changes are.
 *
 * A revision is a mark over a range of text, and one revision can cover several
 * runs: typing across a bold word leaves two `insertion` marks with the same id,
 * because the runs are separate nodes. So a revision is not a mark — it is every
 * mark carrying one id, and accepting it has to act on all of them.
 *
 * Reading is separate from resolving on purpose. Finding what is there is a walk
 * over the document and nothing more; deciding what to keep is a set of edits.
 * Keeping them apart is what lets a pane list the revisions without the risk of
 * changing any.
 */
import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';

/** The revision mark types, in the order a reviewer meets them. */
export const REVISION_KINDS = ['insertion', 'deletion', 'formatChange', 'moveFrom', 'moveTo'] as const;

export type RevisionKind = (typeof REVISION_KINDS)[number];

/** One mark of one revision: which run, and which part of it. */
export interface RevisionSpan {
  sid: string;
  start: number;
  end: number;
  text: string;
}

export interface Revision {
  id: string;
  kind: RevisionKind;
  author: string;
  date?: string;
  /** Pairs a moveFrom with its moveTo. Absent on the other kinds. */
  moveId?: string;
  /** The formatting this range had before, for a formatChange. */
  before?: string;
  /** Every run the revision covers, in document order. */
  spans: RevisionSpan[];
}

const isRevisionKind = (stype: unknown): stype is RevisionKind =>
  typeof stype === 'string' && (REVISION_KINDS as readonly string[]).includes(stype);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * Every tracked change in the document, in the order a reader meets them.
 *
 * Document order, not the order the marks happen to be stored in: a reviewer
 * pressing Next is walking the page, and a list in any other order sends them
 * backwards. Marks sharing an id are gathered into one revision, and its
 * position is that of its first span.
 */
export function revisions(doc: DocumentAccess): Revision[] {
  const found = new Map<string, Revision>();
  const order: string[] = [];

  const visit = (node: DocumentNode | undefined, depth: number): void => {
    if (!node || depth > 64) return;

    for (const mark of node.marks ?? []) {
      const kind = mark?.stype;
      const id = asString(mark?.attrs?.id);
      if (!isRevisionKind(kind) || !id || !node.sid || !mark?.range) continue;

      const [start, end] = mark.range;
      const span: RevisionSpan = {
        sid: node.sid,
        start,
        end,
        text: (node.text ?? '').slice(start, end)
      };

      const existing = found.get(id);
      if (existing) {
        existing.spans.push(span);
        continue;
      }

      order.push(id);
      found.set(id, {
        id,
        kind,
        author: asString(mark.attrs?.author) ?? 'Unknown',
        date: asString(mark.attrs?.date),
        moveId: asString(mark.attrs?.moveId),
        before: asString(mark.attrs?.before),
        spans: [span]
      });
    }

    for (const child of childrenOf(doc, node)) visit(child, depth + 1);
  };

  visit(doc.getNode(doc.rootId), 0);
  return order.map((id) => found.get(id)!);
}

/** The revision with this id, or undefined if it has already been resolved. */
export function revisionById(doc: DocumentAccess, id: string): Revision | undefined {
  return revisions(doc).find((revision) => revision.id === id);
}

/**
 * The revision the caret is in, or the next one after it.
 *
 * "The one you are on" is what Accept acts on with no argument, and a caret
 * sitting just after a revision is still on it as far as a reviewer is
 * concerned — so a position inside the span or at either edge counts.
 */
export function revisionAt(
  doc: DocumentAccess,
  position: { sid: string; offset: number } | null | undefined
): Revision | undefined {
  const all = revisions(doc);
  if (!position) return all[0];

  return (
    all.find((revision) =>
      revision.spans.some(
        (span) =>
          span.sid === position.sid && position.offset >= span.start && position.offset <= span.end
      )
    ) ?? all[0]
  );
}

/**
 * The revision after the given id, wrapping at the end.
 *
 * Wrapping rather than stopping: a reviewer who has reached the last change and
 * presses Next again is asking to go round, not to be told they are at the end —
 * the count in the pane already says where they are.
 */
export function revisionAfter(doc: DocumentAccess, id: string | undefined, step: 1 | -1 = 1): Revision | undefined {
  const all = revisions(doc);
  if (all.length === 0) return undefined;

  const index = id ? all.findIndex((revision) => revision.id === id) : -1;
  if (index < 0) return step === 1 ? all[0] : all[all.length - 1];

  return all[(index + step + all.length) % all.length];
}

/**
 * The other half of a move.
 *
 * A move is two revisions — the text left behind and the text put down — tied
 * by `moveId`. Accepting either has to resolve both, or the document keeps a
 * copy of the moved text in the place it moved away from.
 */
export function moveCounterpart(doc: DocumentAccess, revision: Revision): Revision | undefined {
  if (!revision.moveId) return undefined;
  return revisions(doc).find(
    (other) => other.moveId === revision.moveId && other.id !== revision.id
  );
}
