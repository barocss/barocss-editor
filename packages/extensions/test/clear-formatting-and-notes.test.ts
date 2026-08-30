// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, createRichExtensions, EndnoteExtension } from '../src';

/**
 * 서식 지우기 and 미주 — the two capabilities a key map had been promising for years.
 *
 * Both were found the same way and neither is a repair: `keyFaults` was given a third question,
 * *does the chord name a command anything registers*, and Word printed 72 chords and answered 68.
 * Two of the four were misspellings; these two were **commands nobody had ever written**, with the
 * layers around them already built — `DataStore.range.clearFormatting` since the range API existed,
 * `endnoteDef` in both schemas and an `endnoteRef` drawn in superscript by `office-text`.
 *
 * So these tests are about the middle: that the command reaches the layer below it, that the guard
 * answers the same question the run does, and that undo puts back exactly what was there.
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    {
      stype: 'paragraph',
      attributes: {},
      content: [
        {
          stype: 'inline-text',
          text: '굵고 기울인 글자',
          marks: [
            { stype: 'bold', range: [0, 2] as [number, number] },
            { stype: 'italic', range: [3, 6] as [number, number] }
          ]
        }
      ]
    },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '아무 서식 없는 글' }] }
  ]
});

describe('서식 지우기와 미주', () => {
  let editor: Editor;
  let runs: string[];

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [...createCoreExtensions(), ...createRichExtensions(), new EndnoteExtension()]
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

  const over = (run: number, from: number, to: number) => ({
    type: 'range' as const,
    startNodeId: runs[run],
    startOffset: from,
    endNodeId: runs[run],
    endOffset: to
  });

  const marksOn = (run: number) =>
    ((editor.dataStore?.getNode(runs[run]) as { marks?: Array<{ stype: string }> } | undefined)?.marks ?? [])
      .map((mark) => mark.stype)
      .sort();

  describe('clearFormatting', () => {
    it('takes every mark off the selected text, whatever the marks are', async () => {
      expect(marksOn(0)).toEqual(['bold', 'italic']);

      editor.selectionManager?.setSelection(over(0, 0, 8) as never);
      expect(await editor.executeCommand('clearFormatting')).toBe(true);

      expect(marksOn(0)).toEqual([]);
    });

    /*
     * The reason this is an operation with an inverse rather than a loop of `removeMark`s: undo has
     * to put back the *list*, attributes and ranges and all, not re-apply a gesture.
     */
    it('gives the marks back when it is undone', async () => {
      editor.selectionManager?.setSelection(over(0, 0, 8) as never);
      await editor.executeCommand('clearFormatting');
      expect(marksOn(0)).toEqual([]);

      await editor.executeCommand('undo');
      expect(marksOn(0)).toEqual(['bold', 'italic']);
    });

    it('leaves a mark that does not reach the selection alone', async () => {
      // Only the italic run, characters 3–6. Bold sits at 0–2 and is nobody's business here.
      editor.selectionManager?.setSelection(over(0, 3, 6) as never);
      await editor.executeCommand('clearFormatting');

      expect(marksOn(0)).toEqual(['bold']);
    });

    /**
     * The guard asks the same question the run answers.
     *
     * Written first as *"a range covering something"*, on the argument that a reader pressing
     * 서식 지우기 over plain text has got what they asked for. The harness disagreed the same
     * afternoon: a control that lights up, commits and changes nothing is the class this package's
     * conformance run is named after, and plain text is where it happens every time.
     */
    it('does not light up over a caret, or over text wearing nothing', () => {
      editor.selectionManager?.setSelection(over(0, 2, 2) as never);
      expect(editor.canExecuteCommand('clearFormatting')).toBe(false);

      editor.selectionManager?.setSelection(over(1, 0, 5) as never);
      expect(editor.canExecuteCommand('clearFormatting')).toBe(false);

      editor.selectionManager?.setSelection(over(0, 0, 4) as never);
      expect(editor.canExecuteCommand('clearFormatting')).toBe(true);
    });
  });

  describe('insertEndnote', () => {
    const bodies = () => {
      const found: Array<{ stype: string; id: unknown }> = [];
      const walk = (sid: string) => {
        const node = editor.dataStore?.getNode(sid) as
          | { stype?: string; attributes?: { id?: unknown }; content?: unknown[] }
          | undefined;
        if (!node) return;
        if (node.stype === 'endnoteDef' || node.stype === 'footnoteDef') {
          found.push({ stype: node.stype, id: node.attributes?.id });
        }
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk(editor.getRootId());
      return found;
    };

    it('puts a body in the document and a reference over the words', async () => {
      editor.selectionManager?.setSelection(over(1, 0, 2) as never);
      expect(await editor.executeCommand('insertEndnote', { id: 'e1', text: '미주 본문' })).toBe(true);

      expect(bodies()).toEqual([{ stype: 'endnoteDef', id: 'e1' }]);
      expect(marksOn(1)).toEqual(['endnoteRef']);
    });

    /*
     * A body holds `block+`, which is the fault that kept every footnote insert from ever committing:
     * office says `block+` and the standard schema said `inline*`, and the command wrote the inline
     * one. Both say `block+` now, and this is the line that would notice it coming back.
     */
    it('writes the text into a paragraph, because a body holds blocks', async () => {
      editor.selectionManager?.setSelection(over(1, 0, 2) as never);
      await editor.executeCommand('insertEndnote', { id: 'e1', text: '미주 본문' });

      const body = editor.exportDocument(editor.getRootId()) as never as {
        content: Array<{ stype: string; content?: Array<{ stype: string }> }>;
      };
      const def = body.content.find((one) => one.stype === 'endnoteDef');
      expect(def?.content?.[0]?.stype).toBe('paragraph');
    });

    it('does not light up without an id, or without words to mark', () => {
      editor.selectionManager?.setSelection(over(1, 0, 2) as never);
      expect(editor.canExecuteCommand('insertEndnote', {})).toBe(false);

      editor.selectionManager?.setSelection(over(1, 2, 2) as never);
      expect(editor.canExecuteCommand('insertEndnote', { id: 'e1' })).toBe(false);
    });
  });
});
