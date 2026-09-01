import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import {
  STATEABLE,
  STATES,
  attrsInState,
  hasStates,
  stateFaults,
  statedIn,
  statesOf,
  withState
} from '../src/states';
import {
  drawnHtml,
  editorStateCss,
  exportPage,
  mediaRules,
  stateChanges,
  stateRules
} from '../src/export-html';
import { documentFaults, FAULT_KINDS, holderOf } from '../src/faults';
import { sizingCss } from '../src/sizing';
import { positionCss } from '../src/position';
import { definitionsOf } from '../src/components';
import { pagesOf } from '../src/selection';

/**
 * What a block says while a pointer is on it.
 *
 * The arithmetic first — it is the same shape as an override and can be held in a millisecond — and
 * then the thing that makes a state *not* an override: it leaves the drawing as a **rule** rather
 * than being folded into it, because no renderer can be told that a visitor is hovering.
 */
describe('what a block says under the pointer', () => {
  const card = {
    fill: '#FFFFFF',
    cornerRadius: 180,
    gap: 240,
    overrides: { mobile: { gap: 120 } },
    states: { hover: { fill: '#0F7A5A' } }
  };

  it('is the block itself when no state is asked for', () => {
    // The same object identity `attrsAt` promises: silence costs nothing, and a state is silence
    // until a visitor does something.
    expect(attrsInState(card, 'desktop')).toBe(attrsInState(card, 'desktop'));
    expect(attrsInState(card, 'desktop').fill).toBe('#FFFFFF');
  });

  it('replaces only what it names, over the width that is already applied', () => {
    const at = attrsInState(card, 'mobile', 'hover');
    // The state's own.
    expect(at.fill).toBe('#0F7A5A');
    // The width's, still underneath it — a hover does not undo a mobile layout.
    expect(at.gap).toBe(120);
    expect(at.cornerRadius).toBe(180);
  });

  it('hands the renderer neither map', () => {
    const at = attrsInState(card, 'mobile', 'hover');
    expect(at.states).toBeUndefined();
    expect(at.overrides).toBeUndefined();
  });

  it('says which attributes a state changed', () => {
    expect(statedIn(card, 'hover')).toEqual(['fill']);
    expect(statedIn(card, 'focus')).toEqual([]);
    expect(statedIn(card, undefined)).toEqual([]);
  });

  it('adds, replaces and takes back one statement, pruning what is left empty', () => {
    expect(withState(card, 'hover', 'cornerRadius', 360).hover).toEqual({
      fill: '#0F7A5A',
      cornerRadius: 360
    });
    // Not `{ hover: {} }`, which is a line in a saved file a reader would have to wonder about.
    expect(withState(card, 'hover', 'fill', undefined).hover).toBeUndefined();
  });

  it('is checkable, which is why it is allowed to be a map', () => {
    const declared = ['fill', 'cornerRadius', 'gap'];
    expect(stateFaults(card, declared)).toEqual([]);

    // A state no browser has.
    expect(stateFaults({ states: { pressed: { fill: '#000' } } }, declared)).toEqual([
      "'pressed' 상태는 그려지지 않습니다"
    ]);

    /*
     * And the one that is arithmetic rather than taste: a gap on hover resizes the block, the block
     * moves out from under the pointer, the pointer is then not on it, and the browser draws the two
     * states alternately for as long as the visitor holds still.
     */
    expect(stateFaults({ states: { hover: { gap: 1 } } }, declared)).toEqual([
      "'hover'에서 'gap'을(를) 바꾸면 블록이 포인터 아래에서 벗어납니다"
    ]);

    // An attribute this node does not have — `overrideFaults`' check, for the same reason.
    expect(stateFaults({ states: { hover: { fill: '#000' } } }, ['level'])).toEqual([
      "'hover'에서 'fill'을(를) 바꾸는데, 이 블록에는 없는 속성입니다"
    ]);
  });

  it('offers paint and not the border’s width', () => {
    /*
     * A border is drawn inside the box, so on a block whose height is its content's a wider border
     * on hover reflows the text in it. The colour is the half that is safe, and it is the half every
     * design system actually uses — a transparent border of the final width in the base.
     */
    expect(STATEABLE).toContain('stroke');
    expect(STATEABLE).not.toContain('strokeWidth');
    expect(STATEABLE).not.toContain('padding');
  });

  it('asks the browser its own question about the keyboard', () => {
    // `:focus`, not `:focus-visible`, would flash a keyboard ring at every visitor who clicks.
    expect(STATES.find((one) => one.id === 'focus')?.selector).toBe(':focus-visible');
  });

  it('is nothing at all when a block says nothing', () => {
    expect(hasStates({ fill: '#fff' })).toBe(false);
    expect(statesOf({ states: { hover: {} } })).toEqual({});
  });
});

