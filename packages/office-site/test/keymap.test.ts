import { describe, it, expect } from 'vitest';
import { SITE_KEYS, hintFor, hintOf, matchesSiteKey, siteKeyFor } from '../src/keymap';
import { SITE_MENUS } from '../src/menu-model';
import { keyFaults ,
  taughtKeys} from '@barocss/office-controls';
import { createSiteEditor } from '../src/site-kit';

/**
 * The keys, and the menu that teaches them.
 *
 * ## What this exists to stop happening again
 *
 * Measured in a browser, chord by chord, with a block selected: the menubar printed **fourteen**
 * chords and the product answered **three** of them. ⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V, ⌘A, ⌘F and the four zoom
 * keys all did nothing at all, while the menu went on saying they worked.
 *
 * The cause was two declarations of one fact — the hints typed into `menu-model.ts`, the bindings in
 * `keymap.ts`, and a `keydown` handler in the app that remembered two of them. So the hints are
 * derived now, and these are the tests that hold the derivation to something.
 */
/** The chords a menu prints that this app does not answer, and who does answer them. */
const PLATFORM: Record<string, string> = {
  잘라내기: '⌘X',
  복사: '⌘C',
  붙여넣기: '⌘V',
  미리보기: 'Esc로 나가기'
};

describe('what a key means, and what the menu says it means', () => {
  const entries = SITE_MENUS.flatMap((menu) =>
    menu.blocks.flatMap((block) => block.items.map((item) => ({ menu: menu.label, ...item })))
  );

  it('prints a chord only where there is one', () => {
    for (const entry of entries) {
      /*
       * **묶은 것 = 제품 + 엔진.** `SITE_KEYS` 만 보면 메뉴가 인쇄하는 엔진 화음(⌥↑ 같은 것)이
       * *근거 없는 인쇄* 로 읽힌다. 이 회차에 같은 반쪽 읽기를 다섯 자리에서 고쳤다 —
       * `taughtKeys` 의 프로세.
       */
      const bound = taughtKeys(SITE_KEYS).find(
        (key) =>
          (entry.command !== undefined && key.command === entry.command) ||
          (entry.view !== undefined && key.view === entry.view)
      );
      if (bound) {
        // Bound: the chord is derived, so it cannot say anything but what the binding says.
        expect(entry.hint).toBe(hintOf(bound.key));
      } else {
        /*
         * Unbound: nothing, unless it is one of the four this product deliberately does **not**
         * answer. ⌘X, ⌘C and ⌘V in text are the platform's; 미리보기's is a note about Escape rather
         * than a chord to press. The list is written out here on purpose — it is short, every entry
         * on it is a claim, and the assertion that would have failed a week ago on nine entries is
         * the one underneath it.
         */
        expect(PLATFORM[entry.label] ?? undefined).toBe(entry.hint);
      }
    }
  });

  it('offers every key it binds somewhere a reader can find it', () => {
    // A chord nobody can discover is a chord only the person who wrote it knows about.
    const offered = new Set(entries.flatMap((one) => [one.command, one.view].filter(Boolean)));
    for (const key of SITE_KEYS) {
      const what = key.command ?? key.view;
      expect.soft(offered.has(what), `${key.key} → ${what}`).toBe(true);
    }
  });

  it('binds a command or a view and says exactly one', () => {
    // `menuFaults` holds a menu entry to this; a binding is the same shape and had no such check.
    for (const key of SITE_KEYS) {
      expect(Boolean(key.command)).not.toBe(Boolean(key.view));
    }
  });

  it('writes a chord the way a menu prints it', () => {
    expect(hintOf('Mod+z')).toBe('⌘Z');
    expect(hintOf('Mod+Shift+z')).toBe('⇧⌘Z');
    // `Del`, which is the deck's convention and now the suite's — one table of symbols, not three.
    expect(hintOf('Delete')).toBe('Del');
    // And the modifiers come out in macOS order whatever order the declaration wrote them in.
    expect(hintOf('Shift+Mod+z')).toBe('⇧⌘Z');
    expect(hintOf('Shift+1')).toBe('⇧1');
    // `=` and `+` are one key, and the menu names the one on the keycap.
    expect(hintOf('Mod+=')).toBe('⌘+');
    expect(hintFor({ command: 'undo' })).toBe('⌘Z');
    expect(hintFor({ view: 'zoom.fit' })).toBe('⇧1');
    expect(hintFor({ command: 'exportSite' })).toBeUndefined();
  });

  it('matches a digit by where the key is, not by what it types', () => {
    const fit = SITE_KEYS.find((one) => one.view === 'zoom.fit')!;
    /*
     * Shift and `1` types `!` on a US layout and something else on several others. Compared against
     * `event.key` this chord would be a chord that works on one keyboard.
     */
    expect(matchesSiteKey(fit, { key: '!', code: 'Digit1', shiftKey: true })).toBe(true);
    expect(matchesSiteKey(fit, { key: '1', code: 'Digit1', shiftKey: true })).toBe(true);
    expect(matchesSiteKey(fit, { key: '!', code: 'Digit2', shiftKey: true })).toBe(false);
  });

  it('answers undo wherever the reader is, and Delete only in select', () => {
    const meta = { metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(siteKeyFor({ key: 'z', ...meta }, 'text')?.command).toBe('undo');
    expect(siteKeyFor({ key: 'z', ...meta }, 'select')?.command).toBe('undo');
    // In text, Delete is a letter — a builder that took it is one nobody can write a sentence in.
    expect(siteKeyFor({ key: 'Delete' }, 'text')).toBeUndefined();
    expect(siteKeyFor({ key: 'Delete' }, 'select')?.command).toBe('removeBlocks');
  });

  /**
   * **Escape is in the map**, which is the half of this that had never been written down.
   *
   * It was listened for in the app and declared nowhere, so it was in no menu, no control could
   * print it as a hint, and the harness could not ask whether it did anything — this repository's
   * own rule about a surface that declares nothing, broken by the one key a reader reaches for when
   * they are stuck.
   *
   * `select` only: in text mode `Escape` means *finish typing*, which is the app's business and not
   * a command's, and a map that claimed it there would take the way out of the caret away.
   */
  it('answers Escape in select and leaves it alone in text', () => {
    expect(siteKeyFor({ key: 'Escape' }, 'select')?.command).toBe('selectParent');
    expect(siteKeyFor({ key: 'Escape' }, 'text')).toBeUndefined();
  });

  it('does not answer a chord with a modifier it did not ask for', () => {
    const undo = SITE_KEYS.find((one) => one.command === 'undo')!;
    expect(matchesSiteKey(undo, { key: 'z', metaKey: true })).toBe(true);
    // ⇧⌘Z is redo and a different entry, which is only true because shift is compared and not ignored.
    expect(matchesSiteKey(undo, { key: 'z', metaKey: true, shiftKey: true })).toBe(false);
    expect(matchesSiteKey(undo, { key: 'z' })).toBe(false);
    expect(siteKeyFor({ key: 'z', metaKey: true, shiftKey: true }, 'select')?.command).toBe('redo');
  });

  /**
   * And every chord names something that answers it.
   *
   * The two above hold the *hints* to the bindings; this holds the **bindings to the product**. A
   * chord naming a command nobody registers is a key that does nothing, and from every other angle it
   * is indistinguishable from a key nobody presses — which is how Word carried four of them, two of
   * which were capabilities that had never been built at all.
   */
  it('binds a command or a view and says exactly one, and the command exists', () => {
    const known = new Set(createSiteEditor().commandNames());
    expect(keyFaults(SITE_KEYS, (command) => known.has(command))).toEqual([]);
  });
});
