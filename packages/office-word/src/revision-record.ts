/**
 * Recording an edit as a proposal rather than carrying it out.
 *
 * With tracking on, an edit stops being a change to the document and becomes a
 * suggestion about it. Typing still puts the characters in — it only marks them
 * as added. Deleting does not delete: the text stays and is marked as proposed
 * for removal, and the caret steps over it. That asymmetry is the feature, and
 * it is why deletion has to be decided *before* the operation runs while
 * insertion can be recorded after.
 *
 * Everything here is a decision, not an edit: what marks an edit should leave,
 * given what is already there. No store, no editor, no browser.
 */

/** A revision mark as it sits on a run. */
export interface RunMark {
  stype: string;
  range: [number, number];
  attrs: Record<string, unknown>;
}

/** A run of text an edit covers, and the marks already on it. */
export interface CoveredRun {
  sid: string;
  /** The part of the run the edit covers, `[start, end)`. */
  start: number;
  end: number;
  marks: RunMark[];
}

export interface Reviewer {
  author: string;
  date: string;
  /** A fresh revision id. Ids are opaque; only their uniqueness matters. */
  nextId: () => string;
}

/** A transaction operation, as the model's builder takes them. */
export interface RevisionOp {
  type: string;
  payload: Record<string, unknown>;
}

const revisionMark = (mark: RunMark, stype: string): boolean => mark.stype === stype;

const authorOf = (mark: RunMark): string =>
  typeof mark.attrs?.author === 'string' ? mark.attrs.author : '';

const covers = (mark: RunMark, from: number, to: number): boolean =>
  mark.range[0] <= from && mark.range[1] >= to;

const overlaps = (mark: RunMark, from: number, to: number): boolean =>
  mark.range[0] < to && mark.range[1] > from;

/**
 * Cut `[from, to)` into the stretches that need different treatment.
 *
 * The boundaries are every mark edge inside the range, so each piece is either
 * wholly covered by a given mark or wholly outside it — which is what lets the
 * decision be made per piece rather than per character.
 */
function segments(marks: RunMark[], from: number, to: number): [number, number][] {
  const edges = new Set<number>([from, to]);
  for (const mark of marks) {
    for (const edge of mark.range) {
      if (edge > from && edge < to) edges.add(edge);
    }
  }

  const sorted = [...edges].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let index = 0; index + 1 < sorted.length; index++) {
    out.push([sorted[index], sorted[index + 1]]);
  }
  return out;
}

/**
 * What a delete becomes while changes are being tracked.
 *
 * Three cases per stretch of text, and the second is the one people notice:
 *
 * - Text somebody proposed adding, by this same reviewer: really deleted. Word
 *   does this, and without it a typo becomes permanent the moment it is typed —
 *   the author cannot take back their own word, only propose removing it, and
 *   somebody else has to agree.
 * - Text already proposed for removal: left alone. Marking it twice says
 *   nothing, and the caret is expected to step over it.
 * - Anything else: marked as proposed for removal, and kept.
 */
export function recordDeletion(runs: CoveredRun[], reviewer: Reviewer): RevisionOp[] {
  const ops: RevisionOp[] = [];
  const id = reviewer.nextId();
  let marked = false;

  for (const run of runs) {
    const keep: RunMark[] = [...run.marks];
    const cuts: [number, number][] = [];

    for (const [from, to] of segments(run.marks, run.start, run.end)) {
      if (to <= from) continue;

      const alreadyGone = run.marks.some(
        (mark) => revisionMark(mark, 'deletion') && covers(mark, from, to)
      );
      if (alreadyGone) continue;

      const mine = run.marks.some(
        (mark) =>
          revisionMark(mark, 'insertion') &&
          authorOf(mark) === reviewer.author &&
          covers(mark, from, to)
      );

      if (mine) {
        cuts.push([from, to]);
        continue;
      }

      keep.push({
        stype: 'deletion',
        range: [from, to],
        attrs: { id, author: reviewer.author, date: reviewer.date }
      });
      marked = true;
    }

    if (keep.length !== run.marks.length) {
      ops.push({ type: 'setMarks', payload: { nodeId: run.sid, marks: keep } });
    }

    // Back to front: each cut shifts every offset after it.
    for (const [from, to] of cuts.sort((a, b) => b[0] - a[0])) {
      ops.push({ type: 'deleteTextRange', payload: { nodeId: run.sid, start: from, end: to } });
    }
  }

  // An id nobody used is not spent; the caller may want to know nothing was
  // proposed, which is what an empty list of marks means.
  return marked || ops.length > 0 ? ops : [];
}