/**
 * And the same thing as a **rule**, in both grounds it has to hold in.
 *
 * A published page has no inline styles left, so a selector wins on its own; a board is drawn inline
 * by design, and nothing beats an inline style but `!important`. One calculation, two notations —
 * and a test that they carry the same declarations, because the day they do not is the day the
 * editor and the visitor disagree about a colour.
 */
describe('a state, published and drawn', () => {
  /** The colour **this test** puts on a card, which is nothing to do with the sample's palette. */
  const HOVER = '#0F7A5A';

  let editor: any;
  let store: DataStore;
  let home: string;
  let card: string;

  beforeAll(async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;

    // A block of the real page, told to answer differently under the pointer.
    const found: string[] = [];
    const walk = (sid: string, depth = 0) => {
      if (depth > 40) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.stype === 'frame' && depth > 1) found.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(home);
    card = found[0];
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { state: 'hover', fill: HOVER });
  });

  it('writes the state through the command a panel runs', () => {
    expect(statesOf((store.getNode(card) as any).attributes).hover).toEqual({ fill: HOVER });
  });

  it('refuses an arrangement in a state rather than writing one', async () => {
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { state: 'hover', gap: 999 });
    expect(statesOf((store.getNode(card) as any).attributes).hover).toEqual({ fill: HOVER });
  });

  it('ignores the width it was set at, because a state is not a width', async () => {
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { at: 'mobile', state: 'hover', cornerRadius: 360 });
    const attrs = (store.getNode(card) as any).attributes;
    // In the states, not in the mobile overrides: the gesture is the same gesture at every width.
    expect(statesOf(attrs).hover?.cornerRadius).toBe(360);
    expect((attrs.overrides?.mobile ?? {}).cornerRadius).toBeUndefined();
  });

  it('leaves the page as a promise about a colour, not as the colour', () => {
    const changes = stateChanges(store as never, home);
    const mine = changes.filter((one) => one.sid === card);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].state).toBe('hover');
    expect(mine[0].css.backgroundColor).toBe(HOVER);
  });

  /**
   * The sample's own colour, **read from the document** rather than written here.
   *
   * One of these three held `#0B5C44` — the sample's pressed-in brand colour, copied into the test
   * as a literal — and a change of palette broke it. That check is not about a colour: it is about a
   * *token resolving* inside a definition, and it has to ask the document what the token says.
   *
   * The other two are about a colour this test wrote itself (`HOVER`), which is a different thing
   * and stays a literal. Mixing the two is what made a palette change look like a broken feature.
   */
  const tokenValue = (name: string): string => {
    const root = store.getNode(editor.getRootId()) as any;
    for (const sid of (root?.content ?? []) as string[]) {
      const box = store.getNode(sid) as any;
      if (box?.stype !== 'variables') continue;
      for (const each of (box.content ?? []) as string[]) {
        const one = store.getNode(each) as any;
        if (one?.attributes?.name === name) return String(one.attributes.value);
      }
    }
    throw new Error(`no token ${name}`);
  };

  it('publishes it as a selector the browser already knows', () => {
    const css = stateRules(store as never, home);
    expect(css).toContain(':hover');
    expect(css).toContain(HOVER);
    /*
     * And with no `!important` in it. A published page a reader cannot restyle with their own CSS is
     * a page that is not really theirs, and this file has promised that since it was written.
     */
    expect(css).not.toContain('!important');
  });

  it('draws it on the boards, where nothing else beats an inline style', () => {
    const css = editorStateCss(store as never, home);
    expect(css).toContain(`[data-bc-sid="${card}"]:hover`);
    expect(css).toContain('!important');
    // The same declaration, in the other notation — one calculation, two ways of writing it down.
    expect(css).toContain(`background-color: ${HOVER}`);
  });

  it('reaches a placement of a definition, on every page it is placed on', () => {
    /*
     * The sample's button is a **component**, and a component lives beside the pages rather than in
     * one. Keyed by the node's own id and found by walking the page, its hover reached nothing — and
     * neither had its width overrides, since media queries were written. The rule names the part by
     * its ending, because a drawn part is `placement~part` and one definition placed five times is
     * five ids for the thing a reader edited once.
     */
    const css = stateRules(store as never, home);
    expect(css).toContain('~');
    expect(css).toContain(tokenValue('강조진함'));
  });

  it('gives a definition’s width overrides the media query they never got', () => {
    // The same hole, found by a state and older than states: the footer says it stacks at 390.
    const rules = mediaRules(store as never, home);
    expect(rules).toContain('~');
  });

  it('reaches the visitor, inside the document the export writes', () => {
    const page = exportPage(editor, home);
    expect(page.html).toContain(':hover');
    expect(page.html).toContain('#0F7A5A');
    // After the media queries: a state written for one width has to arrive after the width it is
    // about, or the width would have the last word over the pointer.
    expect(page.html.indexOf(':hover')).toBeGreaterThan(page.html.indexOf('@media'));
  });
});

