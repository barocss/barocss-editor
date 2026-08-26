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
import { BASE_BREAKPOINT, attrsAt, overridesOf } from './responsive';
import { sizingCss } from './sizing';
import { pagesOf } from './selection';

type Node = Record<string, any>;

export interface ExportedPage {
  /** Where it answers. */
  path: string;
  /** What a reader calls it, which is also the browser tab's words. */
  name: string;
  /** A complete document, openable on its own. */
  html: string;
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

/** One page. */
export function exportPage(editor: Editor, pageSid: string): ExportedPage {
  const store = editor.dataStore!;
  const page = store.getNode(pageSid) as Node;

  const host = drawn(editor, pageSid);
  const lifted = lift(host);
  const responsive = mediaRules(store, pageSid, lifted.classOf);

  const name = String(page?.attributes?.name ?? '');
  const path = String(page?.attributes?.path ?? '/');

  return {
    path,
    name,
    html: document_(name, host.innerHTML, [lifted.css, responsive].filter(Boolean).join('\n\n'))
  };
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
    [SITE_ENV_KEY]: createSiteEnv(BASE_BREAKPOINT)
  } as never);

  const tree = editor.getDocumentProxy?.(pageSid);
  if (!tree) return host;
  renderer.render(host, tree as never, [], undefined);

  return clean(host);
}

/** Everything an editor puts in a drawing that a reader has no use for. */
function clean(host: HTMLElement): HTMLElement {
  for (const filler of [...host.querySelectorAll('[data-bc-filler]')]) filler.remove();

  for (const el of [host, ...host.querySelectorAll('*')] as HTMLElement[]) {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    el.removeAttribute('data-bc-layer');
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
  return host;
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
  const blocks: string[] = [];
  walk(store, pageSid, (sid) => blocks.push(sid));

  const resolve = resolverFor(store, pageSid);

  const widths = BREAKPOINTS.filter((one) => one.id !== BASE_BREAKPOINT)
    // Widest first, so a narrower rule wins by coming later — the same cascade `attrsAt` runs.
    .sort((a, b) => b.width - a.width);

  const chunks: string[] = [];
  for (const width of widths) {
    const rules: string[] = [];
    for (const sid of blocks) {
      const node = store.getNode(sid);
      const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
      if (Object.keys(overridesOf(attrs)).length === 0) continue;

      const differs = changed(
        cssFor(node, BASE_BREAKPOINT, resolve),
        cssFor(node, width.id, resolve)
      );
      if (Object.keys(differs).length === 0) continue;

      const where = classOf(sid);
      rules.push(`  ${where ? `.${where}` : `[data-b="${sid}"]`} { ${declarations(differs)} }`);
    }
    if (rules.length > 0) {
      chunks.push(`@media (max-width: ${width.width}px) {\n${rules.join('\n')}\n}`);
    }
  }
  return chunks.join('\n\n');
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
  resolve?: (value: string, sid: string) => string | undefined
): Record<string, string> {
  const attrs = attrsAt((node?.attributes ?? {}) as Record<string, unknown>, at);
  const stack = node?.stype === 'frame' || node?.stype === 'collection';
  const named = resolve ? resolved(attrs, String(node?.sid ?? ''), resolve) : attrs;

  return {
    ...(stack ? (stackCss(named as never) as Record<string, string>) : {}),
    ...(sizingCss(named as never) as Record<string, string>)
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
  const rootId = (() => {
    let at = pageSid;
    for (let hop = 0; hop < 8; hop += 1) {
      const parent = store.getNode(at)?.parentId;
      if (typeof parent !== 'string' || !parent) return at;
      at = parent;
    }
    return at;
  })();

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

/** A style map as CSS text, in the notation a stylesheet uses. */
function declarations(css: Record<string, string>): string {
  return Object.entries(css)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`)}: ${value};`)
    .join(' ');
}

/**
 * The document around the page.
 *
 * Deliberately small: the drawing carries its own styles inline, so what is left is the things a
 * *document* has — a character set, a viewport, a title — plus the media queries. No framework, no
 * reset beyond the two rules a page cannot do without, and nothing that would make the published
 * page depend on this repository being installed.
 */
function document_(name: string, body: string, responsive: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(name)}</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
${responsive}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
