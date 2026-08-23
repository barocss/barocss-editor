import { describe, it, expect } from 'vitest';
import { createSchema } from '../src/schema';
import { getOfficeSchemaDefinition } from '../src/office-schema';
import { validateTree, describeFindings } from '../src/validate-tree';

/**
 * Checking a whole document, which nothing did.
 *
 * Operations validate what they write, so a document built by editing is checked
 * at every step — and one handed to `loadDocument` went in exactly as written.
 * A product's fixtures are the only place its documents come from and were the
 * one place nothing looked.
 */
const schema = createSchema('office', getOfficeSchemaDefinition());

const surface = (content: unknown[]) => ({
  stype: 'document',
  attributes: {},
  content: [{ stype: 'surface', attributes: { kind: 'flow' }, content }]
});

const paragraph = (text: string) => ({
  stype: 'paragraph',
  attributes: {},
  content: [{ stype: 'inline-text', text }]
});

describe('checking a document against its schema', () => {
  it('says nothing about a document that agrees with it', () => {
    expect(validateTree(schema, surface([paragraph('hello')]))).toEqual([]);
  });

  /**
   * The case this was written for. A table whose rows sit directly under it is
   * four levels down, draws perfectly, and every table operation refuses it —
   * reporting `cell not found in table`, which is a fact about the grid builder
   * rather than about the document.
   */
  it('finds a fault four levels down, which is where they are', () => {
    const findings = validateTree(
      schema,
      surface([
        {
          stype: 'bTable',
          attributes: {},
          content: [
            {
              stype: 'bTableRow',
              attributes: {},
              content: [{ stype: 'bTableCell', attributes: {}, content: [] }]
            }
          ]
        }
      ])
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].stype).toBe('bTable');
    expect(findings[0].path).toBe('document/surface[0]/bTable[0]');
  });

  it('says where, in a path a reader can follow', () => {
    const findings = validateTree(
      schema,
      surface([paragraph('fine'), { stype: 'nonsense', attributes: {}, content: [] }])
    );
    expect(describeFindings(findings)).toContain('document/surface[0]/nonsense[1]');
    expect(describeFindings(findings)).toContain('nonsense');
  });

  /**
   * All of them, not the first: a fixture with three faults should take one run
   * to fix rather than three.
   */
  it('reports every fault it finds', () => {
    const findings = validateTree(
      schema,
      surface([
        { stype: 'nonsense', attributes: {}, content: [] },
        { stype: 'alsoNonsense', attributes: {}, content: [] }
      ])
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * A run keeps its text in a field rather than in children, so asking its
   * content model about an empty child list would report every word in the
   * document as an empty node.
   */
  it('does not mistake a run for an empty node', () => {
    expect(validateTree(schema, surface([paragraph('')]))).toEqual([]);
  });

  /**
   * `Validator.validateNode` reads `node.attrs`, and every document here writes
   * `attributes` — so it has been validating an empty object for every node it
   * was ever handed, and a missing required attribute has never once been found
   * by it.
   */
  it('reads the attribute field documents actually use', () => {
    const withSize = validateTree(schema, surface([
      { stype: 'canvasBlock', attributes: {}, content: [
        { stype: 'rectangle', attributes: { width: 100, height: 100 } }
      ] }
    ]));
    expect(withSize).toEqual([]);

    const without = validateTree(schema, surface([
      { stype: 'canvasBlock', attributes: {}, content: [{ stype: 'rectangle', attributes: {} }] }
    ]));
    expect(without.length).toBeGreaterThan(0);
    expect(without[0].stype).toBe('rectangle');
  });
});
