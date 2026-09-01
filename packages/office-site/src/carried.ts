/**
 * **What a copied block has to travel with**, and what a paste does with it.
 *
 * ## The hole this closes
 *
 * A page's blocks are full of **references**, and every one of them is a name that means nothing in
 * another document. Five, by now:
 *
 * | on a block | names |
 * |---|---|
 * | `instance.componentId` | a definition in `components` |
 * | `collection.source` | a dataset in `resources` |
 * | `picture.src` = `asset:이름` | a file in `resources` |
 * | `form.sends` | a connection in `resources` |
 * | any paint = `var:이름` | a variable |
 *
 * Copy a card into a document that does not define its component and the paste **succeeds**: an
 * empty placement, drawing nothing, with nothing anywhere saying why. The deck measured exactly this
 * and fixed it for its one reference (`paste-cards.ts`); a page has five, so the same fault has five
 * shapes and only one of them was ever going to be noticed by accident.
 *
 * ## What travels, and what a paste does with it
 *
 * The clipboard carries the *definitions* the copied blocks point at, and a paste adds the ones the
 * destination has not got. **By name**, which is the whole reason it works: a document that already
 * has a `강조` keeps its own, and a card pasted into a site with a different brand comes out in that
 * site's colours — which is what a reader means by pasting a card into their site.
 *
 * ## What it deliberately does not do
 *
 * **It does not rename.** A destination with a different `상품` dataset gets the paste pointing at
 * *its* `상품`, not at a `상품 2` nobody asked for. A name is a reference and a reference is meant to
 * resolve to whatever the document means by that name — the same rule `var:이름` follows everywhere
 * else, and the reason a component placed on five pages is one component.
 *
 * The cost is stated rather than hidden: two documents that use one name for two things will produce
 * a paste that draws the destination's. That is a real surprise and it is the smaller one — the
 * alternative is a document that quietly accumulates `상품 2`, `상품 3` every time anybody pastes.
 */
import { componentsOf, documentVars, isVarRef, varNameOf, type CanvasAccess } from '@barocss/office-canvas';
import { assetNameOf, assetsOf } from './assets';
import { servicesOf } from './form';
import { datasetsOf } from './data';
import { sameName } from './names';

/**
 * What reading a document for a copy needs: its root, its nodes, and a whole tree for one of them.
 *
 * `treeAt` is separate from `getNode` because a stored node's `content` is a list of **sids**, not
 * its parts — walking one would find no children at all, and a carried definition made of sids is a
 * definition that means nothing in the document it is pasted into.
 */
export interface CarrySource {
  rootId: string;
  getNode(sid: string): any;
  treeAt(sid: string): unknown;
}

type Access = CarrySource;

/** The definitions a copied selection points at, as whole trees with no sids. */
export interface Carried {
  components: unknown[];
  datasets: unknown[];
  assets: unknown[];
  services: unknown[];
  variables: unknown[];
}

const EMPTY: Carried = { components: [], datasets: [], assets: [], services: [], variables: [] };

/** Every name a tree refers to, by kind — walked once. */
/**
 * **What a block refers to, by name** — the five kinds of reference this document model has.
 *
 * Exported because it answers a second question as well as the one it was written for. Carrying a
 * paste needs to know what travels with it; a reader looking at a block needs to know what it
 * *depends on*, which is the same list — and it is the one thing about a block that the property
 * panel cannot show, because a reference is not a property of any one row.
 */
export function namesIn(tree: unknown, found = {
  components: new Set<string>(),
  datasets: new Set<string>(),
  assets: new Set<string>(),
  services: new Set<string>(),
  variables: new Set<string>()
}, depth = 0): typeof found {
  if (!tree || typeof tree !== 'object' || depth > 64) return found;

  const node = tree as Record<string, any>;
  const attrs = (node.attributes ?? {}) as Record<string, unknown>;

  if (typeof attrs.componentId === 'string') found.components.add(attrs.componentId);
  if (typeof attrs.source === 'string') found.datasets.add(attrs.source);
  if (typeof attrs.sends === 'string') found.services.add(attrs.sends);
  for (const one of [attrs.src, attrs.icon]) {
    const name = assetNameOf(one);
    if (name) found.assets.add(name);
  }
  /*
   * A `var:이름` can be the value of **any** paint attribute — a fill, a stroke, a shadow's colour —
   * so this reads the values rather than a list of keys. A list would be a second place to remember
   * every colour attribute, and it would be wrong the first time one was added.
   */
  for (const value of Object.values(attrs)) {
    if (isVarRef(value)) found.variables.add(varNameOf(value));
  }

  for (const child of (node.content ?? []) as unknown[]) namesIn(child, found, depth + 1);
  return found;
}

/**
 * What these blocks need in order to draw somewhere else.
 *
 * A component's own parts are walked too, because a card holds a card: a placement inside a
 * definition names a second definition, and carrying the first without the second is the same empty
 * box one level down.
 */
