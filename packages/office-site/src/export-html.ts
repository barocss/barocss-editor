/**
 * The page a visitor gets.
 *
 * ## Export is a **render**, not a second implementation
 *
 * The obvious way to write this is a walk over the document that builds HTML strings — and it is the
 * wrong way, for a reason that has nothing to do with effort. A site builder's whole claim is that
 * the thing on screen *is* the page; an exporter that computes its own `display: flex` is a second
 * answer to "what does a stack look like", and two answers drift. The first divergence would be a
 * page that looked right in the editor and wrong when published, which is the one failure this
 * product cannot have.
 *
 * So this renders. The same `DOMRenderer`, the same registry, the same renderers, the same env — into
 * a detached element instead of into the app — and then serialises what came out. There is nothing
 * for the two to disagree about because there are not two.
 *
 * ## Which makes it an instrument
 *
 * Because export is a render, comparing an exported page with what the editor drew is a real check
 * rather than a tautology: `export.test.ts` renders a page in the editor at 390 and asserts the
 * media query the export wrote for 390 says the same thing. A difference is a bug in one of them,
 * and there is exactly one place it can be.
 *
 * ## The one thing that is genuinely different
 *
 * The editor draws **one width per board**, told through the env. A published page has to answer at
 * every width *at once*, which is what a media query is. So the export renders the base width
 * inline — every style a renderer produces is an inline style, so the page needs no stylesheet for
 * it — and then, for each narrower width, asks the same functions for that width's answer and writes
 * down only what **differs**, keyed by the node.
 *
 * That is the same sentence the document makes: a narrower width says only what differs. The export
 * says it in CSS instead of in attributes.
 *
 * ## Why the styles are lifted out of the elements
 *
 * The renderers produce **inline** styles — which is right for an editor, where a drawing is rebuilt
 * whenever the model moves. It is fatal for a published page: an inline style beats a stylesheet, so
 * every media query was written correctly and did nothing. Measured in a real browser at 390 pixels,
 * on a row that stayed a row.
 *
 * So the export lifts each drawn element's style into a class of its own. Base and narrow then have
 * the same weight and the order decides, which is how CSS is meant to work — and the published page
 * is a stylesheet rather than a page of inline soup. No `!important` anywhere: a page a reader cannot
 * override with their own CSS is a page that is not really theirs.
 */
import { getGlobalRegistry } from '@barocss/dsl';
import { isVarRef, resolveVarValue } from '@barocss/office-canvas';
import { DOMRenderer } from '@barocss/renderer-dom';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { stackCss } from './renderers';
import { BREAKPOINTS, SITE_ENV_KEY, createSiteEnv, type BreakpointId } from './breakpoints';
import { BASE_BREAKPOINT, overridesOf } from './responsive';
import {
  STATES,
  attrsInState,
  hasStates,
  opensAtRest,
  opensOf,
  opensOneOf,
  selectorIn,
  statesOf,
  type StateId
} from './states';
import { hrefFor } from './page-link';
import { liveScript, markLive, markLiveCharts } from './live';
import { neverShown } from './presence';
import { assetFileName, assetNameOf, assetNamed } from './assets';
import { scopeOf } from './components';
import { nfc } from './names';
import { revealOf, revealRule } from './reveal';
import { PAGE_CSS } from './page-css';
import { typeRule } from './type-scale';
import { sizingCss } from './sizing';
import { positionCss } from './position';
import { pagesOf, blocksIn } from './selection';

type Node = Record<string, any>;

export interface ExportedPage {
  /** Where it answers. */
  path: string;
  /**
   * And **what it is called on disk**, which is not the app's to decide and was.
   *
   * Measured: a link to a page resolves to that page's `path` — `/제품` — and the app was writing it
   * as `제품.html`. So **every link in a published site was broken**, on every host that does not
   * quietly try `.html` for you, and it looked completely fine in the editor because the editor
   * follows the reference rather than the file.
   *
   * `제품/index.html` is the answer, and it is the model's because the mapping from an address to a
   * file is a fact about *how this site is served* rather than about how a browser saves a download.
   * The sitemap has named its own file since the day it existed, for the same reason and by accident.
   */
  file: string;
  /** What a reader calls it, which is also the browser tab's words. */
  name: string;
  /** A complete document, openable on its own. */
  html: string;
}

/**
 * The file a page's address is served from.
 *
 * `/` is `index.html` and `/제품` is `제품/index.html` — the shape every static host serves, and the
 * one that makes the links the export already writes actually resolve. The alternative, `제품.html`,
 * is a file whose own address is `/제품.html`, which is not what any link on the site says.
 *
 * A path is written as it is, Korean and all: a URL has carried non-Latin characters for twenty
 * years, and a name transliterated into `jepum` would be a page whose address stops matching what a
 * reader typed into the panel.
 */
