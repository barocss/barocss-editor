import { describe, it, expect } from 'vitest';
import {
  backspaceTargetOffset,
  completesMove,
  recordDeletion,
  recordFormatChange,
  recordInsertion,
  recordMoveFrom,
  recordMoveTo,
  recordParagraphMerge,
  type CoveredRun,
  type Reviewer,
  type RunMark
} from '../src/revision-record';

/**
 * What an edit records while changes are being tracked.
 *
 * The asymmetry is the feature: typing still puts the characters in and only
 * marks them, while deleting does not delete. Every case below is one somebody
 * would hit within a minute of turning tracking on.
 */
const jinho = (): Reviewer => {
  let n = 0;
  return { author: 'Jinho', date: '2026-08-12', nextId: () => `rev${++n}` };
};

const mark = (stype: string, range: [number, number], author = 'Jinho'): RunMark => ({
  stype,
  range,
  attrs: { id: `${stype}-${range[0]}`, author }
});

const run = (start: number, end: number, marks: RunMark[] = []): CoveredRun => ({
  sid: 't',
  start,
  end,
  marks
});

/** The marks a setMarks operation would leave behind. */
const marksAfter = (ops: { type: string; payload: any }[]): RunMark[] =>
  ops.find((op) => op.type === 'setMarks')?.payload.marks ?? [];

const cuts = (ops: { type: string; payload: any }[]) =>
  ops.filter((op) => op.type === 'deleteTextRange').map((op) => [op.payload.start, op.payload.end]);

describe('deleting while changes are tracked', () => {
  it('keeps the text and proposes its removal', () => {
    const ops = recordDeletion([run(4, 9)], jinho());

    expect(cuts(ops)).toEqual([]);
    expect(marksAfter(ops)).toContainEqual(
      expect.objectContaining({ stype: 'deletion', range: [4, 9] })
    );
  });

  it('really deletes what this reviewer had just added', () => {
    // Word does this, and without it a typo is permanent the moment it is typed:
    // its author could only propose removing it and wait for somebody to agree.
    const ops = recordDeletion([run(4, 9, [mark('insertion', [0, 12])])], jinho());

    expect(cuts(ops)).toEqual([[4, 9]]);
    expect(marksAfter(ops).some((each) => each.stype === 'deletion')).toBe(false);
  });

  it('proposes removing what somebody else added', () => {
    const ops = recordDeletion([run(4, 9, [mark('insertion', [0, 12], 'Sujin')])], jinho());

    expect(cuts(ops)).toEqual([]);
    expect(marksAfter(ops)).toContainEqual(
      expect.objectContaining({ stype: 'deletion', range: [4, 9] })
    );
  });

  it('leaves text that is already proposed for removal alone', () => {
    const ops = recordDeletion([run(4, 9, [mark('deletion', [0, 12])])], jinho());

    // Marking it twice says nothing, and the caret is expected to step over it.
    expect(ops).toEqual([]);
  });

  it('treats each stretch of a mixed range on its own terms', () => {
    const ops = recordDeletion(
      [
        run(0, 12, [
          mark('insertion', [0, 4]), // mine — really goes
          mark('deletion', [8, 12]) // already proposed — untouched
        ])
      ],
      jinho()
    );

    expect(cuts(ops)).toEqual([[0, 4]]);
    // The middle, which nothing covered, is what gets proposed for removal.
    expect(marksAfter(ops)).toContainEqual(
      expect.objectContaining({ stype: 'deletion', range: [4, 8] })
    );
  });

  it('cuts back to front so the second cut lands where it meant to', () => {
    const ops = recordDeletion(
      [run(0, 12, [mark('insertion', [0, 4]), mark('insertion', [8, 12])])],
      jinho()
    );

    expect(cuts(ops)).toEqual([
      [8, 12],
      [0, 4]
    ]);
  });

  it('gives one revision to a delete that spans several runs', () => {
    const ops = recordDeletion(
      [
        { sid: 'a', start: 2, end: 4, marks: [] },
        { sid: 'b', start: 0, end: 3, marks: [] }
      ],
      jinho()
    );

    const ids = ops
      .flatMap((op) => (op.payload.marks ?? []) as RunMark[])
      .filter((each) => each.stype === 'deletion')
      .map((each) => each.attrs.id);

    // One act of deleting is one thing to accept or reject, however many runs
    // the selection happened to cross.
    expect(new Set(ids).size).toBe(1);
  });

  it('leaves other marks on the run where they were', () => {
    const bold = mark('bold', [0, 12]);
    const ops = recordDeletion([run(4, 9, [bold])], jinho());

    expect(marksAfter(ops)).toContainEqual(bold);
  });
});

