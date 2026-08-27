import { describe, it, expect } from 'vitest';
import { menuFaults } from '@barocss/office-controls';
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
});
