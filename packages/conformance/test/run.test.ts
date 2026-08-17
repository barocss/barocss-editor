import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * The harness's own contract.
 *
 * Most of it is about exemptions, because that is the part with a failure mode:
 * a check that finds nothing is merely useless, while an exemption that has
 * gone stale is *worse than nothing* — it looks like coverage and silences the
 * next finding on the same subject.
 */
describe('holding a product to the checks', () => {
  const schemaOf = (nodes: Record<string, { group?: string }>) => ({
    nodes: new Map(
      Object.entries(nodes).map(([name, def]) => [name, { name, ...def }])
    )
  });

  it('says nothing when every node is drawn', () => {
    const report = conformance({
      schema: schemaOf({ paragraph: {}, heading: {} }),
      hasRenderer: () => true
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-node-is-drawn']).toBe(2);
  });

  it('names a node type nothing draws', () => {
    const report = conformance({
      schema: schemaOf({ paragraph: {}, textFrame: {} }),
      hasRenderer: (name) => name === 'paragraph'
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].subject).toBe('textFrame');
  });

  it('leaves definitions alone, which are referenced rather than placed', () => {
    // A stylesheet has no renderer and wants none
    const report = conformance({
      schema: schemaOf({ styleDef: { group: 'resource' }, resources: { group: 'document' } }),
      hasRenderer: () => false
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-node-is-drawn']).toBe(0);
  });

  it('accepts a finding the product expected', () => {
    const report = conformance({
      schema: schemaOf({ connector: {} }),
      hasRenderer: () => false,
      exempt: { connector: 'FigJam draws these; Word has no arrows' }
    });
    expect(report.findings).toEqual([]);
    expect(report.staleExemptions).toEqual([]);
  });

  /**
   * The reason the harness has this shape.
   *
   * Fourteen exemptions in the operation roster said "declares no inverse"
   * about operations that had since been given one, and the checks they
   * silenced stayed off for months looking like coverage.
   */
  it('fails an exemption that no longer exempts anything', () => {
    const report = conformance({
      schema: schemaOf({ connector: {} }),
      hasRenderer: () => true,
      exempt: { connector: 'nobody draws these' }
    });
    expect(report.findings).toEqual([]);
    expect(report.staleExemptions).toEqual([
      { subject: 'connector', reason: 'nobody draws these' }
    ]);
  });

  it('counts what it looked at, so a check that examined nothing is visible', () => {
    const report = conformance({ schema: schemaOf({}), hasRenderer: () => true });
    // A silent pass over an empty set is not a pass
    expect(report.examined['every-node-is-drawn']).toBe(0);
  });

  it('runs a subset, for a product adopting one check at a time', () => {
    const report = conformance({
      schema: schemaOf({ paragraph: {} }),
      hasRenderer: () => false,
      only: ['no-such-check']
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-node-is-drawn']).toBeUndefined();
  });
});