export function fileFor(path: string): string {
  /*
   * **Composed**, which is the difference between a link that resolves and a 404 nobody can see: a
   * browser requests `/제품` as NFC, and a file stored decomposed is the same word in different
   * bytes. `names.ts` has the whole of it.
   */
  const clean = nfc(String(path ?? '/')).replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/index.html` : 'index.html';
}

interface Editor {
  dataStore?: { getNode: (sid: string) => Node | undefined };
  getRootId?: () => string | undefined;
  getDocumentProxy?: (sid?: string) => unknown;
}

/**
 * Every page of the site, ready to be written to disk.
 *
 * The addresses are the document's — `path` is what makes a page a page of a site — so a writer maps
 * `/제품` onto `제품/index.html` and nothing here has to know how a host serves files.
 */
export function exportSite(editor: Editor): ExportedPage[] {
  const store = editor.dataStore;
  const rootId = editor.getRootId?.();
  if (!store || !rootId) return [];

  const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
  return pagesOf(doc as never).map((page) => exportPage(editor, page.sid));
}

/**
 * The **sitemap**, or nothing when the site has not said where it lives.
 *
 * ## Why it is a sibling of the pages rather than one of them
 *
 * `ExportedPage` carries an `html`, and a field called `html` holding XML is the kind of small lie
 * this repository spends its time finding. A page and a sitemap are different things — one is a
 * document a visitor opens and the other is a list a crawler reads — so they are handed over
 * separately, and the publish command's payload says which is which.
 *
 * ## Why it needs the address
 *
 * Every `<loc>` in a sitemap is absolute; the format has no relative form. So a site that has not
 * said where it lives gets **no sitemap at all** rather than one full of paths, which a crawler
 * would reject as a whole. Same rule as the canonical link and the description: written only when a
 * reader has said enough for it to be true.
 *
 * No `<lastmod>`, and that is a decision rather than an omission: this model records no times, and
 * stamping the export's own clock would tell a crawler every page changed every time anybody
 * published — which is how a site teaches a crawler to stop believing its sitemap.
 */
/**
 * **`robots.txt`** — what a crawler is told before it reads anything else.
 *
 * Two lines, and each is a decision a site had no way to make. `Sitemap:` is the one that matters
 * most: a sitemap nothing points at is a file a crawler finds only by guessing its name, and every
 * guide tells you to name it here. `Disallow: /` is the switch for the state nobody tests — a staging
 * copy published before it was ready and now sitting in a search result.
 *
 * Nothing at all without a site address, and that is the same rule `og:url` and the sitemap follow: a
 * `Sitemap:` line takes an absolute address and there is nothing honest to put in a relative one.
 */
export function robotsFor(editor: Editor): string | undefined {
  const store = editor.dataStore;
  const rootId = editor.getRootId?.();
  if (!store || !rootId) return undefined;

  const said = (store.getNode(rootId) as Node | undefined)?.attributes;
  const at = typeof said?.address === 'string' ? said.address.trim().replace(/\/+$/, '') : '';
  if (!at) return undefined;

  // Silence is *yes*: a site somebody published is a site they meant to be found.
  const allow = said?.noIndex === true ? 'Disallow: /' : 'Disallow:';
  return `User-agent: *\n${allow}\nSitemap: ${at}/sitemap.xml\n`;
}

export function sitemapFor(editor: Editor): string | undefined {
  const store = editor.dataStore;
  const rootId = editor.getRootId?.();
  if (!store || !rootId) return undefined;

  const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
  const locations = pagesOf(doc as never)
    /**
     * **Not the pages that said not to read them.**
     *
     * Found the day the sample grew a dashboard, which is the first page in it to say `noIndex`: the
     * head said *do not index this* and the sitemap said *here it is*, in the same publish. A crawler
     * given both obeys the first and learns the second is unreliable — which is the one thing a
     * sitemap must not teach, and is what this file already argues about publishing one full of
     * paths a site cannot serve.
     *
     * It is also the cheaper half of the same rule `robots.txt` follows here: a site that says
     * `noIndex` gets `Disallow: /`, and a page that says it gets left out of the map.
     */
    .filter((page) => (store.getNode(page.sid) as Node | undefined)?.attributes?.noIndex !== true)
    .map((page) => addressOf(store, rootId, String(page.path ?? '/')))
    .filter((one): one is string => !!one);
  if (locations.length === 0) return undefined;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locations.map((at) => `  <url><loc>${escape(at)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');
}

/** One page. */
export function exportPage(editor: Editor, pageSid: string): ExportedPage {
  const store = editor.dataStore!;
  const page = store.getNode(pageSid) as Node;

  const host = drawn(editor, pageSid);
  const lifted = lift(host);
  const responsive = mediaRules(store, pageSid, lifted.classOf);
  /*
   * After the media queries, deliberately: a state written for one width is written inside that
   * width's query, and it has to arrive after the rule it is about. See `stateRules`.
   */
  const states = stateRules(store, pageSid, lifted.classOf);
  /*
   * After the states, because it is the last thing a reader of the stylesheet needs and because it
   * is the only part wrapped in `@supports` — a block a browser cannot animate is a block it simply
   * draws, and that is easier to see when the guard is at the bottom rather than woven through.
   */
  const reveals = revealRules(store, pageSid, lifted.classOf);
  /*
   * And the ring on whatever presses a switch — last, because it is about a control that only the
   * published page has and a reader of the stylesheet meets it after everything they drew.
   */
  const openers = openerRules(host, store, pageSid);
  /*
   * And the one line of script this product ships, on the pages that need it. See `closerScript`.
   */
  const closer = closerScript(host);
  /*
   * And the other one, on the pages that have a list a visitor's browser goes and gets. Off by
   * default and argued at length in `live.ts` — a page with no live list ships neither.
   */
  const live = host.querySelector('[data-st-live]') ? liveScript() : '';

  const name = String(page?.attributes?.name ?? '');
  const path = String(page?.attributes?.path ?? '/');

  /*
   * **Where the body begins**, so a skip link has somewhere to point.
   *
   * The first block on this page that says it is the page's `main`, given an id in the drawing. A
   * page that has not said which block is its body gets **no skip link at all** rather than one
   * pointing at the top of the document — a link that goes nowhere is worse than none, because it
   * looks like the page has one.
   */
  const main = (() => {
    const found = firstLandmark(store, pageSid, 'main');
    if (!found) return undefined;
    /*
     * Quoted rather than `CSS.escape`d: the export runs in **Node** as well as in a browser — the
     * publish command is a unit test's first caller — and `CSS` is a browser global. A sid is
     * `site:45`; it has never contained a quote, and the attribute selector needs nothing else.
     */
    /*
     * **`data-b`**, not `data-bc-sid`: `lift` has already run by here and renames the attribute — the
     * published page keeps the node's id under a shorter name because a media query has to be able
     * to point at it. Looked for under the editor's name, this found nothing and the page silently
     * shipped without a skip link.
     *
     * Quoted rather than `CSS.escape`d, too: the export runs in **Node** as well as a browser and
     * `CSS` is a browser global. A sid is `site:45` and has never held a quote.
     */
    const el = host.querySelector<HTMLElement>(`[data-b="${found.replace(/"/g, '\\"')}"]`);
    if (!el) return undefined;
    el.id = 'main';
    return 'main';
  })();

  return {
    path,
    file: fileFor(path),
    name,
    html: document_(
      name,
      host.innerHTML,
      [lifted.css, responsive, states, reveals, openers].filter(Boolean).join('\n\n'),
      {
        script: [closer, live].filter(Boolean).join('\n'),
        /**
         * **The picture in a browser tab** — the cheapest thing that makes a published site look
         * like a site rather than a file somebody opened.
         *
         * Resolved to the path the archive will hold, which is why it could not exist before the
         * assets did: a favicon is a *file*, and until a document could carry one there was nowhere
         * for the bytes to be.
         */
        icon: (() => {
          const said = store.getNode(editor.getRootId?.() ?? '')?.attributes?.icon;
          const asset = assetNamed(
            { rootId: editor.getRootId?.() ?? '', getNode: (sid: string) => store.getNode(sid) } as never,
            assetNameOf(said)
          );
          return asset ? { href: assetFileName(asset), type: asset.type } : undefined;
        })(),
        /*
         * And a page a crawler is told to skip, which is the **page's** half of the same question the
         * site answers in `robots.txt`: a thank-you page is a page nobody should arrive at from a
         * search result, and `robots.txt` has no way to say so about one page.
         */
        noIndex: page?.attributes?.noIndex === true,
        /** What the site is set in — see `type-scale.ts` for why it is the document's. */
        type: typeRule(store.getNode(editor.getRootId?.() ?? '')?.attributes),
        description: page?.attributes?.description as string | undefined,
        /** And the picture an unfurl shows, which is most of what anybody sees of a shared link. */
        image: page?.attributes?.image as string | undefined,
        main,
        // Where the site lives, which only the document knows and only publishing needs.
        at: addressOf(store, editor.getRootId?.(), path)
      }
    )
  };
}

/**
 * The nearest block **above** this one that says only one thing inside it may be open — or nothing.
 *
 * Walked up the **drawing** rather than the document, which is the same choice `clean` makes and for
 * the same reason: inside a placed component the drawing is where the placement's own copy of every
 * part is, and the document would have to work that out again.
 */
function one(
  from: HTMLElement,
  store: { getNode: (sid: string) => Node | undefined }
): HTMLElement | undefined {
  let at: HTMLElement | null = from.parentElement;
  for (let hop = 0; at && hop < 64; hop += 1) {
    const name = at.getAttribute('data-b');
    if (name) {
      const cut = name.lastIndexOf('~');
      const node = store.getNode(cut < 0 ? name : name.slice(cut + 1));
      if (opensOneOf(node?.attributes as Record<string, unknown> | undefined)) return at;
    }
    at = at.parentElement;
  }
  return undefined;
}

/**
 * The sid of the part called `partId`, in the page or definition that holds `from`.
 *
 * Scoped rather than searched document-wide, and the scoping is the feature: a navigation bar placed
 * on five pages is one definition, and every part of it is named once. A document-wide search would
 * find the first 메뉴 anywhere and open somebody else's.
 */
function partNamed(
  store: { getNode: (sid: string) => Node | undefined },
  from: string,
  partId: string
): string | undefined {
  const holder = scopeOf(store, from);
  if (!holder) return undefined;

  const find = (sid: string, depth = 0): string | undefined => {
    if (depth > 32) return undefined;
    for (const child of (store.getNode(sid)?.content ?? []) as unknown[]) {
      if (typeof child !== 'string') continue;
      if (store.getNode(child)?.attributes?.partId === partId) return child;
      const deeper = find(child, depth + 1);
      if (deeper) return deeper;
    }
    return undefined;
  };
  return find(holder);
}

/**
 * **The one line of script this product ships** — and only on a page that has no other answer.
 *
 * ## The case, which is smaller than it sounds and completely real
 *
 * A visitor on a phone opens the menu and taps a link. Following it to *another page* closes the
 * menu for free: the next page is a new document and the checkbox starts unchecked. Following one to
 * an **anchor on the same page** does not — nothing navigates, so nothing resets, and the menu stays
 * over the section the visitor just asked to see.
 *
 * ## Why there is no CSS answer, having looked for one
 *
 * CSS cannot uncheck a checkbox. Three things were tried on paper and all three fail:
 *
 * - a `<label for>` wrapping the link — HTML says label activation is **skipped** when the click
 *   lands on interactive content inside it, which an `<a>` is, so the switch never toggles;
 * - `:target` on the section — it hides the menu and then goes on matching, so the hamburger stops
 *   being able to reopen it;
 * - a second switch — two controls for one gesture, and the visitor can now put them out of step.
 *
 * ## So: one line, and only where it is earned
 *
 * A page with an opener and no same-page link gets **nothing at all**, which is nearly every page —
 * the sample's five all export with no `<script>` in them. This is not a runtime; it is a listener
 * for one event that unchecks the switches, and the page works without it for every other gesture.
 *
 * `pointer-events` is deliberately not the mechanism, and neither is `history`: the browser's own
 * navigation is left exactly as it was, so a middle-click, a long-press, ⌘-click and "open in new
 * tab" all still do what they do.
 */
export function closerScript(host: HTMLElement): string {
  const opens = host.querySelector('.st-open-switch');
  const anchor = host.querySelector('a[href^="#"]');
  if (!opens || !anchor) return '';

  return (
    "document.addEventListener('click',function(e){" +
    "var a=e.target.closest&&e.target.closest('a[href^=\"#\"]');if(!a)return;" +
    "document.querySelectorAll('.st-open-switch:checked').forEach(function(s){s.checked=false});" +
    '});'
  );
}

/**
 * **Where the focus ring goes** when a visitor tabs to a switch.
 *
 * The switch is off the page — it has to be, or it would be a checkbox sitting in the middle of a
 * navigation bar — and an off-the-page control draws its ring off the page too. So the ring is put
 * on the thing the visitor is actually looking at: the block that presses it.
 *
 * One rule per switch rather than one rule for all of them, and that is the difference between a
 * ring and a mess: `label[for]` with no id in it would ring **every** opener on the page the moment
 * any one of them took focus, which on a page with a menu and three accordions is four rings and no
 * information. CSS cannot match a `for` against an `id` on its own, so the pairing is written out.
 *
 * A browser without `:has()` loses the ring and keeps the menu; every current one has it.
 */
function openerRules(
  host: HTMLElement,
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string
): string {
  const resolve = resolverFor(store, pageSid);
  const rules: string[] = [];

  for (const switch_ of [...host.querySelectorAll<HTMLElement>('.st-open-switch')]) {
    const id = switch_.getAttribute('id');
    if (!id) continue;

    rules.push(
      `body:has(#${id}:focus-visible) [for="${id}"] { outline: 2px solid currentColor; outline-offset: 3px; border-radius: 4px; }`
    );

    /**
     * And **what the opener itself looks like while the thing it opens is open**.
     *
     * The chosen tab, which is not a nicety: a tab strip where a visitor cannot tell which tab they
     * are on is a tab strip that does not work. It is also the one 열림 that cannot be written as
     * `switch:checked + block`, because the opener is not next to the switch — the switch sits by
     * the *panel*, which may be anywhere on the page.
     *
     * So this is the second rule in the file that names a control by its id, and it reads as the
     * sentence it is: *while this switch is on, the block that presses it looks like this.* The
     * label wraps exactly one element, so `> *` is the opener and nothing else.
     *
     * A block's `states.open` therefore has one meaning and two shapes: for a block that is opened,
     * it is what it becomes; for a block that opens, it is what it looks like having done so. A block
     * that is both — a nested accordion's middle row — takes the gesture it owns, which is this one.
     */
    const opener = host.querySelector<HTMLElement>(`[for="${id}"] > [data-b]`);
    const name = opener?.getAttribute('data-b') ?? '';
    const cut = name.lastIndexOf('~');
    const node = store.getNode(cut < 0 ? name : name.slice(cut + 1));
    if (!node || !statesOf(node.attributes as Record<string, unknown> | undefined).open) continue;

    /*
     * At the widest width only. A chosen tab looks chosen the same way at 390 as at 1280 — it is the
     * same gesture, which is the argument `states.ts` makes about states not being per-width — and
     * the day one genuinely differs it takes an `overrides` inside the state, like every other.
     */
    const said = declarations(
      changed(
        cssFor(node, BASE_BREAKPOINT, resolve),
        cssFor(node, BASE_BREAKPOINT, resolve, 'open')
      )
    );
    if (said) rules.push(`body:has(#${id}:checked) [for="${id}"] > * { ${said} }`);
  }
  return rules.join('\n');
}

/**
 * Every drawn element's style, moved into a class of its own.
 *
 * Per **element** rather than per node, and that is the fix rather than a detail: a node's id is
 * stamped on every element of its template, so a rule keyed by the id would reach inside a heading
 * and restyle the span in it. A class is given out once per element, and the first element carrying
 * a node's id is the one a media query is about — which is the node's own outermost element, because
 * that is the order a template is walked in.
 */
function lift(host: HTMLElement): { css: string; classOf: (sid: string) => string | undefined } {
  const rules: string[] = [];
  const owner = new Map<string, string>();
  let next = 0;

  for (const el of [...host.querySelectorAll<HTMLElement>('[style]')]) {
    const style = el.getAttribute('style');
    if (!style) continue;

    const name = `b${next++}`;
    el.classList.add(name);
    el.removeAttribute('style');
    rules.push(`.${name} { ${style} }`);

    const sid = el.getAttribute('data-b');
    if (sid && !owner.has(sid)) owner.set(sid, name);
  }

  return { css: rules.join('\n'), classOf: (sid: string) => owner.get(sid) };
}

/**
 * The page as the editor draws it, with the editing taken off.
 *
 * Rendered rather than built, which is the whole design — see the header. What is removed afterwards
 * is only what a *reader* has no use for: the caret filler, which is renderer bookkeeping and must
 * never look like content, and `contenteditable`, which would make a published page typable.
 *
 * The sid stays, as `data-b`. A published page has no use for it either, and the media queries do:
 * a rule has to say **which node** it is about, and the node's own id is the one name that cannot
 * drift from the drawing it came out of.
 */
export function drawnHtml(editor: Editor, pageSid: string): string {
  return drawn(editor, pageSid).innerHTML;
}

/** The drawing itself, before its styles are lifted — the one place a render happens. */
function drawn(editor: Editor, pageSid: string): HTMLElement {
  const store = editor.dataStore!;
  const rootId = editor.getRootId?.() ?? '';
  const host = document.createElement('div');

  const renderer = new DOMRenderer(getGlobalRegistry());
  renderer.setEnv({
    [WORD_ENV_KEY]: createTextEnv({
      rootId,
      getNode: (sid: string) => store.getNode(sid) as never
    } as never),
    // The widest width. Everything narrower is a media query, below.
    /*
     * The widest width, and **the page a visitor gets** — the second flag is read by exactly one
     * thing, and it is the only place where the export's drawing is allowed to differ from a board's
     * rather than being a removal made afterwards: a form on a board has no address and no live
     * fields, because a designer arranging one should not be sending messages. See `SiteEnv`.
     */
    [SITE_ENV_KEY]: createSiteEnv(BASE_BREAKPOINT, true)
  } as never);

  const tree = editor.getDocumentProxy?.(pageSid);
  if (!tree) return host;
  renderer.render(host, tree as never, [], undefined);

  return clean({ rootId, getNode: (sid: string) => store.getNode(sid) }, host);
}

/** Everything an editor puts in a drawing that a reader has no use for. */
function clean(
  doc: { rootId: string; getNode: (sid: string) => Node | undefined },
  host: HTMLElement
): HTMLElement {
  const store = doc;
  for (const filler of [...host.querySelectorAll('[data-bc-filler]')]) filler.remove();

  for (const el of [host, ...host.querySelectorAll('*')] as HTMLElement[]) {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    el.removeAttribute('data-bc-layer');
    /**
     * **`data-from` is the editor's**, and this is the one place that has to say so.
     *
     * It names *where a value came from* — `field:제목`, `var:강조` — so the board can mark which
     * words on a page are not typed there. A visitor has no use for it, and it is this document's
     * own vocabulary, which is exactly what `data-goes` had to be stopped from publishing.
     *
     * Stripped **here** rather than guarded in each renderer, because the renderers that draw it are
     * in two packages now: the site's blocks and the shared text ones. One rule in the place that
     * decides what ships beats the same guard written four times and forgotten on the fifth.
     */
    el.removeAttribute('data-from');
    const sid = el.getAttribute('data-bc-sid');
    if (sid) {
      /*
       * Renamed rather than dropped: a media query has to name the node it is about, and the node's
       * own id is the one name that cannot drift from the drawing it came out of. A resolved part
       * carries `owner~part`, which is a name too — the row of a list has one and needs it.
       */
      el.setAttribute('data-b', sid);
      el.removeAttribute('data-bc-sid');
    }
  }

  /**
   * And every block a reader **hid**, which is the one place the visitor is told less than the
   * editor and is told it on purpose.
   *
   * The editor draws a hidden block `display: none` and goes on listing it in 구성, because a block
   * a reader cannot get back to is a block they have lost. A published page has no such need and one
   * strong reason against: `display: none` still *ships the words* — to a crawler, to a reader with
   * styles off, to anybody who opens the source — and a section somebody hid is a section they did
   * not mean to publish.
   *
   * Read from the drawing rather than from the document, because the drawing is what the export is
   * about: a hidden block inside a component's definition is hidden in every placement of it, and
   * walking the document would have to work that out again.
   */
  for (const hidden of [...host.querySelectorAll<HTMLElement>('[style*="display: none"]')]) {
    /*
     * A **draft**, which is not the same question as "is it hidden right now".
     *
     * This width is the widest one, and two ordinary designs are hidden here and not drafts: a block
     * shown only on a phone, and a block a visitor opens. Both were being cut — the sample's
     * hamburger was removed from the published page and its label was left behind empty, so on the
     * one width the menu existed for there was nothing to press. `neverShown` asks the whole
     * question: hidden at every width, and in every state.
     *
     * Asked of the **node** where there is one. An element with no `data-b` that is drawn
     * `display: none` was hidden by its own template rather than by a reader, and goes as it always
     * did.
     */
    const name = hidden.getAttribute('data-b');
    if (name) {
      const cut = name.lastIndexOf('~');
      const own = store.getNode(cut < 0 ? name : name.slice(cut + 1));
      if (!neverShown(own?.attributes as Record<string, unknown> | undefined)) continue;
    }
    hidden.remove();
  }

  /*
   * **After** the drafts go, so a switch is never left pointing at a block that is not there, and
   * after the rename, because the switches are found by `data-b`.
   */
  openSwitches(store, host);
  goesLinks(doc, store, host);

  /*
   * And last, the lists a visitor's browser goes and gets again — after the rename, because they are
   * found by `data-b`, and after the drafts, because a hidden list is not one anybody fetches for.
   */
  markLive(doc, host);
  /*
   * And the charts, which are the same rule one step further: a list's refetch rewrites **words**
   * and a chart's rewrites **where its points are**. Both are marked here so the one script the page
   * ships can find either.
   */
  markLiveCharts(doc, host);
  return host;
}

/**
 * The **switches** an exported page opens with, and the labels that press them.
 *
 * ## Why a published page has controls the editor does not
 *
 * Everything else here is export-as-a-render: the published page is what the editor drew, and a
 * second path is a place for a rule to get old. This is the exception, and it is the exception on
 * purpose — a checkbox that remembers whether a menu is open is not something a *designer* edits.
 * Drawing it on the board would put an invisible control inside every openable block, in the way of
 * every drag, answering to nobody. The board previews 열림 by being told to (`editorStateCss`), which
 * is the designer's version of the same fact.
 *
 * ## Why a checkbox, and no JavaScript at all
 *
 * A browser already has one thing that remembers a choice a visitor made and can be styled on it.
 * Using it means the menu opens on a page whose script failed, on a crawler, on a phone on a train —
 * and it means this product ships no runtime, which was worth keeping through a feature that on
 * every other builder is where the runtime starts.
 *
 * The switch is put **before** the block it opens rather than inside it, and `states.ts` has the
 * argument: inside, it is inside a `display: none`, and a key cannot reach it.
 *
 * ## Why the opener is wrapped rather than turned into a label
 *
 * The hamburger is whatever the designer drew — a stack with three lines in it, or a word. Making it
 * a `<label>` would mean replacing its element and moving its children, and its own styles are
 * pinned to it by then. A wrapper of `display: contents` has no box at all: the layout is exactly
 * the layout, and a press anywhere in it reaches the switch.
 */
/**
 * The **links a block is**, which is `openSwitches`'s sibling and was missing for as long as it.
 *
 * A button in this model is a stack with a colour, a padding and words in it — that is the schema's
 * own sentence and it is right about how a button *looks*. It said nothing about what a button *is*,
 * and the sample proved the gap by wearing it: seven calls to action drawn with an accent fill, a
 * pill radius, a `:hover` that darkens and a `:focus-visible` ring, every one of them published as
 * `<div><p><span>무료로 시작하기</span></p></div>` — outside the tab order, announced as a paragraph,
 * and carrying a focus ring that a `<div>` can never fire.
 *
 * ## The element becomes the link, rather than being wrapped in one
 *
 * Wrapped first, in an `<a>` of `display: contents` — which has no box, so the layout is untouched.
 * Measured in a browser, and it does not work: **an element with no box cannot take focus.** Chromium
 * leaves `document.activeElement` on `<body>`, so the wrapper published a link a mouse could press
 * and a Tab key could not reach, which is the exact fault this whole thing exists to fix, rebuilt one
 * layer out.
 *
 * So the block's own element is *replaced* by an `<a>` carrying every attribute it had. Its styling
 * survives because styling is carried by **class** — `lift` has already pulled every rule out into a
 * stylesheet by the time this runs — and the children move across, so the box is the box it was and
 * the whole of it is the target rather than the eight pixels of text a link mark would have covered.
 *
 * `<a>` is transparent content: it holds whatever its parent could hold, so a paragraph, a stack and
 * a picture inside one are all valid.
 *
 * ## And a reference that resolves to nothing publishes no `href`
 *
 * `hrefFor`'s rule, unchanged: a `page:` naming a page that is gone comes back undefined, and an
 * `<a>` with no `href` is the one shape a browser draws as *not a link*. Honest, visible, and
 * already reported by `linkFaults` — rather than a link that looks fine until somebody follows it.
 */
function goesLinks(
  doc: { rootId: string; getNode: (sid: string) => Node | undefined },
  store: { getNode: (sid: string) => Node | undefined },
  host: HTMLElement
): void {
  for (const el of [...host.querySelectorAll<HTMLElement>('[data-b]')]) {
    const name = el.getAttribute('data-b') ?? '';
    const cut = name.lastIndexOf('~');
    const own = cut < 0 ? name : name.slice(cut + 1);
    /**
     * The **drawn** destination first, and the stored one after.
     *
     * A row of a list draws as `${collection}~${index}~${part}`, so looking the sid up in the store
     * lands on the *definition's* part — and every row in a list went to the same place. The drawing
     * carries the resolved answer (`data-goes`), which is the one that knows which row it is.
     *
     * The store stays as the fallback rather than being replaced: a block whose destination was
     * written before this existed is still drawn by a renderer that may not have said it, and the
     * older answer was right for every case except the one it could not see.
     */
    const drawn = el.getAttribute('data-goes');
    const said =
      drawn && drawn.trim()
        ? drawn
        : (store.getNode(own)?.attributes as Record<string, unknown> | undefined)?.goes;
    if (typeof said !== 'string' || !said.trim()) continue;

    const href = hrefFor(doc as never, said.trim());
    const link = host.ownerDocument.createElement('a');
    for (const attr of [...el.attributes]) link.setAttribute(attr.name, attr.value);
    /*
     * And the destination itself does **not** travel. It is a reference in this document's own
     * vocabulary (`page:post-stack`), which means nothing outside this document — the published page
     * says where it goes with `href`, and a second, unresolved copy of the same fact is a leak of
     * the editor into the thing it published. The check that says so is `no editor vocabulary in the
     * export`, which found this the first time a row of a list carried one.
     */
    link.removeAttribute('data-goes');
    if (href) link.setAttribute('href', href);
    /*
     * And a **name**, for the very common button that draws its words as a picture — a monogram, an
     * arrow, a chevron. The block's 이름 is what the reader typed in the panel, and it is the one
     * sentence in the document that says what following this does.
     */
    if (!(el.textContent ?? '').trim()) {
      const called = store.getNode(own)?.attributes?.name;
      if (typeof called === 'string' && called) link.setAttribute('aria-label', called);
    }
    while (el.firstChild) link.appendChild(el.firstChild);
    el.parentElement?.replaceChild(link, el);
  }
}

function openSwitches(
  store: { getNode: (sid: string) => Node | undefined },
  host: HTMLElement
): void {
  let next = 0;
  /** One radio name per `opensOne` **element** — see below for why an element and not a node. */
  const groups = new Map<HTMLElement, string>();

  for (const el of [...host.querySelectorAll<HTMLElement>('[data-b]')]) {
    const name = el.getAttribute('data-b') ?? '';
    /*
     * `owner~part` for a block inside a placed component, and the part is what the definition wrote.
     * So the sid to ask the document about is the half after the tilde, and the placement's own
     * prefix is what turns the answer back into *this* copy's element.
     */
    const cut = name.lastIndexOf('~');
    const own = cut < 0 ? name : name.slice(cut + 1);
    const prefix = cut < 0 ? '' : name.slice(0, cut + 1);

    const opens = opensOf(store.getNode(own)?.attributes as Record<string, unknown> | undefined);
    if (!opens) continue;

    /*
     * A **`partId`**, which is the durable name a part has and the only kind of name a document can
     * be authored with: a component in a library, a sample, a page pasted in from elsewhere — none
     * of them know the sids they will be given. `componentBind` learned this first and this follows
     * it. So the sid is looked up from the name, inside the page or the definition the opener is in,
     * which is the scope a `partId` means anything in.
     */
    const found = opens === 'self' ? own : partNamed(store, own, opens);
    if (!found) continue;

    const wanted = `${prefix}${found}`;
    const target = host.querySelector<HTMLElement>(`[data-b="${wanted.replace(/"/g, '\"')}"]`);
    // A block that opens something no longer on the page opens nothing, and says so by being an
    // ordinary block: no switch, no label, and the state rule beside it matches nothing.
    if (!target || !target.parentElement) continue;

    /*
     * **One at a time, or many** — a radio or a checkbox, which is the browser's own answer to the
     * difference and has been since 1993.
     *
     * The nearest block above this one that says `opensOne` is the set: a tab strip says it, and
     * pressing the second tab then unchecks the first, every other panel falls back to what it says
     * at rest, and *nothing* had to be written to make that happen. An accordion that says it gets
     * one answer open at a time; one that says nothing gets checkboxes and opens as many as it likes.
     *
     * The group is named after the **element**, not the node, and that is the placement rule again:
     * a tab strip inside a component placed on five pages is five sets of tabs, and one shared name
     * would make choosing a tab on one page choose it on all five.
     */
    const set = one(el, store);
    const kind = set ? 'radio' : 'checkbox';
    let group = set ? groups.get(set) : undefined;
    if (set && !group) {
      group = `st-one-${groups.size}`;
      groups.set(set, group);
    }

    const id = `st-open-${next++}`;
    const switch_ = host.ownerDocument.createElement('input');
    switch_.setAttribute('type', kind);
    switch_.setAttribute('class', 'st-open-switch');
    switch_.setAttribute('id', id);
    if (group) switch_.setAttribute('name', group);
    /*
     * And **already pressed**, where the document says so. A tab strip with nothing chosen shows
     * nothing at all, which is the one state a tab strip must never be in; a menu with nothing
     * chosen is a menu, so silence means closed.
     */
    if (opensAtRest(store.getNode(own)?.attributes as Record<string, unknown> | undefined)) {
      switch_.setAttribute('checked', '');
    }
    /*
     * Off the page and **not** `display: none` or `hidden`, which is the whole point of it being
     * here: a control a browser does not render is a control a Tab key cannot reach, and 열림 would
     * then be a pointer-only gesture. This one is in the focus order, takes Space, and is described
     * by the label around the block that presses it.
     */
    switch_.setAttribute(
      'style',
      'position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap;'
    );
    /*
     * And a **name**, for the very common opener that has no words in it.
     *
     * A `<label for>` gives its control the label's own text, which for a hamburger drawn as three
     * lines is the empty string: a checkbox announced as "checkbox" and nothing else. The block's
     * 이름 is what the reader typed in the panel — 메뉴 열기 — and it is the one sentence in the
     * document that says what pressing this does.
     */
    if (!(el.textContent ?? '').trim()) {
      const said = store.getNode(own)?.attributes?.name;
      switch_.setAttribute('aria-label', typeof said === 'string' && said ? said : '열기');
    }
    target.parentElement.insertBefore(switch_, target);

    const label = host.ownerDocument.createElement('label');
    label.setAttribute('for', id);
    // No box of its own, so the opener lays out exactly where it laid out.
    label.setAttribute('style', 'display: contents; cursor: pointer;');
    el.parentElement?.insertBefore(label, el);
    label.appendChild(el);
  }
}

/**
 * What each narrower width says, as CSS.
 *
 * Asked of the **same functions the renderer asks**: `attrsAt` for the width, then `frameCss` and
 * `sizingCss` for what that becomes. So a media query cannot say something the editor would not draw
 * — and `export.test.ts` holds that to the editor's own drawing rather than trusting it.
 *
 * Only what differs from the base is written. A page whose blocks say nothing at a narrower width
 * gets no rules at all, which is the CSS equivalent of the sentence the document makes.
 */
export function mediaRules(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string,
  /** The class the export gave each node's own element. Without one, the node's id is used. */
  classOf: (sid: string) => string | undefined = () => undefined
): string {
  const blocks = styledNodes(store, pageSid);
  const resolve = resolverFor(store, pageSid);

  const widths = BREAKPOINTS.filter((one) => one.id !== BASE_BREAKPOINT)
    // Widest first, so a narrower rule wins by coming later — the same cascade `attrsAt` runs.
    .sort((a, b) => b.width - a.width);

  const chunks: string[] = [];
  for (const width of widths) {
    const rules: string[] = [];
    for (const one of blocks) {
      const node = store.getNode(one.sid);
      const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
      if (Object.keys(overridesOf(attrs)).length === 0) continue;

      const differs = changed(
        cssFor(node, BASE_BREAKPOINT, resolve),
        cssFor(node, width.id, resolve)
      );
      if (Object.keys(differs).length === 0) continue;

      rules.push(`  ${whereFor(one, classOf)} { ${declarations(differs)} }`);
    }
    if (rules.length > 0) {
      chunks.push(`@media (max-width: ${width.width}px) {\n${rules.join('\n')}\n}`);
    }
  }
  return chunks.join('\n\n');
}

/**
 * What each **state** says, as CSS.
 *
 * ## Why this is a rule where an override is a drawing
 *
 * A width is known before a page is drawn — three boards, three breakpoints, each view resolving its
 * own — so an override never needs a stylesheet in the editor and only becomes a media query on the
 * way out. A pointer is known to nobody at render time. There is no moment at which a document can
 * be resolved *as hovered*, because the hovering is the visitor's and happens after the drawing has
 * finished. So a state is the first thing on a page that has to be published as a **promise about a
 * value** rather than as a value.
 *
 * ## One calculation, two notations
 *
 * The published page has no inline styles left — `lift` moved them into classes — so a rule of equal
 * weight and later position wins, and `:hover` carries a pseudo-class's specificity on top of that.
 * The **editor** is the opposite case: its drawing is inline by design, and an inline style beats
 * every selector there is. The only thing that beats an inline style is `!important`, which is
 * precisely what it is for.
 *
 * That is a genuine asymmetry and it is confined to exactly one place: `stateChanges` below computes
 * the declarations once, and the two functions after it write the same declarations down twice, in
 * the notation each ground needs. The published page keeps this file's promise that it contains no
 * `!important` — a page a reader cannot override with their own CSS is a page that is not theirs.
 */
export interface StateChange {
  /** The node the promise is about. */
  sid: string;
  /** Whether it belongs to a definition, and so is drawn once per placement — see `styledNodes`. */
  part: boolean;
  state: StateId;
  /**
   * The width it applies at, or `undefined` when it applies at every width.
   *
   * Almost always `undefined`: a card that lifts under the pointer lifts at every width, because the
   * gesture is the same gesture. A width appears here only when the state's *result* differs there —
   * a hover fill stated over a base fill that the width already changed — and then it is written
   * inside that width's media query, after the base rule, so the later one wins.
   */
  width?: BreakpointId;
  css: Record<string, string>;
}

export function stateChanges(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string
): StateChange[] {
  const blocks = styledNodes(store, pageSid);
  const resolve = resolverFor(store, pageSid);
  const narrower = BREAKPOINTS.filter((one) => one.id !== BASE_BREAKPOINT).sort(
    (a, b) => b.width - a.width
  );

  const changes: StateChange[] = [];
  for (const one of blocks) {
    const node = store.getNode(one.sid);
    const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
    if (!hasStates(attrs)) continue;

    for (const state of STATES) {
      const id = state.id;
      if (!statesOf(attrs)[id]) continue;

      const base = changed(
        cssFor(node, BASE_BREAKPOINT, resolve),
        cssFor(node, BASE_BREAKPOINT, resolve, id)
      );
      if (Object.keys(base).length > 0) {
        changes.push({ sid: one.sid, part: one.part, state: id, css: base });
      }

      for (const width of narrower) {
        const here = changed(
          cssFor(node, width.id, resolve),
          cssFor(node, width.id, resolve, id)
        );
        if (declarations(here) === declarations(base)) continue;
        if (Object.keys(here).length === 0) continue;
        changes.push({ sid: one.sid, part: one.part, state: id, width: width.id, css: here });
      }
    }
  }
  return changes;
}

/**
 * The states as a published stylesheet — written after the media queries, so a width-specific state
 * lands after the width it is about.
 */
export function stateRules(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string,
  /** The class the export gave each node's own element. Without one, the node's id is used. */
  classOf: (sid: string) => string | undefined = () => undefined
): string {
  const changes = stateChanges(store, pageSid);
  if (changes.length === 0) return '';

  const flat: string[] = [];
  const byWidth = new Map<BreakpointId, string[]>();

  // Before the state rules, so a reader opening the stylesheet meets the block and then what it
  // becomes. It is a different selector either way, so the order is for the reader and not the
  // cascade.
  for (const [selector, said] of transitionsFor(store, changes, classOf)) {
    flat.push(`${selector} { ${said} }`);
  }

  /**
   * The **arriving** curve, on the state's own rule.
   *
   * A browser reads the transition of the ruleset it is going *to*, so this one governs the arrival
   * and the block's own governs the return. Which is what makes two curves possible at all without a
   * second mechanism — see `ENTER` and `LEAVE`.
   *
   * Keyed by selector so a block with a hover and a focus is told once rather than twice: they are
   * the same arrival and the same block.
   */
  const entering = new Map<string, string>();
  for (const [selector, said] of transitionsFor(store, changes, classOf, undefined, ENTER)) {
    entering.set(selector, said);
  }

  for (const change of changes) {
    /*
     * An **opener's** 열림 is not written here. It is the one that cannot be said as
     * `switch:checked + block` — the opener is not beside its switch — so `openerRules` writes it by
     * the switch's id, and a rule written here as well would name two elements that are never
     * adjacent and quietly match nothing.
     */
    if (change.state === 'open' && opensOf(store.getNode(change.sid)?.attributes)) continue;

    const where = whereFor(change, classOf);
    const selector = where
      .split(', ')
      .map((one) => selectorIn(one, change.state))
      .join(', ');
    const arriving = entering.get(where);
    const rule = `${selector} { ${declarations(change.css)}${arriving ? ` ${arriving}` : ''} }`;
    if (!change.width) {
      flat.push(rule);
      continue;
    }
    byWidth.set(change.width, [...(byWidth.get(change.width) ?? []), `  ${rule}`]);
  }

  const chunks = [flat.join('\n')];
  for (const width of BREAKPOINTS.filter((one) => byWidth.has(one.id)).sort(
    (a, b) => b.width - a.width
  )) {
    chunks.push(`@media (max-width: ${width.width}px) {\n${byWidth.get(width.id)!.join('\n')}\n}`);
  }
  return chunks.filter(Boolean).join('\n\n');
}

/**
 * The same states, for the **boards** — where the drawing is inline and a rule has to say so.
 *
 * Scoped by the board rather than diffed against it: the three boards are three subtrees of one
 * window drawing one document, so a node's id matches in all of them at once and a width-specific
 * state written without a scope would apply at every width. `data-frame` is what a board is called
 * on screen, and it is the only per-view name there is in the DOM.
 */
export function editorStateCss(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string,
  /**
   * And what to draw **as if** it were in a state, because the pointer never gets there.
   *
   * A board is covered by the tool's own layer — that layer is what decides what a click means, and
   * it is why a click on this product works at all. It also means the page underneath is never the
   * topmost thing under the pointer, so its `:hover` does not fire and a designer editing a hover
   * would be editing something they cannot see.
   *
   * So the panel says which state it has opened and on which blocks, and those blocks are drawn in
   * it. Which is what every tool of this kind does, and is better than a live hover would be anyway:
   * a designer needs to *look* at the hover state, and a hover state that goes away when you move
   * the mouse to the colour field cannot be looked at.
   */
  preview?: { state: StateId; sids: string[] }
): string {
  const changes = stateChanges(store, pageSid);
  const rules: string[] = [];

  /*
   * The same declaration, in the board's notation — and `!important` for the same reason every
   * other rule here carries it: a board is drawn with inline styles by design, and nothing beats an
   * inline style. A designer who sets a fade and watches the board snap has been shown a preview of
   * something else.
   */
  for (const [selector, said] of transitionsFor(store, changes, () => undefined, 'data-bc-sid')) {
    rules.push(`${selector} { ${said.replace(';', ' !important;')} }`);
  }

  /*
   * And the arriving curve, in the board's notation — see `stateRules` for why there are two, and
   * `ENTER`/`LEAVE` for which is which. A designer who is shown a fade that eases the same way in
   * both directions has been shown something a visitor will not get.
   */
  const entering = new Map<string, string>();
  for (const [selector, said] of transitionsFor(store, changes, () => undefined, 'data-bc-sid', ENTER)) {
    entering.set(selector, said.replace(';', ' !important;'));
  }

  for (const change of changes) {
    // The board has no switches at all, so an opener's 열림 is drawn only by the panel's preview
    // below — see `stateRules` for why the adjacent-sibling rule cannot say it.
    if (change.state === 'open' && opensOf(store.getNode(change.sid)?.attributes)) {
      if (preview?.state !== change.state || !preview.sids.includes(change.sid)) continue;
    }

    const at = change.width ? `[data-frame="${change.width}"] ` : '';
    const said = Object.entries(change.css)
      .map(([key, value]) => `${dashed(key)}: ${value} !important;`)
      .join(' ');
    const whole = whereFor(change, () => undefined, 'data-bc-sid');
    const where = whole.split(', ');
    const arriving = entering.get(whole);
    rules.push(
      `${where.map((one) => `${at}${selectorIn(one, change.state)}`).join(', ')} { ${said}${arriving ? ` ${arriving}` : ''} }`
    );

    /*
     * And the same declarations again with no pseudo-class, on the blocks the panel has opened.
     *
     * Scoped to those blocks rather than to the board: drawing *every* hover on the page at once
     * would be a page nobody has ever seen, and a designer comparing a card to the one beside it
     * would be comparing two hovers.
     */
    if (preview?.state !== change.state) continue;
    /*
     * A drawn part carries `placement~part`, and what the reader selected is whichever of those the
     * board handed them — so the match is *the node itself, or a placement of it*, which is the same
     * sentence `whereFor` writes as a selector.
     */
    const chosen = preview.sids.filter(
      (sid) => sid === change.sid || sid.endsWith(`~${change.sid}`)
    );
    if (chosen.length === 0) continue;
    rules.push(
      `${chosen.map((sid) => `${at}[data-bc-sid="${sid}"]`).join(', ')} { ${said} }`
    );
  }
  return rules.join('\n');
}

/**
 * **How long** each block takes to answer, as one declaration per block.
 *
 * ## Why the properties are named rather than `all`
 *
 * A hand-written page says `transition: all`, because a hand-written page does not know what is
 * going to change. This one does: a state has already been computed down to the exact declarations
 * it changes (`stateChanges`), so the rule can name those and nothing else.
 *
 * Which is not only tidier. `all` transitions whatever the browser considers animatable, including
 * things nobody meant — a `width` that a media query changes underneath, a `transform` a script
 * sets — and it is the reason a hover on a hand-written page so often drags something unrelated
 * along with it. Naming the properties also means the list can never fall behind `STATEABLE`,
 * because it is not a list: it is what this block actually promised.
 *
 * ## Why it is on the block *and* on the state
 *
 * A `transition` declared **only** inside `:hover` animates the arrival and not the leaving — the
 * colour eases in over 160ms and snaps back the instant the pointer goes. It is the classic
 * half-built hover, and it is one line's difference. So the block carries one, which is what a
 * reader means by *this card fades*; and then the state carries one too, with the other curve, which
 * is what a reader means by *and it fades back differently*. See `ENTER` and `LEAVE`.
 *
 * A property here can be a **shorthand** — a state that changes a stroke's colour changes the whole
 * `border` declaration, so the rule names `border` — and that is safe rather than lucky. A shorthand
 * transitions its parts, and the part that would reflow is `border-width`, which a state cannot
 * change: `STATEABLE` leaves `strokeWidth` out for exactly that reason, so the width is identical in
 * both rules and there is nothing there to animate.
 *
 * ## Which curve, which is the caller's to say
 *
 * This writes whichever curve it was handed and defaults to `LEAVE`, because the block's own rule is
 * the one it is asked for most and the one a reader would forget. `ENTER` and `LEAVE` carry the
 * reasoning; the only thing this function knows about them is that a ruleset gets exactly one.
 */
function transitionsFor(
  store: { getNode: (sid: string) => Node | undefined },
  changes: StateChange[],
  classOf: (sid: string) => string | undefined,
  /** The attribute the selector matches on — `data-b` on a published page, the sid on a board. */
  attribute?: string,
  /** Which curve these rules carry — see `ENTER` and `LEAVE`. */
  curve: string = LEAVE
): [string, string][] {
  /** Every property any of this block's states changes, in the order they were first seen. */
  const properties = new Map<string, { one: StateChange; keys: Set<string> }>();
  for (const change of changes) {
    const held = properties.get(change.sid) ?? { one: change, keys: new Set<string>() };
    for (const key of Object.keys(change.css)) held.keys.add(dashed(key));
    properties.set(change.sid, held);
  }

  const out: [string, string][] = [];
  for (const [sid, { one, keys }] of properties) {
    const ms = (store.getNode(sid) as { attributes?: Record<string, unknown> } | undefined)
      ?.attributes?.transitionMs;
    // Unset is not zero: a block nobody has told about time answers the way it always did, and a
    // page that says nothing about time carries no rule about time.
    if (typeof ms !== 'number' || !Number.isFinite(ms)) continue;

    const said = [...keys].map((key) => `${key} ${Math.max(0, Math.round(ms))}ms ${curve}`).join(', ');
    out.push([whereFor(one, classOf, attribute), `transition: ${said};`]);
  }
  return out;
}

/**
 * The two curves, and why there are two.
 *
 * ## One curve was half of an answer
 *
 * A `transition` on the block governs **both directions** — the arrival and the leaving — so one
 * curve means a card that eases *in* the same way it eases *out*. Every considered system uses
 * ease-out on the way in and ease-in on the way out, and the reason is about eyes rather than taste:
 *
 * - **Arriving**, the change should start fast and settle slowly. Fast to leave is what makes it
 *   *noticed*; slow to settle is what makes it *followable*. That is `ENTER`.
 * - **Leaving**, the opposite. A change that starts slowly reads as the thing letting go rather than
 *   being snatched away, and it keeps the eye from being pulled back to something the reader has
 *   already moved on from. That is `LEAVE`.
 *
 * Reversed — ease-in on the way in — the first thing a hover does is nothing, which reads as lag.
 * `linear` in either direction reads as mechanical.
 *
 * ## How two curves fit on one property
 *
 * The block's own rule carries `LEAVE` and the state's rule carries `ENTER`. A browser reads the
 * transition of the ruleset it is *going to*, so the hover rule's curve governs the arrival and the
 * base rule's governs the return — which is the whole trick, and it is one extra declaration rather
 * than a mechanism.
 */
const ENTER = 'cubic-bezier(0.2, 0, 0, 1)';
const LEAVE = 'cubic-bezier(0.4, 0, 1, 1)';

/**
 * The blocks that **arrive as a visitor scrolls to them**, as rules.
 *
 * The third thing on a page published as a rule rather than folded into a drawing, and the one with
 * the clearest reason: there is no moment at which a document is *being scrolled to*. A width is
 * known before the page is drawn and a pointer is the visitor's; a scroll position is the visitor's
 * too, and it keeps changing.
 *
 * Written whether or not anything else about the block is — a section with a reveal and no hover is
 * ordinary — so this walks the page itself rather than reading `stateChanges`.
 *
 * The keyframes are not here: they are five, they are the same on every page, and they go out once
 * in `PAGE_CSS` (`reveal.ts`). What is per block is which one it names.
 */
export function revealRules(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string,
  classOf: (sid: string) => string | undefined = () => undefined,
  attribute?: string
): string {
  const out: string[] = [];
  for (const one of styledNodes(store, pageSid)) {
    const attrs = (store.getNode(one.sid) as Node | undefined)?.attributes;
    const kind = revealOf(attrs);
    if (!kind) continue;

    /*
     * **차례로**: the container's own arrival is given to what is inside it instead.
     *
     * A row of three cards that all appear at the same instant is the tell of a template, and the
     * fix cannot be an animation on the row — a scroll animation on a parent moves the whole thing.
     * So a container that says `revealStagger` animates its **children**, each starting a little
     * further along the scroll, and does not animate itself. Which is also why the two are one
     * choice in the panel rather than two: a block either arrives, or what is in it does.
     */
    /*
     * `(sid) => store.getNode(sid)` rather than `store.getNode` — the bound method loses its `this`,
     * and `DataStore.getNode` resolves an alias through it. The test found it immediately, which is
     * the argument for a test that runs the real store rather than a fake with one method on it.
     */
    const inside =
      attrs?.revealStagger === true
        ? blocksIn({ getNode: (sid: string) => store.getNode(sid) } as never, one.sid)
        : [];
    if (inside.length > 1) {
      inside.forEach((sid, at) => {
        // A draft, and not merely a block hidden at this width — see `clean`. A section that arrives
        // only on a phone still arrives.
        if (neverShown((store.getNode(sid) as Node | undefined)?.attributes)) return;
        out.push(
          revealRule(
            whereFor({ sid, part: one.part }, classOf, attribute),
            kind,
            attribute !== undefined,
            at,
            inside.length
          )
        );
      });
      continue;
    }

    out.push(revealRule(whereFor(one, classOf, attribute), kind, attribute !== undefined));
  }
  return out.join('\n');
}

/**
 * What a node's own drawing amounts to, at one width.
 *
 * **`stackCss`, the renderer's own** — not `frameCss` plus this file's copy of the page's defaults,
 * which is what it was. The copy had one of the two (`alignItems: stretch`) with a comment saying
 * the export "has to carry it", and the day the renderer stopped clipping by default the export kept
 * clipping: the editor drew `overflow: visible` and the published page said `hidden`, in the one
 * check whose entire job is that those two agree.
 *
 * That is the argument for export-as-a-render stated exactly: a second path is not a second
 * implementation of the same rule, it is a place for the rule to be *older*.
 */
export function cssFor(
  node: Node | undefined,
  at: BreakpointId,
  /**
   * How a `var:이름` becomes a colour — the document, which only a caller has.
   *
   * **Optional, and the day it was not passed cost something.** A media rule is not rendered, so the
   * resolution the renderer does on every node never happens here, and a narrower width whose card
   * says `fill: 'var:면'` published a stylesheet containing the literal `var:면`. A visitor's
   * browser has never heard of it: the rule is dropped and the card is transparent at that width
   * only. Found by the sample the day its cards started naming a token.
   */
  resolve?: (value: string, sid: string) => string | undefined,
  /**
   * And in which state, if not the resting one.
   *
   * A parameter rather than a second function, so that the before-and-after a state's rule is built
   * from is one function compared against itself. The alternative — a `cssForState` beside this —
   * is the second path this file's own header calls "a place for the rule to be older".
   */
  state?: StateId
): Record<string, string> {
  const attrs = attrsInState((node?.attributes ?? {}) as Record<string, unknown>, at, state);
  const stack = node?.stype === 'frame' || node?.stype === 'collection';
  const named = resolve ? resolved(attrs, String(node?.sid ?? ''), resolve) : attrs;

  return {
    ...(stack ? (stackCss(named as never) as Record<string, string>) : {}),
    ...(sizingCss(named as never) as Record<string, string>),
    /*
     * And **where the block is**, which a media query has to be able to change: a header that is
     * sticky at 1280 and ordinary at 390 is the commonest thing anybody does with this, and a
     * badge's offsets are different numbers on a phone.
     *
     * `stackCss` already answers it for a frame; this adds it for the nodes that are not stacks —
     * a picture lifted over a band is the second commonest.
     */
    ...(stack ? {} : (positionCss(named as never) as Record<string, string>))
  };
}

/**
 * The same resolution the renderer makes, as a function a caller can hand to `cssFor`.
 *
 * Exported because **two** things have to make it and get the same answer: the media rules the
 * export writes, and the test that compares those rules against what the editor drew. A test that
 * resolved differently from the export would be checking one of them against itself.
 */
export function resolverFor(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string
): (value: string, sid: string) => string | undefined {
  /*
   * From the **document's** root rather than the page's, and the difference is the whole answer.
   *
   * `resolveVarValue` walks up from the node to the root it is given, and a site's tokens live in a
   * `variables` node beside the pages rather than inside one — a page may declare its own, and
   * those win, which is exactly why the walk goes up. Given the page as the root it stopped one
   * level short of the document's, found nothing, and every token on the site resolved to nothing.
   */
  const rootId = rootOf(store, pageSid);

  return (value, sid) =>
    resolveVarValue({ rootId, getNode: (one: string) => store.getNode(one) } as never, value, sid);
}

/** Every `var:이름` in a node's attributes, as what it means — the renderer's `named`, here. */
function resolved(
  attrs: Record<string, unknown>,
  sid: string,
  resolve: (value: string, sid: string) => string | undefined
): Record<string, unknown> {
  let out: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (!isVarRef(value)) continue;
    const answer = resolve(value, sid);
    if (answer === undefined) continue;
    out = out ?? { ...attrs };
    out[key] = answer;
  }
  return out ?? attrs;
}

