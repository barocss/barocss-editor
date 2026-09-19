import { describe, it, expect, beforeEach } from 'vitest';
import { createWordEditor } from '../src/word-kit';

/**
 * **Pressing 도형 or 프레임 while the caret is in a table cell.**
 *
 * Both inserts climb from the caret to "the block a new sibling goes next to", and both decided
 * where to stop from a **hand-written list**: *not a paragraph, not a heading*. A `bTableCell`
 * satisfies that — its parent is a `bTableRow` — so the walk stopped one step early and asked the
 * row to hold a frame. `bTableRow` is `'bTableCell*'`, the validator refused the transaction, and
 * the command returned false with the button still lit.
 *
 * `office-site` met the same fault twice and the answer both times was to **ask the schema**
 * (`holdsABlock`) instead of keeping a list of what a block cannot go inside — a list is a second
 * place to remember the schema, and it is wrong the first time a type is added.
 *
 * Word now supports paragraphs and legacy direct inline content inside cells. The frame and
 * drawing insertion path still places these objects after the table. In particular, the row
 * must never receive a frame as a sibling of its cells.
 *
 * Written before the fix and red on both counts — `insertFrame` and `insertRectangle` each returned
 * `false` and left the document untouched.
 */
describe('inserting a block while the caret is in a table cell', () => {
  let editor: any;

  /** A section holding a paragraph, a two-cell table, and a paragraph after it. */
  const doc = () => ({
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'surface',
        attributes: { kind: 'flow' },
        content: [
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '앞 문단' }] },
          {
            stype: 'bTable',
            attributes: {},
            content: [
              {
                stype: 'bTableBody',
                attributes: {},
                content: [
                  {
                    stype: 'bTableRow',
                    attributes: {},
                    content: [
                      { stype: 'bTableCell', attributes: {}, content: [{ stype: 'inline-text', text: 'A1' }] },
                      { stype: 'bTableCell', attributes: {}, content: [{ stype: 'inline-text', text: 'B1' }] }
                    ]
                  }
                ]
              }
            ]
          },
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '뒤 문단' }] }
        ]
      }
    ]
  });

  beforeEach(() => {
    editor = createWordEditor();
    editor.loadDocument(doc(), 'word');
  });

  /** Every node in the document, as `stype` and its children — the shape of the tree. */
  const treeOf = (sid: string = editor.getRootId()): any => {
    const node = editor.dataStore.getNode(sid);
    const kids = (node?.content ?? []).filter((one: unknown) => typeof one === 'string' && editor.dataStore.getNode(one as string)?.stype !== 'resources');
    return kids.length > 0 ? { [node.stype]: kids.map((one: string) => treeOf(one)) } : node.stype;
  };

  const section = () => editor.dataStore.getNode(editor.getRootId()).content[0];
  const table = () => editor.dataStore.getNode(section()).content[1];
  const firstCell = () => {
    const body = editor.dataStore.getNode(table()).content[0];
    const row = editor.dataStore.getNode(body).content[0];
    return editor.dataStore.getNode(row).content[0];
  };
  /**
   * Put the caret in the run inside cell A1 — where a reader who clicked in the cell is.
   *
   * Set on the editor rather than handed to the command, because that is what the ribbon does:
   * `apps/word/src/app.tsx:153` runs a toolbar entry's command with the entry's payload and nothing
   * about the selection, so a command that only reads a payload's selection is a button that does
   * nothing.
   */
  const caretIn = (nodeId: string) => {
    const run = editor.dataStore.getNode(nodeId).content[0];
    editor.setRange({ type: 'range', startNodeId: run, startOffset: 0, endNodeId: run, endOffset: 0, collapsed: true });
  };

  it('allows Word cell paragraphs while rows still accept cells only', () => {
    const schema = editor.dataStore.getActiveSchema();
    expect(schema.getNodeType('bTableCell')?.content).toBe('(block|inline)*');
    expect(schema.getNodeType('bTableHeaderCell')?.content).toBe('(block|inline)*');
    expect(schema.getNodeType('bTableRow')?.content).toBe('bTableCell*');
  });

  it('puts a frame after the table, not inside the row that holds only cells', async () => {
    caretIn(firstCell());
    expect(await editor.executeCommand('insertFrame', { layoutMode: 'row' })).toBe(true);

    expect(treeOf()).toEqual({
      document: [
        {
          surface: [
            { paragraph: ['inline-text'] },
            { bTable: [{ bTableBody: [{ bTableRow: [{ bTableCell: ['inline-text'] }, { bTableCell: ['inline-text'] }] }] }] },
            { frame: [{ paragraph: ['inline-text'] }, { paragraph: ['inline-text'] }] },
            { paragraph: ['inline-text'] }
          ]
        }
      ]
    });
  });

  it('puts a drawing after the table too', async () => {
    caretIn(firstCell());
    expect(await editor.executeCommand('insertRectangle')).toBe(true);

    expect(treeOf()).toEqual({
      document: [
        {
          surface: [
            { paragraph: ['inline-text'] },
            { bTable: [{ bTableBody: [{ bTableRow: [{ bTableCell: ['inline-text'] }, { bTableCell: ['inline-text'] }] }] }] },
            { canvasBlock: ['rectangle'] },
            { paragraph: ['inline-text'] }
          ]
        }
      ]
    });
  });

  /*
   * The button is lit exactly when the command has somewhere to write. It was lit and dead — the
   * walk found a parent and the validator threw the transaction away — which is the half of this
   * fault a reader actually meets.
   */
  it('says it can insert, and means it', () => {
    caretIn(firstCell());
    expect(editor.canExecuteCommand('insertFrame'), '단추는 켜져 있는데 명령이 실패합니다').toBe(true);
    expect(editor.canExecuteCommand('insertRectangle')).toBe(true);
  });

  /*
   * And the walk still stops at the paragraph's siblings when the caret is in ordinary text — the
   * schema answering "a paragraph holds inlines" is what used to be the hand-written exception.
   */
  it('still lands beside the paragraph when the caret is in one', async () => {
    caretIn(editor.dataStore.getNode(section()).content[0]);

    expect(await editor.executeCommand('insertFrame', { layoutMode: 'row' })).toBe(true);

    expect((treeOf() as any).document[0].surface.map((one: any) => (typeof one === 'string' ? one : Object.keys(one)[0]))).toEqual([
      'paragraph',
      'frame',
      'bTable',
      'paragraph'
    ]);
  });
});
