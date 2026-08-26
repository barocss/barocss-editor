import type { Check, Finding } from '../types';

/**
 * Every mark a schema declares draws something.
 *
 * ## The vocabulary all eight other checks were blind to
 *
 * A mark is neither a node nor an attribute of one, so nothing in this harness had ever asked about
 * one. `every-node-is-drawn` walks node types; `every-attribute-is-read` probes a node's attributes;
 * `every-property-can-be-edited` asks which of those a reader can set. A mark falls between all
 * three, and a mark that draws nothing is exactly as invisible as an unread attribute was before the
 * probe existed — the same shape of gap, one vocabulary along.
 *
 * **What it found on its first run** is the reason it exists. `link` has been in the standard schema
 * since it was written, with `href` required, and `toggleLink` has been a registered command for as
 * long. It drew nothing at all: marks become `<span class="mark-…">` with whatever the product's
 * format tables map, and `link` was in none of them. Measured on the site builder's own sample —
 * five pages with addresses, a navigation row, and **zero `<a>` elements**.
 *
 * A site builder whose pages cannot link to each other is not a site builder, and every check was
 * green.
 *
 * ## What counts as drawn
 *
 * The product answers, because only the product knows how it draws one. Some suites map a mark to
 * CSS, some to an element, some to an attribute on a span — and a mark that contributes *nothing* to
 * any of those is what this asks about.
 *
 * ## What has to be exempt
 *
 * A mark read by something that is not a renderer: a `comment` that a pane lists, a `revision` that
 * a review flow resolves, a `bookmark` that a cross-reference points at. Each is a claim naming what
 * reads it instead, checked like every other exemption here — the day it grows a drawing, the claim
 * is stale and this fails on the claim.
 */

export const everyMarkIsDrawn: Check = {
  name: 'every-mark-is-drawn',
  describe: 'a mark the schema declares changes what the product draws, or is exempt with what reads it instead',

  run: ({ schema, markDrawn }) => {
    const findings: Finding[] = [];
    let examined = 0;

    // A product that has not adopted this yet: `examined: 0` is how a check doing nothing stays
    // visible rather than passing.
    if (!markDrawn) return { findings, examined };

    const marks = schema.marks;
    if (!marks) return { findings, examined };

    for (const name of marks.keys()) {
      examined += 1;
      if (markDrawn(name)) continue;

      findings.push({
        check: 'every-mark-is-drawn',
        subject: name,
        /*
         * A mark has no node to be keyed by — it covers a range rather than being one — so the
         * subject and the family are the same word. That is the one place in this harness where they
         * are, and it is a fact about marks rather than a shortcut.
         */
        family: name,
        detail:
          `the schema declares the mark \`${name}\` and drawing text under it changes nothing — a ` +
          `reader could apply it, a file could record it, and the page would be identical. Draw it, ` +
          `or exempt it with what reads it instead.`
      });
    }

    return { findings, examined };
  }
};