/** Every block on the page, in document order, including the ones inside placements' own children. */
function walk(
  store: { getNode: (sid: string) => Node | undefined },
  sid: string,
  each: (sid: string) => void,
  depth = 0
): void {
  if (depth > 64) return;
  const node = store.getNode(sid);
  if (!node) return;
  if (depth > 0) each(sid);
  for (const child of (node.content ?? []) as unknown[]) {
    if (typeof child === 'string') walk(store, child, each, depth + 1);
  }
}

/**
 * Every node a rule can be **about**, and how a rule has to name it.
 *
 * ## The hole this closed
 *
 * A rule was keyed by the node's own id and the nodes were found by walking the page. Which quietly
 * excluded everything inside a **component definition** — a definition lives beside the pages, not
 * in one, and what a page holds is a placement of it. So the header, the footer and both buttons —
 * the four things on this sample that appear on every page — could say `overrides: { mobile: … }`
 * and the published page would carry no media query for them at all.
 *
 * Found by a state rather than by a width, and only because a hover on the sample's button did not
 * reach the exported page. The width version of it had been there since media queries were written.
 *
 * ## Why a part is named by its ending
 *
 * A drawn part carries `placement~part` as its id, so one definition placed on five pages is five
 * different ids for one node — and the thing a reader edited was the **part**. `[data-b$="~part"]`
 * is the one selector that says that: every placement of this part, which is exactly what placing a
 * component means. The part's own id matches too, for the boards, where a definition being edited is
 * drawn on its own.
 */