/**
 * And **how long it takes to get there**.
 *
 * The pairing every design system has and this one had no word for: a hover that arrives instantly
 * reads as a bug on anything larger than a link, because the eye sees a replacement rather than a
 * change and cannot tell what caused it.
 *
 * The interesting decision is not the number, it is **which properties are named**. `transition: all`
 * is what a hand-written page says and it is wrong here for a reason this product can be precise
 * about: a state has already been computed down to the exact declarations it changes, so the rule
 * can name those and nothing else. No guessed list to fall behind `STATEABLE`, and no chance of
 * animating something a state cannot even set.
 */
describe('how long a block takes to answer the pointer', () => {
  let editor: any;
  let store: DataStore;
  let home: string;
  let card: string;

  const rulesNow = () => stateRules(store as never, home);
  /**
   * The sheet's rules about **this** block.
   *
   * A whole-stylesheet `not.toContain('transition')` was a question about the block under test right
   * up until the sample grew a block of its own that fades — the hamburger, whose hover is 120ms. It
   * then failed while reporting on a different block, and took four tests after it down with it: the
   * one that failed here was the one that *restored* the value the rest depend on.
   *
   * Matched by the whole selector rather than by the sid, because `site:5` is a substring of
   * `site:50`.
   */
  const mine = () =>
    rulesNow()
      .split('\n')
      .filter((one) => one.includes(`[data-b="${card}"]`))
      .join('\n');
  const attrs = () => (store.getNode(card) as any).attributes as Record<string, unknown>;

  beforeAll(async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;

    const found: string[] = [];
    const walk = (sid: string, depth = 0) => {
      if (depth > 40) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.stype === 'frame' && depth > 1) found.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(home);
    card = found[0];
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { state: 'hover', fill: '#0F7A5A' });
  });

  it('says nothing at all until a reader asks for it', () => {
    expect(attrs().transitionMs).toBeUndefined();
    // Not `transition: 0ms` on every block that has a hover. A block nobody has told answers the way
    // it always did, and a block that says nothing about time carries no rule about time.
    expect(mine()).not.toContain('transition');
  });

  it('is written on the block, not inside the state', async () => {
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { transitionMs: 160 });

    expect(attrs().transitionMs).toBe(160);
    // A state says what a block *becomes*; this says how it gets there, so it is not one of the
    // things `STATEABLE` allows a state to name.
    expect(statesOf(attrs()).hover).toEqual({ fill: '#0F7A5A' });
    expect(STATEABLE).not.toContain('transitionMs');
  });

  it('names exactly the properties its states change, and no others', () => {
    const css = rulesNow();
    // The card's hover changes its fill and nothing else, so that is the whole rule.
    expect(css).toContain('transition: background-color 160ms');
    expect(css).not.toContain('transition: all');
    // Nothing that would move the block: a state cannot set one, so the rule cannot name one.
    expect(css).not.toMatch(/transition:[^;]*\b(width|height|padding|gap|margin)\b/);
  });

  it('is on the block, and again on the state, with a different curve each way', () => {
    const css = rulesNow();
    const lines = css.split('\n').filter((one) => one.includes('transition:'));

    /*
     * **Two curves**, and this is the whole of how they fit on one property: a browser reads the
     * transition of the ruleset it is going *to*, so the state's rule governs the arrival and the
     * block's own governs the return.
     *
     * Which is why one curve was half an answer rather than a simplification. A `transition` only on
     * the block eases in the same way it eases out; only inside `:hover` it eases in and **snaps
     * back**, which is the classic half-built hover.
     */
    const base = lines.find((one) => !one.includes(':hover'))!;
    const hover = lines.find((one) => one.includes(':hover'))!;
    expect(base).toBeTruthy();
    expect(hover).toBeTruthy();

    // Arriving: fast to leave, slow to settle — what makes a change noticed and then followable.
    expect(hover).toContain('cubic-bezier(0.2, 0, 0, 1)');
    // Leaving: the other way round, so the thing lets go rather than being snatched away.
    expect(base).toContain('cubic-bezier(0.4, 0, 1, 1)');
    expect(base).not.toContain('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('says nothing about time in either rule until a reader asks', async () => {
    // The pair is still one attribute: silence on the block is silence in both directions.
    await editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { transitionMs: undefined });
    expect(mine()).not.toContain('transition');
    await editor.executeCommand('setBlockFormat', { transitionMs: 160 });
  });

  it('is drawn on the boards too, so a designer sees what a visitor will', () => {
    const css = editorStateCss(store as never, home);
    expect(css).toContain('transition: background-color 160ms');
  });

  it('reaches the visitor, before the rule it is about', () => {
    const page = exportPage(editor, home);
    expect(page.html).toContain('transition: background-color 160ms');
    // A `transition` declared after the `:hover` it belongs to still works — it is on a different
    // selector — but a reader opening the stylesheet should meet the block before its states.
    expect(page.html.indexOf('transition:')).toBeLessThan(page.html.lastIndexOf(':hover'));
  });

  it('can be taken back, and instantly is a thing a reader can ask for', async () => {
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { transitionMs: 0 });
    // Zero is a decision and it is drawn as one: a block that says it answers instantly and a block
    // nobody has told are the same drawing and different documents.
    expect(attrs().transitionMs).toBe(0);
    expect(rulesNow()).toContain('transition: background-color 0ms');

    await editor.executeCommand('setBlockFormat', { transitionMs: undefined });
    expect(attrs().transitionMs).toBeUndefined();
    expect(mine()).not.toContain('transition');
  });
});

