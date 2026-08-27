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
import { STATES, attrsInState, hasStates, statesOf, type StateId } from './states';
import { isHidden } from './presence';
import { revealOf, revealRule } from './reveal';
import { PAGE_CSS } from './page-css';
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

  const name = String(page?.attributes?.name ?? '');
  const path = String(page?.attributes?.path ?? '/');

  return {
    path,
    name,
    html: document_(
      name,
      host.innerHTML,
      [lifted.css, responsive, states, reveals].filter(Boolean).join('\n\n')
    )
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
    hidden.remove();
  }

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

  for (const change of changes) {
    const selector = whereFor(change, classOf)
      .split(', ')
      .map((one) => `${one}${selectorOf(change.state)}`)
      .join(', ');
    const rule = `${selector} { ${declarations(change.css)} }`;
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

  for (const change of changes) {
    const at = change.width ? `[data-frame="${change.width}"] ` : '';
    const said = Object.entries(change.css)
      .map(([key, value]) => `${dashed(key)}: ${value} !important;`)
      .join(' ');
    const where = whereFor(change, () => undefined, 'data-bc-sid').split(', ');
    rules.push(`${where.map((one) => `${at}${one}${selectorOf(change.state)}`).join(', ')} { ${said} }`);

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
 * ## Why it is on the block and not in the `:hover`
 *
 * A `transition` declared inside `:hover` animates the arrival and not the leaving — the colour
 * eases in over 160ms and snaps back the instant the pointer goes. It is the classic half-built
 * hover, and it is one line's difference. Declared on the block, both directions are the same
 * gesture, which is what a reader means by *this card fades*.
 *
 * A property here can be a **shorthand** — a state that changes a stroke's colour changes the whole
 * `border` declaration, so the rule names `border` — and that is safe rather than lucky. A shorthand
 * transitions its parts, and the part that would reflow is `border-width`, which a state cannot
 * change: `STATEABLE` leaves `strokeWidth` out for exactly that reason, so the width is identical in
 * both rules and there is nothing there to animate.
 *
 * ## One curve, and why it is that one
 *
 * `cubic-bezier(0.2, 0, 0, 1)` — fast to leave, slow to settle. It is the curve every system with a
 * considered one has converged on, for a reason that is about eyes rather than taste: a change that
 * starts fast is *noticed*, and a change that ends slowly can be *followed*. `linear` reads as
 * mechanical and `ease-in` reads as laggy, because the first thing it does is nothing.
 *
 * The refinement this leaves on the table, so it is a decision and not an omission: enter and leave
 * ideally use different curves (out on the way in, in on the way out), which needs the base rule and
 * the state rule to carry one each. Worth doing the day a reader can choose a curve at all; today
 * they cannot, and one curve in one place is the honest shape of that.
 */
function transitionsFor(
  store: { getNode: (sid: string) => Node | undefined },
  changes: StateChange[],
  classOf: (sid: string) => string | undefined,
  /** The attribute the selector matches on — `data-b` on a published page, the sid on a board. */
  attribute?: string
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

    const said = [...keys].map((key) => `${key} ${Math.max(0, Math.round(ms))}ms ${EASE}`).join(', ');
    out.push([whereFor(one, classOf, attribute), `transition: ${said};`]);
  }
  return out;
}

/** See `transitionsFor` for why this curve and not another. */
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

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
    const kind = revealOf((store.getNode(one.sid) as Node | undefined)?.attributes);
    if (!kind) continue;
    out.push(revealRule(whereFor(one, classOf, attribute), kind, attribute !== undefined));
  }
  return out.join('\n');
}

/** The CSS a state is, by its id — one lookup, so neither notation can invent its own. */
function selectorOf(state: StateId): string {
  return STATES.find((one) => one.id === state)?.selector ?? '';
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
    if (isHidden((store.getNode(sid) as Node | undefined)?.attributes)) return;
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
function document_(name: string, body: string, responsive: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(name)}</title>
<style>
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; }
${PAGE_CSS}
${responsive}
</style>
</head>
<body>
${body}
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