interface Styled {
  sid: string;
  /** Whether it belongs to a definition, and so is drawn once per placement. */
  part: boolean;
}

function styledNodes(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string
): Styled[] {
  const found: Styled[] = [];
  const seen = new Set<string>();

  const add = (sid: string, part: boolean) => {
    if (seen.has(sid)) return;
    seen.add(sid);
    /*
     * Not a block a reader **hid**. `clean` takes the element out of the exported page, and a rule
     * naming a node that is not there is an orphan — measured after the removal landed: the element
     * was gone and its media query, its `:hover` and its arrival were all still in the stylesheet,
     * naming it.
     *
     * Harmless to a browser and not harmless to a reader: those rules are the one remaining trace
     * that a section exists at all, and hiding a draft is the gesture that says it should not be
     * published.
     */
    // The same question `clean` asks of the drawing: a block hidden at **every** width and in every
    // state is a draft and its rules go with it; a block shown on a phone, or when opened, keeps
    // both. Asked with one function, or the markup and the stylesheet disagree about what shipped.
    if (neverShown((store.getNode(sid) as Node | undefined)?.attributes)) return;
    found.push({ sid, part });
  };

  walk(store, pageSid, (sid) => add(sid, false));

  /*
   * And every definition in the document, because a placement of one may be on this page — asked of
   * the document root rather than of the page, which is the same walk `resolverFor` makes for a
   * token and for the same reason: what a page refers to lives one level above it.
   */
  const root = rootOf(store, pageSid);
  for (const definition of definitionsIn(store, root)) {
    walk(store, definition, (sid) => add(sid, true));
  }

  return found;
}

