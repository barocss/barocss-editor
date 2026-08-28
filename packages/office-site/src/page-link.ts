/**
 * A link to another page of this site.
 *
 * ## What was missing, and how it showed
 *
 * The sample site has five pages with addresses and a navigation row reading 제품 · 가격 · 소개 ·
 * 블로그, and the page it drew had **zero `<a>` elements**. Half of that was the `link` mark drawing
 * nothing at all, which was a shared fault and is fixed in `office-text`. This is the other half: a
 * link mark carries an `href`, and nothing turned a page of this site into one.
 *
 * ## Why not just write the path
 *
 * Because a path changes. A reader renames `/제품` to `/products` and every link that spelled the old
 * one goes to a page that no longer answers — silently, because a broken internal link looks exactly
 * like a working one until it is followed.
 *
 * So a link names the page's **durable id** and the address is resolved at draw time, which is the
 * answer this schema already gives three times over:
 *
 * - a colour that follows a token is `var:강조`, not a hex (`office-canvas`'s `isVarRef`);
 * - a placement names its definition by `componentId`, never by sid;
 * - a list names its dataset by `name`, and `forFile` strips sids precisely so that a reference
 *   cannot be one.
 *
 * `page:<id>` is the fourth, written the same way and resolved in the same place a drawing happens —
 * so the editor and the published page agree by construction rather than by both remembering.
 *
 * ## And an address that is not a page stays an address
 *
 * A link to `https://…` or to `mailto:` is an ordinary link and passes through untouched. Only the
 * `page:` prefix is this product's, which is why it is a prefix at all: a reader typing an address
 * that happens to be a page's id would otherwise get a link somewhere they did not mean.
 */

import { pagesOf } from './selection';

/** How a link says "a page of this site", as opposed to an address. */
export const PAGE_PREFIX = 'page:';

type Node = Record<string, any>;
type Access = { rootId: string; getNode: (sid: string) => Node | undefined };

/**
 * Whether an `href` names a page of this document rather than an address.
 *
 * The predicate is the **prefixed** type rather than `string`, which is not pedantry: as
 * `href is string` the *false* branch of a call on a known string narrows to `never`, so the first
 * function that asked "not a page reference, then what kind of address is it" could not call a single
 * method on the answer. `page:${string}` leaves a string a string on the way out.
 */
export function isPageRef(href: unknown): href is `page:${string}` {
  return typeof href === 'string' && href.startsWith(PAGE_PREFIX);
}

/** The page id a reference names — `page:홈` is `홈`. */
export function pageIdOf(href: string): string {
  return href.slice(PAGE_PREFIX.length);
}

/** A reference to a page, from its durable id. */
export function pageRef(id: string): string {
  return `${PAGE_PREFIX}${id}`;
}

/**
 * What a link's `href` should actually be, at the moment it is drawn.
 *
 * A page reference becomes that page's current `path`; anything else is returned as it is.
 *
 * **A reference to a page that is gone becomes nothing**, not the raw `page:…` text. A reader who
 * deletes a page has broken the links into it either way, and an `<a>` with no `href` is the one
 * shape a browser draws as *not a link* — which is the honest drawing of a link with nowhere to go,
 * and the one a reader can see rather than discover by clicking.
 */
export function hrefFor(doc: Access | undefined, href: unknown): string | undefined {
  if (typeof href !== 'string' || href.length === 0) return undefined;
  if (!isPageRef(href)) return href;
  if (!doc) return undefined;

  const id = pageIdOf(href);
  const found = pagesIn(doc).find((page) => page.id === id);
  return found?.path;
}

/** The page a text node's link names, if it names one rather than an address. */
export function pageLinkOf(node: Node | undefined): string | undefined {
  const href = linkOf(node);
  return isPageRef(href) ? pageIdOf(href) : undefined;
}

/**
 * The **address** a text node's link names, if it names one rather than a page.
 *
 * `pageLinkOf`'s other half, and it did not exist because for a while nothing could write one: the
 * toolbar offered a page picker and no way to type `https://…` at all, so every link on a page this
 * product built was internal by construction. That made `pageLinkOf` a complete answer to *is there
 * a link here*, and the ribbon used it as one — the 링크 없음 button asks it and would have been grey
 * over an address link, which is a control that greys itself out of a job the moment the job exists.
 */
export function addressLinkOf(node: Node | undefined): string | undefined {
  const href = linkOf(node);
  return typeof href === 'string' && !isPageRef(href) ? href : undefined;
}

