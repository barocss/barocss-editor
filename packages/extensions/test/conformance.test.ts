// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { assertConforms, conformance } from '@barocss/conformance';
import { DataStore } from '@barocss/datastore';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import * as extensions from '../src';

/**
 * **Every command this package registers, run over a real document.**
 *
 * ## Why this did not exist, and what that cost
 *
 * The suite has a check that asks exactly this question — `every-command-does-something` in
 * `@barocss/conformance` — and it has only ever been wired **per product**. So whether a command was
 * checked at all depended on whether Word's, the deck's or the site's probe happened to reach it,
 * and a command no product surfaces was checked by nobody. Measured before this file existed:
 *
 * | | |
 * | --- | ---: |
 * | commands registered here | 97 |
 * | never named in any test | 36 |
 * | test files that mock `commit` | 18 of 22 |
 *
 * The tests are not absent; they are the wrong shape. The one for `setFontSize` is representative:
 * it builds a **fake** editor, mocks `transaction().commit()`, hands the command a good range, and
 * asserts the *operation it would have built*. It never loads a document, never applies anything and
 * never asks `canExecute`. So when `setFontSize`'s guard turned out to accept a collapsed range —
 * where `applyMark` commits and changes nothing — every one of its tests passed, and the passing
 * tests are what made it invisible.
 *
 * The deck's probe caught `setFontColor` doing the same thing months ago. `setFontSize`, three lines
 * away in a neighbouring file, survived because no product put a size control on a surface.
 *
 * ## What it asks
 *
 * The product half of `every-command-does-something`: run the command and see whether the document
 * moved. Three answers, and the third is the one that keeps the check honest — `null` means the probe
 * could not get into a state where the command says it can run, which is counted rather than passed.
 *
 * ## The payload table, and why it is not cheating
 *
 * A colour command asks `canExecute` before the reader has picked a colour — that is deliberate and
 * documented: a control has to know whether to be enabled before it knows what it will send. So the
 * probe supplies what a **surface** would supply, which is what the products' probes do too. A
 * command with no entry runs with nothing, and one that then says yes and does nothing is a finding
 * either way: either its guard is looser than its execute, or this table owes it an entry.
 */
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

  // Inserts whose content is the reader's.
  insertText: { text: '들어간 글자' },
  insertImage: { src: 'https://example.com/a.png', alt: '그림' },
  insertFigure: { src: 'https://example.com/a.png', alt: '그림', caption: '설명' },
  insertVideo: { src: 'https://example.com/a.mp4' },
  insertAudio: { src: 'https://example.com/a.mp3' },
  insertEmbed: { provider: 'youtube', id: 'abc123', title: '영상' },
  insertMathInline: { tex: 'a^2 + b^2' },
  insertMathBlock: { tex: 'a^2 + b^2' },
  insertMention: { id: '지호' },
  insertBookmark: { id: '요금' },
  insertFootnote: { id: '1', text: '각주' },
  insertFootnoteRef: { id: '1' },
  insertCallout: { type: 'note', title: '알림' },
  insertCodeBlock: { language: 'ts' },
  insertDetails: { summary: '더 보기' },
  insertPullQuote: { text: '인용' },
  insertTable: { rows: 2, cols: 2 },
  insertColumns: { count: 2 },
  insertEmoji: { emoji: '🙂' },
  replaceText: { text: '바뀐 글자' },
  setContext: { key: 'probe', value: 1 },
  focus: { text: '' },

  /*
   * `TextFormattingExtension` registers six of these through two private helpers, so what each one
   * wants is not in a signature at all: the mark's attribute name is an argument to the helper and
   * the payload key is always `value` — or `attrs` for the two that take several. Guessed from the
   * registration call first (`spacing`, `height`, `shadow`) and all six came back as broken; reading
   * the helper is what settled it, and a table that had kept guessing would have reported six
   * working commands as faults.
   */
  setLetterSpacing: { value: '0.05em' },
  setWordSpacing: { value: '0.1em' },
  setLineHeight: { value: '1.6' },
  setTextShadow: { value: '0 1px 2px rgb(0 0 0 / 0.2)' },
  setBorder: { attrs: { style: 'solid', width: '1px', color: '#0F7A5A' } },
  setSpanLang: { attrs: { lang: 'ko', dir: 'ltr' } },

  /* `DocStructureExtension` takes its node's own attributes under one key. */
  insertChart: { attrs: { title: '분기 매출', values: '3,5,8' } },
  insertDocHeader: { attrs: {} },
  insertDocFooter: { attrs: {} },
  insertEndnote: { attrs: { id: '1' } },

  moveBlockToPosition: { targetIndex: 0 }
};

