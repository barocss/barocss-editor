import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * A block a reader can add and then not get hold of.
 *
 * The check that exists because the same fault was recorded **six times in one list** and every one
 * of them was found by a person using the product, never by anything in this directory. A page
 * builder keeps one set of the stypes a click may land on; adding a node type means registering it
 * in the renderer *and* in that set, and only the first is forced by anything. So the round adds the
 * node, writes the renderer, checks that it appears, and ships — with the drawing perfect and the
 * thing unreachable.
 *
 * Three arrived that way and were fixed by hand: a quotation, a rule and a code block; then a
 * table's cells; then a chart. The hour this check was pointed at that product it reported **three
 * more, live** — a video, an embed and a form, the last being the one node type that product
 * genuinely added.
 */
const findings = (report: { findings: { check: string; subject: string }[] }) =>
  report.findings.filter((f) => f.check === 'every-insert-can-be-held');

const schema = {
  topNode: 'document',
  nodes: new Map(
    Object.entries({
      document: { content: 'surface+' },
      surface: { content: 'block+' },
      frame: { group: 'block', content: 'block*' },
      paragraph: { group: 'block', content: 'inline*' },
      mediaVideo: { group: 'block' },
      emoji: { group: 'inline' },
      'inline-text': { group: 'inline' }
    }).map(([name, node]) => [name, { name, ...node }] as const)
  )
};

const produces = [
  { command: 'insertSection', produces: 'frame' },
  { command: 'insertRow', produces: 'frame' },
  { command: 'insertBodyText', produces: 'paragraph' },
  { command: 'insertVideo', produces: 'mediaVideo' },
  { command: 'insertEmoji', produces: 'emoji' }
];

describe('a block a reader can add and then not get hold of', () => {
  it('is a finding, said once per node type rather than once per command', () => {
    const report = conformance({
      schema,
      hasRenderer: () => true,
      produces,
      /* The product's selection rule, missing the video — which is the shape of all six faults. */
      nameable: ['frame', 'paragraph', 'emoji']
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['mediaVideo']);
  });

  it('names the commands that make it, because that is how a reader reproduces it', () => {
    const report = conformance({ schema, hasRenderer: () => true, produces, nameable: ['mediaVideo', 'emoji'] });

    /*
     * **Once**, for two commands. Five inserts produce a `frame` in the real product, and five
     * copies of one finding is the shape that teaches a reader to skim — so the type is the subject
     * and the commands come along in the sentence.
     */
    const said = findings(report);
    expect(said.map((f) => f.subject)).toEqual(['frame', 'paragraph']);
    expect(said[0].detail).toContain('`insertSection`, `insertRow`');
  });

  it('holds when every one of them can be held', () => {
    const report = conformance({
      schema,
      hasRenderer: () => true,
      produces,
      nameable: ['frame', 'paragraph', 'mediaVideo', 'emoji']
    });

    expect(findings(report)).toEqual([]);
    /* And it looked. Four types from five commands — the count is types, which is what it asks. */
    expect(report.examined['every-insert-can-be-held']).toBe(4);
  });

  it('says what it could not ask about, when the product has no selection rule', () => {
    /**
     * The failure this whole harness is shaped against, applied to itself: a check with nothing to
     * compare against must not come out green — and must not vanish either.
     *
     * Word is the real case. A word processor has no layer list and no click that selects a block; a
     * reader puts a caret somewhere, and a paragraph has no edges to drag. So there is nothing to
     * compare `produces` against and never will be. Not constructing the check there would leave a
     * product that *should* answer silently unchecked, and `examined: 0` alone reads as a guard that
     * ran and found nothing.
     *
     * `unanswered` is the third answer, **by name** — a count says a guard has holes and nothing
     * about where.
     */
    const report = conformance({ schema, hasRenderer: () => true, produces });

    expect(findings(report)).toEqual([]);
    expect(report.examined['every-insert-can-be-held']).toBe(0);
    expect(report.unanswered['every-insert-can-be-held']).toEqual([
      'frame',
      'paragraph',
      'mediaVideo',
      'emoji'
    ]);
  });
});