/**
 * The `href` of the first link mark on a node, whatever kind it is.
 *
 * One walk, so *is there a link* and *what kind of link* cannot answer differently — which they did:
 * the ribbon asked `pageLinkOf` for both questions and got "no link" for an address.
 */
export function linkOf(node: Node | undefined): string | undefined {
  for (const mark of (node?.marks ?? []) as Node[]) {
    const href = mark?.attributes?.href ?? mark?.attrs?.href;
    if (typeof href === 'string' && href.length > 0) return href;
  }
  return undefined;
}

/**
 * An address as a reader typed it, made into one a browser can follow — or nothing.
 *
 * ## Why a builder normalises this and a word processor need not
 *
 * A reader linking a card to their shop types `barocss.com`, because that is what the address *is*
 * to them. Written into an `href` unchanged it is a **relative** path: the browser reads it against
 * the current page and goes to `/제품/barocss.com`, which does not exist. Every builder of this kind
 * normalises for exactly this reason, and the failure it prevents is the worst kind — the link is
 * drawn, it is clickable, it looks right, and it is wrong only once somebody follows it.
 *
 * ## What is left alone
 *
 * Anything that already says how to be followed. A scheme (`https:`, `mailto:`, `tel:`), a root-
 * relative path (`/가격`), a fragment (`#요금`) and a protocol-relative address are all deliberate,
 * and a builder that "helpfully" prefixed them would break the three most useful ones.
 *
 * And `page:` is refused rather than normalised: it is this product's own mechanism for naming a
 * page, and a reader who types it means the letters, not a link to whatever `홈` happens to be.
 */
export function addressFor(typed: unknown): string | undefined {
  if (typeof typed !== 'string') return undefined;
  const said = typed.trim();
  if (said.length === 0) return undefined;
  if (isPageRef(said)) return undefined;

  // Already says how to be followed.
  if (/^[a-z][a-z0-9+.-]*:/i.test(said) || said.startsWith('//') || said.startsWith('/') || said.startsWith('#')) {
    return said;
  }
  /*
   * And otherwise it is a host, which is the case this exists for. `https` rather than `http`
   * because a site published today is served over it and a builder that writes the other one is
   * writing a redirect at best and a warning at worst.
   */
  return `https://${said}`;
}

/**
 * Every page of this document, as a link could name one.
 *
 * `pagesOf` is the walk — pages are the root's own children, which is a fact about this schema
 * rather than about links — and this is that list narrowed to the pages a reference can *reach*: a
 * page with no id is a page no link can name, and offering one in the picker would write a
 * reference to `page:` and nothing.
 */
export function pagesIn(doc: Access): { sid: string; id: string; name: string; path: string }[] {
  return pagesOf(doc as never).filter((page) => page.id !== '');
}

/**
 * How many links point at a page — the number a reader needs *before* they delete it.
 *
 * `linkFaults` is the report afterwards, and afterwards is too late to be a decision: a link into a
 * page that is gone draws as ordinary words, so the cost of removing a page is the one thing about
 * it that is not on screen.
 */
export function linksTo(doc: Access, id: string): number {
  let count = 0;

  const walk = (sid: string, depth = 0) => {
    if (depth > 64) return;
    const node = doc.getNode(sid);
    if (!node) return;

    for (const mark of (node.marks ?? []) as Node[]) {
      const href = mark?.attributes?.href ?? mark?.attrs?.href;
      if (isPageRef(href) && pageIdOf(href) === id) count += 1;
    }
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, depth + 1);
    }
  };
  walk(doc.rootId);

  return count;
}

/**
 * The links in this document that name a page which is not there.
 *
 * The sibling of `collectionFaults` and `overrideFaults`, and worth having for the same reason: a
 * reference that resolves to nothing is invisible in the drawing — an `<a>` with no `href` reads as
 * ordinary words — so the product has to be able to *say* it rather than leave a reader to click.
 */
export function linkFaults(doc: Access): { sid: string; href: string; missing: string }[] {
  const pages = new Set(pagesIn(doc).map((page) => page.id));
  const faults: { sid: string; href: string; missing: string }[] = [];

  const walk = (sid: string, depth = 0) => {
    if (depth > 64) return;
    const node = doc.getNode(sid);
    if (!node) return;

    for (const mark of (node.marks ?? []) as Node[]) {
      const href = mark?.attributes?.href ?? mark?.attrs?.href;
      if (isPageRef(href) && !pages.has(pageIdOf(href))) {
        faults.push({ sid, href, missing: pageIdOf(href) });
      }
    }
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') walk(child, depth + 1);
    }
  };
  walk(doc.rootId);

  return faults;
}
