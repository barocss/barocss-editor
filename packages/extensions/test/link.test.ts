// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, createBasicExtensions, LinkExtension } from '../src';

/**
 * **A link, and the way off one.**
 *
 * Two commands and one gesture, and they had no test of their own — the conformance probe asked
 * whether each moves the document and got yes, which is true of both and says nothing about what a
 * reader ends up with.
 *
 * What a probe cannot say is here: that the address lands on the *words* and not on the caret, that
 * pressing it twice with a new address changes the link rather than nesting one inside another, and
 * that 링크 제거 is offered where there is a link and nowhere else — which is the guard the file's
 * own comment left for *"the day a reader complains that it is offered on unlinked words"*, and the
 * day arrived as a measurement.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    {
      stype: 'paragraph',
      attributes: {},
      content: [{ stype: 'inline-text', text: '바로씨에스 편집기' }]
    }
  ]
});

describe('a link', () => {
  let editor: Editor;
  let run: string;

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [...createCoreExtensions(), ...createBasicExtensions(), new LinkExtension()]
    } as never);
    editor.loadDocument(document_() as never, 'standard');

    run = '';
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as { stype?: string; content?: unknown[] } | undefined;
      if (!node) return;
      if (node.stype === 'inline-text' && !run) run = sid;
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
  });

  const select = (from: number, to: number) =>
    editor.selectionManager?.setSelection({
      type: 'range',
      startNodeId: run,
      startOffset: from,
      endNodeId: run,
      endOffset: to,
      collapsed: from === to
    } as never);

  const linksOn = () =>
    ((editor.dataStore?.getNode(run) as { marks?: Array<{ stype: string; attrs?: { href?: string }; range?: [number, number] }> } | undefined)
      ?.marks ?? [])
      .filter((mark) => mark.stype === 'link')
      .map((mark) => ({ href: mark.attrs?.href, range: mark.range }));

  it('puts the address on the words that were selected', async () => {
    select(0, 5);
    expect(await editor.executeCommand('toggleLink', { href: 'https://barocss.dev' })).toBe(true);

    expect(linksOn()).toEqual([{ href: 'https://barocss.dev', range: [0, 5] }]);
  });

  /**
   * A link is a mark and a mark covers the text **between two points**. Over a caret `toggleLink`
   * writes a zero-length link: nothing to read, nothing to press, and nothing on screen to say it
   * went wrong. The guard asked only about the address until this was measured.
   */
  it('is not offered over a caret, or without an address', () => {
    select(2, 2);
    expect(editor.canExecuteCommand('toggleLink', { href: 'https://barocss.dev' })).toBe(false);

    select(0, 5);
    expect(editor.canExecuteCommand('toggleLink', {})).toBe(false);
    expect(editor.canExecuteCommand('toggleLink', { href: 'https://barocss.dev' })).toBe(true);
  });

  /*
   * A second address over the same words is a **change of address**, not a link inside a link — which
   * is what a reader means by pressing 링크 again on words that already have one.
   */
  it('changes the address rather than laying a second link over the first', async () => {
    select(0, 5);
    await editor.executeCommand('toggleLink', { href: 'https://barocss.dev' });
    select(0, 5);
    await editor.executeCommand('toggleLink', { href: 'https://barocss.dev/docs' });

    expect(linksOn()).toHaveLength(1);
    expect(linksOn()[0].href).toBe('https://barocss.dev/docs');
  });

  describe('taking one off', () => {
    it('takes the link off the words and leaves the words', async () => {
      select(0, 5);
      await editor.executeCommand('toggleLink', { href: 'https://barocss.dev' });

      select(0, 5);
      expect(await editor.executeCommand('removeLink', {})).toBe(true);

      expect(linksOn()).toEqual([]);
      expect((editor.dataStore?.getNode(run) as { text?: string } | undefined)?.text).toBe('바로씨에스 편집기');
    });

    /**
     * **And it is not offered on unlinked words.**
     *
     * `link.ts` named this as the tighter answer and left it for *"the day a reader complains that it
     * is offered on unlinked words"*. The day arrived as a measurement rather than a complaint: over
     * words with no link the command committed and changed nothing, which is the class this
     * package's conformance run is named after.
     */
    it('is offered where there is a link, and nowhere else', async () => {
      select(0, 5);
      expect(editor.canExecuteCommand('removeLink', {})).toBe(false);

      await editor.executeCommand('toggleLink', { href: 'https://barocss.dev' });
      select(0, 5);
      expect(editor.canExecuteCommand('removeLink', {})).toBe(true);

      // And on the words beside it, which carry no link of their own.
      select(6, 9);
      expect(editor.canExecuteCommand('removeLink', {})).toBe(false);
    });

    it('is not offered over a caret', async () => {
      select(0, 5);
      await editor.executeCommand('toggleLink', { href: 'https://barocss.dev' });

      select(2, 2);
      expect(editor.canExecuteCommand('removeLink', {})).toBe(false);
    });
  });
});