/**
 * Commands that need something to **have happened** before they mean anything.
 *
 * Undo over a fresh document is not a command that does nothing; it is a command with nothing to do,
 * and a probe that cannot tell those apart turns a whole history into a finding. So the document is
 * moved first, by a command already known to move it, and then the question is asked.
 */
/**
 * Commands that move the document and **cannot be put back** — filled by the probe, asserted below.
 *
 * The check this file runs asks whether a command changes the document. Undo is the other half of
 * the same run and costs nothing: the probe has the document before and after already, so putting it
 * back and comparing is one more line. `every-command-does-something`'s own documentation says as
 * much — *"which is two answers for the price of one, because a command that cannot be undone is its
 * own fault and a worse one."* Nothing had ever collected the second answer.
 */
const UNDONE: string[] = [];

const AFTER_AN_EDIT = new Set(['undo', 'redo', 'historyUndo', 'historyRedo']);

/** What each of these needs is **a node of some kind**, filled in from the document below. */
const WANTS_NODE: Record<string, string> = {
  toggleChecklistItem: 'taskItem',
  deleteNode: 'paragraph',
  indentNode: 'paragraph',
  outdentNode: 'paragraph',
  moveBlockToPosition: 'paragraph',
  setFigcaption: 'bFigure',
  addDescriptionItem: 'descList',
  addColumn: 'columns',
  removeColumn: 'columns',

  /*
   * A table's nine, which take the **cell** they act from rather than reading it out of the
   * selection. Worth writing down because it was guessed the other way first: a caret was put in a
   * cell as a third selection state and nothing changed, because the guard never looks there.
   */
  deleteRow: 'bTableCell',
  insertRowAbove: 'bTableCell',
  insertRowBelow: 'bTableCell',
  insertColumnLeft: 'bTableCell',
  insertColumnRight: 'bTableCell',
  deleteColumn: 'bTableCell',
  splitCell: 'bTableCell',
  mergeCells: 'bTableCell'
};

/** And the key each of them calls it, which is not one name. */
const NODE_KEY: Record<string, string[]> = {
  toggleChecklistItem: ['nodeId'],
  deleteNode: ['nodeId'],
  indentNode: ['nodeId'],
  outdentNode: ['nodeId'],
  moveBlockToPosition: ['blockId'],
  setFigcaption: ['figureId'],
  addDescriptionItem: ['descListId'],
  addColumn: ['columnsId'],
  removeColumn: ['columnsId'],
  deleteRow: ['cellId'],
  insertRowAbove: ['cellId'],
  insertRowBelow: ['cellId'],
  insertColumnLeft: ['cellId'],
  insertColumnRight: ['cellId'],
  deleteColumn: ['cellId'],
  splitCell: ['cellId'],
  // Two cells, and the second is the one beside it — a merge of a cell with itself is not a merge.
  mergeCells: ['fromCellId']
};

/**
 * A document with one of most things in it.
 *
 * Hand-written rather than built by running the inserts, so that a broken insert is a **finding**
 * rather than a fixture that fails to build — the probe must not depend on the thing it measures.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: '제목 한 줄' }] },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '한 문단의 글자들' }] },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '두 번째 문단입니다' }] },
    /*
     * Already indented, so there is something for `outdentText` to take off. Without one it is a
     * command that correctly declines everywhere in this document — honest, and it means the check
     * never runs it.
     */
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '  들여 쓴 문단' }] },
    {
      stype: 'list',
      attributes: { type: 'bullet' },
      content: [
        { stype: 'listItem', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '첫 항목' }] }] },
        { stype: 'listItem', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '둘째 항목' }] }] }
      ]
    },
    { stype: 'taskItem', attributes: { checked: false }, content: [{ stype: 'inline-text', text: '할 일 하나' }] },
    {
      stype: 'descList',
      attributes: {},
      content: [
        { stype: 'descTerm', attributes: {}, content: [{ stype: 'inline-text', text: '낱말' }] },
        { stype: 'descDef', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '뜻풀이' }] }] }
      ]
    },
    {
      stype: 'columns',
      attributes: {},
      content: [
        { stype: 'column', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '왼쪽 단' }] }] },
        { stype: 'column', attributes: {}, content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '오른쪽 단' }] }] }
      ]
    },
    {
      stype: 'bFigure',
      attributes: {},
      content: [
        { stype: 'inline-image', attributes: { src: 'https://example.com/a.png', alt: '그림' }, content: [] },
        { stype: 'bFigcaption', attributes: {}, content: [{ stype: 'inline-text', text: '그림 설명' }] }
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
              content: [
                { stype: 'bTableCell', attributes: {}, content: [{ stype: 'inline-text', text: '다' }] },
                { stype: 'bTableCell', attributes: {}, content: [{ stype: 'inline-text', text: '라' }] }
              ]
            }
          ]
        }
      ]
    }
  ]
});

