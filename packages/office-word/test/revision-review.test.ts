import { describe, it, expect } from 'vitest';
import { moveCounterpart, revisionAfter, revisionAt, revisions } from '../src/revision-index';
import { dispositionOf, resolveAllOps, resolveRevisionOps } from '../src/revision-resolve';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';

/**
 * Reviewing tracked changes.
 *
 * The direction is the whole feature: accepting an insertion keeps the text and
 * accepting a deletion removes it, and getting that backwards destroys work
 * without saying anything. So the dispositions are asserted directly, as a
 * table, rather than only through the operations they produce.
 */
const mark = (
  stype: string,
  range: [number, number],
  attrs: Record<string, unknown>
): NonNullable<DocumentNode['marks']>[number] => ({ stype, range, attrs });

/** A document of one run, carrying whatever marks are given. */
const oneRun = (marks: NonNullable<DocumentNode['marks']>, text = 'The quick brown fox'): DocumentAccess => {
  const nodes: Record<string, DocumentNode> = {
    root: { sid: 'root', stype: 'document', content: ['body'] },
    body: { sid: 'body', stype: 'body', content: ['p'] },
    p: { sid: 'p', stype: 'paragraph', content: ['t'] },
    t: { sid: 't', stype: 'inline-text', text, marks }
  };
  return { getNode: (id: string) => nodes[id], rootId: 'root' };
};

describe('finding the tracked changes', () => {
  it('gathers the marks that share an id into one revision', () => {
    // Typing across a bold word leaves the same revision on two runs.
    const nodes: Record<string, DocumentNode> = {
      root: { sid: 'root', stype: 'document', content: ['p'] },
      p: { sid: 'p', stype: 'paragraph', content: ['a', 'b'] },
      a: {
        sid: 'a',
        stype: 'inline-text',
        text: 'one ',
        marks: [mark('insertion', [0, 4], { id: 'r1', author: 'Jinho' })]
      },
      b: {
        sid: 'b',
        stype: 'inline-text',
        text: 'two',
        marks: [mark('insertion', [0, 3], { id: 'r1', author: 'Jinho' })]
      }
    };
    const doc: DocumentAccess = { getNode: (id) => nodes[id], rootId: 'root' };

    const found = revisions(doc);
    expect(found).toHaveLength(1);
    expect(found[0].spans.map((span) => span.sid)).toEqual(['a', 'b']);
    expect(found[0].spans.map((span) => span.text)).toEqual(['one ', 'two']);
  });

  it('reads them in document order, whatever order the marks are stored in', () => {
    const doc = oneRun([
      mark('deletion', [10, 15], { id: 'later', author: 'Sujin' }),
      mark('insertion', [0, 3], { id: 'earlier', author: 'Jinho' })
    ]);

    // Both marks are on one run, so "document order" is the order they appear
    // on that run — which is the order a reviewer meets them.
    expect(revisions(doc).map((revision) => revision.id)).toEqual(['later', 'earlier']);
  });

  it('finds the revision the caret is in, and falls back to the first', () => {
    const doc = oneRun([
      mark('insertion', [4, 9], { id: 'r1', author: 'Jinho' }),
      mark('deletion', [10, 15], { id: 'r2', author: 'Sujin' })
    ]);

    expect(revisionAt(doc, { sid: 't', offset: 6 })?.id).toBe('r1');
    // The edge counts: a caret just after a change is still on it.
    expect(revisionAt(doc, { sid: 't', offset: 9 })?.id).toBe('r1');
    expect(revisionAt(doc, { sid: 't', offset: 12 })?.id).toBe('r2');
    expect(revisionAt(doc, { sid: 't', offset: 0 })?.id).toBe('r1');
    expect(revisionAt(doc, null)?.id).toBe('r1');
  });

  it('wraps at either end when stepping between them', () => {
    const doc = oneRun([
      mark('insertion', [0, 3], { id: 'r1', author: 'Jinho' }),
      mark('deletion', [4, 9], { id: 'r2', author: 'Sujin' })
    ]);

    expect(revisionAfter(doc, 'r1', 1)?.id).toBe('r2');
    expect(revisionAfter(doc, 'r2', 1)?.id).toBe('r1');
    expect(revisionAfter(doc, 'r1', -1)?.id).toBe('r2');
  });

  it('pairs the two halves of a move', () => {
    const doc = oneRun([
      mark('moveFrom', [0, 3], { id: 'a', moveId: 'm1', author: 'Jinho' }),
      mark('moveTo', [10, 15], { id: 'b', moveId: 'm1', author: 'Jinho' })
    ]);

    const [from] = revisions(doc);
    expect(moveCounterpart(doc, from)?.id).toBe('b');
  });
});

describe('what accepting and rejecting mean', () => {
  it.each([
    ['insertion', 'accept', 'keep'],
    ['insertion', 'reject', 'remove'],
    ['deletion', 'accept', 'remove'],
    ['deletion', 'reject', 'keep'],
    ['formatChange', 'accept', 'keep'],
    ['formatChange', 'reject', 'keep'],
    ['moveFrom', 'accept', 'remove'],
    ['moveFrom', 'reject', 'keep'],
    ['moveTo', 'accept', 'keep'],
    ['moveTo', 'reject', 'remove']
  ] as const)('%s %sed: %s the text', (kind, action, expected) => {
    expect(dispositionOf(kind, action)).toBe(expected);
  });
});