/**
 * The marks a run should carry after text was typed into it.
 *
 * Extending an existing insertion rather than adding one per edit, when the same
 * reviewer's insertion touches the new text. A revision per keystroke would put
 * several hundred entries in the review pane for one paragraph, and a reviewer
 * would have to accept each of them to accept a sentence.
 *
 * Touching, not merely overlapping: text typed straight after an insertion is a
 * continuation of it, and the mark ends exactly where the new text begins.
 */
export function recordInsertion(
  run: CoveredRun,
  reviewer: Reviewer
): RevisionOp[] {
  const { start, end } = run;
  if (end <= start) return [];

  const mine = run.marks.filter(
    (mark) =>
      revisionMark(mark, 'insertion') &&
      authorOf(mark) === reviewer.author &&
      mark.range[0] <= end &&
      mark.range[1] >= start
  );

  const others = run.marks.filter((mark) => !mine.includes(mark));

  if (mine.length === 0) {
    return [
      {
        type: 'setMarks',
        payload: {
          nodeId: run.sid,
          marks: [
            ...run.marks,
            {
              stype: 'insertion',
              range: [start, end],
              attrs: { id: reviewer.nextId(), author: reviewer.author, date: reviewer.date }
            }
          ]
        }
      }
    ];
  }

  // One mark from all of them, keeping the id of the earliest: a reviewer who
  // has already been told "this is Jinho's addition" should not see it become a
  // different addition because they typed another word into it.
  const first = mine.reduce((earliest, mark) =>
    mark.range[0] < earliest.range[0] ? mark : earliest
  );

  const merged: RunMark = {
    stype: 'insertion',
    range: [
      Math.min(start, ...mine.map((mark) => mark.range[0])),
      Math.max(end, ...mine.map((mark) => mark.range[1]))
    ],
    attrs: { ...first.attrs, date: reviewer.date }
  };

  return [{ type: 'setMarks', payload: { nodeId: run.sid, marks: [...others, merged] } }];
}

/** What a node looked like before a formatting command touched it. */
export interface FormatBefore {
  attributes?: Record<string, unknown>;
  marks?: RunMark[];
}

/**
 * The mark a formatting change leaves, and what it has to remember.
 *
 * Both halves, because Word's formatting is two different things wearing one
 * name: bold is a mark over a range of characters, alignment is a property of
 * the paragraph. Recording only one of them would make half the toolbar
 * untracked, and which half would be a detail of our model rather than anything
 * a reviewer could predict.
 *
 * `before` is stored as JSON so that a property nobody anticipated survives the
 * round trip rather than being flattened away by a format that only thought of
 * the common ones.
 */
export function recordFormatChange(
  run: CoveredRun,
  before: FormatBefore,
  reviewer: Reviewer
): RevisionOp[] {
  const { start, end } = run;
  if (end < start) return [];

  // An existing formatChange by this reviewer over the same ground is extended
  // rather than stacked: pressing bold and then italic is one reformatting to
  // review, and `before` still holds what it looked like before either.
  const mine = run.marks.find(
    (mark) =>
      mark.stype === 'formatChange' &&
      authorOf(mark) === reviewer.author &&
      mark.range[0] <= start &&
      mark.range[1] >= end
  );
  if (mine) return [];

  return [
    {
      type: 'setMarks',
      payload: {
        nodeId: run.sid,
        marks: [
          ...run.marks,
          {
            stype: 'formatChange',
            range: [start, end],
            attrs: {
              id: reviewer.nextId(),
              author: reviewer.author,
              date: reviewer.date,
              before: JSON.stringify(before)
            }
          }
        ]
      }
    }
  ];
}

