/**
 * **무엇이 무엇을 쓰는가** — one walk, answering every question that crosses a page.
 *
 * ## Why this exists, measured rather than argued
 *
 * Three questions this product asks are about the **whole site**, and all three were three separate
 * walks of every node of every page:
 *
 * - `usesOf` — *머리말이 6곳에서 쓰입니다*, the sentence that has to be said before anybody edits a
 *   definition, because editing one changes every page it is placed on.
 * - `linksTo` — *이 페이지를 지우면 링크 3개가 끊어집니다*, the moment before a link breaks silently.
 * - `documentFaults` — whether every reference in the site points at something.
 *
 * They are the admin screen. Drawing it walked the document three times over, and the sample is 740
 * nodes; a site of sixty pages is five thousand, on every keystroke that redraws it.
 *
 * ## And it is the shape the next thing needs
 *
 * `docs/specs/site-builder.md` — *모든 것이 문서는 아니다* — records where this model is going: a
 * page's body stays a document and everything around it becomes service information. The moment
 * pages are separate documents, none of those three questions can be a walk at all: *what uses what*
 * has to be **written down when a page is saved**.
 *
 * So this is that index, built by walking today and looked up the same way it will be looked up
 * then. Which is the point — the callers do not change when the store does.
 *
 * ## What a reference is
 *
 * Every one of the nine shapes this schema uses, and they are deliberately in one table rather than
 * nine: a reference is *a name that resolves somewhere else*, and the questions asked of them are the
 * same three whatever the name points at — who uses this, what does this use, and does it resolve.
 */
import { isAssetRef, assetNameOf } from './assets';
import { fieldNameOf, isRichRef, richNameOf } from './data';
import { isPageRef, pageIdOf } from './page-link';
import { isVarRef, varNameOf } from '@barocss/office-canvas';

type Node = Record<string, any>;
type Access = { rootId: string; getNode: (sid: string) => Node | undefined };

/** What a reference points at. One word per kind, and every kind this schema has. */
export type RefKind = 'page' | 'component' | 'dataset' | 'field' | 'asset' | 'variable' | 'service' | 'richText';

export interface Ref {
  /** The node that holds the reference — what a reader would click to fix it. */
  from: string;
  /** The page or definition that node is in, which is what a split store would key by. */
  in: string;
  kind: RefKind;
  /** The name it points at: a page's id, a column's name, a definition's id. */
  to: string;
}

/**
 * Every reference in the document, with where it was written.
 *
 * One walk. The three questions above are then `filter`s over the result, which is the whole saving:
 * the walk is the expensive part and there is one of it.
 */
