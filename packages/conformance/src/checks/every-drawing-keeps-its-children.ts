import { childTypes, placeableTypes } from '../placeable';
import { isHtmlTag } from './every-drawing-can-hold-what-it-contains';
import type { Check, Finding } from '../types';

/**
 * A node's drawing must be one the parser will *keep* its children inside.
 *
 * The sibling of `every-drawing-can-hold-what-it-contains`, asking the second
 * way a renderer can exist, run without error, produce elements, and put the
 * wrong thing on the page.
 *
 * That check is about namespaces: an HTML element inside an `<svg>` is kept and
 * never laid out. This one is about HTML's own structure. Some elements accept
 * only certain children, and the parser does not merely disapprove — it *moves
 * the child out*. `<thead><th>` becomes a `<thead>` with a `<tr>` the author
 * never wrote, or the cell foster-parented before the table entirely. Nothing
 * errors, and what is on the page is not what the renderer built.
 *
 * **Written after meeting it by hand.** Word drew `bTableHeader` as `<thead>`
 * and its cells as `<th>`, because the schema says a header holds its cells
 * directly — "a header IS a row". Browsers render it, which is why it survived,
 * and it is not HTML: anything reading the table as a table — a screen reader,
 * `querySelectorAll('tr')`, a copy into another application — sees a header with
 * no rows in it. The fix was one line; the check is so the next one is found
 * rather than met.
 *
 * ## Asked of the parser, not of a list
 *
 * The same decision the namespace check made, for the same reason: a
 * hand-written table of which element may contain which is a note, and notes
 * rot. The HTML parsing algorithm already knows — it is the thing that does the
 * moving — so this writes `<child>` inside a `<parent>` and reads back whether
 * the child is still there.
 *
 * What that scopes the check to is exactly right: it reports the pairs a browser
 * actually rearranges, which is the set that actually breaks. A pair the spec
 * frowns on and the parser leaves alone draws what the renderer built, and is
 * not this check's business.
 */

/** Whether the parser keeps a `<child>` written directly inside a `<parent>`. */
const keepsCache = new Map<string, boolean>();
const contextCache = new Map<string, string>();

/**
 * Where a `<parent>` has to be written for the parser to keep it at all.
 *
 * Asked rather than listed, like everything else here: a `<thead>` written into
 * a `<div>` is dropped on the floor, so testing what it may contain has to
 * happen inside a `<table>`. Anything that survives in a `<div>` is tested
 * there.
 */
function contextFor(parent: string): string {
  const known = contextCache.get(parent);
  if (known !== undefined) return known;

  let answer = 'div';
  try {
    const box = document.createElement('div');
    box.innerHTML = `<${parent}></${parent}>`;
    if (box.firstElementChild?.tagName.toLowerCase() !== parent.toLowerCase()) answer = 'table';
  } catch {
    answer = 'div';
  }

  contextCache.set(parent, answer);
  return answer;
}

/**
 * Parse `<parent><child></child></parent>` in a context that keeps the parent,
 * and hand back the parent element as the parser built it.
 *
 * The context matters more than it looks. Parsing *with the parent itself* as
 * the context element — which is what `innerHTML` on a `<table>` does — hides
 * the loudest rearrangement HTML makes: a `<p>` inside a `<table>` is **foster
 * parented** to just before the table, and with the table as context that
 * position is the fragment root, so the paragraph comes back looking like a
 * child that was kept. Written inside a real `<div>` wrapper, the same parse
 * puts the paragraph beside the table where it belongs, and the table is empty.
 */
function parsedPair(parent: string, child: string): Element | null {
  const box = document.createElement(contextFor(parent));
  box.innerHTML = `<${parent}><${child}></${child}></${parent}>`;
  return box.querySelector(parent);
}

function parserKeeps(parent: string, child: string): boolean {
  const key = `${parent}>${child}`;
  const known = keepsCache.get(key);
  if (known !== undefined) return known;

  let answer = true;
  try {
    const built = parsedPair(parent, child);
    const first = built?.firstElementChild;
    answer = !!first && first.tagName.toLowerCase() === child.toLowerCase();
  } catch {
    // A tag the environment will not create tells us nothing; say it is fine
    // rather than reporting a fault in the harness as a fault in the product.
    answer = true;
  }

  keepsCache.set(key, answer);
  return answer;
}

/** What the parser did with it instead, so a finding can say what went wrong. */
function insteadGot(parent: string, child: string): string {
  try {
    const first = parsedPair(parent, child)?.firstElementChild;
    return first ? `<${first.tagName.toLowerCase()}>` : `an empty <${parent}> — the child was moved out`;
  } catch {
    return 'nothing';
  }
}

export const everyDrawingKeepsItsChildren: Check = {
  name: 'every-drawing-keeps-its-children',
  describe:
    'a node type drawn as an element the parser would move its children out of is a drawing ' +
    'that is not what it was built as',

  run: ({ schema, drawnAs, holdsIn }) => {
    const findings: Finding[] = [];
    let examined = 0;

    // Nothing to measure without a way to see what a product draws. Abstains
    // rather than guessing, and `examined: 0` says so.
    if (!drawnAs) return { findings, examined };

    const placeable = placeableTypes(schema.nodes, schema.topNode ?? 'document');

    /** What a node draws as — the answer for the *child* of a pair. */
    const tagOf = new Map<string, string | null>();
    const tag = (type: string): string | null => {
      if (!tagOf.has(type)) tagOf.set(type, drawnAs(type));
      return tagOf.get(type) ?? null;
    };

    /**
     * What holds a node's children — the answer for the *parent* of a pair, and
     * not the same question. A renderer that draws a tree puts its content
     * somewhere inside it: a header drawn as `<thead>` holds its cells in a
     * `<tr>`, and only that answer decides whether a cell is legally placed.
     */
    const holderOf = new Map<string, string | null>();
    const holder = (type: string): string | null => {
      if (!holderOf.has(type)) holderOf.set(type, (holdsIn ?? drawnAs)(type));
      return holderOf.get(type) ?? null;
    };

    for (const [parent] of schema.nodes) {
      if (!placeable.has(parent)) continue;

      const parentTag = holder(parent);
      if (!parentTag) continue;

      for (const child of childTypes(schema.nodes, parent)) {
        if (!placeable.has(child)) continue;

        const childTag = tag(child);
        if (!childTag) continue;

        /**
         * HTML only. The question is what the HTML parser does with a pair, and
         * asking it about SVG is asking the wrong parser: it turns `<image>`
         * into `<img>` and has never heard of `<g>`, so Word's groups and
         * pictures came back reported as rearranged when they draw perfectly.
         * A pair across the two namespaces is the sibling check's, and a pair
         * inside SVG is nobody's — SVG has no foster parenting.
         */
        if (!isHtmlTag(parentTag) || !isHtmlTag(childTag)) continue;

        examined += 1;
        if (parserKeeps(parentTag, childTag)) continue;

        findings.push({
          check: 'every-drawing-keeps-its-children',
          subject: `${parent} > ${child}`,
          detail:
            `the schema lets \`${parent}\` contain \`${child}\`, and the product draws them as ` +
            `<${parentTag}> and <${childTag}>. The HTML parser does not keep a <${childTag}> ` +
            `directly inside a <${parentTag}>: it produces ${insteadGot(parentTag, childTag)} ` +
            `instead. Nothing errors and the page may even look right, but what is in the ` +
            `document is not what the renderer built — anything reading the markup as ` +
            `structure sees something else. Draw the element the parser expects between them, ` +
            `or exempt the pair with the reason a document never holds it.`
        });
      }
    }

    return { findings, examined };
  }
};
