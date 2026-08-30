// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, createBasicExtensions, SlashCommandExtension } from '../src';

/**
 * What the `/` menu **offers**, and what it does when a reader moves through it.
 *
 * ## Why this needs a test of its own
 *
 * The conformance run asks the seven questions of every command, and it can ask them of this one's
 * five — but every one of those questions is about the *document*. This extension's whole job is
 * state: which rows survive the filter, which row the highlight is on, what the app is told when
 * either changes. A menu that offers a row nothing can run is a menu that lights up and does
 * nothing, and the probe cannot see it because the fault is in what the surface *says*.
 *
 * It is also the extension that was rewritten most recently — it used to build its own panel into
 * `document.body`, which is what made it uninstallable — so the part a product now depends on is the
 * part that has never been checked.
 */
const ROWS = [
  { id: 'heading', label: '제목', command: 'setHeading', payload: { level: 2 }, description: '큰 글씨' },
  { id: 'bullets', label: '글머리 목록', command: 'toggleBulletList' },
  { id: 'nowhere', label: '없는 것', command: 'commandNobodyRegisters' }
];

const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '글자들이 있다' }] }
  ]
});

describe('슬래시 메뉴', () => {
  let editor: Editor;
  let told: Array<{ open: boolean; query: string; items: Array<{ id: string }>; currentIndex: number }>;

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [
        ...createCoreExtensions(),
        ...createBasicExtensions(),
        new SlashCommandExtension({ items: ROWS })
      ]
    } as never);
    editor.loadDocument(document_() as never, 'standard');

    /*
     * A caret, because a reader who typed `/` has one — and the rows are commands that need it. Left
     * out at first, and 제목 declined: a menu tested with no selection is a menu tested in a state no
     * reader is ever in.
     */
    let run = '';
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as { stype?: string; content?: unknown[] } | undefined;
      if (!node) return;
      if (node.stype === 'inline-text' && !run) run = sid;
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    editor.selectionManager?.setSelection({
      type: 'range', startNodeId: run, startOffset: 3, endNodeId: run, endOffset: 3
    } as never);

    told = [];
    editor.on('editor:slashMenu.change' as never, (state: unknown) =>
      told.push(JSON.parse(JSON.stringify(state)))
    );
  });

  /*
   * Through `getExtension`, which the editor declares — the state is the extension's, and a product
   * that wants to draw the menu reaches it exactly this way.
   */
  const menu = () => editor.getExtension<SlashCommandExtension>('slashCommand')!;

  /**
   * The row naming a command nobody registers **never appears**.
   *
   * The shared default list names Word's `insertComment` and the rich bundle's `insertCallout` and
   * `insertMathBlock`; a product that does not register those would offer rows that light up and do
   * nothing. Filtering by `commandNames()` is what makes one shared list safe on three products, and
   * it is the sentence a future edit is most likely to drop.
   */
  it('offers only rows this editor can run', async () => {
    await editor.executeCommand('showSlashMenu', {});

    expect(menu().state.items.map((row) => row.id)).toEqual(['heading', 'bullets']);
  });

  it('narrows on the label, the id and the description', async () => {
    await editor.executeCommand('showSlashMenu', {});

    await editor.executeCommand('filterSlashMenu', { query: '제목' });
    expect(menu().state.items.map((row) => row.id)).toEqual(['heading']);

    // The id, which a reader who knows the product types instead of the label.
    await editor.executeCommand('filterSlashMenu', { query: 'bullet' });
    expect(menu().state.items.map((row) => row.id)).toEqual(['bullets']);

    // And the description, which is the half that makes a menu findable rather than memorised.
    await editor.executeCommand('filterSlashMenu', { query: '큰 글씨' });
    expect(menu().state.items.map((row) => row.id)).toEqual(['heading']);
  });

  it('puts the highlight on the first row, and takes it away when nothing matches', async () => {
    await editor.executeCommand('showSlashMenu', {});
    expect(menu().state.currentIndex).toBe(0);

    await editor.executeCommand('filterSlashMenu', { query: '있을 리 없는 말' });
    expect(menu().state.items).toEqual([]);
    expect(menu().state.currentIndex).toBe(-1);
  });

  /* A reader at the last row pressing down means the first — the one behaviour a menu is judged on. */
  it('rounds the highlight in both directions', async () => {
    await editor.executeCommand('showSlashMenu', {});

    await editor.executeCommand('moveSlashMenu', { by: 1 });
    expect(menu().state.currentIndex).toBe(1);

    await editor.executeCommand('moveSlashMenu', { by: 1 });
    expect(menu().state.currentIndex).toBe(0);

    await editor.executeCommand('moveSlashMenu', { by: -1 });
    expect(menu().state.currentIndex).toBe(1);
  });

  /**
   * Picking a row runs its command and **reports what the command answered**.
   *
   * It used to fire and return `true` without waiting, so picking a row said it had worked before
   * the row had done anything — and would have said it for a row whose command declined.
   */
  it('runs the row the highlight is on, and closes', async () => {
    await editor.executeCommand('showSlashMenu', {});
    await editor.executeCommand('filterSlashMenu', { query: '제목' });

    expect(await editor.executeCommand('runSlashMenuItem', {})).toBe(true);
    expect(menu().state.open).toBe(false);

    const tree = editor.exportDocument(editor.getRootId()) as never as {
      content: Array<{ stype: string; attributes?: { level?: number } }>;
    };
    expect(tree.content[0].stype).toBe('heading');
    expect(tree.content[0].attributes?.level).toBe(2);
  });

  /*
   * Every state change reaches the app. A menu whose state is right and whose event is missing draws
   * the previous frame for ever, which is exactly what a product cannot debug from the outside.
   */
  it('tells the app on every change', async () => {
    await editor.executeCommand('showSlashMenu', {});
    await editor.executeCommand('filterSlashMenu', { query: '제목' });
    await editor.executeCommand('moveSlashMenu', { by: 1 });
    await editor.executeCommand('hideSlashMenu', {});

    expect(told.map((state) => `${state.open}:${state.query}:${state.items.length}`)).toEqual([
      'true::2',
      'true:제목:1',
      'true:제목:1',
      'false::0'
    ]);
  });

  /* And the guards say what the state allows — a closed menu has nothing to filter or pick. */
  it('offers nothing to press while it is closed', async () => {
    expect(editor.canExecuteCommand('hideSlashMenu', {})).toBe(false);
    expect(editor.canExecuteCommand('filterSlashMenu', {})).toBe(false);
    expect(editor.canExecuteCommand('runSlashMenuItem', {})).toBe(false);
    expect(editor.canExecuteCommand('moveSlashMenu', {})).toBe(false);

    await editor.executeCommand('showSlashMenu', {});

    expect(editor.canExecuteCommand('hideSlashMenu', {})).toBe(true);
    expect(editor.canExecuteCommand('filterSlashMenu', {})).toBe(true);
    expect(editor.canExecuteCommand('runSlashMenuItem', {})).toBe(true);
    expect(editor.canExecuteCommand('moveSlashMenu', {})).toBe(true);
  });
});
