import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '../src/editor';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';

/**
 * A document that is loaded is checked against the schema.
 *
 * Every *operation* validates what it writes, so a document built by editing is
 * checked at every step — and one handed to `loadDocument` went in exactly as
 * written, which is how a product's own fixture came to be a document its schema
 * refuses. It drew perfectly for as long as it existed, because renderers walk
 * whatever they are given, and the failure surfaced four levels away as
 * `mergeTableCells: cell not found in table`.
 *
 * Reported rather than refused: a reader with a file that will not open and no
 * way to see why is worse off than one whose file opens with a warning, and
 * refusing is the wrong default for a product that imports other people's
 * documents.
 *
 * **What this adds is the arrangement.** The loader already refuses a node type
 * the schema has never heard of — it throws on the way in — so every fault here
 * is built from types the schema knows, put together in a way it does not allow.
 * That is the shape a real fixture goes wrong in: nobody invents a node type by
 * accident, and everybody nests one wrongly.
 */
const schema = createSchema('standard-faults', getStandardSchemaDefinition());

const editorWith = () => new Editor({ schema } as never);

const document = (content: unknown[]) => ({ stype: 'document', attributes: {}, content });

const paragraph = (text: string) => ({
  stype: 'paragraph',
  attributes: {},
  content: [{ stype: 'inline-text', text }]
});

// Only `mockRestore` is used, and stating that is simpler than naming the spy's
// generic parameters — `mockImplementation` narrows them.
let warn: { mockRestore: () => void };
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  // Braces: the arrow's return value would be read as a cleanup function.
  warn.mockRestore();
});

describe('loading a document', () => {
  it('says nothing about one the schema accepts', () => {
    const editor = editorWith();
    editor.loadDocument(document([paragraph('hello')]));

    expect(editor.documentFaults).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * The shape that cost four rounds of debugging: a table whose rows sit
   * directly under it, where the schema says `bTableBody+`. Two levels below the
   * root, which is already past where `Validator.validateDocument` stops.
   */
  it('finds a fault below the level the old validator stopped at', () => {
    const editor = editorWith();
    editor.loadDocument(
      document([
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

    expect(editor.documentFaults.length).toBeGreaterThan(0);
    expect(editor.documentFaults[0].path).toContain('bTable');
    expect(warn).toHaveBeenCalled();
  });

  /**
   * Opened anyway. The document is in the store and editable — the check is a
   * report, not a gate.
   */
  it('opens the document all the same', () => {
    const editor = editorWith();
    editor.loadDocument(
      document([
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

    expect(editor.documentFaults.length).toBeGreaterThan(0);
    expect(editor.getRootId()).toBeTruthy();
  });

  it('announces it, so a host can show what is wrong', () => {
    const editor = editorWith();
    const heard: unknown[] = [];
    editor.on('editor:document.invalid' as never, (payload: unknown) => heard.push(payload));

    editor.loadDocument(
      document([
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
    expect(heard).toHaveLength(1);
  });

  /** A second load replaces the answer rather than adding to it. */
  it('reports on the document it was last given', () => {
    const editor = editorWith();
    editor.loadDocument(
      document([
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
    expect(editor.documentFaults.length).toBeGreaterThan(0);

    editor.loadDocument(document([paragraph('fine')]));
    expect(editor.documentFaults).toEqual([]);
  });
});