/**
 * Every definition in the document.
 *
 * Two levels, because that is where they are: a document holds a `components` container and the
 * definitions are in it, beside `resources` and `variables`. Pages are stepped over rather than
 * descended into — their nodes have already been walked, and a definition is never inside one.
 */
function definitionsIn(
  store: { getNode: (sid: string) => Node | undefined },
  root: string
): string[] {
  const found: string[] = [];
  for (const child of (store.getNode(root)?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const node = store.getNode(child);
    if (node?.stype === 'component') found.push(child);
    else if (node?.stype === 'components') {
      for (const one of (node.content ?? []) as unknown[]) {
        if (typeof one === 'string' && store.getNode(one)?.stype === 'component') found.push(one);
      }
    }
  }
  return found;
}

/** How a rule names one of them, given what the export called its element. */
function whereFor(
  one: Styled,
  classOf: (sid: string) => string | undefined,
  attribute = 'data-b'
): string {
  if (one.part) return `[${attribute}$="~${one.sid}"], [${attribute}="${one.sid}"]`;
  const named = classOf(one.sid);
  return named ? `.${named}` : `[${attribute}="${one.sid}"]`;
}

/** The document a page belongs to, walked up from it — `resolverFor`'s own climb, named. */
function rootOf(store: { getNode: (sid: string) => Node | undefined }, pageSid: string): string {
  let at = pageSid;
  for (let hop = 0; hop < 8; hop += 1) {
    const parent = store.getNode(at)?.parentId;
    if (typeof parent !== 'string' || !parent) return at;
    at = parent;
  }
  return at;
}

/** The entries of `after` that `before` does not already have. */
function changed(before: Record<string, string>, after: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(after)) if (before[key] !== value) out[key] = value;
  /*
   * And the ones that went away — a padding a narrow width took off has to be *unset*, not left
   * standing from the base. Written as the property's initial value rather than omitted, because a
   * media query can only add.
   */
  for (const key of Object.keys(before)) if (!(key in after)) out[key] = 'initial';
  return out;
}

