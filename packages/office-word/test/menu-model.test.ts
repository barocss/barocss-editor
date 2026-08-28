import { describe, it, expect } from 'vitest';
import { chordFor, keyFaults, keyLabel, menuFaults } from '@barocss/office-controls';
import { WORD_KEYS, WORD_VIEW_KEYS } from '../src/word-keymap';
import { WORD_MENUS, wordMenuCommands, wordMenuEntry, wordMenuId } from '../src/menu-model';
import { createWordEditor } from '../src/word-kit';

/**
 * What Word's **menubar** offers, held to what the product can actually do.
 *
 * A menu is a promise about what a product can do, and a promise nothing checks is the hand-kept
 * list this whole harness replaced. The first test is the one that matters: every command this model
 * names must be a command the editor registers.
 */
describe('what the menubar offers', () => {
  const registered = new Set<string>(createWordEditor().commandNames() as string[]);

  it('names only commands the product registers', () => {
    expect(wordMenuCommands().filter((name) => !registered.has(name))).toEqual([]);
  });

  it('says of every entry whether it changes the document or the view', () => {
    /*
     * Exactly one of the two, and it is load-bearing rather than tidy: whether a reader is
     * presenting is not a fact about their deck, so it is not a command — and an entry that declared
     * one would be telling the harness a command exists which does not.
     */
    expect(menuFaults(WORD_MENUS)).toEqual([]);
  });

  it('holds what acts on the document, and nothing that acts on one selected thing’s look', () => {
    // The moment a formatting command appears here the menubar has started becoming a second
    // toolbar, which is exactly how this product's toolbar reached 60 controls.
    const named = wordMenuCommands();
    expect(named).not.toContain('toggleBold');
    expect(named).not.toContain('setBoxStyle');
    expect(named).not.toContain('setBlockFormat');
  });

  it('is addressable by the id the menubar hands back', () => {
    const [menu] = WORD_MENUS;
    const [block] = menu.blocks;
    const id = wordMenuId(menu, block, 0);
    expect(wordMenuEntry(id)).toBe(block.items[0]);
    expect(wordMenuEntry('nothing.at.all')).toBeUndefined();
  });

  it('puts 파일 first, where a reader looks for it', () => {
    expect(WORD_MENUS[0].label).toBe('파일');
  });

  /**
   * And the chords, which a browser had to be opened to distrust.
   *
   * Pressed one at a time with a caret in the document: ⌘+, ⌘- and ⌘0 were printed beside their
   * labels in 보기 and **none of them did anything**, while pressing the entries worked. The chords
   * were typed here rather than read from a binding, so nothing could tell that no binding existed.
   */
  it('prints a chord only where Word binds one', () => {
    for (const menu of WORD_MENUS) {
      for (const block of menu.blocks) {
        for (const item of block.items) {
          const bound = chordFor(WORD_KEYS, item);
          if (bound) expect(item.hint, item.label).toBe(keyLabel(bound));
          /*
           * ⌘P is the one typed chord, and it is a claim: printing is the **browser's**, hooked at
           * `beforeprint`, so it is a fact about the platform rather than something Word binds. The
           * list is written out because it is short and every line on it is a claim.
           */
          else expect(item.hint ? { [item.label]: item.hint } : undefined, item.label).toEqual(
            item.label === '인쇄' ? { 인쇄: '⌘P' } : undefined
          );
        }
      }
    }
  });

  it('offers every view it binds a key to somewhere a reader can find it', () => {
    // A chord nobody can discover is a chord only the person who wrote it knows about.
    const offered = new Set(
      WORD_MENUS.flatMap((menu) => menu.blocks.flatMap((block) => block.items.map((one) => one.view)))
    );
    for (const key of WORD_VIEW_KEYS) expect.soft(offered.has(key.view), key.key).toBe(true);
  });

  it('binds a command or a view and says exactly one', () => {
    expect(keyFaults(WORD_KEYS)).toEqual([]);
  });
});
