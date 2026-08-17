import { placeableTypes } from '../placeable';
import type { Check, Finding } from '../types';

/**
 * Every node type a schema declares has something that draws it.
 *
 * The first check, because it found the most: **15 of the office schema's 27
 * declared node types had no renderer**, including the entire scene set —
 * `frame`, `group`, `sticky`, `connector`, `component`, `instance` and
 * `textFrame`. Word used one half of a `surface` and left the other half
 * unread, and a whole second document shape sat there for as long as the schema
 * had existed.
 *
 * Nothing could have failed. A node type nobody puts in a document is a node
 * type no test renders, and a renderer nobody wrote is not a line of code with
 * a bug in it.
 *
 * **Not every node is drawn, and that is fine.** A style definition, a numbering
 * scheme, a footnote body, a speaker note — these are read by the product and
 * placed by something other than the flow, or not placed at all. What is not
 * fine is the difference being invisible. So a product either draws a node type
 * or says which of these it is, and the saying is checked.
 */


export const everyNodeIsDrawn: Check = {
  name: 'every-node-is-drawn',
  describe:
    'a node type the schema declares is drawn by the product, or is declared undrawn with a reason',

  run: ({ schema, hasRenderer }) => {
    const findings: Finding[] = [];
    let examined = 0;

    /**
     * Only what a document can actually contain.
     *
     * By reachability rather than by group: a definition is referenced by id
     * and never placed, and asking which types the content expressions lead to
     * answers that without guessing. It used to skip anything grouped
     * `resource` or `document`, which missed `numberingLevel` — a node the
     * schema deliberately gives no group, reachable only through a numbering
     * definition — and made a product write an exemption for it.
     */
    const placeable = placeableTypes(schema.nodes, schema.topNode ?? 'document');

    for (const [name] of schema.nodes) {
      if (!placeable.has(name)) continue;

      examined += 1;
      if (hasRenderer(name)) continue;

      findings.push({
        check: 'every-node-is-drawn',
        subject: name,
        detail:
          `the schema declares \`${name}\` and the product has no renderer for it — ` +
          `a document holding one would draw nothing. Register a renderer, or exempt ` +
          `it with the reason it is never drawn.`
      });
    }

    return { findings, examined };
  }
};