export function refsIn(doc: Access): Ref[] {
  const found: Ref[] = [];

  /**
   * Which **page or definition** a node is in, carried down rather than walked up.
   *
   * Walking up per node is the same walk again once per node, and this is the index that exists to
   * stop doing that. It is also the field a split store keys by: when a page is its own document,
   * `in` is the document the reference was written in.
   */
  const walk = (sid: string, owner: string, depth: number) => {
    if (depth > 64) return;
    const node = doc.getNode(sid);
    if (!node) return;

    const stype = String(node.stype ?? '');
    const mine = stype === 'surface' || stype === 'component' ? sid : owner;
    const attrs = (node.attributes ?? {}) as Record<string, unknown>;

    /* A placement names a definition. */
    if (stype === 'instance' && typeof attrs.componentId === 'string' && attrs.componentId) {
      found.push({ from: sid, in: mine, kind: 'component', to: attrs.componentId });
    }
    /* A page a template draws is one too — the same reference, said by a page rather than a block. */
    if (stype === 'surface' && typeof attrs.template === 'string' && attrs.template) {
      found.push({ from: sid, in: mine, kind: 'component', to: attrs.template });
    }
    /* A list and a chart both name a dataset. */
    if ((stype === 'collection' || stype === 'chart') && typeof attrs.source === 'string' && attrs.source) {
      found.push({ from: sid, in: mine, kind: 'dataset', to: attrs.source });
    }
    /* A form names a service. */
    if (stype === 'form' && typeof attrs.sends === 'string' && attrs.sends) {
      found.push({ from: sid, in: mine, kind: 'service', to: attrs.sends });
    }

    /*
     * And every attribute that *is* a reference, whatever node it is on — which is the half a walk
     * written per node type keeps missing: `fill: 'var:강조'` is on any block, `src: 'asset:로고'` is
     * on a picture and on a background, and `field:제목` is on a placement's answers.
     */
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'string' || !value) continue;
      if (isPageRef(value)) found.push({ from: sid, in: mine, kind: 'page', to: pageIdOf(value) });
      else if (isAssetRef(value)) {
        const name = assetNameOf(value);
        if (name) found.push({ from: sid, in: mine, kind: 'asset', to: name });
      } else if (isRichRef(value)) {
        const name = richNameOf(value);
        if (name) found.push({ from: sid, in: mine, kind: 'richText', to: name });
      } else if (isVarRef(value)) {
        const name = varNameOf(value);
        if (name) found.push({ from: sid, in: mine, kind: 'variable', to: name });
      } else {
        const field = fieldNameOf(value);
        if (field) found.push({ from: sid, in: mine, kind: 'field', to: field });
      }
      void key;
    }

    /**
     * **And the references inside a dataset's rows**, which no walk of attributes can see.
     *
     * `records` is an *array of objects* on one attribute — the shape `data.ts` chose deliberately,
     * because 500 rows as nodes is 4,000 things nothing ever selects. The cost was written down
     * there; this is a cost that was not: a cell holding `text:요약-스택` or `page:post-stack` is a
     * reference the document has, and every walk this product had looked at string attributes and
     * went straight past it.
     *
     * So a rich summary whose `richText` had been deleted, or a row pointing at a page that is gone,
     * was a broken reference **nothing could report**. Found by this index the first time it was
     * asked which kinds it can see.
     */
    if (stype === 'dataset') {
      for (const row of (attrs.records ?? []) as unknown[]) {
        if (!row || typeof row !== 'object') continue;
        for (const value of Object.values(row as Record<string, unknown>)) {
          if (typeof value !== 'string' || !value) continue;
          if (isPageRef(value)) found.push({ from: sid, in: mine, kind: 'page', to: pageIdOf(value) });
          else if (isRichRef(value)) {
            const name = richNameOf(value);
            if (name) found.push({ from: sid, in: mine, kind: 'richText', to: name });
          } else if (isAssetRef(value)) {
            const name = assetNameOf(value);
            if (name) found.push({ from: sid, in: mine, kind: 'asset', to: name });
          }
        }
      }
    }

    /*
     * A **link mark**, which is the one reference that is not an attribute: it lives on a run, over a
     * range of characters. `linksTo` counts these and nothing else, deliberately — one link drawn on
     * six pages through a definition is *one* link, and a reader deleting a page wants to know how
     * many links break, not how many drawings of them there are.
     */
    for (const mark of (node.marks ?? []) as Node[]) {
      const href = mark?.attributes?.href ?? mark?.attrs?.href;
      if (typeof href === 'string' && isPageRef(href)) {
        found.push({ from: sid, in: mine, kind: 'page', to: pageIdOf(href) });
      }
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, mine, depth + 1);
    }
  };

  walk(doc.rootId, doc.rootId, 0);
  return found;
}

/** How many references of a kind point at each name — `usesOf` and `linksTo`, from one walk. */
export function refCounts(refs: Ref[], kind: RefKind): Map<string, number> {
  const count = new Map<string, number>();
  for (const one of refs) {
    if (one.kind !== kind) continue;
    count.set(one.to, (count.get(one.to) ?? 0) + 1);
  }
  return count;
}

/**
 * What a **page or definition** refers to — the row a split store would write when it saves one.
 *
 * Named for what it is for rather than for what it does: this is the index entry, and the reason the
 * callers above take a `Ref[]` is that they should not care whether it came from a walk or from a
 * table.
 */
export function refsFrom(refs: Ref[], owner: string): Ref[] {
  return refs.filter((one) => one.in === owner);
}
