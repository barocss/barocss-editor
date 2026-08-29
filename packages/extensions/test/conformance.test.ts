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
       * **Three left**, and they are a work list rather than a claim.
       *
       * A ratchet says how much of a known pile is still there; it cannot go stale, because the day
       * one is fixed the number is wrong in the direction that fails — and it says so out loud:
       * *"3 finding(s), and 5 were allowed. Lower the ratchet to 3."*
       *
       * It opened at **nine**, on the first run, and six went the same afternoon:
       *
       * - **Four** to one change. `DocStructure` gave every node it makes a **paragraph** as its
       *   empty content, and `docHeader`, `docFooter` and `endnoteDef` hold `inline*` — so the schema
       *   refused the child and three inserts drew nothing, while the three beside them in the same
       *   table and through the same code worked perfectly. `chart` was the fourth and a different
       *   shape of the same thing: it *requires* a `values` attribute and the command never checked,
       *   so it built a node the schema would not take.
       * - **`removeHeading`**, whose guard was `return true` under a comment reading *"conservative
       *   default"*. 제목 해제 lit up with the caret in an ordinary paragraph.
       * - **`splitListItem`**, whose guard asked for a range and not for a **list item**. There is
       *   nothing to split outside one, and the operation knows that and quietly produces nothing.
       *
       * What is left: `removeColumn`, `splitCell` — a column and a cell that will not go — and
       * `setFigcaption`, which declines with a figure handed to it. Each says it can run first,
       * which is the fault this check is named after. They are here rather than exempt because none
       * of them has a *reason*; they have a cause, which is not the same thing and is what a number
       * is for.
       */
      ratchet: { 'every-command-does-something': 3 }
    });
  });

  /**
   * And **how much of the product this could ask about at all**, which is the half a pass hides.
   *
   * `unanswered` is the probe saying it could not get the editor into a state where the command says
   * it can run. That is honest and it is not coverage, so it is asserted as a ceiling: a probe that
   * quietly stopped setting things up would drive this number *up* and fail, rather than reporting
   * a smaller, greener product.
   */
  it('can ask about most of them, and says how many it cannot', () => {
    const report = conformance({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      hasRenderer: () => true,
      only: ['every-command-does-something'],
      reachable: names,
      commandChanges: (command: string) => moved.get(command) ?? null
    });

    expect(report.examined['every-command-does-something']).toBeGreaterThanOrEqual(108);
    expect(report.unanswered['every-command-does-something']).toBeLessThanOrEqual(28);
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
  }

  const at = (sid: string, from: number, to: number) => () =>
    editor.selectionManager.setSelection({
      type: 'range', startNodeId: sid, startOffset: from, endNodeId: sid, endOffset: to, collapsed: from === to
    });

  /*
   * The states a text editor's surfaces act from. A range first, because almost everything here is
   * about words; a caret second, because a list toggle and a block insert both work from one and
   * demanding a selection would be the opposite fault.
   */
  const states = [at(words, 0, 3), at(words, 1, 1)];
  const span = ['deleteText', 'deleteCrossNode', 'replaceText'].includes(name);

  for (const set of states) {
    set();
    if (AFTER_AN_EDIT.has(name)) await editor.executeCommand('toggleBold', {});
    if (span) said.range = editor.selection;
    if (editor.canExecuteCommand(name, said) !== true) continue;

    const before = JSON.stringify(editor.exportDocument(editor.getRootId()) ?? '');
    try {
      await editor.executeCommand(name, said);
    } catch {
      // A throw is an answer too, and the answer is *the document did not move*.
    }
    if (JSON.stringify(editor.exportDocument(editor.getRootId()) ?? '') !== before) return true;
    return false;
  }
  return null;
}
