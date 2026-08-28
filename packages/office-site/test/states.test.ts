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
import { editorStateCss, exportPage, mediaRules, stateChanges, stateRules } from '../src/export-html';
import { documentFaults, FAULT_KINDS, holderOf } from '../src/faults';
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
    await editor.executeCommand('setBlockFormat', { state: 'hover', fill: '#0F7A5A' });
  });

  it('writes the state through the command a panel runs', () => {
    expect(statesOf((store.getNode(card) as any).attributes).hover).toEqual({ fill: '#0F7A5A' });
  });

  it('refuses an arrangement in a state rather than writing one', async () => {
    editor.executeCommand('setNode', { nodeIds: [card] });
    await editor.executeCommand('setBlockFormat', { state: 'hover', gap: 999 });
    expect(statesOf((store.getNode(card) as any).attributes).hover).toEqual({ fill: '#0F7A5A' });
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
    expect(mine[0].css.backgroundColor).toBe('#0F7A5A');
  });

  it('publishes it as a selector the browser already knows', () => {
    const css = stateRules(store as never, home);
    expect(css).toContain(':hover');
    expect(css).toContain('#0F7A5A');
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
    expect(css).toContain('background-color: #0F7A5A');
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
    expect(css).toContain('#0B5C44');
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
    // it always did, and a page that says nothing about time carries no rule about time.
    expect(rulesNow()).not.toContain('transition');
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
    expect(rulesNow()).not.toContain('transition');
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
    expect(rulesNow()).not.toContain('transition');
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
    expect([...named].sort()).toEqual(['data', 'link', 'state', 'width']);
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