/**
 * And the checks, run over a real document — which none of them were.
 *
 * Three functions in this package answer "what is wrong with this", each with a unit test beside it,
 * and until `faults.ts` nothing asked any of them about the sample. A check nobody runs reads to the
 * next person exactly like a check that passes.
 */
describe('what is wrong with the document', () => {
  let doc: any;
  let declares: (node: { stype?: unknown }) => string[];

  beforeAll(() => {
    registerSiteRenderers();
    const definition = getSiteSchemaDefinition();
    const schema = createSchema('site', definition);
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };

    const nodes = (definition as any).nodes as Record<string, any>;
    declares = (node) => Object.keys(nodes[String(node?.stype ?? '')]?.attrs ?? {});
  });

  it('finds nothing wrong with the sample', () => {
    expect(documentFaults(doc, { declares })).toEqual([]);
  });

  it('finds a fault through the walk rather than being handed one', () => {
    const one = {
      rootId: 'r',
      getNode: (sid: string) =>
        sid === 'r'
          ? { sid: 'r', stype: 'frame', attributes: { states: { hover: { padding: 10 } } }, content: [] }
          : undefined
    };
    expect(documentFaults(one as never, { declares: () => ['padding'] })).toEqual([
      {
        sid: 'r',
        kind: 'state',
        said: "'hover'에서 'padding'을(를) 바꾸면 블록이 포인터 아래에서 벗어납니다"
      }
    ]);
  });

  /*
   * And the half a list needs before it is a list a reader can act on. Both of these are about the
   * surface rather than the arithmetic, which is why they live here: `documentFaults` had been
   * correct and unreadable for as long as nothing drew it.
   */
  it('names every kind it can report, so no group is drawn without a heading', () => {
    // A `kind` `Fault` can carry and `FAULT_KINDS` does not name is a group of rows with no title.
    const named = new Set(FAULT_KINDS.map((one) => one.id));
    expect([...named].sort()).toEqual([
      'address',
      'asset',
      'data',
      'form',
      'found',
      'landmark',
      'link',
      'press',
      'reference',
      'state',
      'width'
    ]);
    // Each says *why*, because a list that only says what is wrong teaches a reader to dismiss it.
    for (const kind of FAULT_KINDS) expect(kind.why.length).toBeGreaterThan(10);
  });

  it('says which page or definition holds a node, which is where a reader has to go', () => {
    const home = pagesOf(doc)[0];
    // A block deep inside the home page answers with the page, walked up rather than searched down.
    const deep = (function first(sid: string, depth = 0): string {
      const node = doc.getNode(sid);
      const child = (node?.content ?? []).find((one: unknown) => typeof one === 'string');
      return child && depth < 8 ? first(child, depth + 1) : sid;
    })(home.sid);
    expect(holderOf(doc, deep)).toEqual({ kind: 'page', sid: home.sid, name: home.name });

    // A page answers with itself: a fault on the page *is* on the page.
    expect(holderOf(doc, home.sid)?.sid).toBe(home.sid);

    // And a definition is not a page — it is reached by opening it, and by its id rather than sid.
    const definition = definitionsOf(doc)[0];
    const part = definition.part!;
    expect(holderOf(doc, part)).toEqual({
      kind: 'component',
      sid: definition.id,
      name: definition.name
    });

    // Nothing at all for a node that is not there, rather than a made-up place.
    expect(holderOf(doc, 'no-such-node')).toBeUndefined();
  });
});