describe('typing while changes are tracked', () => {
  it('marks what was typed as an addition', () => {
    const ops = recordInsertion(run(4, 9), jinho());

    expect(marksAfter(ops)).toContainEqual(
      expect.objectContaining({ stype: 'insertion', range: [4, 9] })
    );
  });

  it('extends the addition it was typed into', () => {
    // A revision per keystroke would put several hundred entries in the pane for
    // one paragraph, and a reviewer would accept a sentence one letter at a time.
    const ops = recordInsertion(run(9, 12, [mark('insertion', [4, 9])]), jinho());

    const added = marksAfter(ops).filter((each) => each.stype === 'insertion');
    expect(added).toHaveLength(1);
    expect(added[0].range).toEqual([4, 12]);
  });

  it('extends one typed straight in front of an addition too', () => {
    const ops = recordInsertion(run(0, 4, [mark('insertion', [4, 9])]), jinho());

    const added = marksAfter(ops).filter((each) => each.stype === 'insertion');
    expect(added).toHaveLength(1);
    expect(added[0].range).toEqual([0, 9]);
  });

  it('keeps the id of the addition it joined', () => {
    const existing = mark('insertion', [4, 9]);
    const ops = recordInsertion(run(9, 12, [existing]), jinho());

    const added = marksAfter(ops).filter((each) => each.stype === 'insertion');
    // A reviewer told "this is Jinho's addition" should not find it become a
    // different addition because another word was typed into it.
    expect(added[0].attrs.id).toBe(existing.attrs.id);
  });

  it('does not join somebody else’s', () => {
    const ops = recordInsertion(run(9, 12, [mark('insertion', [4, 9], 'Sujin')]), jinho());

    const added = marksAfter(ops).filter((each) => each.stype === 'insertion');
    expect(added).toHaveLength(2);
  });

  it('records nothing for an empty insert', () => {
    expect(recordInsertion(run(5, 5), jinho())).toEqual([]);
  });
});

describe('where Backspace goes', () => {
  it('takes the character behind the caret when there is nothing in the way', () => {
    expect(backspaceTargetOffset([], 5)).toBe(4);
  });

  it('steps over text already proposed for removal', () => {
    // Otherwise the caret sits in front of a character that will not go, and the
    // key appears to do nothing at all.
    expect(backspaceTargetOffset([mark('deletion', [2, 5])], 5)).toBe(1);
  });

  it('stops at the start of the run', () => {
    expect(backspaceTargetOffset([mark('deletion', [0, 5])], 5)).toBe(0);
  });

  it('is unmoved by marks that are not deletions', () => {
    expect(backspaceTargetOffset([mark('insertion', [2, 5])], 5)).toBe(4);
  });
});

describe('reformatting while changes are tracked', () => {
  it('remembers what the run looked like, both halves of it', () => {
    const was = [mark('bold', [0, 5])];
    const ops = recordFormatChange(
      run(0, 5),
      { attributes: { alignment: 'left' }, marks: was },
      jinho()
    );

    const recorded = marksAfter(ops).find((each) => each.stype === 'formatChange')!;
    // Bold is a mark over characters and alignment is a property of the
    // paragraph. Recording one and not the other would leave half the toolbar
    // untracked, and which half is a detail of our model, not of Word.
    expect(JSON.parse(String(recorded.attrs.before))).toEqual({
      attributes: { alignment: 'left' },
      marks: was
    });
  });

  it('does not stack a second one over the same ground', () => {
    // Bold then italic is one reformatting to review, and the first `before`
    // still holds what it looked like before either.
    const already = mark('formatChange', [0, 5]);
    expect(recordFormatChange(run(0, 5, [already]), {}, jinho())).toEqual([]);
  });

  it('records one over somebody else’s', () => {
    const theirs = mark('formatChange', [0, 5], 'Sujin');
    expect(recordFormatChange(run(0, 5, [theirs]), {}, jinho())).not.toEqual([]);
  });
});

describe('moving text', () => {
  const move = { moveId: 'm1', text: 'the fox', author: 'Jinho' };

  it('pairs the two ends by the same moveId', () => {
    const from = recordMoveFrom([run(0, 7)], move, jinho());
    const to = recordMoveTo(run(20, 27), move, jinho());

    const idOf = (ops: any[], stype: string) =>
      marksAfter(ops).find((each) => each.stype === stype)?.attrs.moveId;

    expect(idOf(from, 'moveFrom')).toBe('m1');
    expect(idOf(to, 'moveTo')).toBe('m1');
  });

  it('keeps the text where it left, marked rather than removed', () => {
    const ops = recordMoveFrom([run(0, 7)], move, jinho());
    expect(cuts(ops)).toEqual([]);
  });

  it('is a move only when the same reviewer puts the same words down', () => {
    const reviewer = jinho();
    expect(completesMove(move, 'the fox', reviewer)).toBe(true);
    // Edited in between, so it is an addition — calling it a move would tie two
    // unrelated places together in the review.
    expect(completesMove(move, 'the red fox', reviewer)).toBe(false);
    expect(completesMove({ ...move, author: 'Sujin' }, 'the fox', reviewer)).toBe(false);
    expect(completesMove(null, 'the fox', reviewer)).toBe(false);
    expect(completesMove({ ...move, text: '' }, '', reviewer)).toBe(false);
  });
});

describe('joining two paragraphs', () => {
  it('proposes the boundary rather than the text', () => {
    const ops = recordParagraphMerge('p1', { styleId: 'Body' }, jinho());

    expect(ops[0].type).toBe('setAttrs');
    expect(ops[0].payload.attrs).toMatchObject({
      styleId: 'Body',
      revisionType: 'deletion',
      revisionAuthor: 'Jinho'
    });
  });

  it('does not propose the same boundary twice', () => {
    // Pressing Backspace again should step past it, not stack proposals.
    expect(recordParagraphMerge('p1', { revisionId: 'rev1' }, jinho())).toEqual([]);
  });
});
