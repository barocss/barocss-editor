import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keyLabel, withHints, type KeyModel, type MenuModel } from '../src/keys';

/**
 * **Nothing in this package guesses which keyboard the reader has.**
 *
 * `keyLabel(chord, apple = true)` and `withHints(menus, keys, apple = true)` both had a default, and
 * the default was the fault: all three products build their menubar with one line that leaves the
 * argument off, so every chord in every menu of Word, the deck and the site builder was printed in
 * Apple symbols on every platform. Type-checking was green, every unit check passed, and the machine
 * it was built on was a Mac.
 *
 * The repair is a parameter with no default, which is a compiler error at each site that has not
 * decided. This file is what keeps it from growing one back — a default is a one-character edit and
 * nothing else in the repository would notice.
 */

const source = readFileSync(fileURLToPath(new URL('../src/keys.ts', import.meta.url)), 'utf8');

describe('the platform is asked for, never assumed', () => {
  it('no function in keys.ts gives `apple` a default', () => {
    /*
     * Read from the source rather than inferred from behaviour, because a default is invisible at
     * runtime: `f(x)` and `f(x, true)` return the same string, which is exactly why this went
     * unnoticed. `Function.length` would not see it either — it stops at the first defaulted
     * parameter, so a default *is* the thing that hides itself.
     */
    const defaulted = source
      .split('\n')
      .map((line, at) => ({ line, at: at + 1 }))
      .filter(({ line }) => /\bapple\s*(?::\s*boolean\s*)?=/.test(line) && !line.trim().startsWith('*'));
    expect(defaulted.map((one) => `${one.at}: ${one.line.trim()}`)).toEqual([]);
  });

  it('every declaration of `apple` in this package is a required boolean', () => {
    const declarations = source.match(/\bapple\s*[?:][^,)]*/g) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    // `apple?:` would be the same fault wearing a different spelling — undefined is falsy, so an
    // optional parameter silently means "not a Mac" instead of silently meaning "a Mac".
    expect(declarations.filter((one) => one.startsWith('apple?'))).toEqual([]);
  });
});

describe('what the argument actually changes', () => {
  const keys: KeyModel[] = [
    { key: 'Mod+z', command: 'undo' },
    { key: 'Mod+Shift+z', command: 'redo' },
    { key: 'Mod+Alt+k', command: 'insertLink' }
  ];

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
            { command: 'insertLink', label: '링크' }
          ]
        }
      ]
    }
  ];

  it('draws a whole menu in the other convention, not just the joining character', () => {
    const hints = (apple: boolean) =>
      withHints(menus, keys, apple)[0].blocks[0].items.map((one) => one.hint);

    expect(hints(true)).toEqual(['⌘Z', '⇧⌘Z', '⌥⌘K']);
    expect(hints(false)).toEqual(['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+Alt+K']);
  });

  it('changes the order of the modifiers as well as their spelling', () => {
    // Apple writes Control, Option, Shift, Command; the rest write Ctrl first. Both are what a
    // reader of that platform scans for, and neither is a preference.
    expect(keyLabel('Mod+Alt+Shift+k', true)).toBe('⌥⇧⌘K');
    expect(keyLabel('Mod+Alt+Shift+k', false)).toBe('Ctrl+Alt+Shift+K');
  });

  it('is the difference a Windows reader would report as broken', () => {
    // The state the three menubars were actually in, written out so the fault is legible: a chord
    // printed with a key the reader's keyboard does not have.
    const printedEverywhere = keyLabel('Mod+z', true);
    const whatWindowsNeeded = keyLabel('Mod+z', false);
    expect(printedEverywhere).toBe('⌘Z');
    expect(whatWindowsNeeded).toBe('Ctrl+Z');
    expect(printedEverywhere).not.toBe(whatWindowsNeeded);
  });
});