/**
 * 열림 — the state a visitor **decides**.
 *
 * The other two are things a visitor happens into and the browser already knows how to ask about. A
 * page has no pseudo-class for *somebody pressed this*, so the published page grows a control it did
 * not have before, and this is where that control is held to being real: in the markup, in the focus
 * order, and in a rule that names the two elements next to each other.
 *
 * Built out of two ordinary blocks rather than out of the sample's, deliberately — an accordion, a
 * hamburger and a 더보기 are the same two blocks in a different order, and a test that used the
 * sample's navigation bar would be testing the sample.
 */
describe('a block a visitor opens', () => {
  let editor: any;
  let store: DataStore;
  let home: string;
  let opener: string;
  let menu: string;

  beforeAll(async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;

    // Two frames that are siblings, which is what a bar and the menu under it are.
    const found: string[] = [];
    const walk = (sid: string, depth = 0) => {
      if (depth > 40) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.stype === 'frame' && depth > 1) found.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(home);
    [opener, menu] = found;

    // The menu is not on the page until it is asked for.
    store.updateNode(menu, {
      attributes: {
        ...(store.getNode(menu) as any).attributes,
        visible: false,
        states: { open: { visible: true } }
      }
    } as never);
    // Through the command a panel runs, which is what mints the name the document records — the
    // reader picks a block and the document never holds a sid.
    await editor.executeCommand('setOpens', { nodeId: opener, target: menu });
  });

  it('records a name rather than the sid a reader picked', () => {
    /*
     * `componentBind`'s rule, for `componentBind`'s reason: a sid is given out at load, so nothing
     * written down can hold one — not a library component, not this product's own sample. The panel
     * hands over the block a reader pointed at and the command turns it into a durable name.
     */
    const said = (store.getNode(opener) as any).attributes.opens;
    expect(said).toBeTruthy();
    expect(said).not.toBe(menu);
    expect((store.getNode(menu) as any).attributes.partId).toBe(said);
  });

  it('lets a state say the thing a held state may not', async () => {
    /*
     * The one test that would have passed before and meant the opposite. `visible` is refused on
     * hover because a block that vanishes under the pointer vanishes from under the pointer; being
     * open is remembered rather than held, so nothing is alternating and appearing is the point.
     */
    editor.executeCommand('setNode', { nodeIds: [menu] });
    await editor.executeCommand('setBlockFormat', { state: 'open', visible: true });
    expect(statesOf((store.getNode(menu) as any).attributes).open?.visible).toBe(true);

    editor.executeCommand('setNode', { nodeIds: [menu] });
    await editor.executeCommand('setBlockFormat', { state: 'hover', visible: false });
    expect(statesOf((store.getNode(menu) as any).attributes).hover).toBeUndefined();
  });

  it('does not call it a fault, in the state where it is the point', () => {
    const declared = ['visible', 'fill', 'gap'];
    expect(stateFaults({ states: { open: { visible: true } } }, declared)).toEqual([]);
    // And still calls it one where it flickers.
    expect(stateFaults({ states: { hover: { visible: true } } }, declared).length).toBe(1);
  });

  it('keeps the closed block in the page, where every other hidden block is cut', () => {
    /*
     * `visible: false` means a draft everywhere else and is removed from the published page — the
     * words of an unfinished section should not reach a crawler. A closed menu writes the identical
     * attribute and means the opposite, and told apart by nothing it would publish as a page with no
     * menu in it: the hamburger, its label, and a rule naming a block that is not there.
     */
    /*
     * Asked of the **markup** and not of the document. `page.html` carries the stylesheet too, and a
     * removed block leaves its rules behind naming it — so the whole-document version of this test
     * passed while the menu was being cut, reporting on the orphan rule as if it were the menu.
     */
    expect(drawnHtml(editor, home)).toContain(`data-b="${menu}"`);
  });

  it('ships a switch that a key can reach, before the block it opens', () => {
    const page = exportPage(editor, home);
    // Not `display: none` and not `hidden`: a control a browser does not render is a control a Tab
    // key cannot reach, and 열림 would then be a gesture only a pointer could make.
    const at = page.html.indexOf('st-open-switch');
    expect(at).toBeGreaterThan(-1);
    // Its own style was lifted into a class of its own, like every element's; what it must not
    // say anywhere is that it is not drawn.
    const rule = /\.b\d+ \{ position: absolute;[^}]*\}/.exec(page.html)?.[0] ?? '';
    expect(rule.length).toBeGreaterThan(0);
    expect(rule).not.toContain('display: none');
    expect(page.html).not.toContain('st-open-switch" hidden');
    // And it is the element immediately before the one it opens.
    expect(page.html.slice(at)).toMatch(
      new RegExp(`st-open-switch[^>]*>\\s*<[^>]*data-b="${menu}"`)
    );
  });

  it('presses it from the opener, without a line of javascript', () => {
    const page = exportPage(editor, home);
    const id = /id="(st-open-\d+)"/.exec(page.html)?.[1];
    expect(id).toBeTruthy();
    expect(page.html).toContain(`for="${id}"`);
    // The whole feature, and no runtime: the browser already remembers what a visitor decided.
    expect(page.html).not.toContain('<script');
  });

  it('publishes the rule as the two elements a reader can find by looking', () => {
    const css = stateRules(store as never, home);
    expect(css).toContain('.st-open-switch:checked + ');
    expect(css).toContain('display: flex');
  });

  it('rings the block a visitor presses, not the control off the page', () => {
    // The switch is off the page, so its own focus ring is off the page. The ring goes on the thing
    // being looked at — and named per switch, or one accordion taking focus rings all four.
    const page = exportPage(editor, home);
    expect(page.html).toMatch(/body:has\(#st-open-\d+:focus-visible\) \[for="st-open-\d+"\]/);
    expect(page.html).toContain('outline: 2px solid currentColor');
  });
});

