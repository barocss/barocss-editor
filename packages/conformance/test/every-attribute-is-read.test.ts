import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';
import { probeValues, UNPROBEABLE } from '../src/attribute-read';

/**
 * The check that replaced a hand-kept list.
 *
 * The list lived in a backlog — *"Attributes the schema declares and nothing reads"*,
 * a line each and a date — and a person had to go and re-measure it. Between one look
 * and the next it said things that were no longer true, which is the operation
 * roster's fourteen stale notes with a different subject.
 *
 * Two things are worth testing here, and they are the two ways this check can be
 * wrong. It can miss a real gap, and it can **report one that is not there** — which
 * is worse, because a person then spends an afternoon proving a tool wrong. The probe
 * tests below are all regressions of the second kind.
 */
describe('every attribute is read', () => {
  const schemaOf = (attrs: Record<string, Record<string, unknown>>) => ({
    topNode: 'document',
    nodes: new Map<string, { name: string; content?: string; attrs?: Record<string, unknown> }>([
      ['document', { name: 'document', content: 'shape' }],
      ['shape', { name: 'shape', attrs }]
    ])
  });

  const run = (
    attrs: Record<string, Record<string, unknown>>,
    read: (nodeType: string, attr: string) => boolean | null,
    exempt?: Record<string, string>
  ) =>
    conformance({
      schema: schemaOf(attrs) as never,
      hasRenderer: () => true,
      attributeRead: read,
      exempt,
      only: ['every-attribute-is-read']
    });

  it('abstains, visibly, when the product has not adopted it', () => {
    const report = conformance({
      schema: schemaOf({ fill: { type: 'string' } }) as never,
      hasRenderer: () => true,
      only: ['every-attribute-is-read']
    });
    expect(report.findings).toEqual([]);
    // Nought examined is how a check doing nothing stays visible instead of passing.
    expect(report.examined['every-attribute-is-read']).toBe(0);
  });

  it('names an attribute whose drawing changes nothing', () => {
    const report = run({ fill: { type: 'string' }, name: { type: 'string' } }, (_n, attr) =>
      attr === 'fill'
    );
    expect(report.findings.map((finding) => finding.subject)).toEqual(['shape.name']);
    expect(report.examined['every-attribute-is-read']).toBe(2);
  });

  it('does not count an attribute the product cannot be asked about', () => {
    const report = run({ fills: { type: 'array' }, fill: { type: 'string' } }, (_n, attr) =>
      attr === 'fills' ? null : true
    );
    expect(report.findings).toEqual([]);
    // One answer, not two: a `null` is skipped *and* uncounted, so the examined
    // number is the number of real answers rather than of attempts.
    expect(report.examined['every-attribute-is-read']).toBe(1);
  });

  /**
   * One decision, not one per node type.
   *
   * `locked` came back unread on eleven of a deck's node types, all for the same
   * reason — the commands read it, not the renderers — and eleven copies of that
   * sentence is the failure this harness is named after.
   */
  it('lets one exemption cover the whole family', () => {
    const many = {
      topNode: 'document',
      nodes: new Map<string, { name: string; content?: string; attrs?: Record<string, unknown> }>([
        ['document', { name: 'document', content: 'a b' }],
        ['a', { name: 'a', attrs: { locked: { type: 'boolean' } } }],
        ['b', { name: 'b', attrs: { locked: { type: 'boolean' } } }]
      ])
    };
    const report = conformance({
      schema: many as never,
      hasRenderer: () => true,
      attributeRead: () => false,
      exempt: { locked: 'the commands refuse to move it' },
      only: ['every-attribute-is-read']
    });
    expect(report.findings).toEqual([]);
    expect(report.staleExemptions).toEqual([]);
  });

  it('reports a family exemption that exempts nothing', () => {
    const report = run({ locked: { type: 'boolean' } }, () => true, {
      locked: 'the commands refuse to move it'
    });
    // The renderers started drawing it, so the reason is now a note that would
    // hide the next finding on the same attribute.
    expect(report.staleExemptions).toEqual([
      { subject: 'locked', reason: 'the commands refuse to move it' }
    ]);
  });

  it('prefers the exemption about one node to the one about the attribute', () => {
    const report = run({ fill: { type: 'string' } }, () => false, {
      'shape.fill': 'a line has no interior',
      fill: 'nothing reads a fill anywhere'
    });
    expect(report.findings).toEqual([]);
    // The broader claim matched nothing, and says so — a fact about one node is not
    // evidence for a fact about every node.
    expect(report.staleExemptions.map((stale) => stale.subject)).toEqual(['fill']);
  });
});

