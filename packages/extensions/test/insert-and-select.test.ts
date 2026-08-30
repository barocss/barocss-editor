// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import {
  createCoreExtensions,
  createBasicExtensions,
  ImageExtension,
  /*
   * Named, though `createCoreExtensions()` builds them: a test says which extension it is about, and
   * the sweep that asks *"is every extension named in a test of its own"* reads the names.
   */
  type SelectAllExtension,
  type TextExtension
} from '../src';

/**
 * **Putting a picture in, writing characters, and taking everything.**
 *
 * Three of the extensions that had no test of their own — `image`, `text` and `select-all`. The
 * conformance probe asks whether each moves the document; what it cannot say is *where the picture
 * lands*, *what the run holds afterwards*, and *what "everything" is in a document of two blocks.*
 *
 * `replaceText` is the one worth the most care: it is the door **every character a reader types**
 * comes through — `EditorViewDOM.insertText` is a `replaceText` over a collapsed range — so a fault
 * here is a fault in typing, and the probe reaches it with one payload out of the many the view
 * sends.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '첫째 문단' }] },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '둘째 문단' }] }
  ]
});

describe('a picture, a character and a selection', () => {
  let editor: Editor;
  let runs: string[];

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [...createCoreExtensions(), ...createBasicExtensions(), new ImageExtension()]
    } as never);
    editor.loadDocument(document_() as never, 'standard');

    runs = [];
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as { stype?: string; content?: unknown[] } | undefined;
      if (!node) return;
      if (node.stype === 'inline-text') runs.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
  });

  const at = (run: number, from: number, to = from) => ({
    type: 'range' as const,
    startNodeId: runs[run],
    startOffset: from,
    endNodeId: runs[run],
    endOffset: to,
    collapsed: from === to
  });

  const select = (run: number, from: number, to = from) =>
    editor.selectionManager?.setSelection(at(run, from, to) as never);

  const textOf = (run: number) =>
    (editor.dataStore?.getNode(runs[run]) as { text?: string } | undefined)?.text;

  const kinds = () => {
    const found: string[] = [];
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as { stype?: string; content?: unknown[] } | undefined;
      if (!node) return;
      found.push(String(node.stype));
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    return found;
  };

  describe('a picture', () => {
    it('goes in where the caret is', async () => {
      select(0, 2);
      expect(await editor.executeCommand('insertImage', { src: 'cat.png', alt: '고양이' })).toBe(true);

      expect(kinds()).toContain('inline-image');
    });

    /*
     * An address **and somewhere to put it**. The run inserts at the selection and refuses without
     * one; the guard asked only about the address, so with a box held the control lit up and the run
     * declined — the identical pair `toggleLink` had.
     */
    it('is not offered without an address, or with nowhere to go', () => {
      select(0, 2);
      expect(editor.canExecuteCommand('insertImage', {})).toBe(false);
      expect(editor.canExecuteCommand('insertImage', { src: 'cat.png' })).toBe(true);

      editor.selectionManager?.setSelection({ type: 'node', nodeIds: [runs[0]] } as never);
      expect(editor.canExecuteCommand('insertImage', { src: 'cat.png' })).toBe(false);
    });

    it('carries the words a reader wrote for it', async () => {
      select(0, 2);
      await editor.executeCommand('insertImage', { src: 'cat.png', alt: '고양이 사진' });

      const drawn = editor.exportDocument(editor.getRootId()) as never as {
        content: Array<{ content?: Array<{ stype: string; attributes?: { alt?: string; src?: string } }> }>;
      };
      const picture = drawn.content
        .flatMap((block) => block.content ?? [])
        .find((one) => one.stype === 'inline-image');

      expect(picture?.attributes?.src).toBe('cat.png');
      expect(picture?.attributes?.alt).toBe('고양이 사진');
    });
  });

  /**
   * **The door every typed character comes through.**
   *
   * `EditorViewDOM.insertText` is a `replaceText` over a collapsed range, so what this does with an
   * empty range is what typing does. The three shapes below are the three the view sends: a caret, a
   * selection replaced, and a selection emptied.
   */
  describe('writing characters', () => {
    it('writes at a caret without touching what is beside it', async () => {
      expect(await editor.executeCommand('replaceText', { range: at(0, 2), text: '가' })).toBe(true);

      expect(textOf(0)).toBe('첫째가 문단');
      expect(textOf(1)).toBe('둘째 문단');
    });

    it('puts what was typed in place of what was selected', async () => {
      expect(await editor.executeCommand('replaceText', { range: at(0, 0, 2), text: '셋째' })).toBe(true);

      expect(textOf(0)).toBe('셋째 문단');
    });

    /* An empty replacement is a deletion, which is what Backspace over a selection sends. */
    it('takes the words away when what is typed is nothing', async () => {
      expect(await editor.executeCommand('replaceText', { range: at(0, 0, 3), text: '' })).toBe(true);

      expect(textOf(0)).toBe('문단');
    });

    it('gives the words back when it is undone', async () => {
      await editor.executeCommand('replaceText', { range: at(0, 0, 2), text: '셋째' });
      await editor.executeCommand('undo', {});

      expect(textOf(0)).toBe('첫째 문단');
    });

    /*
     * Both halves, because the command reads both: a range with no text and text with no range are
     * two different callers getting it wrong, and `insertText` above declined *every time* for a year
     * because it asked with neither.
     */
    it('is not offered without a range or without text', () => {
      expect(editor.canExecuteCommand('replaceText', {})).toBe(false);
      expect(editor.canExecuteCommand('replaceText', { range: at(0, 2) })).toBe(false);
      expect(editor.canExecuteCommand('replaceText', { text: '가' })).toBe(false);
      expect(editor.canExecuteCommand('replaceText', { range: at(0, 2), text: '가' })).toBe(true);
    });
  });

  describe('taking everything', () => {
    it('reaches from the first character to the last, across the blocks', async () => {
      select(0, 1);
      expect(await editor.executeCommand('selectAll', {})).toBe(true);

      const all = editor.selection as never as {
        startNodeId: string;
        startOffset: number;
        endNodeId: string;
        endOffset: number;
      };
      expect(all.startNodeId).toBe(runs[0]);
      expect(all.startOffset).toBe(0);
      expect(all.endNodeId).toBe(runs[runs.length - 1]);
      expect(all.endOffset).toBe(String(textOf(runs.length - 1)).length);
    });

    /**
     * And an **empty** document has nothing to take.
     *
     * `() => true` was the last guard of its kind in this package, and it is honest for almost every
     * state — selecting everything works from a caret, from a held box and from nothing held. It is
     * not honest here, where the run selects nothing and reports success.
     */
    it('is not offered over a document with nothing in it', () => {
      editor.loadDocument({ stype: 'document', attributes: {}, content: [] } as never, 'standard');

      expect(editor.canExecuteCommand('selectAll', {})).toBe(false);
    });
  });
});