export function carriedFor(doc: Access, trees: readonly unknown[]): Carried {
  const wanted = namesIn({ content: trees });

  const defs = componentsOf(doc as never as CanvasAccess);
  const components: unknown[] = [];
  const seen = new Set<string>();

  const take = (id: string, depth = 0) => {
    if (seen.has(id) || depth > 8) return;
    const found = defs.find((one) => one.id === id);
    if (!found) return;
    seen.add(id);

    const tree = doc.treeAt(found.sid);
    if (!tree) return;
    components.push(tree);
    // And whatever *it* points at, which is how a card that holds a card travels whole.
    const inside = namesIn(tree);
    for (const one of inside.components) take(one, depth + 1);
    for (const one of inside.datasets) wanted.datasets.add(one);
    for (const one of inside.assets) wanted.assets.add(one);
    for (const one of inside.services) wanted.services.add(one);
    for (const one of inside.variables) wanted.variables.add(one);
  };
  for (const id of wanted.components) take(id);

  const variables: unknown[] = [];
  for (const one of documentVars(doc as never as CanvasAccess)) {
    if (!wanted.variables.has(one.name)) continue;
    const tree = doc.treeAt(one.sid);
    if (tree) variables.push(tree);
  }

  const at = (sid: string | undefined) => (sid ? doc.treeAt(sid) : undefined);
  const some = (found: unknown[]) => found.filter((one) => !!one);

  return {
    components,
    datasets: some(
      datasetsOf(doc as never)
        .filter((one) => wanted.datasets.has(one.name))
        .map((one) => at(one.sid))
    ),
    assets: some(
      assetsOf(doc as never)
        .filter((one) => wanted.assets.has(one.name))
        .map((one) => at(one.sid))
    ),
    services: some(
      servicesOf(doc as never)
        .filter((one) => wanted.services.has(one.name))
        .map((one) => at(one.sid))
    ),
    variables
  };
}

/** Whether a document already has something of this kind under this name. */
const has = (held: readonly { name?: unknown; id?: unknown }[], want: unknown, key: 'name' | 'id') =>
  held.some((one) => sameName(one[key], want));

/**
 * What a paste has to **add** — the carried definitions this document has not got.
 *
 * By name, and never renamed: a document that already has a `강조` keeps its own, so a card pasted
 * into a site with a different brand comes out in that site's colours. See the header for why that is
 * the answer rather than a surprise.
 */
export function missingFrom(doc: Access, carried: Carried | undefined): Carried {
  if (!carried) return EMPTY;

  const defs = componentsOf(doc as never as CanvasAccess);
  const attrsOf = (one: unknown) => ((one as any)?.attributes ?? {}) as Record<string, unknown>;
  const variables = documentVars(doc as never as CanvasAccess);

  return {
    components: carried.components.filter((one) => !has(defs, attrsOf(one).id, 'id')),
    datasets: carried.datasets.filter((one) => !has(datasetsOf(doc as never), attrsOf(one).name, 'name')),
    assets: carried.assets.filter((one) => !has(assetsOf(doc as never), attrsOf(one).name, 'name')),
    services: carried.services.filter((one) => !has(servicesOf(doc as never), attrsOf(one).name, 'name')),
    variables: carried.variables.filter((one) => !has(variables, attrsOf(one).name, 'name'))
  };
}

/** Which container each kind of carried thing goes into, and in what order they are added. */
export const CARRIED_HOMES: { key: keyof Carried; box: string }[] = [
  { key: 'variables', box: 'variables' },
  { key: 'assets', box: 'resources' },
  { key: 'datasets', box: 'resources' },
  { key: 'services', box: 'resources' },
  /*
   * Components **last**, because one may point at a dataset or a file that has just been added: a
   * definition added before what it needs is a definition that is momentarily broken, and a check
   * that ran between the two would say so.
   */
  { key: 'components', box: 'components' }
];

/** The container of this kind under the root, for a paste to add into. */
/**
 * **Where a name is used**, which is `namesIn` read the other way.
 *
 * A reader who changes a colour, renames a dataset or edits a card wants to know what they are about
 * to change — and this product's whole reference shape means the answer is always *somewhere else*.
 * Six references, five kinds, and nothing in the editor ever said who was pointing at what.
 *
 * Answered per **page and definition**, because that is where a reader would go to look, and not per
 * block: a list of forty sids is not something anybody reads.
 *
 * `components.ts` has a `usesOf` that counts placements per definition — the same question narrowed
 * to one kind and answered as a number. This says *which*, for all five.
 */
export function whereUsed(
  doc: Access,
  kind: 'components' | 'datasets' | 'assets' | 'services' | 'variables',
  name: string
): { sid: string; label: string; kind: 'page' | 'component' }[] {
  if (!name) return [];
  const found: { sid: string; label: string; kind: 'page' | 'component' }[] = [];

  const holders: { sid: string; label: string; kind: 'page' | 'component' }[] = [];
  for (const child of (doc.getNode(doc.rootId)?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const node = doc.getNode(child) as Record<string, any> | undefined;
    if (node?.stype === 'surface') {
      holders.push({
        sid: child,
        label: typeof node.attributes?.name === 'string' ? node.attributes.name : '이름 없는 페이지',
        kind: 'page'
      });
      continue;
    }
    if (node?.stype !== 'components') continue;
    for (const one of (node.content ?? []) as unknown[]) {
      if (typeof one !== 'string') continue;
      const each = doc.getNode(one) as Record<string, any> | undefined;
      holders.push({
        sid: one,
        label:
          (typeof each?.attributes?.name === 'string' && each.attributes.name) ||
          (typeof each?.attributes?.id === 'string' ? each.attributes.id : '이름 없는 컴포넌트'),
        kind: 'component'
      });
    }
  }

  for (const holder of holders) {
    const tree = doc.treeAt(holder.sid);
    if (!tree) continue;
    if (namesIn(tree)[kind].has(name)) found.push(holder);
  }
  return found;
}

export function boxOf(doc: Access, stype: string): { sid: string } | undefined {
  for (const child of (doc.getNode(doc.rootId)?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    if (doc.getNode(child)?.stype === stype) return { sid: child };
  }
  return undefined;
}

/** Whether a paste has anything to add at all — cheaper to ask than to compare five lists twice. */
export function anyCarried(carried: Carried | undefined): boolean {
  return !!carried && CARRIED_HOMES.some(({ key }) => carried[key].length > 0);
}
