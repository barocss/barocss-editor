import { describe, it, expect } from 'vitest';
import { chordFor, keyCommands, keyFaults, keyFor, keyLabel, matchesKey, withHints } from '../src/keys';
import type { KeyModel } from '../src/keys';
import type { MenuModel } from '../src/menu';

/**
 * What a product binds, and what its menu is allowed to say about it.
 *
 * ## The measurement this exists because of
 *
 * Every chord each product's menubar printed was pressed in a browser, one at a time, and what
 * happened was compared with what the menu said would happen. **Seventeen taught, six answered.**
 * The site printed fourteen and answered three; Word printed ⌘+, ⌘- and ⌘0 and answered none; the
 * deck printed ⌘S, ⌘M and F5 and answered none.
 *
 * One cause in all three: the chord was typed beside the label, the binding lived somewhere else,
 * and nothing held the two together. So a hint is **derived** now, and these hold the derivation.
 */
describe('a chord, and what a menu may say about it', () => {
  const keys: KeyModel[] = [
    { key: 'Mod+z', command: 'undo' },
    { key: 'Mod+Shift+z', command: 'redo' },
    { key: 'Delete', command: 'remove', mode: 'select', needsSelection: true },
    { key: 'Mod+=', view: 'zoom.in' },
    { key: 'Shift+1', view: 'zoom.fit' }
  ];

  it('writes a chord in the platform’s order, not the declaration’s', () => {
    /*
     * macOS writes Control, Option, Shift, Command, always, whatever a menu's author typed. It is not
     * a nicety: a reader finds a chord by its shape, and `⌘⇧Z` is one they read twice. Both products
     * that had a label function wrote this back to front.
     */
    expect(keyLabel('Mod+Shift+z')).toBe('⇧⌘Z');
    expect(keyLabel('Shift+Mod+z')).toBe('⇧⌘Z');
    expect(keyLabel('Mod+Alt+Ctrl+k')).toBe('⌃⌥⌘K');
  });

  it('writes the other convention when the reader is not on a Mac', () => {
    // A tool that shows `Ctrl+D` on a Mac looks ported; one that shows `⌘D` on Windows is unreadable.
    expect(keyLabel('Mod+d', false)).toBe('Ctrl+D');
    expect(keyLabel('Mod+Shift+z', false)).toBe('Ctrl+Shift+Z');
    expect(keyLabel('Delete', false)).toBe('Delete');
  });

  it('names the key on the keycap, not the one in the event', () => {
    // `=` and `+` are one key, and every application prints the one a reader looks for.
    expect(keyLabel('Mod+=')).toBe('⌘+');
    expect(keyLabel('Delete')).toBe('Del');
    expect(keyLabel('Backspace')).toBe('⌫');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel(undefined)).toBeUndefined();
  });

  it('matches a digit by where the key is, not by what it types', () => {
    const fit = keys.find((one) => one.view === 'zoom.fit')!;
    /*
     * Shift and `1` types `!` on a US layout and something else on several others. Compared against
     * `event.key`, this chord would be a chord that works on one keyboard — which is what both
     * products' matchers did before this one.
     */
    expect(matchesKey(fit, { key: '!', code: 'Digit1', shiftKey: true })).toBe(true);
    expect(matchesKey(fit, { key: '1', code: 'Digit1', shiftKey: true })).toBe(true);
    expect(matchesKey(fit, { key: '!', code: 'Digit2', shiftKey: true })).toBe(false);
  });

  it('is strict about every modifier, including the ones not asked for', () => {
    const undo = keys[0];
    expect(matchesKey(undo, { key: 'z', metaKey: true })).toBe(true);
    // Ctrl is Mod too, because a reader on Windows means the same thing by it.
    expect(matchesKey(undo, { key: 'z', ctrlKey: true })).toBe(true);
    // ⇧⌘Z is redo and a different binding, which is only true because shift is compared.
    expect(matchesKey(undo, { key: 'z', metaKey: true, shiftKey: true })).toBe(false);
    expect(matchesKey(undo, { key: 'z' })).toBe(false);
  });

  it('answers a press with the binding for the mode the reader is in', () => {
    // In text, Delete is a letter — a builder that took it is one nobody can write a sentence in.
    expect(keyFor(keys, { key: 'Delete' }, 'select')?.command).toBe('remove');
    expect(keyFor(keys, { key: 'Delete' }, 'text')).toBeUndefined();
    // A binding with no mode belongs to every mode, which is what a one-mode product declares.
    expect(keyFor(keys, { key: 'z', metaKey: true }, 'text')?.command).toBe('undo');
  });

  it('fills a menu’s chords in from the bindings, and says nothing where there are none', () => {
    const menus: MenuModel[] = [
      {
        id: 'edit',
        label: '편집',
        blocks: [
          {
            id: 'history',
            items: [
              { command: 'undo', label: '실행 취소' },
              { command: 'redo', label: '다시 실행' },
              // Bound to nothing: the honest answer is silence, not a guess.
              { command: 'exportEverything', label: '전부 내보내기' },
              // And a note about a key rather than a chord to press, which stays as written.
              { view: 'preview', label: '미리보기', hint: 'Esc로 나가기' }
            ]
          }
        ]
      }
    ];
    const [filled] = withHints(menus, keys);
    expect(filled.blocks[0].items.map((one) => one.hint)).toEqual([
      '⌘Z',
      '⇧⌘Z',
      undefined,
      'Esc로 나가기'
    ]);
    // The declaration is left alone — a menu model is read by tests and by the harness as well.
    expect(menus[0].blocks[0].items[0].hint).toBeUndefined();
  });

  it('finds the first chord for a thing, because several keys can run one', () => {
    const many: KeyModel[] = [
      { key: 'ArrowLeft', command: 'nudge' },
      { key: 'Shift+ArrowLeft', command: 'nudge' }
    ];
    // What a menu wants to say is one chord rather than eight.
    expect(chordFor(many, { command: 'nudge' })).toBe('ArrowLeft');
    expect(chordFor(many, { command: 'nothing' })).toBeUndefined();
    expect(chordFor(keys, { view: 'zoom.in' })).toBe('Mod+=');
  });

  it('counts the commands a key map reaches, and not the views', () => {
    // `every-command-can-be-reached` asks this, and a view is not a command.
    expect(keyCommands(keys)).toEqual(['undo', 'redo', 'remove']);
  });

  it('says what is wrong with a key map, in its author’s words', () => {
    expect(keyFaults(keys)).toEqual([]);
    expect(keyFaults([{ key: 'Mod+k', command: 'a', view: 'b' }])).toEqual([
      'Mod+k — a binding runs a command or changes a view, and says exactly one'
    ]);
    expect(keyFaults([{ key: 'Mod+k' }])).toHaveLength(1);

    /*
     * Bound twice in one mode is a fault a reader meets as *sometimes it does one thing and sometimes
     * the other*, depending on which the array happened to list first.
     */
    expect(
      keyFaults([
        { key: 'Mod+k', command: 'a' },
        { key: 'Mod+K', command: 'b' }
      ])
    ).toEqual(['Mod+K — bound twice in the same mode, and one of them wins']);

    // Two modes may share a chord — that is the whole point of having modes.
    expect(
      keyFaults([
        { key: 'Delete', command: 'a', mode: 'select' },
        { key: 'Delete', command: 'b', mode: 'text' }
      ])
    ).toEqual([]);
  });
});
