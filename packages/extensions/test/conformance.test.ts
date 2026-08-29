// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { assertConforms, conformance } from '@barocss/conformance';
import { DataStore } from '@barocss/datastore';
import { createSchema, getStandardSchemaDefinition, validateTree } from '@barocss/schema';
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
  insertEmoji: { unicode: '🙂', shortcode: ':slightly_smiling_face:' },
  replaceText: { text: '바뀐 글자' },
  setContext: { key: 'probe', value: 1 },

  /*
   * A search, and what to put in its place. `find` is no longer a panel-opener — see
   * `find-replace.ts` — so the probe can hand it the query a panel would have collected, and the
   * four commands that need a search in progress become answerable.
   */
  find: { query: '문단' },
  findAndReplace: { query: '문단', replacement: '단락' },
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

/**
 * Commands that move the document and cannot be **put forward again** — the third leg of a history.
 *
 * Undo and redo are not one mechanism tested twice. Undo replays an *inverse*; redo replays the
 * *original*, against a document the undo has just rewritten — so a redo that fails is a command
 * whose operation is not repeatable against its own result, which is a different fault and one no
 * amount of undo testing reaches.
 */
const UNREDONE: string[] = [];

/**
 * Commands that leave a document the **schema will not accept**.
 *
 * Operations validate what they write, one node at a time; nothing had ever asked whether the tree
 * they leave behind is still a tree this schema describes. `validateTree` is the check written for
 * exactly that gap — see its own note, where a deck's sample table drew perfectly and every table
 * operation refused it, four levels away from the thing that was wrong.
 */
const BROKEN: string[] = [];

/**
 * The two that are not faults and could not be.
 *
 * Undoing an `undo` is a **redo**, and the document is supposed to end up where the undo left it —
 * not where it started. Both history questions below have to say so out loud, because the alternative
 * is a probe that reports the history as broken by the history working.
 */
const GHOST: string[] = [];
const NOT_SELF_INVERSE: string[] = [];

const HISTORY = new Set(['undo', 'historyUndo']);

const AFTER_AN_EDIT = new Set(['undo', 'redo', 'historyUndo', 'historyRedo']);

/**
 * And the ones that need an edit **and an undo** before they mean anything.
 *
 * Redo over a document nothing has undone is a command with nothing to do, which is not the same
 * sentence as a command that does nothing — the same distinction `AFTER_AN_EDIT` draws one step
 * earlier, and the probe has to be able to tell them apart or it turns a working history into two
 * findings.
 */
const AFTER_AN_UNDO = new Set(['redo', 'historyRedo']);

/**
 * And the four that need a **search in progress**.
 *
 * `findNext`, `findPrev`, `replaceOne` and `replaceAll` all read the result of a `find`, and the
 * probe runs each command over a fresh editor — so all four asked their question of a search nobody
 * had started, declined, correctly, and were counted as unaskable. Four commands reading like four
 * nobody had written, in a file that turned out to have been complete all along.
 */
const AFTER_A_SEARCH = new Set(['findNext', 'findPrev', 'replaceOne', 'replaceAll']);

/** And the one that needs a menu open, which the command beside it opens. */
const AFTER_A_MENU = new Set(['hideSlashMenu']);

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
                /*
                 * Already merged, because `splitTableCell` refuses a cell that is not — with the
                 * reason in the operation — so without one in the fixture `splitCell` correctly
                 * declines everywhere and is never exercised.
                 */
                { stype: 'bTableCell', attributes: { colspan: 2 }, content: [{ stype: 'inline-text', text: '다' }] }
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
const meaning = (node: unknown, keepSids = true): unknown => {
  if (Array.isArray(node)) return node.map((one) => meaning(one, keepSids));
  if (!node || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'metadata') continue;
    if (!keepSids && (key === 'sid' || key === 'parentId')) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!Array.isArray(value) && typeof value === 'object' && Object.keys(value as object).length === 0) continue;
    out[key] = meaning(value, keepSids);
  }
  return out;
};

const asWritten = (editor: { exportDocument: (sid: string) => unknown; getRootId: () => string }) =>
  JSON.stringify(meaning(editor.exportDocument(editor.getRootId()) ?? ''));

