import { describe, it, expect } from 'vitest';
import { createWordEditor, createWordExtensions } from '../src/word-kit';
import { WORD_KEYBINDINGS } from '../src/word-keymap';

/**
 * The kit is the seam between engine and product: it decides what can be done,
 * and with which keys. Nothing below it knows any of this.
 */
describe('Word kit', () => {
  it('installs the editing commands a word processor needs', () => {
    const editor = createWordEditor();
    const commands = new Set(Array.from((editor as any)._commands.keys()));

    for (const command of [
      'insertParagraph', 'toggleBold', 'setHeading1', 'toggleBulletList',
      'insertTable', 'insertRowBelow', 'deleteColumn', 'mergeCells', 'nextCell'
    ]) {
      expect(commands.has(command)).toBe(true);
    }
  });

  it('can be created with no kit at all', () => {
    // A product may want a viewer: the engine imposes no editing commands.
    const editor = createWordEditor({ kit: [] });
    const commands = new Set(Array.from((editor as any)._commands.keys()));

    expect(commands.has('toggleBold')).toBe(false);
    expect(commands.has('historyUndo')).toBe(true); // engine command, always there
  });

  it('uses the Word schema', () => {
    const editor = createWordEditor();
    const schema = (editor as any).dataStore.getActiveSchema();

    expect(schema.getNodeType('contentControl')).toBeDefined();
    expect(schema.getNodeType('styleDef')).toBeDefined();
    expect(schema.getMarkType('insertion')).toBeDefined();
  });

  it('replaces the engine key map rather than layering on it', () => {
    const editor = createWordEditor();
    editor.emit('editor:selection.focus');
    (editor as any).setContext('inTable', true);

    // Tab is Word's cell navigation here, not the engine's indent binding
    const resolved = (editor as any).keybindings.resolve('Tab');
    expect(resolved.map((r: any) => r.command)).toEqual(['nextCell']);
  });

  it('scopes table keys to tables', () => {
    const editor = createWordEditor();
    editor.emit('editor:selection.focus');
    (editor as any).setContext('inTable', false);

    expect((editor as any).keybindings.resolve('Tab')).toHaveLength(0);
  });

  it('accepts a key map of its own', () => {
    const editor = createWordEditor({ keybindings: [{ key: 'Mod+q', command: 'toggleBold' }] });
    editor.emit('editor:selection.focus');

    expect((editor as any).keybindings.resolve('Mod+q').map((r: any) => r.command)).toEqual(['toggleBold']);
  });

  it('keeps the engine keys its own map does not restate', () => {
    // A product map layers over the engine default rather than replacing it. It
    // used to clear the registry first, which threw out the baseline with the
    // conflict: Backspace, Delete and the arrow keys are engine defaults that a
    // word processor has nothing new to say about, and losing them left the
    // document unable to merge a block or move the caret by keyboard at all.
    const editor = createWordEditor({ keybindings: [{ key: 'Mod+q', command: 'toggleBold' }] });
    editor.emit('editor:selection.focus');

    for (const key of ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight']) {
      expect((editor as any).keybindings.resolve(key).length).toBeGreaterThan(0);
    }
  });

  it('wins where it does collide with the engine', () => {
    const editor = createWordEditor({
      keybindings: [{ key: 'Backspace', command: 'wordSpecificBackspace' }]
    });
    editor.emit('editor:selection.focus');

    // Both are registered; the product's outranks the engine's by source.
    expect((editor as any).keybindings.resolve('Backspace')[0].command).toBe(
      'wordSpecificBackspace'
    );
  });
});

describe('Word key map', () => {
  it('scopes table keys so Tab keeps its ordinary meaning outside a table', () => {
    const tab = WORD_KEYBINDINGS.find((b) => b.key === 'Tab');
    expect(tab?.when).toContain('inTable');
  });

  it('always consumes undo/redo so the browser never runs its own', () => {
    for (const key of ['Mod+z', 'Mod+Shift+z', 'Mod+y']) {
      const binding = WORD_KEYBINDINGS.find((b) => b.key === key);
      expect(binding).toBeDefined();
      expect(binding!.when).toBe('editorFocus');
      expect(binding!.when).not.toContain('historyCan');
    }
  });

  it('gates every binding on editor focus', () => {
    for (const binding of WORD_KEYBINDINGS) {
      expect(binding.when).toContain('editorFocus');
    }
  });

  it('binds no key twice within the same context', () => {
    const seen = new Map<string, string>();
    for (const b of WORD_KEYBINDINGS) {
      const scope = `${b.key}::${b.when}`;
      expect(seen.has(scope)).toBe(false);
      seen.set(scope, b.command);
    }
  });
});

describe('createWordExtensions', () => {
  it('includes the table kit', () => {
    expect(createWordExtensions().some((e) => e.name === 'table')).toBe(true);
  });
});