/**
 * And the same thing again, on the block a reader would actually meet: the sample's own header.
 *
 * The one above is built out of two frames chosen for being frames, which proves the mechanism and
 * proves nothing about the product. This one asks the published home page whether the hamburger a
 * designer would open the sample and see actually opens the menu under it — through a **component**,
 * placed on five pages, which is the case the whole `owner~part` naming exists for.
 */
describe('the sample’s own menu, on a phone', () => {
  let editor: any;
  let store: DataStore;
  let home: string;
  let html: string;

  beforeAll(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;
    html = exportPage(editor, home).html;
  });

  it('ships the menu, and hides it at every width until it is opened', () => {
    // In the markup — a closed menu is not a draft, so it publishes and waits.
    expect(drawnHtml(editor, home)).toContain('메뉴 열기');
    // And the state says what it becomes, in the browser's own two-element selector.
    expect(stateRules(store as never, home)).toContain('.st-open-switch:checked + ');
  });

  it('opens each placement’s own menu, not every menu on the site', () => {
    /*
     * The header is one definition placed on five pages, so its parts are named `owner~part` and one
     * rule reaches all five. What must **not** be shared is the switch: a visitor opening the menu on
     * one page cannot be opening it on four others, and the id is per element for that reason.
     */
    const ids = [...html.matchAll(/id="(st-open-\d+)"/g)].map((one) => one[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names the switch after the block, for an opener drawn as three lines', () => {
    // A `<label for>` gives its control the label's words, and a hamburger has none. The block's
    // 이름 is the one sentence in the document that says what pressing it does.
    expect(html).toContain('aria-label="메뉴 열기"');
  });

  it('publishes it with no runtime at all', () => {
    expect(html).not.toContain('<script');
  });
});

/**
 * **아코디언과 탭** — the same two blocks, and one attribute between them.
 *
 * The claim worth testing is not that either works. It is that they are *one mechanism*: an
 * accordion's answer and a tab's panel are the identical node, and 하나만 열림 is the whole
 * difference. If that is true, a reader who has learned one has learned both, and a fault in either
 * is a fault in one place.
 */
describe('the two things a visitor opens', () => {
  let editor: any;
  let store: DataStore;
  let home: string;

  /*
   * The block an insert made, found by diffing the **whole page** rather than its top level.
   *
   * An insert lands *next to what is selected*, and it selects what it made — so the second one goes
   * in beside the first rather than at the page's root. Written the shallow way this returned
   * nothing, and every assertion after it failed with a length of zero rather than with the sentence
   * "that landed somewhere else".
   */
  const make = async (command: string): Promise<string> => {
    const before = new Set(walkOf(home));
    await editor.executeCommand(command, { pageId: home });
    return walkOf(home).find((sid) => !before.has(sid))!;
  };

  const walkOf = (sid: string): string[] => {
    const found: string[] = [];
    const walk = (at: string, depth = 0) => {
      if (depth > 20) return;
      for (const child of ((store.getNode(at) as any)?.content ?? []) as unknown[]) {
        if (typeof child !== 'string') continue;
        found.push(child);
        walk(child, depth + 1);
      }
    };
    walk(sid);
    return found;
  };

  beforeAll(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;
  });

  it('builds an accordion a reader could not have wired by hand', async () => {
    const made = await make('insertAccordion');
    const inside = walkOf(made).map((sid) => (store.getNode(sid) as any).attributes ?? {});

    // Three questions, each opening a body that is a **sibling** — the one structural fact the whole
    // feature turns on, and the one a reader building this out of rows would get wrong.
    const openers = inside.filter((one) => one.opens);
    expect(openers).toHaveLength(3);
    for (const one of openers) {
      const body = inside.find((other) => other.partId === one.opens);
      expect(body?.visible).toBe(false);
      expect(body?.states?.open).toEqual({ visible: true });
    }
  });

  it('gives every part a name nothing else on the page is using', async () => {
    // Two accordions on one page both calling their body 내용 is the second one's header opening the
    // first one's body — silently, and only in the published page, because `opens` resolves by name
    // and the first match wins.
    const second = await make('insertAccordion');
    const names = walkOf(second)
      .map((sid) => (store.getNode(sid) as any).attributes?.partId)
      .filter(Boolean);
    expect(names).toHaveLength(3);

    const all: string[] = [];
    const walk = (at: string, depth = 0) => {
      if (depth > 24) return;
      for (const child of ((store.getNode(at) as any)?.content ?? []) as unknown[]) {
        if (typeof child !== 'string') continue;
        const said = (store.getNode(child) as any)?.attributes?.partId;
        if (typeof said === 'string' && said) all.push(said);
        walk(child, depth + 1);
      }
    };
    walk(home);
    expect(new Set(all).size).toBe(all.length);
  });

  it('opens each answer on its own, because nothing said only one', async () => {
    const made = await make('insertAccordion');
    const page = new DOMParser().parseFromString(exportPage(editor, home).html, 'text/html');

    // Read as the browser reads it rather than as text: what is being claimed is that the switch is
    // the element *immediately before* the answer, and that is a fact about the tree.
    const bodies = walkOf(made).filter(
      (sid) => (store.getNode(sid) as any).attributes?.partId !== undefined
    );
    expect(bodies).toHaveLength(3);

    for (const sid of bodies) {
      const el = page.querySelector(`[data-b="${sid}"]`);
      const before = el?.previousElementSibling as HTMLInputElement | null;
      expect(before?.tagName).toBe('INPUT');
      // A checkbox, so a visitor may have all three answers open at once.
      expect(before?.getAttribute('type')).toBe('checkbox');
    }
  });

  it('turns the same structure into a tab strip with one attribute', async () => {
    const made = await make('insertTabs');
    const attrs = (store.getNode(made) as any).attributes;
    expect(attrs.opensOne).toBe(true);

    const inside = walkOf(made).map((sid) => (store.getNode(sid) as any).attributes ?? {});
    const tabs = inside.filter((one) => one.opens);
    expect(tabs).toHaveLength(3);

    // Exactly one already pressed. None, and a visitor arrives at a tab strip showing nothing.
    expect(tabs.filter((one) => one.openAtRest === true)).toHaveLength(1);
    expect(tabs[0].openAtRest).toBe(true);

    // And a panel is an accordion's answer, to the attribute: one mechanism, two arrangements.
    for (const one of tabs) {
      const panel = inside.find((other) => other.partId === one.opens);
      expect(panel?.visible).toBe(false);
      expect(panel?.states?.open).toEqual({ visible: true });
    }
  });

  it('publishes the tabs as one radio group, with the first one on', () => {
    const html = exportPage(editor, home).html;
    const radios = [...html.matchAll(/<input type="radio"[^>]*>/g)].map((one) => one[0]);
    expect(radios).toHaveLength(3);

    // One name between them, which *is* the rule: choosing the second unchecks the first, and its
    // panel falls back to what it says at rest. Nothing keeps them in step because nothing has to.
    const names = radios.map((one) => /name="([^"]+)"/.exec(one)?.[1]);
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBeTruthy();

    expect(radios.filter((one) => one.includes('checked'))).toHaveLength(1);
    expect(radios[0]).toContain('checked');
  });

  it('says which tab is the chosen one, which no adjacent rule could', () => {
    /*
     * The one 열림 that cannot be `switch:checked + block`: the tab is not beside its switch — the
     * panel is. A tab strip where a visitor cannot tell which tab they are on is a tab strip that
     * does not work, so this is the feature and not a flourish.
     */
    const html = exportPage(editor, home).html;
    expect(html).toMatch(/body:has\(#st-open-\d+:checked\) \[for="st-open-\d+"\] > \* \{/);
    expect(html).toContain('border: 1px solid #0F7A5A');
  });

  it('keeps the two groups apart, so one accordion is not the other', () => {
    // Radios share a name *per `opensOne` block*. The accordions above are checkboxes and have no
    // name at all — an accordion whose switches joined the tab strip's group would open one answer
    // and close a tab.
    const html = exportPage(editor, home).html;
    for (const one of [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map((m) => m[0])) {
      expect(one).not.toContain('name=');
    }
  });
});

/**
 * **How tall a block is**, which this schema could not say until the hamburger forced it.
 *
 * The measurement that makes this worth a test rather than a line: before the pair existed, three
 * boxes with nothing in them were three boxes of no height, so the product's own mark had to be an
 * SVG. A schema gap shows up as artwork standing in for a layout, and this is the only kind of
 * evidence that a gap has actually closed.
 */
describe('how tall a block is', () => {
  it('says at least, and at most, in the unit the document keeps', () => {
    expect(sizingCss({ minHeight: 30, maxHeight: 30 })).toMatchObject({
      minHeight: '2px',
      maxHeight: '2px'
    });
    // Silence still costs nothing, which is what let this be added without redrawing every page.
    expect(sizingCss({ sizing: 'hug' }).minHeight).toBeUndefined();
  });

  it('draws the sample’s hamburger as three boxes rather than a picture', () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const home = pagesOf(doc as never)[0].sid;

    const html = drawnHtml(editor, home);
    // Three rules, each 2px tall — and no picture standing in for them.
    expect([...html.matchAll(/data-name="줄"/g)]).toHaveLength(3);
    expect(html).toContain('min-height: 2px');
    expect(html).not.toContain('alt="메뉴 열기"');
  });
});

/**
 * **Where a block is**, which a column of boxes could not say.
 *
 * The arithmetic is small and the two mistakes it exists to stop are not: a sticky block with no
 * inset never sticks — the rule is valid, the browser accepts it, and nothing happens — and an
 * absolutely placed block with no positioned ancestor flies to the corner of the document instead of
 * the corner of the card it was put in.
 */
describe('where a block is', () => {
  it('gives a sticky block the inset it would otherwise forget', () => {
    // The most-made mistake with this property, and the reason silence is not silence here.
    expect(positionCss({ position: 'sticky' })).toEqual({ position: 'sticky', top: '0px' });
    expect(positionCss({ position: 'sticky', insetTop: 900 })).toEqual({
      position: 'sticky',
      top: '60px'
    });
  });

  it('takes a negative offset, because overlap is the point of having this', () => {
    // Every other length in this schema is a size, where a negative number is nonsense. These are
    // offsets: this is a card lifted into the band above it.
    expect(positionCss({ position: 'absolute', insetTop: -240 })).toMatchObject({ top: '-16px' });
  });

  it('answers the stacking order even for a block that stays in the flow', () => {
    // A header that scrolls *under* a hero picture is one number on a block that is not placed.
    expect(positionCss({ zOrder: 10 })).toEqual({ zIndex: '10' });
    expect(positionCss({})).toEqual({});
  });

  it('makes every stack the thing a placed block is placed against', () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const home = pagesOf(doc as never)[0].sid;

    /*
     * Rather than a `positionsChildren` switch a reader has to know to turn on. It changes no layout
     * and makes no stacking context on its own, and without it a badge meant for a card's corner
     * goes to the corner of the page — which looks like the attribute not working.
     */
    const html = drawnHtml(editor, home);
    expect(html).toContain('position: relative');

    // And the sample's header follows the page, which is the first thing anybody tries.
    const page = exportPage(editor, home).html;
    expect(page).toContain('position: sticky');
    expect(page).toContain('z-index: 10');
  });
});
