import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * A drawing the parser will not keep its children inside.
 *
 * The sibling of the namespace check, and the second way a renderer can exist,
 * run without error, produce elements and put the wrong thing on the page: HTML
 * moves a child *out* of a parent that may not hold it. `<thead><th>` becomes a
 * `<thead>` with a `<tr>` nobody wrote.
 *
 * Written after meeting exactly that by hand — Word drew a table's header group
 * as `<thead>` and its cells as `<th>`, because the schema says a header holds
 * its cells directly. Browsers render it; anything reading the markup as
 * structure sees a header with no rows.
 */
const findings = (report: { findings: { check: string; subject: string }[] }) =>
  report.findings.filter((f) => f.check === 'every-drawing-keeps-its-children');

const schemaOf = (nodes: Record<string, { content?: string }>, top = ['root']) => ({
  topNode: 'root',
  // `name` from the key: a real schema's node carries its own name, and the checks
  // read it. Left out, this fixture needed a cast at every call site.
  nodes: new Map(
    Object.entries({ root: { content: top.join(' ') }, ...nodes }).map(
      ([name, node]) => [name, { name, ...node }] as const
    )
  )
});

const draws = (tags: Record<string, string>) => (type: string) => tags[type] ?? null;

describe('a drawing the parser will not keep its children inside', () => {
  it('finds a cell drawn straight into a header group', () => {
    // The one this was written for.
    const report = conformance({
      schema: schemaOf({ head: { content: 'cell' }, cell: {} }, ['head']),
      hasRenderer: () => true,
      drawnAs: draws({ head: 'thead', cell: 'th' })
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['head > cell']);
    expect(report.findings[0].detail).toContain('<tr>');
  });

  it('says nothing about a table put together the way HTML expects', () => {
    const report = conformance({
      schema: schemaOf(
        { table: { content: 'body' }, body: { content: 'row' }, row: { content: 'cell' }, cell: {} },
        ['table']
      ),
      hasRenderer: () => true,
      drawnAs: draws({ table: 'table', body: 'tbody', row: 'tr', cell: 'td' })
    });

    expect(findings(report)).toEqual([]);
  });

  it('finds content the parser fosters out of a table', () => {
    // A paragraph written inside a `<table>` is moved *before* the table — one
    // of the loudest rearrangements the parser makes, and silent in the DOM.
    const report = conformance({
      schema: schemaOf({ table: { content: 'para' }, para: {} }, ['table']),
      hasRenderer: () => true,
      drawnAs: draws({ table: 'table', para: 'p' })
    });

    expect(findings(report).map((f) => f.subject)).toEqual(['table > para']);
  });

  it('leaves ordinary nesting alone', () => {
    const report = conformance({
      schema: schemaOf(
        { section: { content: 'para' }, para: { content: 'run' }, run: {} },
        ['section']
      ),
      hasRenderer: () => true,
      drawnAs: draws({ section: 'div', para: 'p', run: 'span' })
    });

    expect(findings(report)).toEqual([]);
  });

  /**
   * A pair the spec frowns on and the parser leaves alone draws exactly what the
   * renderer built, so it is not this check's business. Saying so keeps the
   * check's scope honest rather than letting it drift into a style guide.
   */
  it('reports what the parser moves, not what the spec dislikes', () => {
    const report = conformance({
      schema: schemaOf({ list: { content: 'block' }, block: {} }, ['list']),
      hasRenderer: () => true,
      drawnAs: draws({ list: 'ul', block: 'div' })
    });

    expect(findings(report)).toEqual([]);
  });

  it('abstains, visibly, when the product cannot say what it draws', () => {
    const report = conformance({
      schema: schemaOf({ head: { content: 'cell' }, cell: {} }, ['head']),
      hasRenderer: () => true
    });

    expect(findings(report)).toEqual([]);
    expect(report.examined['every-drawing-keeps-its-children']).toBe(0);
  });
});
