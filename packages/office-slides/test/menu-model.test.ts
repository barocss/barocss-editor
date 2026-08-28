import { describe, it, expect } from 'vitest';
import { chordFor, keyFaults, keyLabel, menuFaults } from '@barocss/office-controls';
import { SLIDES_KEYS } from '../src/keymap';
import { SLIDES_MENUS, slidesMenuCommands, slidesMenuEntry, slidesMenuId } from '../src/menu-model';
import { createSlidesEditor } from '../src/slides-kit';

/**
 * What the deck's **menubar** offers, held to what the product can actually do.
 *
 * A menu is a promise about what a product can do, and a promise nothing checks is the hand-kept
 * list this whole harness replaced. The first test is the one that matters: every command this model
 * names must be a command the editor registers.
 */
describe('what the menubar offers', () => {
  const registered = new Set<string>(createSlidesEditor().commandNames() as string[]);

  it('names only commands the product registers', () => {
    expect(slidesMenuCommands().filter((name) => !registered.has(name))).toEqual([]);
  });

  it('says of every entry whether it changes the document or the view', () => {
    /*
     * Exactly one of the two, and it is load-bearing rather than tidy: whether a reader is
     * presenting is not a fact about their deck, so it is not a command — and an entry that declared
     * one would be telling the harness a command exists which does not.
     */
    expect(menuFaults(SLIDES_MENUS)).toEqual([]);
  });

  it('holds what acts on the document, and nothing that acts on one selected thing’s look', () => {
    // The moment a formatting command appears here the menubar has started becoming a second
    // toolbar, which is exactly how this product's toolbar reached 60 controls.
    const named = slidesMenuCommands();
    expect(named).not.toContain('toggleBold');
    expect(named).not.toContain('setBoxStyle');
    expect(named).not.toContain('setBlockFormat');
  });

  it('is addressable by the id the menubar hands back', () => {
    const [menu] = SLIDES_MENUS;
    const [block] = menu.blocks;
    const id = slidesMenuId(menu, block, 0);
    expect(slidesMenuEntry(id)).toBe(block.items[0]);
    expect(slidesMenuEntry('nothing.at.all')).toBeUndefined();
  });

  it('puts 파일 first, where a reader looks for it', () => {
    expect(SLIDES_MENUS[0].label).toBe('파일');
  });

  /**
   * And the chords, which a browser had to be opened to distrust.
   *
   * Pressed one at a time on a fresh deck: ⌘S, ⌘M and F5 were printed beside their labels in 파일,
   * 편집 and 보기 and **none of them did anything**, while pressing the entries worked. Two of the
   * three are views, which is why they could not have been bound before — this deck's key map could
   * name only commands, and saving a file and starting a show are the app's.
   */
  it('prints a chord only where the deck binds one', () => {
    for (const menu of SLIDES_MENUS) {
      for (const block of menu.blocks) {
        for (const item of block.items) {
          const bound = chordFor(SLIDES_KEYS, item);
          if (bound) expect(item.hint, item.label).toBe(keyLabel(bound, true));
          // Nothing where nothing is bound, which is the honest thing to say about a dead key.
          else expect(item.hint, item.label).toBeUndefined();
        }
      }
    }
  });

  it('binds a command or a view and says exactly one, once per chord', () => {
    expect(keyFaults(SLIDES_KEYS)).toEqual([]);
  });
});
