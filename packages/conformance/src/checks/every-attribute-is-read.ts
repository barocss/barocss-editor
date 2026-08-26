import { placeableTypes } from '../placeable';
import type { Check, Finding } from '../types';

/**
 * Every attribute a schema declares is read by something.
 *
 * ## The list this replaces
 *
 * The first product kept it by hand, in its backlog: *"Attributes the schema
 * declares and nothing reads"*, a line each, and a date — *"Re-measured 2026-08-18,
 * and five came off."* Somebody had to go and look, attribute by attribute, and
 * between one look and the next the list said things that were no longer true.
 *
 * Which is the operation roster's failure with a different subject: fourteen notes
 * claiming an operation had no inverse, about operations that had since been given
 * one, and the checks they silenced stayed off for months looking exactly like
 * coverage. **A note rots.** This is the same question asked of the product every
 * time the tests run.
 *
 * ## Why an unread attribute matters
 *
 * A schema is a promise about what a document may say. An attribute nothing reads is
 * a promise nothing keeps: a reader sets it, a file records it, a converter carries
 * it, and the page is unchanged. Nothing fails, because nothing is wrong in any one
 * file — which is the whole reason this harness exists.
 *
 * Measured on this suite: `visible` was declared in the *shared* canvas attributes
 * and read by both products' renderers, and settable by nothing at all — the sibling
 * failure, and the one a command check catches. This catches the other direction.
 *
 * ## What counts as read, and what has to be exempt
 *
 * Read means **the drawing changes**: the node is rendered with the attribute absent
 * and again with it set, and the two are compared (`attributeReadFrom`). An attribute
 * that reaches the page some other way — a contents page reading `outlineLevel`, a
 * paginator reading a section's columns, a command reading `locked` — looks unread
 * here and needs an exemption naming where it is read.
 *
 * That is not the hand-kept list coming back. An exemption here is **checked**: the
 * day a renderer starts drawing the attribute, the claim is stale and this fails on
 * the claim rather than passing quietly. A person decides once, in a place that
 * cannot go out of date.
 */

export const everyAttributeIsRead: Check = {
  name: 'every-attribute-is-read',
  describe:
    'an attribute the schema declares changes what the product draws, or is exempt with what reads it instead',

  run: ({ schema, attributeRead, hasRenderer }) => {
    const findings: Finding[] = [];
    let examined = 0;
    let unanswered = 0;

    // A product that has not adopted this yet: `examined: 0` is how a check doing
    // nothing stays visible rather than passing.
    if (!attributeRead) return { findings, examined };

    const placeable = placeableTypes(schema.nodes, schema.topNode ?? 'document');

    for (const [name, shape] of schema.nodes) {
      if (!placeable.has(name)) continue;
      /*
       * A node type this product does not draw is **not** a blind spot, and counting
       * one as such buries the real ones. `every-node-is-drawn` owns that question and
       * the product has already answered it there, with a reason — a page has no
       * coordinates, so it draws no `rectangle`, and asking whether its `cornerRadius`
       * is read is asking about a drawing that does not exist.
       *
       * Measured on the site builder, which inherits a canvas vocabulary it draws none
       * of: **201 unanswered before this line, 8 after** — and the 8 are the ones
       * worth looking at.
       */
      if (hasRenderer && !hasRenderer(name)) continue;
      const attrs = shape.attrs;
      if (!attrs) continue;

      for (const attr of Object.keys(attrs)) {
        const read = attributeRead(name, attr);
        /*
         * `null` is "the product cannot be asked" — a renderer that will not run on a
         * bare node, or a value the probe has no way to invent (every `array` and
         * `object` attribute is one). Skipped rather than guessed at, because a wrong
         * finding costs a person an afternoon proving the tool wrong.
         *
         * **Counted, though.** It was not, and that was the same fault this file's
         * header describes: `examined: 128` over a product with 21 unaskable slots in
         * it reads as coverage, and one of those slots was the site builder's whole
         * responsive mechanism. A product shrinks this number by telling the probe
         * what its values look like — see `attributeReadFrom`'s `probes`.
         */
        if (read === null) {
          unanswered += 1;
          continue;
        }

        examined += 1;
        if (read) continue;

        findings.push({
          check: 'every-attribute-is-read',
          /**
           * Keyed by node **and** attribute, so an exemption is about one of them.
           * `verticalAlign` on a text frame and on a table cell are two decisions.
           */
          subject: `${name}.${attr}`,
          /**
           * The attribute on its own, so "the commands read `locked`" is one entry
           * instead of one per node type that declares it. `locked` came back on
           * eleven types, and eleven copies of a reason is the failure this harness
           * is named after.
           */
          family: attr,
          detail:
            `the schema declares \`${attr}\` on \`${name}\` and drawing one changes ` +
            `nothing — a reader could set it, a file could record it, and the page ` +
            `would be identical. Read it, or exempt it with what reads it instead.`
        });
      }
    }

    return { findings, examined, unanswered };
  }
};
