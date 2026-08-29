// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import {
  askEveryCommand,
  everyNode,
  type CommandAnswers,
  type ProbeEditor,
  type ProbeStore
} from '@barocss/conformance';
import { validateTree } from '@barocss/schema';
import { createWordEditor } from '../src/word-kit';

/**
 * **Every command Word registers, run over a real document, and asked six questions.**
 *
 * ## Why this exists
 *
 * The probe behind it was written in `packages/extensions` and found eleven faults on its first
 * afternoon, two of which lost a reader's words. All eleven were in the **shared** command layer.
 *
 * Then the count was taken from this side: Word registers **164** commands, and only about 136 come
 * from that layer. The rest are Word's own — revisions, comments, tables, shapes, maths, fields,
 * tab stops — and **not one of them had ever been asked whether it can be undone**. The probe was
 * answering six questions about one package and nothing about the product standing on it, which is
 * the same shape as the fault it was built to find: a mechanism that exists and is wired in one
 * place.
 *
 * It is `@barocss/conformance`'s now. This file is a document fixture, a payload table and four
 * lines — which is what the next product built on this engine has to write to inherit all six.
 *
 * ## What a product owes it
 *
 * A document with one of most things in it, and what a **surface** would send beyond a selection.
 * The table is not cheating: a colour command asks `canExecute` before the reader has picked a
 * colour, deliberately, because a control has to know whether to be enabled before it knows what it
 * will send. A command with no entry runs with nothing, and one that then says yes and does nothing
 * is a finding either way — either its guard is looser than its execute, or this table owes it one.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    {
      stype: 'surface',
      attributes: { kind: 'flow' },
      content: [
        { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: '제목 한 줄' }] },
        { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '한 문단의 글자들' }] },
        { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '두 번째 문단입니다' }] },
        // Already indented, so there is something for `outdentText` to take off.
        { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '  들여 쓴 문단' }] },
        {
          stype: 'list',
          attributes: { type: 'bullet' },
          content: [
            { stype: 'listItem', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '첫 항목' }] }] },
            { stype: 'listItem', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '둘째 항목' }] }] }
          ]
        },
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
                    { stype: 'bTableCell', attributes: {}, content: [{ stype: 'inline-text', text: '가' }] },
                    { stype: 'bTableCell', attributes: {}, content: [{ stype: 'inline-text', text: '나' }] }
                  ]
                },
                {
                  stype: 'bTableRow',
                  attributes: {},
                  // Merged, because `splitTableCell` declines a cell that is not.
                  content: [{ stype: 'bTableCell', attributes: { colspan: 2 }, content: [{ stype: 'inline-text', text: '다' }] }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

const SAYS: Record<string, Record<string, unknown>> = {
  // Marks that carry a value — a swatch, a size box, a family picker.
  setFontColor: { color: '#0F7A5A' },
  setBgColor: { color: '#FDE68A' },
  setHighlight: { color: '#FDE68A' },
  toggleHighlight: { color: '#FDE68A' },
  setFontSize: { size: '18px' },
  setFontFamily: { family: 'Pretendard' },
  setAlignment: { alignment: 'center' },
  setHeading: { level: 2 },
  toggleLink: { href: 'https://barocss.com' },
  setLetterSpacing: { value: '0.05em' },
  setWordSpacing: { value: '0.1em' },
  setLineHeight: { value: '1.6' },
  setTextShadow: { value: '0 1px 2px rgb(0 0 0 / 0.2)' },
  setBorder: { attrs: { style: 'solid', width: '1px', color: '#0F7A5A' } },
  setSpanLang: { attrs: { lang: 'ko', dir: 'ltr' } },

  // Inserts whose content is the reader's.
  insertText: { text: '들어간 글자' },
  insertImage: { src: 'https://example.com/a.png', alt: '그림' },
  insertMention: { id: '지호' },
  insertBookmark: { id: '요금' },
  insertFootnote: { id: '1', text: '각주' },
  insertFootnoteRef: { id: '1' },
  insertTable: { rows: 2, cols: 2 },
  replaceText: { text: '바뀐 글자' },
  setContext: { key: 'probe', value: 1 },
  focus: { text: '' },

  // Word's own.
  insertComment: { text: '한마디' },
  setParagraphIndents: { indentLeft: 720 },
  setTabStops: { tabs: [{ pos: 1440, align: 'left' }] },
  setRowHeight: { height: 400 },
  setCellShading: { fill: '#FDE68A' },
  setCellVerticalAlign: { align: 'center' },
  setCellTextDirection: { direction: 'btLr' },
  setTableStyle: { styleId: 'TableGrid' },
  toggleTableLook: { look: 'firstRow' },
  moveShapes: { dx: 100, dy: 100 },
  resizeShapes: { width: 2000, height: 1000 }
};

const WANTS_NODE: Record<string, { stype: string; keys: string[] }> = {
  deleteNode: { stype: 'paragraph', keys: ['nodeId'] },
  indentNode: { stype: 'paragraph', keys: ['nodeId'] },
  outdentNode: { stype: 'paragraph', keys: ['nodeId'] },
  moveBlockToPosition: { stype: 'paragraph', keys: ['blockId'] },
  deleteRow: { stype: 'bTableCell', keys: ['cellId'] },
  insertRowAbove: { stype: 'bTableCell', keys: ['cellId'] },
  insertRowBelow: { stype: 'bTableCell', keys: ['cellId'] },
  insertColumnLeft: { stype: 'bTableCell', keys: ['cellId'] },
  insertColumnRight: { stype: 'bTableCell', keys: ['cellId'] },
  deleteColumn: { stype: 'bTableCell', keys: ['cellId'] },
  splitCell: { stype: 'bTableCell', keys: ['cellId'] },
  mergeCells: { stype: 'bTableCell', keys: ['fromCellId'] },
  setRowHeight: { stype: 'bTableRow', keys: ['rowId'] },
  setCellShading: { stype: 'bTableCell', keys: ['cellId'] },
  setCellVerticalAlign: { stype: 'bTableCell', keys: ['cellId'] },
  setCellTextDirection: { stype: 'bTableCell', keys: ['cellId'] },
  setTableStyle: { stype: 'bTable', keys: ['tableId'] },
  toggleTableLook: { stype: 'bTable', keys: ['tableId'] },
  deleteTable: { stype: 'bTable', keys: ['tableId'] }
};

/** What has to have happened first: an edit, an undo. */
const BEFORE: Record<string, (editor: ProbeEditor) => Promise<void>> = {};
for (const name of ['undo', 'redo', 'historyUndo', 'historyRedo']) {
  BEFORE[name] = async (editor) => {
    await editor.executeCommand('toggleBold', {});
    if (name === 'redo' || name === 'historyRedo') await editor.executeCommand('undo', {});
  };
}

