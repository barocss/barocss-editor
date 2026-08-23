import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';
import type { Report } from '../src/types';
import { drawnTagFrom } from '../src/drawn-as';

/**
 * This file is about one check, so it reads one check's findings.
 *
 * `conformance()` runs them all, and its sibling
 * `every-drawing-keeps-its-children` has things to say about the same fixtures —
 * a `<table>` holding a `<td>` directly is a real fault and not this check's.
 * Reading `report.findings` whole made a test about namespaces fail on a
 * finding about HTML structure, which is two checks working and one assertion
 * asking the wrong question.
 */
const namespaceFindings = (report: Report) =>
  report.findings.filter((finding) => finding.check === 'every-drawing-can-hold-what-it-contains');

/**
 * The check that a container's drawing can hold the drawings inside it.
 *
 * It exists because a renderer can be present, run, produce elements and still
 * put nothing on the page: `<svg>` may hold only SVG, so a container drawn in
 * one namespace and its contents in another is an empty box with no error
 * anywhere. That is what a deck's `canvasBlock` was — Word's `<svg>` inherited
 * over Slides' `<div>` shapes — and it went unseen because every check until
 * this one asked whether a renderer *exists*.
 *
 * The cases below are mostly about the classifier, because that is the part that
 * was got wrong first. Deciding SVG-ness by asking the parser what it keeps
 * inside an `<svg>` looked right and is not: the HTML5 breakout list is short,
 * so `thead`, `tr` and `section` all stay in SVG by that test, and the first run
 * of this check reported thirty-six findings, every one of them a table.
 */
