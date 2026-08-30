// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, createBasicExtensions, FindReplaceExtension } from '../src';

/**
 * **Finding, and putting something else there.**
 *
 * This extension was called a stub in three places in this repository — Word's key map explaining
 * why ⌘F was removed, the conformance run opening with it as the fault it was written for, and
 * BACKLOG as an open item. It was never a stub. It was a complete implementation that **nothing
 * installed**, which from a keyboard is indistinguishable from reaching one.
 *
 * It is in a kit now, and this is its first test of its own. The conformance probe asks whether each
 * of its seven commands moves the document; what a probe cannot say is what a *reader* gets — which
 * match they are on, that stepping past the last one comes back to the first, and that replacing a
 * word of a different length leaves the next match findable.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '고양이와 개와 고양이' }] },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '고양이는 셋' }] }
  ]
});

describe('finding what a reader asked for', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [...createCoreExtensions(), ...createBasicExtensions(), new FindReplaceExtension()]
    } as never);
    editor.loadDocument(document_() as never, 'standard');
  });

  /* Through `getExtension`, which the editor declares — the state is the extension's, and a product
   * drawing a find panel reaches it exactly this way. */
  const state = () => editor.getExtension<FindReplaceExtension>('findReplace')!.state;

  const wordsOf = () => {
    const found: string[] = [];
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as
        | { stype?: string; text?: string; content?: unknown[] }
        | undefined;
      if (!node) return;
      if (typeof node.text === 'string') found.push(node.text);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    return found;
  };

  it('finds every occurrence, across the blocks it is in', async () => {
    expect(await editor.executeCommand('find', { query: '고양이' })).toBe(true);

    expect(state().matches).toHaveLength(3);
    // And it goes to the first, which is what a reader pressing 찾기 is asking for.
    expect(state().currentIndex).toBe(0);
  });

  /*
   * `find` with no query at all is what a control asks before anything is typed — the guard allows
   * one and the run declines, which is the difference between "not yet" and "nothing found".
   */
  it('is asked before anything is typed, and declines', async () => {
    expect(editor.canExecuteCommand('find', {})).toBe(true);
    expect(await editor.executeCommand('find', {})).toBe(false);

    expect(editor.canExecuteCommand('find', { query: '' })).toBe(false);
  });

  it('says nothing was found rather than pretending', async () => {
    expect(await editor.executeCommand('find', { query: '없는말' })).toBe(false);

    expect(state().matches).toEqual([]);
    expect(state().currentIndex).toBe(-1);
    // And nothing to step through or replace, which the surface reads to grey its buttons.
    expect(editor.canExecuteCommand('findNext', {})).toBe(false);
    expect(editor.canExecuteCommand('replaceAll', {})).toBe(false);
  });

  /* Round, because a reader at the last match pressing 다음 means the first. */
  it('steps forward and back, and comes round', async () => {
    await editor.executeCommand('find', { query: '고양이' });

    await editor.executeCommand('findNext', {});
    expect(state().currentIndex).toBe(1);
    await editor.executeCommand('findNext', {});
    expect(state().currentIndex).toBe(2);
    await editor.executeCommand('findNext', {});
    expect(state().currentIndex).toBe(0);

    await editor.executeCommand('findPrev', {});
    expect(state().currentIndex).toBe(2);
  });

  describe('putting something else there', () => {
    /**
     * **The one the reader is on**, and then search again.
     *
     * Searching again rather than adjusting the offsets by hand: a replacement of a different length
     * moves every match after it in the same run, and the arithmetic for that *is* the search. The
     * word here is deliberately longer than what it replaces, so a version that adjusted by hand
     * would leave the next match one character out.
     */
    it('replaces the one the reader is on, and finds the rest again', async () => {
      await editor.executeCommand('findAndReplace', { query: '고양이', replacement: '작은고양이' });

      expect(await editor.executeCommand('replaceOne', {})).toBe(true);
      expect(wordsOf()[0]).toBe('작은고양이와 개와 고양이');

      // Two left, and both still findable at their new places.
      expect(state().matches).toHaveLength(3);
      expect(await editor.executeCommand('replaceOne', {})).toBe(true);
    });

    it('replaces every one at once', async () => {
      await editor.executeCommand('findAndReplace', { query: '고양이', replacement: '개' });

      expect(await editor.executeCommand('replaceAll', {})).toBe(true);
      expect(wordsOf()).toEqual(['개와 개와 개', '개는 셋']);
    });

    /**
     * And **one undo takes the lot back**, which is what a reader pressing 모두 바꾸기 and then ⌘Z
     * means: they asked for one thing, so it comes back as one.
     */
    it('gives the whole document back on one undo', async () => {
      await editor.executeCommand('findAndReplace', { query: '고양이', replacement: '개' });
      await editor.executeCommand('replaceAll', {});

      await editor.executeCommand('undo', {});
      expect(wordsOf()).toEqual(['고양이와 개와 고양이', '고양이는 셋']);
    });

    /*
     * Nothing to replace until something has been found — the state is the search's, so a surface
     * that draws 바꾸기 before 찾기 has run gets a grey button rather than a silent no-op.
     */
    it('offers nothing to replace before anything is found', () => {
      expect(editor.canExecuteCommand('replaceOne', {})).toBe(false);
      expect(editor.canExecuteCommand('replaceAll', {})).toBe(false);
    });
  });
});
