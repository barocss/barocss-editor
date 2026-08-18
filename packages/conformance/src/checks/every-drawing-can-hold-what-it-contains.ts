import { childTypes, placeableTypes } from '../placeable';
import type { Check, Finding } from '../types';

/**
 * A node's drawing must be able to contain the drawings of what it may hold.
 *
 * `every-node-is-drawn` asks whether a renderer *exists*. That is the question
 * that found fifteen missing renderers, and it is not the only way a product can
 * fail to draw something: a renderer can exist, run without error, produce
 * elements, and still put nothing on the page.
 *
 * The way it does that is the namespace. `<svg>` may only contain SVG elements —
 * an HTML element inside one is parsed and kept, and never laid out. So a
 * product that draws a container in SVG and its contents in HTML draws an empty
 * box, with no error anywhere.
 *
 * **Found from the other side, in a comment.** Word draws `canvasBlock` as an
 * `<svg>` because in Word a drawing only ever holds shapes, and it draws those
 * shapes as `<rect>`, `<ellipse>` and `<line>`. Slides needs the same four shape
 * types as placed HTML boxes — they sit on a slide beside text frames that have
 * to stay real contenteditable HTML — so it overrides them with `<div>`s, and
 * inherits Word's `canvasBlock`. In a deck, that `<svg>` holds `<div>`s and
 * draws nothing. The renderers all exist; every check passed. What was holding
 * the knowledge was a paragraph in `renderers.ts` saying the harness could not
 * see this — which is the failure mode the harness exists to remove, met from
 * the other side.
 *
 * **The namespace is asked of the parser, not of a list.** A hand-written set of
 * SVG tag names is a note, and notes rot; the HTML5 foreign-content rules
 * already know which names are SVG's, and every parser implements them. So the
 * check writes `<tag>` inside an `<svg>` and reads back which namespace the
 * parser put it in. `rect`, `ellipse`, `line`, `g`, `text` come back SVG;
 * `div`, `span`, `p`, `table` come back HTML; and a tag added to SVG after this
 * was written comes back right too, with nothing to update here.
 *
 * A product supplies the tag it draws each node type as, by rendering it. That
 * is a measurement rather than a declaration on purpose: a product that *says*
 * what it draws can say something that stopped being true.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Which namespace a tag belongs to, according to the parser.
 *
 * Asked once per tag and remembered, since a check compares the same handful of
 * tags across every containment edge in a schema.
 */
const namespaceCache = new Map<string, string | null>();

function namespaceOf(tag: string): string | null {
  const known = namespaceCache.get(tag);
  if (known !== undefined) return known;

  let answer: string | null = null;
  try {
    /**
     * Two questions, because neither alone gives the answer.
     *
     * **Is it a name HTML knows?** `createElement` returns a specific interface
     * for one and `HTMLUnknownElement` for anything else, in every DOM there is.
     * That settles `div`, `section`, `thead`, `tr` — and a custom element, which
     * is HTML however unfamiliar the name looks.
     *
     * **Otherwise, does the parser keep it inside an `<svg>`?** The HTML5
     * foreign-content rules break a fixed list of names out of SVG back into
     * HTML, and keep everything else. That settles `rect`, `ellipse`, `line`,
     * `g`, `text`, `path`.
     *
     * The parser test alone was tried first and is wrong on its own: the
     * breakout list is short, so `thead`, `tr` and `section` all "stay" in SVG
     * and every table in the schema was reported as drawn in the wrong
     * namespace. Thirty-six findings, none of them real. It is the *second*
     * question, not the first.
     */
    if (document.createElement(tag).constructor.name !== 'HTMLUnknownElement') {
      answer = HTML_NS;
    } else {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.innerHTML = `<${tag}></${tag}>`;
      answer = svg.firstElementChild?.namespaceURI ?? null;
    }
  } catch {
    // A tag neither DOM call will accept says nothing either way, and a check
    // that guessed here would be worse than one that abstains.
    answer = null;
  }

  namespaceCache.set(tag, answer);
  return answer;
}

/** For the message: the word a reader uses for the namespace. */
function nameOf(namespace: string | null): string {
  if (namespace === SVG_NS) return 'SVG';
  if (namespace === HTML_NS) return 'HTML';
  return 'an unknown namespace';
}

export const everyDrawingCanHoldWhatItContains: Check = {
  name: 'every-drawing-can-hold-what-it-contains',
  describe:
    'a node type drawn in one namespace is not allowed to contain a node type drawn in another',

  run: ({ schema, drawnAs }) => {
    const findings: Finding[] = [];
    let examined = 0;

    // Without a way to see what a product draws, this check has nothing to
    // measure. It abstains rather than guessing, and `examined: 0` says so.
    if (!drawnAs) return { findings, examined };

    const placeable = placeableTypes(schema.nodes, schema.topNode ?? 'document');
    const tagOf = new Map<string, string | null>();
    const tag = (type: string): string | null => {
      if (!tagOf.has(type)) tagOf.set(type, drawnAs(type));
      return tagOf.get(type) ?? null;
    };

    for (const [parent] of schema.nodes) {
      if (!placeable.has(parent)) continue;

      const parentTag = tag(parent);
      if (!parentTag) continue;
      const parentNs = namespaceOf(parentTag);
      if (!parentNs) continue;

      for (const child of childTypes(schema.nodes, parent)) {
        if (!placeable.has(child)) continue;

        const childTag = tag(child);
        if (!childTag) continue;
        const childNs = namespaceOf(childTag);
        if (!childNs) continue;

        examined += 1;
        if (parentNs === childNs) continue;

        /**
         * The two ways across the boundary that are legal, and no others.
         *
         * `<foreignObject>` is SVG's own door back into HTML, and an `<svg>`
         * root is HTML's door into SVG. Everything else drawn across the line is
         * an element the layout will not place.
         */
        if (parentTag === 'foreignObject' && childNs === HTML_NS) continue;
        if (parentNs === HTML_NS && childTag === 'svg') continue;

        findings.push({
          check: 'every-drawing-can-hold-what-it-contains',
          subject: `${parent} > ${child}`,
          detail:
            `the schema lets \`${parent}\` contain \`${child}\`, and the product draws ` +
            `\`${parent}\` as <${parentTag}> in ${nameOf(parentNs)} and \`${child}\` as ` +
            `<${childTag}> in ${nameOf(childNs)}. A <${childTag}> inside a <${parentTag}> ` +
            `is kept by the parser and never laid out, so a document holding one would ` +
            `draw an empty <${parentTag}>. Draw both in one namespace, or exempt the pair ` +
            `with the reason a document never holds it.`
        });
      }
    }

    return { findings, examined };
  }
};