/**
 * A page's **absolute** address, or nothing when the site has not said where it lives.
 *
 * Joined here rather than by the caller because the two halves disagree about slashes in exactly the
 * way that produces `https://example.com//about` and `https://example.compricing` — one of which a
 * crawler follows to a 404 and the other to nowhere at all.
 */
export function addressOf(
  store: { getNode: (sid: string) => Node | undefined },
  rootId: string | undefined,
  path: string
): string | undefined {
  const said = rootId ? (store.getNode(rootId) as Node | undefined)?.attributes?.address : undefined;
  if (typeof said !== 'string' || !said.trim()) return undefined;
  return `${said.trim().replace(/\/+$/, '')}/${String(path ?? '/').replace(/^\/+/, '')}`;
}

/**
 * The first block on a page that says it is a given landmark, in document order.
 *
 * The **first**, and a page with two `main`s is a document fault the panel reports — see
 * `documentFaults`. This one takes the first rather than refusing, because an export that would not
 * publish a page over a landmark a reader can see and fix in the panel is an export that has decided
 * something the reader has not.
 */
function firstLandmark(
  store: { getNode: (sid: string) => Node | undefined },
  pageSid: string,
  want: string
): string | undefined {
  let found: string | undefined;
  const look = (sid: string, depth = 0) => {
    if (found || depth > 64) return;
    const node = store.getNode(sid);
    if (!node) return;
    if (node.attributes?.landmark === want) {
      found = sid;
      return;
    }
    for (const child of (node.content ?? []) as unknown[]) {
      if (typeof child === 'string') look(child, depth + 1);
    }
  };
  look(pageSid);
  return found;
}

