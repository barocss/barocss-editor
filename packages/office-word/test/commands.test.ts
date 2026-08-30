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
        /*
         * **Formatted text**, which this fixture had none of.
         *
         * The guards that ask *is there a mark here* cannot be asked by a document wearing nothing:
         * `removeLink` over unlinked words and 서식 지우기 over plain text both decline, correctly,
         * everywhere — and a command nothing can ask reads exactly like a command nobody wrote. The
         * link comes first because the probe's range states are a run's first three characters.
         */
        {
          stype: 'paragraph',
          attributes: {},
          content: [
            {
              stype: 'inline-text',
              text: '두 번째 문단입니다',
              marks: [
                { stype: 'link', attrs: { href: 'https://example.com' }, range: [0, 3] },
                { stype: 'bold', range: [4, 7] }
              ]
            }
          ]
        },
        /*
         * Already indented, so there is something for `outdentText` to take off — and by
         * `indentLeft` rather than by leading spaces, which is what **Word's** outdent works on. The
         * extensions' one takes characters off the front of a run; these two share a name and not a
         * question, and a fixture indented the other way had the command declining everywhere and
         * looking like a fault.
         */
        { stype: 'paragraph', attributes: { indentLeft: 720 }, content: [{ stype: 'inline-text', text: '들여 쓴 문단' }] },

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
    },
    /*
     * And `resources`, **after the surface** — `document` is `docMeta? surface+ resources? …`, and a
     * fixture with it first is a tree the schema refuses, which the validity check said about a
     * hundred commands at once.
     *
     * It is here because a numbering definition has to live somewhere the resolver looks: without a
     * `resources` node the two list toggles build nothing and return `false`, at every caret position
     * in the document. A fixture gap that reads exactly like two dead buttons on the ribbon, and it
     * took a measurement of the *reason* to tell those apart.
     */
    { stype: 'resources', attributes: {}, content: [] }
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
  setParagraphIndents: { indents: { indentLeft: 720 } },
  setTabStops: { tabs: [{ pos: 1440, align: 'left' }] },
  setRowHeight: { height: 400 },
  setCellShading: { fill: '#FDE68A' },
  setCellVerticalAlign: { align: 'center' },
  setCellTextDirection: { direction: 'btLr' },
  setTableStyle: { styleId: 'TableGrid' },
  toggleTableLook: { flag: 'firstRow' },
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
   * **The application's own commands, named** — and the document's, none.
   *
   * This started as a ceiling of 33 because the remainder had a cause and not yet a reason. It is a
   * list now, because it does: every one of the 23 below changes the *application* — where the caret
   * is, what is selected, what is on the clipboard, what has focus, which cell or math slot is next,
   * whether tracking is on. `moved` asks about the *document*, so all 23 answer no honestly, and a
   * count would let a 24th in without saying which.
   *
   * ## What came off, and what each one was
   *
   * - **`outdentText`** — `list-commands.ts` registers seven commands through one helper and gave all
   *   seven *"there is a block"*, which is what six of them need. Its run refuses a block with no
   *   indent and no numbering level and says so to nobody, so 내어쓰기 lit up over every paragraph.
   * - **`insertTab`** — the same helper, and it needs a **collapsed** caret.
   * - **`toggleBulletList` / `toggleOrderedList`** — not faults at all: a numbering definition has to
   *   live in a `resources` node and the fixture had none, so both returned false everywhere. The
   *   fixture was wrong, and it read exactly like two dead buttons on the ribbon.
   * - **`insertFootnote`** — the last one, and the oldest. It put the footnote's body at the document
   *   root; office says `document` holds `docMeta? surface+ resources?` and re-declares `footnoteDef`
   *   as a *resource* so a body cannot sit between two paragraphs. Every insert built a tree the
   *   validator refused and rolled back. Then, one layer down, `footnoteDef` held `block+` in office
   *   and `inline*` in the standard schema, and the command wrote the inline one — so **no footnote
   *   had ever been inserted, in any of the three products.** The schema now says `block+` in both
   *   places, which is what Word's own sample document had been writing all along.
   *
   * And one **near miss** worth keeping: the first fix narrowed `outdentFirstLine` too. It works on
   * `indentFirstLine`, and below zero that becomes a **hanging** indent — a real thing a reader wants
   * from a paragraph with no indent at all. Measured before and after, it moved the document at every
   * caret position, and narrowing it broke it. The two share a name and not a question.
   */
  const APPLICATION_ONLY = [
    'clearSelection', 'copy', 'escape',
    'extendSelectionLeft', 'extendSelectionRight', 'extendSelectionWordLeft', 'extendSelectionWordRight',
    'focus', 'isTrackingChanges',
    'moveCursorLeft', 'moveCursorRight', 'moveCursorWordLeft', 'moveCursorWordRight',
    'nextCell', 'nextMathSlot', 'paste', 'previousCell', 'previousMathSlot',
    'selectAll', 'setAbsolutePos', 'setContext', 'setNode', 'setRange'
  ];

  /**
   * **What Word says its inserts make, against what they were watched making.**
   *
   * `conformance.test.ts` carries a `produces` list by hand — 23 pairs of a command and the node type
   * it puts in — and two checks read it: one asks whether that node type is in the schema, the other
   * whether every command named `insert…` is on the list at all. Neither asks whether the list is
   * **true**, and a hand-kept list that nothing compares to the document is the hand-kept list this
   * whole harness replaced.
   *
   * The probe already knows: `made` is what it watched appear, counted before and after, with the
   * payloads this file gives each command. So the comparison costs nothing and closes the loop —
   * a declared `produces` that drifts from what the command does now fails here rather than being
   * quietly believed by the two checks that read it.
   *
   * Only what the probe could ask about. A command it never ran says nothing about the claim, which
   * is a different answer from *the claim is wrong* — and reporting the two together is how a check
   * comes to be ignored.
   */
  it('makes what its own list says it makes', () => {
    const declared: Array<[string, string]> = [
      /*
       * `insertParagraph` is **not** here, and the reason is the check's own limit rather than the
       * command's.
       *
       * The probe watched it make a `heading`, which is correct: it presses Enter at the first place
       * the command can run, which is the middle of the sample's first heading, and a split of a
       * heading is a heading. Enter at the *end* of one starts a paragraph — measured by hand, and
       * it is what the declared type says.
       *
       * So the claim and the observation are both true and about different presses, and the probe
       * stops at the first state a command can run in. A check that reported this would be reporting
       * where the fixture's first block is, which is the class of false finding this repository has
       * paid for twice.
       */
      ['insertHardBreak', 'hardBreak'],
      ['insertLineBreak', 'hardBreak'],
      ['insertImage', 'inline-image'],
      ['insertHorizontalRule', 'horizontalRule'],
      ['insertPageBreak', 'pageBreak'],
      ['insertColumnBreak', 'columnBreak'],
      ['insertTable', 'bTable'],
      ['insertRowAbove', 'bTableRow'],
      ['insertRowBelow', 'bTableRow'],
      ['insertColumnLeft', 'bTableCell'],
      ['insertColumnRight', 'bTableCell'],
      ['insertBookmark', 'bookmarkAnchor'],
      ['insertFootnote', 'footnoteDef'],
      ['insertEndnote', 'endnoteDef'],
      ['insertComment', 'commentThread']
    ];

    /*
     * A command whose observed list is *empty* was never run — a different answer from *the claim is
     * wrong*, and reporting the two together is how a check comes to be ignored.
     *
     * And `insertParagraph` is watched making a `heading`, because the probe presses Enter in the
     * middle of one and a split of a heading is a heading. So the claim is that the declared type is
     * **among** what was seen, not that it is all of it: a command with two honest answers has two.
     */
    const wrong = declared
      .filter(([command]) => (answers.made.get(command)?.length ?? 0) > 0)
      .filter(([command, kind]) => !answers.made.get(command)!.includes(kind))
      .map(([command, kind]) => `${command}: says ${kind}, made ${answers.made.get(command)!.join(', ')}`);

    expect(wrong).toEqual([]);
    // And enough of them were watched for the comparison to mean something.
    const asked = declared.filter(([command]) => (answers.made.get(command)?.length ?? 0) > 0);
    expect(asked.length).toBeGreaterThanOrEqual(8);
  });

  it('says it can run and then changes nothing, only where the change is not the document', () => {
    const dead = [...answers.moved].filter(([, answer]) => answer === false).map(([name]) => name);
    expect(dead.sort()).toEqual([...APPLICATION_ONLY].sort());

    /*
     * And it did ask about most of them — a probe that stopped setting up would pass the line above.
     *
     * 131 → 130 when `moveBlockToPosition` stopped saying yes to a move to the index a block already
     * occupies. A command that declines honestly is one fewer the probe can ask, which is the right
     * direction and reads as a loss in this number.
     */
    const asked = [...answers.moved].filter(([, answer]) => answer !== null).length;
    expect(asked).toBeGreaterThanOrEqual(130);
  });

  /**
   * **A control that lights up over a held box and does nothing** — opened at 45, and is the same 23.
   *
   * The other question stops at the first state a command can run in, so a command that works from a
   * caret and declines over a node selection comes back as **works**. Word is a text editor and
   * spends its time with a caret, which is exactly why nothing had ever asked: the state that finds
   * this is the one a *builder* lives in.
   *
   * Fifteen of the 45 came off in `packages/extensions`, because most of what Word registers is the
   * shared kit's — that is what a shared layer is for. The rest were Word's own and nothing else
   * would have found them: `toggleTableLook` wanted a `flag`, `insertColumnBreak` a range,
   * `setParagraphIndents` an `indents` object, `splitCell` a cell that is actually **merged** — one
   * helper had given all seven table commands *"the caret is in a cell"*, so 셀 나누기 lit up over
   * every cell in every table and worked on the merged ones.
   *
   * That the two lists ended up identical is the finding: what a builder cannot do and what does
   * nothing are now the same set, and it is the application's set.
   */
  it('lights up over a held box and declines, only where the change is not the document', () => {
    expect([...answers.saysYesAndDeclines].sort()).toEqual([...APPLICATION_ONLY].sort());
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

  /**
   * **A toggle is its own inverse** — except the two that leave a *resource* behind.
   *
   * Pressing 글머리 목록 twice returns the paragraph exactly: it loses its `numId` and `numLevel`
   * and is a plain paragraph again. What stays is the **numbering definition** the first press put
   * in `resources`, and that is Word's behaviour rather than a leak — a definition is a document
   * resource, other paragraphs may be using it, and `listToJoin` reuses it the moment the reader
   * bullets anything again. Deleting it would make the second bulleting build a new one and quietly
   * renumber a list somewhere else in the document.
   *
   * Named with the reason rather than passed over: the day the definition stops being reusable, or
   * the day it starts being deleted, this claim is wrong and says so.
   */
  const keepsAResource = new Set(['toggleBulletList', 'toggleOrderedList']);

  it('undoes itself when a toggle is pressed twice', () => {
    expect(answers.notSelfInverse.filter((one) => !keepsAResource.has(one))).toEqual([]);
    // And the two that are exempt really are in the pile — an exemption for a finding that does not
    // happen is a note, which is what the conformance harness fails on elsewhere.
    expect(answers.notSelfInverse.sort()).toEqual([...keepsAResource].sort());
  });
});
