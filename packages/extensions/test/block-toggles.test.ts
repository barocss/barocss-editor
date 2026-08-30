// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import {
  createCoreExtensions,
  createBasicExtensions,
  /*
   * Named, though `createBasicExtensions()` is what builds them: a test says which extension it is
   * about, and the sweep that asks *"is every extension named in a test of its own"* reads the
   * names. Building them out of a kit is how three of these had no test that mentioned them while
   * their commands were being exercised.
   */
  type BlockquoteExtension,
  type ListExtension
} from '../src';

/**
 * **The three block toggles, and the way out of each.**
 *
 * ## What they were
 *
 * `wrapInBlockquote` and `wrapInList`, and nothing else. A paragraph became a quotation the first
 * time and stayed one for ever: pressing 인용 again ran the command, wrapped nothing, reported
 * success and changed nothing. So **there was no way to turn a quotation or a list back into
 * paragraphs** in any of the three products — the only route out was undo, and only if it was the
 * last thing you did.
 *
 * Found by asking whether a toggle is its own inverse. Every mark toggle in this package is; the
 * three block ones were not, and they are the three that change the *shape* of the document rather
 * than the look of a run.
 *
 * ## Why they had no test of their own until now
 *
 * The conformance probe asks the question that found the fault — press it twice, is the document
 * where it started — and it asks it of every command, which is what made the fault visible at all.
 * What a probe cannot say is what a reader *sees*: that the paragraphs come back as paragraphs, in
 * their order, with their text, and that a list of three items comes back as three paragraphs and
 * not one. That is what these are for.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '첫째 줄' }] },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '둘째 줄' }] }
  ]
});

describe('a toggle that changes the shape of the document', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [...createCoreExtensions(), ...createBasicExtensions()]
    } as never);
    editor.loadDocument(document_() as never, 'standard');
  });

  /** The document as a shape and its words: `{ blockQuote: [{ paragraph: '첫째 줄' }] }`. */
  const shapeOf = (sid: string = editor.getRootId()): unknown => {
    const node = editor.dataStore?.getNode(sid) as
      | { stype?: string; text?: string; content?: unknown[] }
      | undefined;
    if (!node) return null;
    if (typeof node.text === 'string') return node.text;

    const children = (node.content ?? []).filter((one): one is string => typeof one === 'string');
    if (children.length === 0) return node.stype;
    const drawn = children.map((one) => shapeOf(one));
    return { [String(node.stype)]: drawn.length === 1 ? drawn[0] : drawn };
  };

  const caretIn = (which: number) => {
    const runs: string[] = [];
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as { stype?: string; content?: unknown[] } | undefined;
      if (!node) return;
      if (node.stype === 'inline-text') runs.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    editor.selectionManager?.setSelection({
      type: 'range',
      startNodeId: runs[which],
      startOffset: 1,
      endNodeId: runs[which],
      endOffset: 1,
      collapsed: true
    } as never);
  };

  for (const [label, command, wrapper] of [
    ['a quotation', 'toggleBlockquote', 'blockQuote'],
    ['a bullet list', 'toggleBulletList', 'list'],
    ['a numbered list', 'toggleOrderedList', 'list']
  ] as const) {
    describe(label, () => {
      it('is made, and unmade, by the same press', async () => {
        const before = shapeOf();

        caretIn(0);
        expect(await editor.executeCommand(command, {})).toBe(true);
        expect(JSON.stringify(shapeOf())).toContain(wrapper);

        /*
         * And back. Pressing it again is the whole of what "toggle" means, and it is the half all
         * three were missing: the way out was `wrapIn…` called a second time, which wrapped nothing
         * and reported success.
         */
        caretIn(0);
        expect(await editor.executeCommand(command, {})).toBe(true);
        expect(shapeOf()).toEqual(before);
      });

      /*
       * The words come back **as they were and where they were**, which is the part a probe cannot
       * say: it compares the document to itself and would be satisfied by two paragraphs in the
       * wrong order carrying the right text.
       */
      it('gives the paragraphs back in their order, with their words', async () => {
        caretIn(0);
        await editor.executeCommand(command, {});
        caretIn(0);
        await editor.executeCommand(command, {});

        expect(shapeOf()).toEqual({
          document: [{ paragraph: '첫째 줄' }, { paragraph: '둘째 줄' }]
        });
      });
    });
  }

  /**
   * And **a list of three comes back as three paragraphs**, not as one.
   *
   * The lift moves each item's blocks up to where the list sits, from the last backwards at one
   * index, so they arrive in the order they were in — inserting forwards at a fixed place reverses
   * them, which is the same arithmetic a paste does and the same reason.
   */
  it('unmakes a list of several items into several paragraphs', async () => {
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'list',
            attributes: { type: 'bullet' },
            content: ['하나', '둘', '셋'].map((text) => ({
              stype: 'listItem',
              attributes: {},
              content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text }] }]
            }))
          }
        ]
      } as never,
      'standard'
    );

    caretIn(0);
    expect(await editor.executeCommand('toggleBulletList', {})).toBe(true);

    expect(shapeOf()).toEqual({
      document: [{ paragraph: '하나' }, { paragraph: '둘' }, { paragraph: '셋' }]
    });
  });

  /*
   * A caret in a **numbered** list given 글머리 목록 means *make this a bullet list*, not *take it out
   * of the list it is in* — which is what every editor of this kind does, and the one case a plain
   * "am I in a list" boolean would get wrong.
   */
  it('changes one kind of list into the other rather than unmaking it', async () => {
    caretIn(0);
    await editor.executeCommand('toggleOrderedList', {});

    caretIn(0);
    expect(await editor.executeCommand('toggleBulletList', {})).toBe(true);

    const drawn = JSON.stringify(shapeOf());
    expect(drawn).toContain('list');
    const list = editor.dataStore?.getNode(
      (editor.dataStore?.getNode(editor.getRootId()) as { content: string[] }).content[0]
    ) as { attributes?: { type?: string } } | undefined;
    expect(list?.attributes?.type).toBe('bullet');
  });

  /**
   * **Enter, inside a list.**
   *
   * The third of this extension's commands, and the one the two toggles above are not: splitting is
   * the opposite question to wrapping. There is nothing to split unless the caret is already inside
   * a `listItem`, and `splitListItemOp` knows that and quietly produces nothing — so with the caret
   * in an ordinary paragraph the command said yes, ran, committed and changed not one thing, until
   * the guard learned to ask both halves.
   *
   * What a probe cannot say is what the reader gets: a *new item*, after the one they were in, with
   * the caret in it — rather than a second paragraph inside the same item, which is what a split of
   * the block rather than of the item would produce.
   */
  describe('Enter inside a list', () => {
    beforeEach(async () => {
      caretIn(0);
      await editor.executeCommand('toggleBulletList', {});
    });

    it('makes another item, beside the one the caret was in', async () => {
      caretIn(0);
      expect(await editor.executeCommand('splitListItem', {})).toBe(true);

      const drawn = JSON.stringify(shapeOf());
      // Two items in the list, not two paragraphs in one item.
      expect(drawn.match(/listItem/g) ?? []).toHaveLength(2);
    });

    /*
     * And it is offered **only** inside one. A caret in an ordinary paragraph has nothing to split,
     * and the operation says so by producing nothing — which reads as a command that worked.
     */
    it('is offered inside an item and nowhere else', async () => {
      caretIn(0);
      expect(editor.canExecuteCommand('splitListItem', {})).toBe(true);

      // The second paragraph was never wrapped, so the caret in it is in no item.
      caretIn(1);
      expect(editor.canExecuteCommand('splitListItem', {})).toBe(false);
    });
  });
});