/**
 * How far back the caret should step, given what lies behind it.
 *
 * Text already proposed for removal is not deleted again — pressing Backspace
 * over it steps past it. Without this the caret sits in front of a character
 * that will not go, and the key appears to do nothing.
 *
 * Returns the offset to delete back to, or the same offset when there is
 * nothing behind the caret to act on.
 */
export function backspaceTargetOffset(marks: RunMark[], caret: number): number {
  let at = caret;

  while (at > 0) {
    const proposed = marks.some(
      (mark) => revisionMark(mark, 'deletion') && overlaps(mark, at - 1, at)
    );
    if (!proposed) return at - 1;
    at -= 1;
  }

  return at;
}

/**
 * Text cut and put down again, recorded as a move rather than as a deletion
 * followed by an unrelated addition.
 *
 * A move is one decision about two places, and a reviewer who is shown it as two
 * changes has to work out that they are the same words and accept both or
 * neither — and if they accept only one, the paragraph either loses the text or
 * keeps two copies of it.
 *
 * Recognised by the text itself: what was cut, put down again unchanged, by the
 * same reviewer. Word pairs them the same way within a session. Paste anything
 * else and it is an ordinary addition, which is what it is.
 */
export interface PendingMove {
  moveId: string;
  text: string;
  author: string;
}

/** The marks the source of a move carries: kept, and marked as moved away. */
export function recordMoveFrom(
  runs: CoveredRun[],
  move: PendingMove,
  reviewer: Reviewer
): RevisionOp[] {
  const ops: RevisionOp[] = [];
  const id = reviewer.nextId();

  for (const run of runs) {
    if (run.end <= run.start) continue;
    ops.push({
      type: 'setMarks',
      payload: {
        nodeId: run.sid,
        marks: [
          ...run.marks,
          {
            stype: 'moveFrom',
            range: [run.start, run.end],
            attrs: { id, moveId: move.moveId, author: reviewer.author, date: reviewer.date }
          }
        ]
      }
    });
  }

  return ops;
}

/** The marks the destination of a move carries. */
export function recordMoveTo(
  run: CoveredRun,
  move: PendingMove,
  reviewer: Reviewer
): RevisionOp[] {
  if (run.end <= run.start) return [];

  return [
    {
      type: 'setMarks',
      payload: {
        nodeId: run.sid,
        marks: [
          ...run.marks,
          {
            stype: 'moveTo',
            range: [run.start, run.end],
            attrs: {
              id: reviewer.nextId(),
              moveId: move.moveId,
              author: reviewer.author,
              date: reviewer.date
            }
          }
        ]
      }
    }
  ];
}

/**
 * Whether a paste is the other half of the cut that came before it.
 *
 * The same reviewer, and the same words. Anything else — somebody else's
 * clipboard, or text that was edited in between — is an addition, and calling it
 * a move would tie two unrelated places together in the review.
 */
export function completesMove(
  move: PendingMove | null | undefined,
  pasted: string,
  reviewer: Reviewer
): boolean {
  return !!move && move.author === reviewer.author && move.text === pasted && pasted.length > 0;
}

/**
 * The attributes a block carries when its paragraph mark is proposed for
 * removal.
 *
 * Backspace at the very start of a paragraph joins it to the one above. With
 * tracking on the join is a proposal like any other, but there is no text to
 * mark — what is being removed is the boundary itself. Word marks the paragraph
 * mark; here that is the block, through the revision attributes the schema has
 * always carried and nothing has ever written.
 */
export function recordParagraphMerge(
  blockSid: string,
  attributes: Record<string, unknown>,
  reviewer: Reviewer
): RevisionOp[] {
  // Already proposed: pressing Backspace again should step past the boundary
  // rather than propose it twice.
  if (attributes.revisionId) return [];

  return [
    {
      type: 'setAttrs',
      payload: {
        nodeId: blockSid,
        // `attrs`, which is what the operation takes. It was `attributes` here
        // and the transaction quietly did nothing: the unit test asserted the
        // shape this function invented rather than the one the model accepts,
        // so it passed. Only running it in a browser found it.
        attrs: {
          ...attributes,
          revisionId: reviewer.nextId(),
          revisionType: 'deletion',
          revisionAuthor: reviewer.author,
          revisionDate: reviewer.date
        }
      }
    }
  ];
}