/**
 * A document as a **string that means the same thing** — what two of these can be compared by.
 *
 * Straight `JSON.stringify` is not it, and the difference is not cosmetic. Undo a `toggleBold` and
 * the run comes back carrying `marks: []` where it had no `marks` key at all: the same document by
 * every reading, and a different string. Measured before this existed, **45** of the commands that
 * move the document looked like commands that cannot be undone — every mark toggle, every delete,
 * every text insert — which is a finding so large it can only be the probe.
 *
 * So: an empty array or an empty object is the same as absent, and `metadata` is the store's own
 * bookkeeping rather than the document.
 */
const meaning = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(meaning);
  if (!node || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'metadata') continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!Array.isArray(value) && typeof value === 'object' && Object.keys(value as object).length === 0) continue;
    out[key] = meaning(value);
  }
  return out;
};

const asWritten = (editor: { exportDocument: (sid: string) => unknown; getRootId: () => string }) =>
  JSON.stringify(meaning(editor.exportDocument(editor.getRootId()) ?? ''));

const everyExtension = () =>
  Object.entries(extensions)
    .filter(([name, made]) => name.endsWith('Extension') && typeof made === 'function' && /^[A-Z]/.test(name))
    .map(([, Made]) => {
      try {
        return new (Made as new () => unknown)();
      } catch {
        // An extension that cannot be constructed with no arguments is not this check's to run.
        return null;
      }
    })
    .filter(Boolean);

