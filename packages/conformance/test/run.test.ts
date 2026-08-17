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
  /**
   * A schema whose document can hold everything named, unless it is put in
   * `resources` — which is how a real schema separates content from
   * definitions, and what the check reads instead of guessing from groups.
   */
  const schemaOf = (
    nodes: Record<string, { group?: string; content?: string }>,
    definitions: string[] = []
  ) => {
    const content = Object.keys(nodes).filter((name) => !definitions.includes(name));
    return {
      topNode: 'document',
      nodes: new Map<string, { name: string; group?: string; content?: string }>([
        ['document', { name: 'document', content: `${content.join(' ')} resources?` }],
        ['resources', { name: 'resources', content: definitions.join(' ') }],
        ...Object.entries(nodes).map(
          ([name, def]) => [name, { name, ...def }] as [string, { name: string; group?: string; content?: string }]
        )
      ])
    };
  };

  /**
   * The scaffolding a schema needs is drawn, so a test can talk about the nodes
   * it is actually about. A real product draws its document and its resources
   * region; these fixtures should not have to say so every time.
   */
  const drawn = (has: (name: string) => boolean) => (name: string) =>
    name === 'document' || name === 'resources' || has(name);

  it('says nothing when every node is drawn', () => {
    const report = conformance({
      schema: schemaOf({ paragraph: {}, heading: {} }),
      hasRenderer: drawn(() => true)
    });
    expect(report.findings).toEqual([]);
    // The two the fixture is about, plus the document and its resources region
    expect(report.examined['every-node-is-drawn']).toBe(4);
  });

  it('names a node type nothing draws', () => {
    const report = conformance({
      schema: schemaOf({ paragraph: {}, textFrame: {} }),
      hasRenderer: drawn((name) => name === 'paragraph')
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].subject).toBe('textFrame');
  });

  it('leaves definitions alone, which are referenced rather than placed', () => {
    // A stylesheet has no renderer and wants none. Reached only through
    // `resources`, so the walk stops before it.
    const report = conformance({
      schema: schemaOf({ styleDef: {} }, ['styleDef']),
      hasRenderer: drawn(() => false)
    });
    expect(report.findings.map((f) => f.subject)).toEqual([]);
  });

  /**
   * The hole the group heuristic had.
   *
   * `numberingLevel` carries no group at all — the schema says so on purpose,
   * because it is reachable only through a numbering definition — and the old
   * check demanded a renderer for it, so a product had to write an exemption it
   * should never have needed.
   */
  it('leaves a node reachable only through a definition alone, group or no group', () => {
    // Built by hand: `numberingLevel` must not be in the document's own content,
    // because the whole point is that it is reachable only through a definition.
    const report = conformance({
      schema: {
        topNode: 'document',
        nodes: new Map<string, { name: string; group?: string; content?: string }>([
          ['document', { name: 'document', content: 'paragraph+ resources?' }],
          ['paragraph', { name: 'paragraph' }],
          ['resources', { name: 'resources', content: 'numberingDef*' }],
          ['numberingDef', { name: 'numberingDef', content: 'numberingLevel+' }],
          // No group at all, exactly as the real schema declares it
          ['numberingLevel', { name: 'numberingLevel' }]
        ])
      },
      hasRenderer: drawn((name) => name === 'paragraph')
    });
    expect(report.findings.map((f) => f.subject)).toEqual([]);
  });

  it('still finds a node a group makes reachable', () => {
    // `block+` reaches every block there is, which is what makes an expression
    // naming a group worth following.
    const report = conformance({
      schema: {
        topNode: 'document',
        nodes: new Map<string, { name: string; group?: string; content?: string }>([
          ['document', { name: 'document', content: 'block+' }],
          ['paragraph', { name: 'paragraph', group: 'block' }],
          ['callout', { name: 'callout', group: 'block' }]
        ])
      },
      hasRenderer: drawn((name) => name === 'paragraph')
    });
    expect(report.findings.map((f) => f.subject)).toEqual(['callout']);
  });

  it('accepts a finding the product expected', () => {
    const report = conformance({
      schema: schemaOf({ connector: {} }),
      hasRenderer: drawn(() => false),
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
      hasRenderer: drawn(() => true),
      exempt: { connector: 'nobody draws these' }
    });
    expect(report.findings).toEqual([]);
    expect(report.staleExemptions).toEqual([
      { subject: 'connector', reason: 'nobody draws these' }
    ]);
  });

  it('counts what it looked at, so a check that examined nothing is visible', () => {
    const report = conformance({
      // Nothing reachable at all: no top node, so the walk finds nothing
      schema: { topNode: 'nowhere', nodes: new Map() },
      hasRenderer: () => true
    });
    // A silent pass over an empty set is not a pass
    expect(report.examined['every-node-is-drawn']).toBe(0);
  });

  it('runs a subset, for a product adopting one check at a time', () => {
    const report = conformance({
      schema: schemaOf({ paragraph: {} }),
      hasRenderer: drawn(() => false),
      only: ['no-such-check']
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-node-is-drawn']).toBeUndefined();
  });

  /**
   * The check that should have caught the worst fault, and the reason it needed
   * to exist beside one that already caught it.
   */
  describe('a command whose node the schema does not know', () => {
    it('is named, and named for the right reason', () => {
      const report = conformance({
        schema: schemaOf({ paragraph: {} }),
        hasRenderer: drawn(() => true),
        produces: [{ command: 'insertChecklist', produces: 'checklist' }]
      });
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].check).toBe('every-command-makes-something-real');
      expect(report.findings[0].detail).toContain('does nothing at all');
    });

    it('is still named when somebody registers a renderer for it', () => {
      // The point of having both checks. `every-command-can-be-seen` stops
      // finding it the moment anything draws a `checklist`, and the command is
      // still impossible — the schema refuses the transaction before it starts.
      const report = conformance({
        schema: schemaOf({ paragraph: {} }),
        // Everything is drawn, `checklist` included — so the "nothing draws
        // it" check has nothing to say and only this one is left.
        hasRenderer: drawn(() => true),
        produces: [{ command: 'insertChecklist', produces: 'checklist' }]
      });
      expect(report.findings.map((f) => f.check)).toEqual(['every-command-makes-something-real']);
    });

    it('says nothing when the schema does declare it', () => {
      const report = conformance({
        schema: schemaOf({ checklist: {} }),
        hasRenderer: drawn(() => true),
        produces: [{ command: 'insertChecklist', produces: 'checklist' }]
      });
      expect(report.findings).toEqual([]);
    });
  });
});