/**
 * The same, **without the identity of the nodes** — which is what a *redo* has to be compared by.
 *
 * The two history questions are not one mechanism asked twice, and the difference is exactly here.
 *
 * **Undo** is *put it back*, and back means the same nodes: a selection, a comment anchor or a link
 * points at a sid, and an undo that returned an equivalent document made of new nodes would break
 * every one of them. So undo is compared strictly, and that strictness is what caught a `deleteNode`
 * returning an empty paragraph.
 *
 * **Redo** is *do it again*, and doing it again makes new nodes exactly as doing it the first time
 * did. Compared strictly, **15** commands looked broken — every insert and every block toggle —
 * and every one of them had reproduced the document perfectly with fresh sids.
 */
const asMeant = (editor: { exportDocument: (sid: string) => unknown; getRootId: () => string }) =>
  JSON.stringify(meaning(editor.exportDocument(editor.getRootId()) ?? '', false));

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
     * Both, now. `hideSlashMenu` used to be exempt too and the harness **deleted** the exemption as
     * stale — it never said it could run over a document with no menu open, so it was unanswered
     * rather than a finding, and an exemption for a finding that does not happen is a note. The
     * probe opens a menu before asking it now, so the claim is real again.
     */
    showSlashMenu: 'opens a menu',
    hideSlashMenu: 'closes it — and it is asked now, because the probe opens one first',
    /*
     * Tab and ⇧Tab between cells. What they are **for** is moving the caret, and only one case in a
     * table changes the document: Tab past the last cell grows a row, which every word processor and
     * spreadsheet does. The probe reaches the first cell it finds, so it measures the ordinary case
     * — and the ordinary case is a selection move.
     */
    nextCell: 'moves the caret to the next cell; only Tab past the last one grows the table',
    previousCell: 'moves the caret to the previous cell, and never grows anything',

    /**
     * And the four a search is made of, which change **where the reader is** and not the document.
     *
     * These two used to be exempted as *"registered as `execute: () => true` — a stub"*, which is
     * what Word's key map says, what the site deleted its 찾기 entry over, and what
     * `every-command-does-something` opens by naming as the fault it was written for. **None of it
     * was true.** `editor-core` registers no `find`; `FindReplaceExtension` has been a complete
     * implementation since the day it was written; and nothing installed it, which from a keyboard
     * is indistinguishable from reaching a stub. See `find-replace.ts`.
     */
    find: 'runs a search and moves the selection onto the first result; the document is untouched',
    findAndReplace: 'the same search, remembering what to put in their place',
    findNext: 'moves the selection onto the next result — a match a reader can act on, not a drawing',
    findPrev: 'the same, backwards'
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
   * It was **28**. Walking every run in the document rather than one took it to **23**; ten guards
   * that demanded `payload.selection` while their `execute` read the editor's took it to **14**.
   *
   * That second batch is the lesson. `setHeading`, `setHeading1`–`6`, `setParagraph` and
   * `insertParagraph` all answered *no* to any caller that asked "can this run right now" without
   * threading a selection — which is what a toolbar does on every render. `Editor.canRun` fills it
   * in and hides the asymmetry; `canExecuteCommand` does not, and both are used. Ten commands sat in
   * the unaskable column reading exactly like ten nobody had got round to.
   *
   * Then six more went by setting up two states the probe had not: an edit **and an undo** for
   * `redo`, and a **search in progress** for the four commands that read one. Both were the same
   * shape as the ten above — a command declining honestly from a state nobody had built, which reads
   * exactly like a command nobody had written. `find` was the extreme case: it had been called a
   * stub in three places for months, and it was complete.
   *
   * The last six went one at a time, and every one of them was a fault rather than a blank: a menu
   * to open first, an emoji command whose run needed a selection its guard never asked for, a move
   * command that said yes on the first block of a page, a merged cell to split, and a **range across
   * two nodes** — which found the worst thing in this repository, in `deleteRange`.
   *
   * **2** left, and they are not a probe gap:
   *
   * - **`indentNode` and `outdentNode` cannot run at all.** They act only on a node type the schema
   *   marks `indentable`, and **no schema in this repository marks one** — not the standard one, not
   *   the office one. Word found this and worked around it (`word-keymap.ts` binds `indentText`
   *   instead, with the reason written down); the commands are still here, still reachable, and
   *   still impossible. A claim rather than a blank: the day something declares `indentable`, this
   *   number drops and the ceiling below fails.
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
    expect(UNDONE.filter((one) => !HISTORY.has(one))).toEqual([]);
  });

  /**
   * **And does it again when it is redone**, which is not the same claim.
   *
   * Undo replays an *inverse*; redo replays the *original*, against a document the undo has just
   * rewritten. A command whose operation is not repeatable against its own result fails here and
   * nowhere else, however many times undo is tested.
   *
   * Compared by `asMeant` rather than `asWritten` — see the note there. Doing something again makes
   * new nodes, exactly as doing it the first time did; only *undo* owes the reader the same ones.
   */
  it('does it again when it is redone', () => {
    expect(UNREDONE.filter((one) => !HISTORY.has(one))).toEqual([]);
  });

  /**
   * **And leaves a document the schema still accepts.**
   *
   * Operations validate what they *write* — one node, as it goes in — and nothing had ever asked
   * whether the tree they add up to is still a tree this schema describes. That is the gap
   * `validateTree` was written for, and its own note is the reason to keep asking: a deck's sample
   * table had its rows directly under `bTable`, it **drew perfectly**, and every table operation
   * refused it — surfacing four levels away as `mergeTableCells: cell not found in table`.
   *
   * Nothing here breaks it today. The value is the day something does, at the command that did it,
   * rather than four levels away in a product.
   */
  /**
   * **And the selection still names nodes that are there.**
   *
   * A command that takes away what the caret was in has to leave the caret somewhere. A selection
   * pointing at a deleted sid is the state the site builder records already having had once — *"a
   * selection naming a node that is gone is a panel describing something nobody can see"* — and it
   * is invisible until something reads it, which is usually a panel or a keystroke rather than a
   * test.
   *
   * Nothing here does it today. The value is the day something does, named by the command.
   */
  it('leaves the selection pointing at nodes that exist', () => {
    expect([...new Set(GHOST)]).toEqual([]);
  });

  /**
   * **And a toggle is its own inverse** — doing it twice is doing nothing.
   *
   * The mark toggles all were. The three **block** ones were not, and they are exactly the three
   * that change the shape of the document rather than the look of a run: `toggleBulletList`,
   * `toggleOrderedList` and `toggleBlockquote` each called a `wrapIn…` operation **and nothing
   * else**. A paragraph became a bullet the first time and stayed one for ever; pressing the control
   * again ran the command, wrapped nothing and reported success.
   *
   * Which means there was no way to turn a list or a quotation back into paragraphs in any of the
   * three products. The only route out was undo, and only if it was the last thing you did.
   */
  it('undoes itself when a toggle is pressed twice', () => {
    expect(NOT_SELF_INVERSE).toEqual([]);
  });

  it('leaves a document the schema still accepts', () => {
    expect(BROKEN).toEqual([]);
  });

  /**
   * And the line above **can fail** — which a check reporting an empty list has to prove.
   *
   * An empty result is the same shape whether nothing is wrong or nothing is being asked, and this
   * repository has been caught by that difference more than once. `bTableRow` under a `document` is
   * a tree no schema here describes; if `validateTree` says nothing about it, the assertion above is
   * decoration.
   */
  it('would say so if a command left an invalid tree', () => {
    const schema = createSchema('standard', getStandardSchemaDefinition());
    const wrong = {
      stype: 'document',
      attributes: {},
      content: [{ stype: 'bTableRow', attributes: {}, content: [] }]
    };
    expect(validateTree(schema as never, wrong).length).toBeGreaterThan(0);
  });

  it('can ask about most of them, and says how many it cannot', () => {
    const report = conformance({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      hasRenderer: () => true,
      only: ['every-command-does-something'],
      reachable: names,
      commandChanges: (command: string) => moved.get(command) ?? null
    });

    expect(report.examined['every-command-does-something']).toBeGreaterThanOrEqual(134);
    expect(report.unanswered['every-command-does-something']).toBeLessThanOrEqual(2);
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
    /*
     * And the **merged** one, for the command that needs one. `splitTableCell` refuses a cell whose
     * colspan and rowspan are both 1 — there is nothing to split — so handing it the first cell in
     * the table is handing it the one case it declines.
     */
    if (name === 'splitCell') {
      const merged = found.find((sid) => {
        const attrs = (store.getNode(sid)?.attributes ?? {}) as { colspan?: number; rowspan?: number };
        return (attrs.colspan ?? 1) > 1 || (attrs.rowspan ?? 1) > 1;
      });
      if (merged) said.cellId = merged;
    }
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
  const span = ['deleteText', 'replaceText'].includes(name);
  /*
   * And one that wants a range across **two** nodes, which is the whole of what it is for — a range
   * inside one run is `deleteText`'s, and the command refuses it by name.
   */
  const across = name === 'deleteCrossNode';

  for (const set of states) {
    set();
    if (AFTER_AN_EDIT.has(name)) await editor.executeCommand('toggleBold', {});
    if (AFTER_AN_UNDO.has(name)) await editor.executeCommand('undo', {});
    if (AFTER_A_SEARCH.has(name)) await editor.executeCommand('find', { query: '문단', replacement: '단락' });
    if (AFTER_A_MENU.has(name)) await editor.executeCommand('showSlashMenu', {});
    if (span) said.range = editor.selection;
    if (across && runs.length > 1) {
      said.range = {
        type: 'range', startNodeId: runs[0], startOffset: 1, endNodeId: runs[1], endOffset: 2, collapsed: false
      };
    }
    if (editor.canExecuteCommand(name, said) !== true) continue;

    const before = asWritten(editor);
    try {
      await editor.executeCommand(name, said);
    } catch {
      // A throw is an answer too, and the answer is *the document did not move*.
    }
    const after = asWritten(editor);
    if (after === before) return false;
    const afterMeant = asMeant(editor);

    /*
     * Still a document this schema describes. Asked of the tree rather than of the node an operation
     * wrote, because an operation validates its own write and nothing validates the shape they add
     * up to — which is the gap `validateTree` exists for.
     */
    const schema = editor.dataStore?.getActiveSchema?.();
    const tree = editor.exportDocument(editor.getRootId());
    if (schema && tree && validateTree(schema as never, tree).length > 0) BROKEN.push(name);

    /*
     * And back. A command that moved the document is asked to give it back, in the same run, over
     * the same editor — which is the cheapest question in this file and the one that found the
     * worst fault in it.
     */
    await editor.executeCommand('undo', {});
    if (asWritten(editor) !== before) UNDONE.push(name);

    /*
     * And forward again. Redo replays the original operation against a document the undo has just
     * rewritten, which is a different claim from undo's and is not reached by testing undo twice.
     */
    await editor.executeCommand('redo', {});
    if (asMeant(editor) !== afterMeant) UNREDONE.push(name);

    /*
     * And the selection still names nodes that exist. A command that removes what the caret was in
     * has to leave the caret somewhere, and a selection pointing at a deleted sid is a panel
     * describing something nobody can see — the fault the site's `removeBlocks` records having had.
     */
    const sel: any = editor.selection;
    for (const key of ['startNodeId', 'endNodeId']) {
      const sid = sel?.[key];
      if (typeof sid === 'string' && !store.getNode(sid)) GHOST.push(`${name}(${key})`);
    }
    for (const sid of (sel?.nodeIds ?? []) as string[]) {
      if (!store.getNode(sid)) GHOST.push(`${name}(nodeIds)`);
    }

    /*
     * And a toggle is its own inverse: doing it twice is doing nothing. Over a **fresh** editor
     * rather than this one, because by here the document has been undone and redone and the point is
     * the pair of presses on their own.
     */
    if (name.startsWith('toggle')) {
      const { editor: twice, store: s2 } = fresh();
      const runs2 = every(twice, s2, 'inline-text');
      const set2 = () => twice.selectionManager.setSelection({
        type: 'range', startNodeId: runs2[1], startOffset: 0, endNodeId: runs2[1], endOffset: 3, collapsed: false
      });
      set2();
      if (twice.canExecuteCommand(name, said) === true) {
        const start = asWritten(twice);
        await twice.executeCommand(name, said);
        set2();
        await twice.executeCommand(name, said);
        if (asWritten(twice) !== start) NOT_SELF_INVERSE.push(name);
      }
    }
    return true;
  }
  return null;
}