describe('resolving one revision', () => {
  it('accepting an insertion drops the mark and keeps every other', () => {
    const doc = oneRun([
      mark('insertion', [0, 3], { id: 'r1', author: 'Jinho' }),
      mark('bold', [0, 9], { id: 'b1' }),
      // Another reviewer over the same words: resolving one must not resolve
      // the other, which is why marks are removed by id and not by type.
      mark('insertion', [1, 4], { id: 'r2', author: 'Sujin' })
    ]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'accept');
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('setMarks');

    const kept = (ops[0].payload.marks as any[]).map((m) => m.attrs.id);
    expect(kept).toEqual(['b1', 'r2']);
  });

  it('rejecting an insertion takes the text out', () => {
    const doc = oneRun([mark('insertion', [4, 9], { id: 'r1', author: 'Jinho' })]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'reject');
    expect(ops.map((op) => op.type)).toEqual(['setMarks', 'deleteTextRange']);
    expect(ops[1].payload).toEqual({ nodeId: 't', start: 4, end: 9 });
  });

  it('accepting a deletion carries out the deletion', () => {
    const doc = oneRun([mark('deletion', [4, 9], { id: 'r1', author: 'Sujin' })]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'accept');
    expect(ops.map((op) => op.type)).toEqual(['setMarks', 'deleteTextRange']);
    expect(ops[1].payload).toEqual({ nodeId: 't', start: 4, end: 9 });
  });

  it('rejecting a deletion puts the text beyond question and only drops the mark', () => {
    const doc = oneRun([mark('deletion', [4, 9], { id: 'r1', author: 'Sujin' })]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'reject');
    expect(ops.map((op) => op.type)).toEqual(['setMarks']);
  });

  it('cuts a run back to front so the second cut still lands where it meant to', () => {
    const doc = oneRun([
      mark('insertion', [0, 3], { id: 'r1', author: 'Jinho' }),
      mark('insertion', [10, 15], { id: 'r1', author: 'Jinho' })
    ]);

    const cuts = resolveRevisionOps(doc, revisions(doc)[0], 'reject').filter(
      (op) => op.type === 'deleteTextRange'
    );
    expect(cuts.map((op) => op.payload.start)).toEqual([10, 0]);
  });

  it('resolves both halves of a move together', () => {
    const doc = oneRun([
      mark('moveFrom', [0, 3], { id: 'a', moveId: 'm1', author: 'Jinho' }),
      mark('moveTo', [10, 15], { id: 'b', moveId: 'm1', author: 'Jinho' })
    ]);

    // Accepted, the text is gone from where it left and stays where it landed.
    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'accept');
    const cuts = ops.filter((op) => op.type === 'deleteTextRange');
    expect(cuts).toHaveLength(1);
    expect(cuts[0].payload).toEqual({ nodeId: 't', start: 0, end: 3 });
  });

  it('restores the formatting a rejected formatChange replaced', () => {
    const doc = oneRun([
      mark('formatChange', [0, 3], {
        id: 'r1',
        author: 'Jinho',
        before: JSON.stringify({ attributes: { alignment: 'left' } })
      })
    ]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'reject');
    expect(ops[0].type).toBe('setAttrs');
    expect(ops[0].payload.attrs).toMatchObject({ alignment: 'left' });
  });

  it('puts back the marks a run carried before it was reformatted', () => {
    const wasBold = [{ stype: 'bold', range: [0, 3], attrs: { id: 'b1' } }];
    const doc = oneRun([
      mark('formatChange', [0, 3], {
        id: 'r1',
        author: 'Jinho',
        before: JSON.stringify({ marks: wasBold })
      })
    ]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'reject');
    expect(ops[0].type).toBe('setMarks');
    expect(ops[0].payload.marks).toEqual(wasBold);
  });

  it('still drops the mark when `before` cannot be read', () => {
    const doc = oneRun([
      mark('formatChange', [0, 3], { id: 'r1', author: 'Jinho', before: 'not json' })
    ]);

    const ops = resolveRevisionOps(doc, revisions(doc)[0], 'reject');
    expect(ops.map((op) => op.type)).toEqual(['setMarks']);
  });
});

describe('resolving all of them', () => {
  it('works backwards through the document so earlier offsets stay put', () => {
    const doc = oneRun([
      mark('insertion', [0, 3], { id: 'r1', author: 'Jinho' }),
      mark('insertion', [10, 15], { id: 'r2', author: 'Sujin' })
    ]);

    const cuts = resolveAllOps(doc, revisions(doc), 'reject').filter(
      (op) => op.type === 'deleteTextRange'
    );
    expect(cuts.map((op) => op.payload.start)).toEqual([10, 0]);
  });

  it('resolves a move once, not once per half', () => {
    const doc = oneRun([
      mark('moveFrom', [0, 3], { id: 'a', moveId: 'm1', author: 'Jinho' }),
      mark('moveTo', [10, 15], { id: 'b', moveId: 'm1', author: 'Jinho' })
    ]);

    const cuts = resolveAllOps(doc, revisions(doc), 'accept').filter(
      (op) => op.type === 'deleteTextRange'
    );
    expect(cuts).toHaveLength(1);
  });
});