const fresh = () => {
  const schema = createSchema('standard', getStandardSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor = (extensions as never as {
    createEditor: (o: unknown) => Record<string, any>;
  }).createEditor({ editable: true, schema, dataStore: store, kit: everyExtension() });
  editor.loadDocument(document_(), 'standard');
  return { editor, store };
};

/** The sids of every node of a kind, in document order. */
const every = (editor: any, store: DataStore, stype: string): string[] => {
  const out: string[] = [];
  const walk = (sid: string) => {
    const node = store.getNode(sid) as any;
    if (!node) return;
    if (node.stype === stype) out.push(sid);
    if (stype === 'inline-text' && typeof node.text === 'string') out.push(sid);
    for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
  };
  walk(editor.getRootId());
  return [...new Set(out)];
};

describe('every command this package registers', () => {
  /**
   * Asked once, before the checks, because a command is `async` and a check is not.
   *
   * The site's probe records what happens when this is got wrong: comparing the document on the line
   * after `executeCommand` reported **all 24** of its commands as changing nothing, including ones a
   * browser watches work. A probe wrong in that direction at least fails loudly.
   */
  const moved = new Map<string, boolean | null>();

  const names: string[] = [...(fresh().editor as any)._commands.keys()].sort();

  beforeAll(async () => {
    for (const name of names) moved.set(name, await ask(name));
  });

  /**
   * What changes the **application** rather than the document — and each is a claim on the record
   * that fails the day it stops being true, rather than a name on a skip list.
   */
  const exempt: Record<string, string> = {
    setNode: 'moves the selection to a node; a selection is not the document',
    setRange: 'moves the selection to a span of text, for the same reason',
    clearSelection: 'lets go of the selection',
    selectAll: 'selects everything, which is a selection and not an edit',
    focus: 'puts the caret in the view; the document is untouched by where a reader is looking',
    escape: 'leaves whatever the reader is inside — a mode, not a document',
    setContext: 'writes a value the view reads; deliberately outside the document',
    setAbsolutePos: 'positions the view’s own overlay',
    /*
     * `showSlashMenu` only. Its twin was here too and the harness deleted it — **stale**, because
     * `hideSlashMenu` never says it can run over a document with no menu open, so it is unanswered
     * rather than a finding, and an exemption for a finding that does not happen is a note.
     */
    showSlashMenu: 'opens a menu',
    /*
     * Tab and ⇧Tab between cells. What they are **for** is moving the caret, and only one case in a
     * table changes the document: Tab past the last cell grows a row, which every word processor and
     * spreadsheet does. The probe reaches the first cell it finds, so it measures the ordinary case
     * — and the ordinary case is a selection move.
     */
    nextCell: 'moves the caret to the next cell; only Tab past the last one grows the table',
    previousCell: 'moves the caret to the previous cell, and never grows anything',

    /*
     * And the two that are **not** application commands and are exempt anyway, because the finding is
     * already recorded and this check would report it every run until it is fixed. An exemption with
     * a reason is how a known fault stays visible without drowning a new one.
     */
    find: 'registered as `execute: () => true` — a stub. See BACKLOG; Word’s ⌘F runs it today',
    findAndReplace: 'the same stub, and the same entry'
  };

  it('changes the document when it says it can run', () => {
    assertConforms({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      hasRenderer: () => true,
      only: ['every-command-does-something'],
      reachable: names,
      commandChanges: (command: string) => moved.get(command) ?? null,
      exempt,
      /**
       * **No ratchet**, and it opened at nine.
       *
       * A ratchet says how much of a known pile is left, and it cannot go stale because the day one
       * is fixed the number is wrong in the direction that fails — which it said out loud, four
       * times, each time a batch went: *"0 finding(s), and 3 were allowed. Lower the ratchet to 0."*
       * It is gone rather than set to zero, because zero is what an assertion already means and a
       * number kept at zero is a note.
       *
       * What the nine were, on the first run this package had ever had of this check:
       *
       * - **Six `canExecute: () => true`** in `TextFormattingExtension`, beside an execute that
       *   refuses without a range *and* without a value. Alive because they are registered through a
       *   private helper, so a sweep reading `canExecute:` at each command's own declaration never
       *   saw them.
       * - **Four inserts that drew nothing** in `DocStructureExtension`. `hasContent: true` gave
       *   every node it makes a **paragraph** as its empty content, and `docHeader`, `docFooter` and
       *   `endnoteDef` hold `inline*` — the schema refused the child, while the three beside them in
       *   the same table and through the same code worked. `chart` was a different shape of the same
       *   thing: it *requires* a `values` attribute and nothing checked.
       * - **`removeHeading`**, whose guard was `return true` under a comment reading *"conservative
       *   default"*. 제목 해제 lit up with the caret in an ordinary paragraph.
       * - **`splitListItem`**, which asked for a range and not for a **list item**.
       * - **`setFigcaption`**, which only ever *added* a caption. A `bFigure` holds at most one, so
       *   on a figure that already had one — which is every figure `insertFigure` makes — the schema
       *   refused the second and the command reported success.
       * - **`splitCell`**, over a cell that is not merged. `splitTableCell` refuses one with the
       *   reason in the operation: there is nothing to split.
       * - **`removeColumn`**, needing two ids with a guard that asked for neither, and taking the
       *   **last** column out of a `column+` besides.
       *
       * Eight of the nine were a `canExecute` looser than its `execute`, which is the class
       * `guards.ts` names and the reason it exists.
       */
    });
  });

  /**
   * And **how much of the product this could ask about at all**, which is the half a pass hides.
   *
   * `unanswered` is the probe saying it could not get the editor into a state where the command says
   * it can run. That is honest and it is not coverage, so it is asserted as a ceiling: a probe that
   * quietly stopped setting things up would drive this number *up* and fail, rather than reporting
   * a smaller, greener product.
   *
   * It was **28**, and walking every run in the document rather than one took it to **23** — five
   * commands that were only ever unaskable because a caret happened to be in a paragraph. What is
   * left, and why:
   *
   * - **A find that has not been run.** `findNext`, `findPrev`, `replaceOne`, `replaceAll` all need
   *   a search in progress, and `find` itself is a stub. They come back when it does.
   * - **A menu that is not open.** `hideSlashMenu`.
   * - **History that has not moved forward.** `redo` and `historyRedo` need an undo first; the probe
   *   does one edit, not an edit and an undo.
   * - **A payload the probe does not know how to make.** `deleteCrossNode` wants a range across two
   *   nodes; `moveBlockUp`/`moveBlockDown`, `indentNode`/`outdentNode`, `insertParagraph` and
   *   `insertEmoji` each want a node or a value in a shape not yet written down.
   *
   * Every one of them is a **probe** gap rather than a product one, which is exactly what this
   * number is for: it says how much of the answer is still missing, out loud, instead of letting a
   * green run imply there was none.
   */
  /**
   * **And every one of them can be put back.**
   *
   * Two are not faults and never could be: undoing an `undo` is a *redo*, and the document is
   * supposed to end up where the undo left it. Everything else that moves the document has to be
   * able to give it back, and the run that first asked found one that could not:
   *
   * **`deleteNode` returned the node without its contents.** `delete`'s inverse carried the node
   * from `getNode`, whose `content` is a list of sids, and the next lines deleted every one of those
   * descendants — so undo put an **empty** paragraph back. Delete a paragraph, press ⌘Z, and the
   * words are gone for good.
   *
   * It survived because everything about it looks right: the delete works, the undo runs, the node
   * reappears, the paragraph count is correct, and no test had ever looked inside one. The same
   * fault was in `removeChild` and `removeChildren`, which were mended with it.
   *
   * The comparison is `meaning` and not `JSON.stringify`, for a reason that is its own small lesson:
   * undo a `toggleBold` and the run comes back carrying `marks: []` where it had no `marks` key —
   * the same document, a different string. Before that was allowed for, **45** commands looked like
   * commands that cannot be undone, which is a finding so large it can only be the probe.
   */
  it('gives the document back when it is undone', () => {
    expect(UNDONE.filter((one) => one !== 'undo' && one !== 'historyUndo')).toEqual([]);
  });

  it('can ask about most of them, and says how many it cannot', () => {
    const report = conformance({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      hasRenderer: () => true,
      only: ['every-command-does-something'],
      reachable: names,
      commandChanges: (command: string) => moved.get(command) ?? null
    });

    expect(report.examined['every-command-does-something']).toBeGreaterThanOrEqual(113);
    expect(report.unanswered['every-command-does-something']).toBeLessThanOrEqual(23);
  });
});

/**
 * Run one command over a fresh document and say whether the document moved.
 *
 * `null` when no state this probe can build lets the command say it can run — counted rather than
 * passed, which is what keeps a probe that stopped setting anything up visible.
 */
async function ask(name: string): Promise<boolean | null> {
  const { editor, store } = fresh();
  const words = every(editor, store, 'inline-text')[1] ?? every(editor, store, 'inline-text')[0];

  const said: Record<string, unknown> = { ...(SAYS[name] ?? {}) };
  const wants = WANTS_NODE[name];
  if (wants) {
    const found = every(editor, store, wants);
    for (const key of NODE_KEY[name] ?? []) if (found[0]) said[key] = found[0];
    // The one beside it, for the command that needs two.
    if (name === 'mergeCells' && found[1]) said.toCellId = found[1];
    /*
     * And a column to take out of it, which is the second of the two ids `removeColumn` needs. It
     * asked for neither until its guard was written, so the probe had never had to supply one.
     */
    if (name === 'removeColumn' && found[0]) {
      said.columnId = ((store.getNode(found[0])?.content ?? []) as string[]).find(
        (sid) => typeof sid === 'string'
      );
    }
  }

  const at = (sid: string, from: number, to: number) => () =>
    editor.selectionManager.setSelection({
      type: 'range', startNodeId: sid, startOffset: from, endNodeId: sid, endOffset: to, collapsed: from === to
    });

  /**
   * **Every run in the document**, as a range and as a caret.
   *
   * It was one run — the second, chosen because it is an ordinary paragraph — and that made a whole
   * class of command unaskable for a reason that had nothing to do with the command: `removeHeading`
   * needs the caret in a **heading**, `splitListItem` in a **list item**, `nextCell` in a **cell**,
   * and none of them was ever offered one. Eleven commands sat in the *could not be asked* column
   * because of where a single caret happened to be, which reads exactly like eleven commands nobody
   * had got round to.
   *
   * Walking them all is what a document is for. The loop stops at the first state a command says it
   * can run in, so the cost is a few `canExecute` calls for the commands that are picky and one for
   * everything else.
   */
  const runs = every(editor, store, 'inline-text');
  const states = [...runs.map((run) => at(run, 0, 3)), ...runs.map((run) => at(run, 1, 1))];
  void words;
  const span = ['deleteText', 'deleteCrossNode', 'replaceText'].includes(name);

  for (const set of states) {
    set();
    if (AFTER_AN_EDIT.has(name)) await editor.executeCommand('toggleBold', {});
    if (span) said.range = editor.selection;
    if (editor.canExecuteCommand(name, said) !== true) continue;

    const before = asWritten(editor);
    try {
      await editor.executeCommand(name, said);
    } catch {
      // A throw is an answer too, and the answer is *the document did not move*.
    }
    if (asWritten(editor) === before) return false;

    /*
     * And back. A command that moved the document is asked to give it back, in the same run, over
     * the same editor — which is the cheapest question in this file and the one that found the
     * worst fault in it.
     */
    await editor.executeCommand('undo', {});
    if (asWritten(editor) !== before) UNDONE.push(name);
    return true;
  }
  return null;
}
