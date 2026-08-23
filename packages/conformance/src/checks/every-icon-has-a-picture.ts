import type { Check, Finding } from '../types';

/**
 * Every icon a product's controls ask for is one something draws.
 *
 * ## The failure this is shaped around
 *
 * A toolbar model says which **act** each control performs — `icon: 'duplicate'` —
 * and the chrome looks the name up in one shared table. A name the table does not
 * know draws the name itself, in text, because a model is free to grow a control
 * before the suite has a picture for it: a blank button says nothing at all, and a
 * word is at least readable.
 *
 * That fallback is a door, and this is what keeps it from being used by accident.
 *
 * ## Why the browser test was not enough
 *
 * Both products already assert that nothing **on screen** fell back — the fallback
 * marks itself with `data-icon-missing`. On screen is the limit: a control on a tab
 * nobody opened, one that appears only with a table selected, a palette inside a
 * dialog. Those are declared exactly like the visible ones, and a missing picture
 * there is found by a reader rather than by a test.
 *
 * Asked of the declaration instead, so every control counts whatever the screen is
 * showing — and it costs milliseconds, so it runs beside the schema checks rather
 * than in a browser.
 *
 * ## One direction only
 *
 * Names asked for and not drawn. Not the reverse: the table is **shared**, so an
 * icon Word never asks for is one Slides may, and a per-product "nothing uses this"
 * finding would be wrong in both products at once.
 */

export const everyIconHasAPicture: Check = {
  name: 'every-icon-has-a-picture',
  describe: 'an icon a control asks for is one the suite draws, rather than its own name in text',

  run: ({ iconsAsked, iconDrawn }) => {
    const findings: Finding[] = [];

    // A product that has not adopted this: `examined: 0` is how a check doing nothing
    // stays visible rather than passing.
    if (!iconsAsked || !iconDrawn) return { findings, examined: 0 };

    const asked = [...new Set(iconsAsked)];
    for (const name of asked) {
      if (iconDrawn(name)) continue;
      findings.push({
        check: 'every-icon-has-a-picture',
        subject: name,
        /**
         * The icon name is the subject, not the control that asks for it: the act is
         * what the table is keyed by, and one missing picture is one decision however
         * many controls perform that act.
         */
        family: 'icon',
        detail:
          `a control asks for the \`${name}\` icon and nothing draws one, so the ` +
          `button shows the word "${name}" where its picture should be. Add it to the ` +
          `shared table, or name an act that is already in it.`
      });
    }

    return { findings, examined: asked.length };
  }
};