/**
 * Adopting a check that finds hundreds at once.
 *
 * Word met this one with 362 of 597 attributes changing no drawing. Three hundred
 * written reasons would be three hundred notes, and a note rots — so the pile is a
 * number that has to come down, which is how Slides adopted the harness on its first
 * day with sixty-four undrawn node types.
 */
describe('working a pile off against a count', () => {
  const twoUnread = {
    topNode: 'document',
    nodes: new Map<string, { name: string; content?: string; attrs?: Record<string, unknown> }>([
      ['document', { name: 'document', content: 'shape' }],
      ['shape', { name: 'shape', attrs: { a: { type: 'string' }, b: { type: 'string' } } }]
    ])
  };

  const run = (ratchet: number, exempt?: Record<string, string>) =>
    conformance({
      schema: twoUnread as never,
      hasRenderer: () => true,
      attributeRead: () => false,
      ratchet: { 'every-attribute-is-read': ratchet },
      exempt,
      only: ['every-attribute-is-read']
    });

  it('reports nothing while the pile is the size it says it is', () => {
    const report = run(2);
    // Counted, not reported: a work list of that size is not a list anybody reads.
    expect(report.findings).toEqual([]);
    expect(report.ratcheted).toEqual([
      { check: 'every-attribute-is-read', allowed: 2, found: 2, families: ['a', 'b'] }
    ]);
  });

  it('fails when something that used to hold no longer does', () => {
    expect(run(1).ratcheted[0]).toMatchObject({ allowed: 1, found: 2 });
  });

  /**
   * The half a person would not think to write.
   *
   * A number left above the truth leaves room to break exactly that many things
   * again, silently — so fixing forty and not lowering the count is also a failure.
   */
  it('fails when the pile has shrunk and the number has not', () => {
    expect(run(9).ratcheted[0]).toMatchObject({ allowed: 9, found: 2 });
  });

  it('counts what is exempt out of the pile, not into it', () => {
    const report = run(1, { a: 'the paginator reads it' });
    expect(report.ratcheted[0]).toMatchObject({ allowed: 1, found: 1, families: ['b'] });
    // And the exemption is still a claim: it matched, so it is not stale.
    expect(report.staleExemptions).toEqual([]);
  });
});

/**
 * What the probe offers a renderer, and why each shape of it is what it is.
 *
 * Every case here was a false finding first: the check reported an attribute as read
 * by nothing, about code that plainly read it. They are the whole reason the probe is
 * more than "set it to a string".
 */
describe('what the probe tries', () => {
  it('tries every value of a fixed set', () => {
    // `linear` is what absent already draws as, so a probe that took the first
    // option called `gradientKind` unread on six node types.
    expect(probeValues({ type: 'string', options: ['linear', 'radial'] }, 'gradientKind')).toEqual([
      'linear',
      'radial'
    ]);
  });

  it('tries both sides of a boolean', () => {
    // A renderer usually asks `=== false` or `=== true`, and the other value looks
    // exactly like absent — `visible: true` beside no `visible` is the same drawing.
    expect(probeValues({ type: 'boolean', default: false }, 'locked')).toEqual([true, false]);
  });

  it('stays inside a declared range', () => {
    // A crop is a fraction of the picture: `fraction()` clamps 4242 to 1, and four
    // crops of 1 crop it out of existence, so the drawing came back uncropped.
    const [value] = probeValues({ type: 'number', default: 0, min: 0, max: 1 }, 'cropLeft') as number[];
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.5);
  });

  it('gives two numbers different values', () => {
    // `cornerRadius` and `cornerTopLeft` were both 4242, so removing either left the
    // drawing identical — the corner fell back to a radius that was the same number.
    const [radius] = probeValues({ type: 'number' }, 'cornerRadius') as number[];
    const [corner] = probeValues({ type: 'number' }, 'cornerTopLeft') as number[];
    expect(radius).not.toBe(corner);
  });

  it('never uses the value the attribute already has', () => {
    const [value] = probeValues({ type: 'boolean', default: true }, 'visible') as boolean[];
    expect(value).toBe(true); // both are tried, and the reading one is first
    const [number] = probeValues({ type: 'number', default: 4000 }, 'x') as number[];
    expect(number).not.toBe(4000);
  });

  it('refuses to invent a value with a shape the schema does not describe', () => {
    // An empty array for `fills` draws exactly like no `fills` at all — `paintsOf`
    // falls back to the legacy single `fill` either way.
    expect(probeValues({ type: 'array' }, 'fills')).toBe(UNPROBEABLE);
    expect(probeValues({ type: 'object' }, 'crop')).toBe(UNPROBEABLE);
  });
});