/** And what has to be read out of the document it will run on — see the extensions' note. */
const DERIVED = (name: string, editor: ProbeEditor, store: ProbeStore): Record<string, unknown> | undefined => {
  const runs = everyNode(editor, store, 'inline-text');
  if (['deleteText', 'replaceText'].includes(name)) return { range: editor.selection };
  if (name === 'deleteCrossNode' && runs.length > 1) {
    return {
      range: { type: 'range', startNodeId: runs[0], startOffset: 1, endNodeId: runs[1], endOffset: 2, collapsed: false }
    };
  }
  const cells = everyNode(editor, store, 'bTableCell');
  if (name === 'mergeCells' && cells[1]) return { toCellId: cells[1] };
  if (name === 'splitCell') {
    const merged = cells.find((sid: string) => {
      const attrs = (store.getNode(sid)?.attributes ?? {}) as { colspan?: number; rowspan?: number };
      return (attrs.colspan ?? 1) > 1 || (attrs.rowspan ?? 1) > 1;
    });
    return merged ? { cellId: merged } : undefined;
  }
  return undefined;
};

/** Undoing an `undo` is a redo; the document is supposed to stay where the undo left it. */
const HISTORY = new Set(['undo', 'historyUndo']);

const fresh = () => {
  const editor = createWordEditor();
  editor.loadDocument(document_() as never, 'word');
  return { editor, store: editor.dataStore };
};

describe('every command Word registers', () => {
  const names = createWordEditor().commandNames().sort();

  let answers: CommandAnswers;

  beforeAll(async () => {
    answers = await askEveryCommand({
      fresh,
      names,
      says: SAYS,
      wantsNode: WANTS_NODE,
      before: BEFORE,
      derive: DERIVED,
      validates: (editor) => {
        const schema = editor.dataStore?.getActiveSchema?.();
        const tree = editor.exportDocument(editor.getRootId());
        return !schema || !tree || validateTree(schema as never, tree).length === 0;
      }
    });
  }, 120_000);

  /**
   * **How many say they can run and then change nothing** — a ceiling, so it can only come down.
   *
   * 98 move the document, 33 do not, 33 cannot be asked. The 33 that do not are not all faults:
   * moving the caret, extending a selection, copying, focusing and reading a flag are application
   * changes, and there are about twenty of those here. What is left is a work list, and the shape of
   * it is already familiar — `list-commands.ts` registers **seven** commands through one helper whose
   * guard is *"there is a block"*, which is looser than what any of the seven actually needs.
   * `TextFormattingExtension` had exactly this, in exactly this shape, and a private helper is why a
   * sweep reading `canExecute:` at each command's own declaration never sees it.
   *
   * A number rather than a list of exemptions because none of them has a *reason* yet; they have a
   * cause, which is what a ratchet is for. Word's own `conformance.test.ts` owns the finding-level
   * question with its own probe — this is the count, held so it cannot grow quietly.
   */
  it('says it can run and then changes nothing, in no more places than it did', () => {
    const dead = [...answers.moved].filter(([, answer]) => answer === false).map(([name]) => name);
    expect(dead.length).toBeLessThanOrEqual(33);

    // And it did ask about most of them — a probe that stopped setting up would pass the line above.
    const asked = [...answers.moved].filter(([, answer]) => answer !== null).length;
    expect(asked).toBeGreaterThanOrEqual(131);
  });

  it('gives the document back when it is undone', () => {
    expect(answers.undone.filter((one) => !HISTORY.has(one))).toEqual([]);
  });

  it('does it again when it is redone', () => {
    expect(answers.unredone.filter((one) => !HISTORY.has(one))).toEqual([]);
  });

  it('leaves a document the schema still accepts', () => {
    expect(answers.broken).toEqual([]);
  });

  it('leaves the selection pointing at nodes that exist', () => {
    expect([...new Set(answers.ghost)]).toEqual([]);
  });

  it('undoes itself when a toggle is pressed twice', () => {
    expect(answers.notSelfInverse).toEqual([]);
  });
});