describe('a drawing that cannot hold what it contains', () => {
  /**
   * `holds` is what the document itself contains, and it is given rather than
   * assumed. Putting every node directly in the document — which is fine for the
   * checks that only ask "is this drawn" — invents containment edges this check
   * is about, and a fixture that says a `<div>` document holds a `<rect>` is
   * reporting a real fault in the fixture.
   */
  const schemaOf = (
    nodes: Record<string, { group?: string; content?: string }>,
    holds: string[] = Object.keys(nodes)
  ) => ({
    topNode: 'document',
    nodes: new Map<string, { name: string; group?: string; content?: string }>([
      ['document', { name: 'document', content: holds.join(' ') }],
      ...Object.entries(nodes).map(
        ([name, def]) =>
          [name, { name, ...def }] as [string, { name: string; group?: string; content?: string }]
      )
    ])
  });

  /** A product that draws each type as the tag it is given here. */
  const draws = (tags: Record<string, string>) => (name: string) =>
    name === 'document' ? 'div' : (tags[name] ?? null);

  const check = 'every-drawing-can-hold-what-it-contains';

  it('finds an HTML node drawn inside an SVG one', () => {
    const report = conformance({
      schema: schemaOf({ canvas: { content: 'shape' }, shape: {} }, ['canvas']),
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'svg', shape: 'div' })
    });

    expect(namespaceFindings(report).map((f) => f.subject)).toEqual(['canvas > shape']);
    expect(namespaceFindings(report)[0].check).toBe(check);
    expect(namespaceFindings(report)[0].detail).toContain('<div> inside a <svg>');
  });

  it('says nothing when both are SVG', () => {
    const report = conformance({
      schema: schemaOf({ canvas: { content: 'shape' }, shape: {} }, ['canvas']),
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'svg', shape: 'rect' })
    });
    expect(namespaceFindings(report)).toEqual([]);
  });

  it('says nothing when both are HTML', () => {
    const report = conformance({
      schema: schemaOf({ canvas: { content: 'shape' }, shape: {} }),
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'div', shape: 'div' })
    });
    expect(namespaceFindings(report)).toEqual([]);
  });

  /**
   * The regression the classifier was rewritten for. Every one of these is an
   * ordinary HTML element that the parser's breakout list does not mention, so
   * the first version called them SVG and reported a finding for each.
   */
  it('knows an HTML element the SVG breakout list does not name', () => {
    const report = conformance({
      schema: schemaOf({
        table: { content: 'head body foot row cell chunk' },
        head: {}, body: {}, foot: {}, row: {}, cell: {}, chunk: {}
      }, ['table']),
      hasRenderer: () => true,
      drawnAs: draws({
        table: 'table', head: 'thead', body: 'tbody', foot: 'tfoot',
        row: 'tr', cell: 'td', chunk: 'section'
      })
    });
    expect(namespaceFindings(report)).toEqual([]);
  });

  it('allows an <svg> inside HTML, which is how a drawing gets on a page', () => {
    const report = conformance({
      schema: schemaOf({ para: { content: 'canvas' }, canvas: {} }),
      hasRenderer: () => true,
      drawnAs: draws({ para: 'p', canvas: 'svg' })
    });
    expect(namespaceFindings(report)).toEqual([]);
  });

  it('allows HTML inside a foreignObject, which is SVG’s door back', () => {
    const report = conformance({
      schema: schemaOf(
        { canvas: { content: 'hole' }, hole: { content: 'para' }, para: {} },
        ['canvas']
      ),
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'svg', hole: 'foreignObject', para: 'p' })
    });
    expect(namespaceFindings(report)).toEqual([]);
  });

  it('finds an SVG shape drawn straight into HTML, with no <svg> around it', () => {
    const report = conformance({
      schema: schemaOf({ para: { content: 'shape' }, shape: {} }, ['para']),
      hasRenderer: () => true,
      drawnAs: draws({ para: 'p', shape: 'rect' })
    });
    expect(namespaceFindings(report).map((f) => f.subject)).toEqual(['para > shape']);
  });

  it('follows a group the way the schema means it', () => {
    const report = conformance({
      schema: schemaOf(
        {
          canvas: { content: 'scene*' },
          box: { group: 'scene' },
          blob: { group: 'scene' }
        },
        ['canvas']
      ),
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'svg', box: 'div', blob: 'rect' })
    });
    // `blob` is fine and `box` is not, which is only visible if the group was
    // expanded to its members rather than treated as a type.
    expect(namespaceFindings(report).map((f) => f.subject)).toEqual(['canvas > box']);
  });

  /**
   * A pair a product has decided about is a claim like any other here, and one
   * that stops being true fails on its own.
   */
  it('takes an exemption for a pair, and reports it when it goes stale', () => {
    const schema = schemaOf({ canvas: { content: 'shape' }, shape: {} }, ['canvas']);
    const exempt = { 'canvas > shape': 'nothing in this product makes a canvas' };

    const withFinding = conformance({
      schema,
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'svg', shape: 'div' }),
      exempt
    });
    expect(withFinding.findings).toEqual([]);
    expect(withFinding.staleExemptions).toEqual([]);

    const fixed = conformance({
      schema,
      hasRenderer: () => true,
      drawnAs: draws({ canvas: 'div', shape: 'div' }),
      exempt
    });
    expect(fixed.staleExemptions).toEqual([
      { subject: 'canvas > shape', reason: 'nothing in this product makes a canvas' }
    ]);
  });

  /**
   * A check that cannot measure must say so rather than pass. `examined: 0` is
   * the harness's way of showing a check that is quietly doing nothing.
   */
  it('abstains, visibly, when the product cannot say what it draws', () => {
    const report = conformance({
      schema: schemaOf({ canvas: { content: 'shape' }, shape: {} }, ['canvas']),
      hasRenderer: () => true
    });
    expect(namespaceFindings(report)).toEqual([]);
    expect(report.examined[check]).toBe(0);
  });

  it('skips a type whose renderer will not name an element', () => {
    const report = conformance({
      schema: schemaOf({ canvas: { content: 'shape' }, shape: {} }, ['canvas']),
      hasRenderer: () => true,
      // A renderer that needs more than an empty node, or draws through an
      // external component: no answer, and a guess would be worse than none.
      drawnAs: (name) => (name === 'shape' ? null : 'svg')
    });
    expect(namespaceFindings(report)).toEqual([]);
  });
});

/**
 * Reading the tag off the product rather than being told it.
 *
 * The whole harness is built against declarations that go stale, so the one
 * fact this check needs is measured: a renderer is a function from a node to a
 * template, and the template's root carries the tag.
 */
describe('asking a registry what it draws', () => {
  it('calls a component renderer and reads the tag it returns', () => {
    const registry = {
      get: (type: string) =>
        type === 'canvas'
          ? { template: { type: 'component', component: () => ({ type: 'element', tag: 'svg' }) } }
          : undefined
    };
    expect(drawnTagFrom(registry).call(null, 'canvas')).toBe('svg');
    expect(drawnTagFrom(registry).call(null, 'missing')).toBeNull();
  });

  it('reads a plain element template directly', () => {
    const registry = { get: () => ({ template: { type: 'element', tag: 'p' } }) };
    expect(drawnTagFrom(registry).call(null, 'para')).toBe('p');
  });

  it('answers null when the renderer throws on an empty node', () => {
    const registry = {
      get: () => ({
        template: {
          type: 'component',
          component: () => {
            throw new Error('needs attributes this node does not have');
          }
        }
      })
    };
    expect(drawnTagFrom(registry).call(null, 'demanding')).toBeNull();
  });
});
