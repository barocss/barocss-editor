import { describe, expect, it } from 'vitest';
import { conformance } from '../src/run';

/**
 * The check that closes the gap between the two either side of it.
 *
 * `every-attribute-is-read` asks whether an attribute reaches the drawing; `every-command-can-be-reached`
 * asks whether a command has a control. An attribute nobody can change passes **both**: it is read,
 * and the command that writes it is reachable — and `setBlockFormat` writes 24 fields, so being
 * reachable says nothing about whether all 24 have a row.
 *
 * Measured on the site builder the day this was written: 64 attributes drawn, 41 offered.
 */
describe('every property can be edited', () => {
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
    editable?: string[],
    exempt?: Record<string, string>
  ) =>
    conformance({
      schema: schemaOf(attrs) as never,
      hasRenderer: () => true,
      attributeRead: read,
      editable,
      exempt,
      only: ['every-property-can-be-edited']
    });

  it('abstains, visibly, when the product cannot say what it can set', () => {
    // A product whose panel is still a React tree cannot answer this at all, and `examined: 0` is
    // how a check that is quietly doing nothing stays visible rather than passing.
    const report = run({ gap: { type: 'number' } }, () => true);
    expect(report.examined['every-property-can-be-edited']).toBe(0);
  });

  it('finds an attribute the product draws and nothing sets', () => {
    const report = run({ gap: { type: 'number' }, corner: { type: 'number' } }, () => true, ['gap']);
    expect(report.findings.map((one) => one.subject)).toEqual(['shape.corner']);
  });

  it('asks only about what the product actually draws', () => {
    /*
     * An attribute nothing reads is `every-attribute-is-read`'s finding, and reporting it here too
     * would be two findings about one fault — which is the noise that makes a person stop reading a
     * report.
     */
    const report = run({ dead: { type: 'number' } }, () => false, []);
    expect(report.findings).toEqual([]);
    expect(report.examined['every-property-can-be-edited']).toBe(0);
  });

  it('counts what it could not ask about rather than guessing', () => {
    const report = run({ shapeless: { type: 'array' } }, () => null, []);
    expect(report.findings).toEqual([]);
    expect(report.unanswered['every-property-can-be-edited']).toBe(1);
  });

  it('takes an exemption, and reports it when it stops exempting anything', () => {
    // The whole difference between this and a hand-kept list: give the attribute a row and the
    // claim is stale, and the run fails on the claim rather than passing quietly.
    const held = run({ rowIndex: { type: 'number' } }, () => true, [], {
      rowIndex: 'which row a placement is — the product computes it, and nothing should type it'
    });
    expect(held.findings).toEqual([]);
    expect(held.staleExemptions).toEqual([]);

    const stale = run({ rowIndex: { type: 'number' } }, () => true, ['rowIndex'], {
      rowIndex: 'which row a placement is — the product computes it, and nothing should type it'
    });
    expect(stale.staleExemptions.map((one) => one.subject)).toEqual(['rowIndex']);
  });
});
