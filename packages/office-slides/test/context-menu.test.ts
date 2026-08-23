import { describe, it, expect } from 'vitest';
import { slideMenu } from '../src/context-menu';
import { SLIDES_KEYS } from '../src/keymap';

/**
 * What a right-click offers.
 *
 * The interesting half is which items appear, which is a fact about the selection
 * — so it is a table and a function rather than a component, and this costs
 * milliseconds instead of a browser.
 */
const ids = (target: Parameters<typeof slideMenu>[0]) =>
  slideMenu(target).flatMap((section) => section.items.map((entry) => entry.id));

describe('the menu a right-click opens', () => {
  it('offers the slide’s own things when the pointer found nothing', () => {
    // The guides are among them: they belong to the slide, and until they were here the
    // only way to place one was to drag it out of a ruler — which a reader working from the
    // keyboard cannot do at all.
    expect(ids({ boxes: 0 })).toEqual([
      'paste',
      'guide-x',
      'guide-y',
      'guides-clear',
      'slide-new',
      'slide-duplicate'
    ]);
  });

  /** Inside a container there is no "new slide" to mean. */
  it('offers only the clipboard inside a container', () => {
    expect(ids({ boxes: 0, inside: true })).toEqual(['paste']);
  });

  it('offers one shape everything but grouping', () => {
    const one = ids({ boxes: 1 });
    expect(one).toContain('duplicate');
    expect(one).toContain('front');
    expect(one).toContain('flip-h');
    expect(one).toContain('delete');
    // A group of one is a thing nobody means.
    expect(one).not.toContain('group');
    expect(one).not.toContain('ungroup');
  });

  it('offers grouping for several, and ungrouping for a group', () => {
    expect(ids({ boxes: 3 })).toContain('group');
    expect(ids({ boxes: 1, group: true })).toContain('ungroup');
    // Both, for a selection that has a group in it and something else.
    const mixed = ids({ boxes: 2, group: true });
    expect(mixed).toContain('group');
    expect(mixed).toContain('ungroup');
  });

  /** Sections, because a menu without rules in it is a list. */
  it('groups the items the way every tool groups them', () => {
    expect(slideMenu({ boxes: 2, group: true }).map((section) => section.id)).toEqual([
      'clipboard',
      'order',
      'group',
      'shape',
      'delete'
    ]);
  });

  it('leaves out a section that has nothing in it', () => {
    expect(slideMenu({ boxes: 1 }).map((section) => section.id)).not.toContain('group');
  });

  /**
   * The chords come from the keymap, so a rebinding cannot leave a stale label —
   * and an item bound to nothing says nothing rather than guessing.
   */
  it('says the chord the keymap binds, and only where there is one', () => {
    const items = slideMenu({ boxes: 2 }).flatMap((section) => section.items);
    const duplicate = items.find((entry) => entry.id === 'duplicate');
    expect(duplicate?.key).toBe('Mod+d');
    expect(items.find((entry) => entry.id === 'group')?.key).toBe('Mod+g');
    // Ordering has no chord in this product, and the menu does not invent one.
    expect(items.find((entry) => entry.id === 'front')?.key).toBeUndefined();

    // Every chord it does say is one the keymap actually holds.
    for (const entry of items) {
      if (!entry.key) continue;
      expect(SLIDES_KEYS.some((bound) => bound.key === entry.key), entry.id).toBe(true);
    }
  });

  /** Every command it names is a command, spelled the way the registry spells it. */
  it('names commands rather than describing them', () => {
    const commands = new Set(
      slideMenu({ boxes: 2, group: true }).flatMap((section) =>
        section.items.map((entry) => entry.command)
      )
    );
    expect(commands).toContain('bringToFront');
    expect(commands).toContain('flipBoxes');
    expect([...commands].every((name) => /^[a-z][A-Za-z]+$/.test(name))).toBe(true);
  });
});
