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
import { iGa } from './korean';
import { isPageRef, pageIdOf } from './page-link';
import { isVarRef, varNameOf } from '@barocss/office-canvas';

type Node = Record<string, any>;
type Access = { rootId: string; getNode: (sid: string) => Node | undefined };

/** What a reference points at. One word per kind, and every kind this schema has. */
export type RefKind = 'page' | 'component' | 'dataset' | 'field' | 'asset' | 'variable' | 'service' | 'richText';

/**
 * **어떻게 가리키나** — the three shapes a reference has in this schema, which is not the same
 * question as what it points at.
 *
 * It earns a field because it is what a reader has to *go and fix*. Told that deleting 가격 breaks
 * eleven things, the useful sentence is which eleven: a link inside a sentence is found by reading
 * the words, a `goes` is found by selecting the card and opening its panel, and a cell is found in
 * the data editor. Three different places, and a single total sends the reader to look in the wrong
 * one.
 */
export type RefVia = 'mark' | 'attr' | 'cell';

export interface Ref {
  /** The node that holds the reference — what a reader would click to fix it. */
  from: string;
  /** The page or definition that node is in, which is what a split store would key by. */
  in: string;
  kind: RefKind;
  /** The name it points at: a page's id, a column's name, a definition's id. */
  to: string;
  via: RefVia;
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
      found.push({ from: sid, in: mine, kind: 'component', to: attrs.componentId, via: 'attr' });
    }
    /* A page a template draws is one too — the same reference, said by a page rather than a block. */
    if (stype === 'surface' && typeof attrs.template === 'string' && attrs.template) {
      found.push({ from: sid, in: mine, kind: 'component', to: attrs.template, via: 'attr' });
    }
    /* A list and a chart both name a dataset. */
    if ((stype === 'collection' || stype === 'chart') && typeof attrs.source === 'string' && attrs.source) {
      found.push({ from: sid, in: mine, kind: 'dataset', to: attrs.source, via: 'attr' });
    }
    /* A form names a service. */
    if (stype === 'form' && typeof attrs.sends === 'string' && attrs.sends) {
      found.push({ from: sid, in: mine, kind: 'service', to: attrs.sends, via: 'attr' });
    }

    /*
     * And every attribute that *is* a reference, whatever node it is on — which is the half a walk
     * written per node type keeps missing: `fill: 'var:강조'` is on any block, `src: 'asset:로고'` is
     * on a picture and on a background, and `field:제목` is on a placement's answers.
     */
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'string' || !value) continue;
      if (isPageRef(value)) found.push({ from: sid, in: mine, kind: 'page', to: pageIdOf(value), via: 'attr' });
      else if (isAssetRef(value)) {
        const name = assetNameOf(value);
        if (name) found.push({ from: sid, in: mine, kind: 'asset', to: name, via: 'attr' });
      } else if (isRichRef(value)) {
        const name = richNameOf(value);
        if (name) found.push({ from: sid, in: mine, kind: 'richText', to: name, via: 'attr' });
      } else if (isVarRef(value)) {
        const name = varNameOf(value);
        if (name) found.push({ from: sid, in: mine, kind: 'variable', to: name, via: 'attr' });
      } else {
        const field = fieldNameOf(value);
        if (field) found.push({ from: sid, in: mine, kind: 'field', to: field, via: 'attr' });
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
          if (isPageRef(value)) found.push({ from: sid, in: mine, kind: 'page', to: pageIdOf(value), via: 'cell' });
          else if (isRichRef(value)) {
            const name = richNameOf(value);
            if (name) found.push({ from: sid, in: mine, kind: 'richText', to: name, via: 'cell' });
          } else if (isAssetRef(value)) {
            const name = assetNameOf(value);
            if (name) found.push({ from: sid, in: mine, kind: 'asset', to: name, via: 'cell' });
          }
        }
      }
    }

    /**
     * A **link mark**, which is the one reference that is not an attribute: it lives on a run, over a
     * range of characters.
     *
     * The old `linksTo` counted these **and nothing else**, and its comment called that deliberate.
     * Measured against this index across the sample, the claim did not survive: of the 23 things
     * naming a page, 11 are marks, 9 are a card's `goes`, 2 are a row's cell and 1 is a form's
     * 감사 페이지. Six of the eight pages were being under-reported, and the two blog posts were
     * reported as **0** — *아무것도 가리키지 않습니다* said about a page the blog list points at from
     * a data row. Wrong in the direction that loses work.
     */
    for (const mark of (node.marks ?? []) as Node[]) {
      const href = mark?.attributes?.href ?? mark?.attrs?.href;
      if (typeof href === 'string' && isPageRef(href)) {
        found.push({ from: sid, in: mine, kind: 'page', to: pageIdOf(href), via: 'mark' });
      }
    }

    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, mine, depth + 1);
    }
  };

  walk(doc.rootId, doc.rootId, 0);
  return found;
}

/**
 * **이걸 지우면 무엇이 끊어지나** — everything naming one thing, split by where a reader would find it.
 *
 * The number alone was the old answer and it was both wrong and unactionable. This is the sentence
 * the delete dialog can say: *링크 3개, 이동 5개, 데이터 2칸*. Three counts because they are three
 * different repairs — retype a sentence, open a card's panel, edit a row — and a reader who is told
 * *8개* looks in the words for all eight and finds three.
 *
 * `total` is here so that the one place that only needs *is it safe* does not have to add three
 * numbers and get it wrong.
 */
export interface Breakage {
  /** A link over words. */
  links: number;
  /** A block that goes there when it is clicked, or a form's 감사 페이지. */
  moves: number;
  /** A cell in a dataset's row. */
  cells: number;
  total: number;
}

export function breaksIfGone(refs: Ref[], kind: RefKind, to: string): Breakage {
  const mine = refs.filter((one) => one.kind === kind && one.to === to);
  return {
    links: mine.filter((one) => one.via === 'mark').length,
    moves: mine.filter((one) => one.via === 'attr').length,
    cells: mine.filter((one) => one.via === 'cell').length,
    total: mine.length
  };
}

/**
 * That breakage as the sentence a dialog says, which is where the three counts have to earn
 * themselves or go back to being one.
 *
 * Only the parts that are not zero, because *링크 3개, 이동 0개, 데이터 0칸* is three facts to read
 * and one of them true. And the last sentence is per-kind for the same reason: a broken link draws
 * as ordinary words and a reader would never find it, which is worth saying; a card that does
 * nothing when clicked is its own report.
 */
export function breakageSaid(breaks: Breakage): string {
  if (breaks.total === 0) return '이 페이지를 가리키는 것이 없습니다.';

  const parts: string[] = [];
  if (breaks.links > 0) parts.push(`링크 ${breaks.links}개`);
  if (breaks.moves > 0) parts.push(`이동 ${breaks.moves}개`);
  if (breaks.cells > 0) parts.push(`데이터 ${breaks.cells}칸`);

  const said = parts.join(', ');
  const tail = breaks.links > 0 ? ' 끊어진 링크는 그냥 글자로 보입니다.' : '';
  return `이 페이지를 가리키는 ${said}${iGa(said)} 끊어집니다.${tail}`;
}


/** How many references of a kind point at each name — `usesOf` and the page counts, from one walk. */
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
