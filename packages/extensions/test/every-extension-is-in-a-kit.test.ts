// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as extensions from '../src';

/**
 * **Every extension this package exports is in a kit a product can install.**
 *
 * ## The fault this would have caught, months earlier
 *
 * `FindReplaceExtension` was called a stub in three places in this repository — Word's key map
 * explaining why ⌘F was removed, `every-command-does-something` opening with it as the fault it was
 * written for, and BACKLOG as an open item. It was never a stub. It was a complete implementation
 * that **nothing installed**, which from a keyboard is indistinguishable from reaching one.
 *
 * A product finds an extension one of two ways: by name, out of this file's exports, or by taking a
 * kit. Nothing ever found `FindReplaceExtension` by name — reading fifty exports to notice a missing
 * one is not something anybody does — and it was in none of the four kits. So it was invisible, and
 * a wrong explanation filled the gap and was quoted for months.
 *
 * ## Word names its extensions one at a time, and that is not a counter-example
 *
 * Its kit takes `createCoreExtensions()` and `createBasicExtensions()` and then lists twenty-two by
 * hand, with the reason written down: `createRichExtensions()` is the whole rich-editor surface, and
 * taking the bundle registered an insert for every node in it — including ten Word cannot draw, so
 * `insertCallout` reported success and left the reader's text invisible. That is the right decision
 * and it is a decision **only a reader of these exports can make**.
 *
 * Which is the argument for this check rather than against it. A product that reads the list can
 * choose; a product that takes a kit gets what the kit has; and an extension in neither is one
 * nobody chooses *or* inherits. The next application starts from a kit.
 *
 * ## Why this is a list and not a count
 *
 * Because the exemptions are the interesting part. Every extension outside a kit today is one that
 * **builds its own DOM**, and that is not a coincidence: a shared model package drawing UI is a
 * package a product cannot use, in a repository whose whole shape is that `office-ui` draws and the
 * packages below it do not. The exemption is a claim about why nobody can install it, and the day
 * one of them stops drawing, this fails and it goes in a kit.
 */
describe('every extension this package exports', () => {
  /**
   * Extensions a product **cannot** install as they are, and what has to change first.
   *
   * **Empty**, and it was three: `FindReplaceExtension`, `SlashCommandExtension` and
   * `FloatingToolbarExtension`, every one of them a shared model package building its own DOM.
   * Two had their drawing taken out and went into a kit; the third registered **no commands at
   * all** — a selection toolbar, entirely UI, in the model layer, that no product had ever built the
   * equivalent of. It was deleted rather than moved, because a component nobody renders written into
   * a second package is the same mistake with a new address. The day a product wants a floating
   * toolbar it belongs in `office-ui`, where it can take the tokens all three products theme by.
   *
   * An entry here is a claim about why nobody *can* install something, not a note that nobody has.
   */
  const cannotBeInstalled: Record<string, string> = {};

  it('is in a kit, or names what would have to change first', () => {
    const classes = Object.entries(extensions).filter(
      ([name, made]) => name.endsWith('Extension') && typeof made === 'function' && /^[A-Z]/.test(name)
    );

    /*
     * By the **instance's** `name`, which is what an editor keys its registry by — a class name is
     * this file's business and the thing a product ends up holding is the instance.
     */
    const nameOf = new Map<string, string>();
    for (const [label, Made] of classes) {
      try {
        nameOf.set(label, (new (Made as new () => { name: string })()).name);
      } catch {
        // An extension that needs an argument is not one a kit can hold without deciding for it.
      }
    }

    const held = new Set<string>();
    for (const kit of [
      'createCoreExtensions',
      'createBasicExtensions',
      'createRichExtensions',
      'createDefaultExtensions'
    ]) {
      const made = ((extensions as never as Record<string, () => { name: string }[]>)[kit]?.() ??
        []) as { name: string }[];
      for (const one of made) held.add(one.name);
    }

    const outside = [...nameOf.values()].filter((name) => !held.has(name)).sort();
    expect(outside).toEqual(Object.keys(cannotBeInstalled).sort());

    // And it looked at all of them — an empty list would pass the line above for the wrong reason.
    expect(nameOf.size).toBeGreaterThanOrEqual(45);
  });
});