/** A style map as CSS text, in the notation a stylesheet uses. */
function declarations(css: Record<string, string>): string {
  return Object.entries(css)
    .map(([key, value]) => `${dashed(key)}: ${value};`)
    .join(' ');
}

/** A property as CSS spells it — the one place the two notations meet. */
function dashed(key: string): string {
  return key.replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`);
}

/**
 * The document around the page.
 *
 * Deliberately small: the drawing carries its own styles inline, so what is left is the things a
 * *document* has — a character set, a viewport, a title — plus the media queries. No framework, no
 * reset beyond the two rules a page cannot do without, and nothing that would make the published
 * page depend on this repository being installed.
 *
 * And `PAGE_CSS`, which is the page's own **type scale** — the same bytes the editor's boards draw
 * with. Without it a browser applied its own: `h1` at 2em with a margin the model never asked for,
 * while the editor drew the same heading at the app's 12px chrome size. Two grounds, one document,
 * and export-as-a-render cannot mean anything while they differ.
 */
function document_(
  name: string,
  body: string,
  responsive: string,
  /** What the page is about, and where its body begins — see below. Both may be absent. */
  said?: {
    description?: string;
    main?: string;
    at?: string;
    image?: string;
    /** The one line of script a page ships when it has an openable block and a same-page link. */
    script?: string;
    /** The picture in a browser tab, already resolved to the file the archive will hold. */
    icon?: { href: string; type: string };
    /** Whether this page may be indexed — the page-level half of `robots.txt`. */
    noIndex?: boolean;
    /**
     * **What the site is set in**, as one rule after the page's own stylesheet.
     *
     * After rather than inside `PAGE_CSS`, because that is the same bytes the boards draw with: the
     * type is a *document's* answer and the stylesheet is the product's, and folding one into the
     * other would make the page's own CSS differ between two sites.
     */
    type?: string;
  }
): string {
  /*
   * **What a crawler and a chat read.**
   *
   * Measured before this existed: the page had a `lang`, a `<title>`, a viewport and no script, and
   * **no description and no Open Graph at all**. So a search result showed whatever an engine could
   * scrape from the first paragraph, and a page pasted into a chat unfurled as a bare address.
   *
   * Written only when a reader has written one. A `<meta name="description" content="">` is worse
   * than none — it tells an engine the page has been described and the description is nothing — and
   * `og:title` alone is an unfurl with a heading and no body, which is what a template looks like.
   *
   * `og:url` is **not** here, and its absence is a finding rather than an omission: Open Graph needs
   * an absolute address and a site in this product has no address of its own. See `BACKLOG.md`.
   */
  const about = said?.description?.trim();
  const meta = [
    ...(about
      ? [
          `<meta name="description" content="${escape(about)}">`,
          `<meta property="og:type" content="website">`,
          `<meta property="og:title" content="${escape(name)}">`,
          `<meta property="og:description" content="${escape(about)}">`
        ]
      : []),
    /*
     * And **where this page is**, which needs the site's own address: Open Graph will not take a
     * relative one and a canonical link that is relative says the page is canonical to itself, which
     * is what a duplicate looks like to a crawler. A site that has not said gets neither.
     */
    ...(said?.at
      ? [
          `<link rel="canonical" href="${escape(said.at)}">`,
          `<meta property="og:url" content="${escape(said.at)}">`
        ]
      : []),
    /**
     * And **the picture**, which is the half of an unfurl people actually look at.
     *
     * A title and a description with no image is the unfurl a chat draws as two lines of grey text;
     * every service that shows one gives the image about nine tenths of the space. It was the last
     * thing missing from the head and the cheapest.
     *
     * **Absolute or nothing.** Open Graph will not take a relative address — a crawler fetching the
     * card has no page to resolve it against — so a relative one is joined onto the site's own
     * address, and a site that has not said where it lives gets no image tag rather than a broken
     * one. That is the same rule `og:url` follows two lines up, and the same reason: a tag that is
     * present and wrong is worse than one that is absent, because nothing ever reports it.
     *
     * **And a `data:` is not an address**, which this rule used to let through — found by putting a
     * description on the sample and then asking what its picture would be, since every picture this
     * sample draws is generated and inlined. A crawler does not render the page and does not read
     * a `data:`; it takes what `og:image` says and *fetches* it. So an inlined picture wrote the
     * exact tag this comment argues against: present, plausible in the source, and an unfurl that
     * comes back empty from every service that draws one.
     *
     * A picture that is going to be shared has to be a **file**, which is what `asset:` is for.
     *
     * `twitter:card` beside it because without it X draws the small square thumbnail whatever the
     * image is, and one word is the difference between a banner and a postage stamp.
     */
    ...(() => {
      const picture = said?.image?.trim();
      if (!picture) return [];
      /*
       * Refused **before** the join, not merely left out of the absolute test — which is where this
       * first went, and it was worse than the fault it fixed: a `data:` is not `https?:`, so it fell
       * to the relative branch and was pasted onto the site's address as
       * `https://barocss.com/data:image/svg+xml;base64,…`. A tag that is present and wrong, written
       * by the line whose comment says that is the one thing to avoid.
       */
      if (/^[a-z][a-z0-9+.-]*:/i.test(picture) && !/^https?:/i.test(picture)) return [];
      const absolute = /^https?:/i.test(picture)
        ? picture
        : said?.at
          ? `${said.at.replace(/\/[^/]*$/, '')}/${picture.replace(/^\/+/, '')}`
          : undefined;
      return absolute
        ? [
            `<meta property="og:image" content="${escape(absolute)}">`,
            `<meta name="twitter:card" content="summary_large_image">`
          ]
        : [];
    })()
  ].join('\n');

  /*
   * **A way past the navigation**, for a visitor who is tabbing.
   *
   * The first thing on every page of this sample is a header with four links in it, so reaching the
   * words costs five presses of Tab — on every page, every time. The link every accessible site has
   * is one line, and it could not be written until a page could say **where its body is**: a skip
   * link that points at nothing is worse than none, because it looks like the page has one.
   *
   * Visually hidden until it has the focus, which is the whole convention: it is for the reader who
   * is already tabbing, and it must not be a stray line above the header for everyone else.
   */
  const skip = said?.main
    ? `<a class="st-skip" href="#${escape(said.main)}">본문으로 건너뛰기</a>`
    : '';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(name)}</title>
${said?.icon ? `<link rel="icon" href="${escape(said.icon.href)}" type="${escape(said.icon.type)}">` : ''}
${said?.noIndex ? '<meta name="robots" content="noindex">' : ''}
${meta}
<style>
.st-skip {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 9;
  padding: 8px 14px;
  background: #ffffff;
  color: #111111;
  border: 1px solid #111111;
}
.st-skip:focus { left: 8px; top: 8px; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; }
${PAGE_CSS}
${said?.type ?? ''}
${responsive}
</style>
</head>
<body>
${skip}
${body}
${said?.script ? `<script>${said.script}</script>` : ''}
</body>
</html>
`;
}

/*
 * There is **no script**, and its absence is the point.
 *
 * There was one for a round: the code blocks were coloured by painting ranges at runtime, so a
 * published page had to run our function to be coloured at all. Prism tokenizes in the **renderer**
 * now, which means the spans are in the markup the export writes — the editor and the visitor get
 * the same bytes, and a page a visitor opens needs nothing to run.
 */

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
