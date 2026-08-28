import { childTypes } from '../placeable';
import type { Check, Finding } from '../types';

/**
 * Every node type a reader can put on a canvas has a word for it.
 *
 * ## The list, and why a name is not decoration
 *
 * A canvas needs a list beside it — the layer panel every design tool has — because
 * two things cannot be done on the canvas itself: picking what is underneath
 * something, and saying where in the stack a thing goes. Every row of that list
 * needs a name, and a shape with no text has only its *kind* to be named by.
 *
 * A product answers that from a table. A table is exactly the thing this harness
 * exists to distrust: the schema grows a node type, the table does not, and the
 * row says whatever the fallback says. Measured on the first product to have such
 * a table — `connector`, `component` and `instance` were declared in the shared
 * schema and all three came out as "상자", the same word as everything else it did
 * not know. Three rows a reader cannot tell apart, and nothing failing.
 *
 * ## Why it is asked of the product rather than read from a list
 *
 * The same reason `drawnAs` is rendered rather than declared: a product that
 * *states* which types it can name can state something that stopped being true.
 * So the product is asked, one type at a time, and a type it has no word for is a
 * finding.
 *
 * ## What a fallback costs, and why it is not accepted
 *
 * A fallback is not an answer. It makes a missing name look like a name, which is
 * the difference between a list a reader can use and a list of six identical
 * rows — and the product cannot tell the two apart either, which is why nothing
 * fails. A product with a fallback should return nothing for the types it does not
 * really know, and let this say so.
 *
 * ## Which types are asked about
 *
 * What a **canvas** can hold, not everything a document can. A paragraph, a table
 * cell and the document itself never appear in a layer list, and asking about them
 * produced thirty findings on the first run — thirty exemptions would have been
 * thirty notes, which is what this harness is shaped against.
 *
 * Derived from the schema rather than named: the members of the `scene` group, plus
 * whatever a scene *container* says it can hold. In the office schema a `group`
 * holds `(scene | frame)+`, so `frame` is asked about too — which is right, because
 * a frame on a canvas is a row in the list like any other.
 *
 * A scene container whose content is a flow — a `textFrame` holds `block+` — is not
 * consulted. Its children are words, and words are not layers.
 *
 * ## And what a product can add to that list
 *
 * The derivation above is a canvas's, and it was written on a canvas product. A **page builder**
 * has a layer list too, and half of what is in it is not on a canvas at all: a quotation, a code
 * block, a rule and a list item are flow blocks, so `group !== 'scene'` and this check could not
 * see one of them. It passed, on a product where four of the rows in the list said `blockQuote`,
 * `codeBlock`, `horizontalRule` and `listItem` — the stype, in English, in a reader's panel.
 *
 * So a product may also **say what a reader can select**, and those are asked about as well. Named
 * rather than derived, and that is the exception this check argues against everywhere else — but
 * the thing being named is not a claim about *names*, it is the product's own selection rule, which
 * it already holds as one list and uses to decide what a click may land on. A product that changed
 * that rule and forgot this would be caught by the same click it broke.
 */

export const everyDrawingCanBeNamed: Check = {
  name: 'every-drawing-can-be-named',
  describe:
    'a node type a canvas can hold has a name the product can show in a list, or is exempt with the reason it never appears in one',

  run: ({ schema, nameOf, nameable }) => {
    const findings: Finding[] = [];
    let examined = 0;

    // A product that has not adopted this check yet: `examined: 0` is how a check
    // doing nothing stays visible, rather than passing quietly.
    if (!nameOf) return { findings, examined };

    /**
     * The scene group, and what a scene container says it holds.
     *
     * `content` naming `scene` is what makes a node a canvas container — a
     * `textFrame` is a scene node whose content is `block+`, and consulting it
     * would pull every paragraph type back in.
     */
    const onCanvas = new Set<string>();
    for (const [name, shape] of schema.nodes) {
      if (shape.group !== 'scene') continue;
      onCanvas.add(name);
      if (shape.content?.includes('scene')) {
        for (const child of childTypes(schema.nodes, name)) onCanvas.add(child);
      }
    }

    // What the product says a reader can select, when it says so — see the note above.
    for (const name of nameable ?? []) onCanvas.add(name);

    for (const name of onCanvas) {
      examined += 1;
      const word = nameOf(name);
      if (word && word.trim().length > 0) continue;

      findings.push({
        check: 'every-drawing-can-be-named',
        subject: name,
        detail:
          `the schema declares \`${name}\` and the product has no name for it — the list ` +
          `beside the canvas would show a row a reader cannot tell from any other. ` +
          `Name it, or exempt it with the reason it never appears in such a list.`
      });
    }

    return { findings, examined };
  }
};
