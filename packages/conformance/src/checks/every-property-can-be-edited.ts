import { placeableTypes } from '../placeable';
import type { Check, Finding } from '../types';

/**
 * Every attribute the product **draws** has somewhere a reader can set it.
 *
 * ## The gap between this and the two checks either side of it
 *
 * `every-attribute-is-read` asks whether an attribute reaches the drawing. `every-command-can-be-reached`
 * asks whether a command has a control. Both can pass over an attribute nobody can change:
 *
 * - the attribute is read — the renderer plainly uses it;
 * - the command that writes it *is* reachable — `setBlockFormat` is on the toolbar and in the panel.
 *
 * And `setBlockFormat` writes **24 fields**. Being reachable says nothing about whether all 24 have
 * a row. Measured on the site builder the day this check was written: the product draws **64**
 * attributes and its panel offered **41** — a third of what it draws could only be set by editing
 * the document by hand, and both existing checks were green.
 *
 * That is the same failure the harness is named after, one level along: a thing the schema promises,
 * the renderer honours, and no reader can reach.
 *
 * ## What counts as somewhere
 *
 * A **declaration**, never a claim. The product hands over the attributes its panel, its toolbar and
 * its commands can set — read out of the same data the panel is drawn from — so this cannot be
 * satisfied by a sentence about a row that used to exist. That is the whole reason a product's panel
 * has to become data before it can adopt this: a React tree is not a declaration, and an exemption
 * saying "the properties panel — 배치 › 방향" is a claim somebody has to go and check.
 *
 * ## What has to be exempt
 *
 * Plenty, and each for a reason worth writing:
 *
 * - **A value the product computes.** A collection's `rowIndex` is which row a placement is; nothing
 *   should be able to type it.
 * - **A value another gesture sets.** A drag writes a position; a resize writes a size.
 * - **A durable name.** `id` and `partId` are how one node refers to another, and a reader renaming
 *   one by hand breaks the reference — which is why the panel offers a *label* instead.
 *
 * An exemption here is checked like every other: give the attribute a row and the claim is stale,
 * and this fails on the claim rather than passing quietly.
 */

export const everyPropertyCanBeEdited: Check = {
  name: 'every-property-can-be-edited',
  describe:
    'an attribute the product draws can be set from one of its declared surfaces, or is exempt with what sets it instead',

  run: ({ schema, attributeRead, hasRenderer, editable }) => {
    const findings: Finding[] = [];
    let examined = 0;
    let unanswered = 0;

    /*
     * Both, or the check abstains — and `examined: 0` is how a check doing nothing stays visible
     * rather than passing. It needs to know what the product *draws* (which is `attributeRead`'s
     * question) and what it can *set*, and neither is derivable from the schema alone.
     */
    if (!attributeRead || !editable) return { findings, examined };

    const settable = new Set(editable);
    const placeable = placeableTypes(schema.nodes, schema.topNode ?? 'document');

    for (const [name, shape] of schema.nodes) {
      if (!placeable.has(name)) continue;
      // A node type the product does not draw has no drawn attributes to set — `every-node-is-drawn`
      // owns that, with a reason.
      if (hasRenderer && !hasRenderer(name)) continue;

      for (const attr of Object.keys(shape.attrs ?? {})) {
        const read = attributeRead(name, attr);
        /*
         * Only what the product **draws**. An attribute nothing reads is `every-attribute-is-read`'s
         * finding and would be two findings about one fault here; an attribute that cannot be asked
         * about is counted, not guessed at, the same way it is there.
         */
        if (read === null) {
          unanswered += 1;
          continue;
        }
        if (read !== true) continue;

        examined += 1;
        if (settable.has(attr)) continue;

        findings.push({
          check: 'every-property-can-be-edited',
          subject: `${name}.${attr}`,
          /**
           * The attribute alone, so "a drag writes it" is one entry rather than one per node type
           * that declares it — the same shape `every-attribute-is-read` settled on after `locked`
           * came back on eleven types.
           */
          family: attr,
          detail:
            `\`${attr}\` on \`${name}\` changes what the product draws and no declared surface sets ` +
            `it — no toolbar control, no key, no panel row. A reader can see it and cannot change ` +
            `it. Give it a row, or exempt it with what sets it instead.`
        });
      }
    }

    return { findings, examined, unanswered };
  }
};
