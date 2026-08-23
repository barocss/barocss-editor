import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * A drawing with no word for it.
 *
 * A canvas needs a list beside it, because two things cannot be done on the canvas
 * itself: picking what is underneath something, and saying where in the stack a
 * thing goes. Every row of that list needs a name, and a shape with no text has
 * only its kind to be named by.
 *
 * The product answers from a table, and a table is what this harness distrusts:
 * the schema grows a node type, the table does not, and the row says whatever the
 * fallback says. Measured on the first product to have one — `connector`,
 * `component` and `instance` were declared and all three came out as the same
 * word as everything else it did not know.
 */
const findings = (report: { findings: { check: string; subject: string }[] }) =>
  report.findings.filter((f) => f.check === 'every-drawing-can-be-named');

/** A canvas: a surface holding scene nodes, and a group holding scene or a frame. */
const canvasSchema = (extra: Record<string, { group?: string; content?: string }> = {}) => {
  const nodes: Record<string, { group?: string; content?: string }> = {
    document: { content: 'surface+' },
    surface: { content: 'scene*' },
    group: { group: 'scene', content: '(scene | frame)+' },
    rectangle: { group: 'scene' },
    picture: { group: 'scene' },
    textFrame: { group: 'scene', content: 'block+' },
    frame: { group: 'block', content: 'scene*' },
    paragraph: { group: 'block', content: 'inline*' },
    'inline-text': { group: 'inline' },
    ...extra
  };
  // `name` from the key, because a real schema's node carries its own name and the
  // checks read it. The fixture left it out and every one of these calls needed an
  // `as never` to get past it — which is exactly the cast that hides a real mismatch.
  return {
    topNode: 'document',
    nodes: new Map(
      Object.entries(nodes).map(([name, node]) => [name, { name, ...node }] as const)
    )
  };
};

const named = (words: Record<string, string>) => (type: string) => words[type] ?? null;

const ALL = {
  group: '그룹',
  rectangle: '사각형',
  picture: '그림',
  textFrame: '텍스트 상자',
  frame: '프레임'
};

describe('a drawing with no word for it', () => {
  it('is a finding', () => {
    const report = conformance({
      schema: canvasSchema(),
      hasRenderer: () => true,
      nameOf: named({ ...ALL, rectangle: undefined as never })
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['rectangle']);
  });

  it('holds when every one of them is named', () => {
    const report = conformance({
      schema: canvasSchema(),
      hasRenderer: () => true,
      nameOf: named(ALL)
    });

    expect(findings(report)).toEqual([]);
    // And it looked: a check that examined nothing and passed is the failure this
    // whole harness is shaped against.
    expect(report.examined['every-drawing-can-be-named']).toBe(5);
  });

  /**
   * A blank is not a name.
   *
   * A product whose table has an empty string for a type has the same problem as
   * one with no entry, and it is harder to see.
   */
  it('counts an empty word as no word', () => {
    const report = conformance({
      schema: canvasSchema(),
      hasRenderer: () => true,
      nameOf: named({ ...ALL, picture: '   ' })
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['picture']);
  });

  /**
   * The set is what a *canvas* holds, and not everything a document holds.
   *
   * Asking about every placeable type produced thirty findings on the real
   * schema — paragraphs, table cells, the document itself — and thirty exemptions
   * would have been thirty notes.
   */
  it('does not ask about paragraphs, or anything inside a text frame', () => {
    const report = conformance({
      schema: canvasSchema(),
      hasRenderer: () => true,
      nameOf: named(ALL)
    });

    // `textFrame` holds `block+`; its children are words, and words are not layers.
    expect(findings(report)).toEqual([]);
    expect(report.examined['every-drawing-can-be-named']).toBe(5);
  });

  /**
   * And a frame is asked about, because a scene container says it holds one.
   *
   * Derived from the schema rather than named here: `group`'s content is
   * `(scene | frame)+`, so a frame on a canvas is a row in the list like any other
   * — even though the frame's own group is `block`.
   */
  it('asks about a frame, which a group says it can hold', () => {
    const report = conformance({
      schema: canvasSchema(),
      hasRenderer: () => true,
      nameOf: named({ ...ALL, frame: undefined as never })
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['frame']);
  });

  /**
   * A product that has not adopted it abstains, visibly.
   *
   * `examined: 0` rather than a pass: a check quietly doing nothing looks exactly
   * like coverage, which is the pattern this harness exists to find.
   */
  it('abstains when the product cannot say, and says so by examining nothing', () => {
    const report = conformance({ schema: canvasSchema(), hasRenderer: () => true });

    expect(findings(report)).toEqual([]);
    expect(report.examined['every-drawing-can-be-named']).toBe(0);
  });

  /**
   * A new scene node in the schema is a new finding, with nothing else changed.
   *
   * Which is the whole point: the table falls behind the schema, and this is what
   * notices.
   */
  it('notices a node type the schema has just grown', () => {
    const report = conformance({
      schema: canvasSchema({ connector: { group: 'scene' } }),
      hasRenderer: () => true,
      nameOf: named(ALL)
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['connector']);
  });
});
