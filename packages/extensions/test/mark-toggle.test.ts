import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoldExtension } from '../src/bold';
import { ItalicExtension } from '../src/italic';
import { UnderlineExtension } from '../src/underline';
import { StrikeThroughExtension } from '../src/strikethrough';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * The character marks a toolbar toggles.
 *
 * All four are the same control to a reader — a button that is on or off and
 * turns the other way when pressed — so they are tested together, and the
 * differences between them show up as failures rather than as prose.
 *
 * Two of them behaved differently and it took a browser to notice. Bold and
 * italic answered "yes, I can run" to every question, including with nothing
 * selected, which left their buttons enabled at all times and silent when
 * pressed. And both *applied* the mark rather than toggling it, so text could be
 * made bold and never unmade: the button drew itself as pressed, announced
 * itself as pressed, and did nothing when pressed again. Underline and
 * strikethrough had been written later and had neither fault.
 */
const ops: any[] = [];

vi.mock('@barocss/model', () => ({
  transaction: (_editor: unknown, operations: any[]) => ({
    commit: async () => (ops.push(...operations), { success: true })
  }),
  // The distinction under test: one turns the mark on and leaves it on, the
  // other turns it the other way.
  toggleMark: (...args: unknown[]) => ({ type: 'toggleMark', args }),
  applyMark: (...args: unknown[]) => ({ type: 'applyMark', args })
}));

const range = (): ModelSelection =>
  ({
    type: 'range',
    startNodeId: 't1',
    startOffset: 0,
    endNodeId: 't1',
    endOffset: 4,
    collapsed: false
  }) as ModelSelection;

const caret = (): ModelSelection =>
  ({
    type: 'range',
    startNodeId: 't1',
    startOffset: 2,
    endNodeId: 't1',
    endOffset: 2,
    collapsed: true
  }) as ModelSelection;

const MARKS = [
  { name: 'bold', command: 'toggleBold', Extension: BoldExtension },
  { name: 'italic', command: 'toggleItalic', Extension: ItalicExtension },
  { name: 'underline', command: 'toggleUnderline', Extension: UnderlineExtension },
  { name: 'strikethrough', command: 'toggleStrikeThrough', Extension: StrikeThroughExtension }
];

const editorWith = (Extension: any, selection: ModelSelection | null) => {
  const commands = new Map<string, any>();
  const editor: any = { selection, registerCommand: (c: any) => commands.set(c.name, c) };
  new Extension().onCreate(editor);
  return { editor, commands };
};

beforeEach(() => {
  // Braces: an arrow returning the new length hands vitest a number where it expects
  // a cleanup function.
  ops.length = 0;
});

describe.each(MARKS)('$name', ({ command, Extension }) => {
  it('toggles the mark rather than applying it', async () => {
    const { editor, commands } = editorWith(Extension, range());
    await commands.get(command).execute(editor, { selection: range() });

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('toggleMark');
  });

  it('can run over a range of text', () => {
    const { editor, commands } = editorWith(Extension, range());
    expect(commands.get(command).canExecute(editor, { selection: range() })).toBe(true);
  });

  it('cannot run with nothing selected', () => {
    // The button has to be able to go grey. A toggle with no range has nothing
    // to toggle, and one that claims otherwise fails silently when pressed.
    const { editor, commands } = editorWith(Extension, null);
    expect(commands.get(command).canExecute(editor, {})).toBe(false);
  });

  it('does nothing, and says so, when asked to run with nothing selected', async () => {
    const { editor, commands } = editorWith(Extension, null);
    expect(await commands.get(command).execute(editor, {})).toBe(false);
    expect(ops).toHaveLength(0);
  });

  it('falls back to the editor selection when the payload carries none', async () => {
    // The key map runs commands without a payload, so the two paths have to
    // agree — a shortcut that works and a button that does not is worse than
    // neither working.
    const { editor, commands } = editorWith(Extension, range());
    expect(commands.get(command).canExecute(editor, {})).toBe(true);
    await commands.get(command).execute(editor, {});
    expect(ops).toHaveLength(1);
  });

  it('treats a collapsed caret as a range, so typing can carry the mark', () => {
    // A caret is still a range selection: pressing Mod+B with no text selected
    // is how a writer turns bold on before typing.
    const { editor, commands } = editorWith(Extension, caret());
    expect(commands.get(command).canExecute(editor, { selection: caret() })).toBe(true);
  });
});
