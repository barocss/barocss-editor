import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { REVEALS, REVEAL_IDS, REVEAL_KEYFRAMES, revealOf, revealRangeFor } from '../src/reveal';
import { exportPage, revealRules } from '../src/export-html';
import { PAGE_CSS } from '../src/page-css';
import { blocksIn, pagesOf } from '../src/selection';
import { definitionsOf } from '../src/components';

/**
 * How a block **arrives as a visitor scrolls to it**.
 *
 * The third thing on a page that is published as a rule rather than folded into a drawing, and the
 * one with the clearest reason: a width is known before the page is drawn, a pointer is the
 * visitor's, and a scroll position is the visitor's *and keeps changing*.
 *
 * What is worth holding here is not that the CSS is written — it is the two guards. Every one of
 * these animations starts at `opacity: 0`, so a rule that reached a browser which cannot run it, or
 * a reader who has asked for no movement, would be a page whose content is invisible forever. Both
 * are one missing line away and neither shows up in a screenshot of a working browser.
 */
describe('how a block arrives', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let home: string;
  let band: string;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const attrs = () => (store.getNode(band) as any).attributes as Record<string, unknown>;
  const rules = () => revealRules(store as never, home);

  beforeEach(async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc)[0].sid;
    band = ((store.getNode(home) as any).content ?? [])[1];
  });

  it('says nothing at all until a reader asks for it', () => {
    expect(attrs().reveal).toBeUndefined();
    expect(rules()).toBe('');
  });

  it('is one of five, named the way the deck names them', () => {
    // The paint decision again: the deck arrived at this vocabulary first, and a second product
    // spelling the same idea differently is the fault this repository keeps finding.
    expect(REVEAL_IDS).toEqual(['rise', 'slideIn', 'pop', 'focusIn', 'appearSlowly']);
    expect(revealOf({ reveal: 'rise' })?.label).toBe('부드럽게 올라오기');
    // And a word this product does not know is not a guess: the deck has nine more, and the ones
    // that need a script or a clock a scroll cannot advance are deliberately not offered.
    expect(revealOf({ reveal: 'typewriter' })).toBeUndefined();
    expect(revealOf({ reveal: 'springIn' })).toBeUndefined();
  });

  it('moves only what the compositor can move', () => {
    /*
     * Never a `width`, a `height` or a `margin`. Not taste — arithmetic: a property that changes
     * layout makes the browser lay the page out again on every scroll frame, and a page that reflows
     * while a visitor scrolls is a page that stutters.
     */
    for (const one of REVEALS) {
      expect(one.from).not.toMatch(/\b(width|height|margin|padding|top|left)\b/);
      expect(one.from).toMatch(/opacity|translate|scale|filter/);
    }
  });

  it('is a keyframe animation whose clock is the scroll', async () => {
    editor.executeCommand('setNode', { nodeIds: [band] });
    await run('setBlockFormat', { reveal: 'rise' });
    expect(attrs().reveal).toBe('rise');

    const css = rules();
    expect(css).toContain('animation: st-rise linear both');
    // `view()` is the browser's own answer to "how far has this entered the viewport". No observer,
    // no class, no script — which is the property the export has and means to keep.
    expect(css).toContain('animation-timeline: view()');
    expect(css).toContain('animation-range:');
  });

  it('is guarded, because the half a reader does not see is `opacity: 0`', async () => {
    editor.executeCommand('setNode', { nodeIds: [band] });
    await run('setBlockFormat', { reveal: 'rise' });
    const css = rules();

    /*
     * A browser that does not know `view()` would apply the start state and never advance it — a
     * page whose content is invisible forever, in exactly the browsers nobody tests in.
     */
    expect(css).toContain('@supports (animation-timeline: view())');
    /*
     * And a reader who has asked for no movement gets none. Dropping the whole block rather than
     * shortening it is what leaves the content *visible*: there is no reduced version of an
     * animation whose first frame is invisible.
     */
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
  });

  it('shares its keyframes with every block that chose the same one', () => {
    // Five definitions whatever a page holds. What differs per block is one declaration.
    for (const one of REVEALS) expect(REVEAL_KEYFRAMES).toContain(`@keyframes st-${one.id}`);
    expect(PAGE_CSS).toContain('@keyframes st-rise');
  });

  /**
   * **What the published page is made of**, which had never been read.
   *
   * Measured on the sample's home page: `lang`, a `<title>`, a viewport, **no script at all** and
   * **not one inline style** — 286 classes and zero `style=`. And every structural element a `<div>`:
   * the tags were `div, section, p, h1…h4, a, img, span, blockquote`, with nothing saying which of
   * forty divs was the header, the navigation, the body or the footer.
   */
  it('publishes the element a reader said a block is', async () => {
    const holder = blocksIn(doc, band)[0];
    editor.executeCommand('setNode', { nodeIds: [holder] });
    await run('setBlockFormat', { landmark: 'main' });

    const html = exportPage(editor, home).html;
    expect(html).toContain('<main');
    // And the export follows for free, because the published page is drawn through the renderers.
    expect(html).not.toContain('<script');
  });

  it('reaches the visitor, inside the document the export writes', async () => {
    editor.executeCommand('setNode', { nodeIds: [band] });
    await run('setBlockFormat', { reveal: 'focusIn' });

    const html = exportPage(editor, home).html;
    expect(html).toContain('animation: st-focusIn linear both');
    expect(html).toContain('@keyframes st-focusIn');
    expect(html).toContain('@supports (animation-timeline: view())');
    // And still no script, which is the whole reason it is written this way.
    expect(html).not.toContain('<script');
  });

  /**
   * **차례로** — the row of cards that every landing page staggers and this one could not.
   *
   * Three cards appearing at the same instant is the tell of a template. The fix cannot be an
   * animation on the row, because a scroll animation on a parent moves the whole thing — so a
   * container carrying `revealStagger` gives its arrival to its **children** and takes none itself.
   */
  it('gives the arrival to what is inside, one after another', async () => {
    const holder = blocksIn(doc, band)[0];
    const inside = blocksIn(doc, holder);
    expect(inside.length).toBeGreaterThan(1);

    editor.executeCommand('setNode', { nodeIds: [holder] });
    await run('setBlockFormat', { reveal: 'rise', revealStagger: true });

    const said = rules();
    // One rule per child, and **none** for the container: it either arrives or its children do.
    expect(said.split('animation: st-rise').length - 1).toBe(inside.length);
    for (const sid of inside) expect(said).toContain(sid);
    expect(said).not.toContain(`data-bc-sid="${holder}"`);

    /*
     * And each starts a little further along the **scroll**, not a little later in time: a
     * scroll-driven animation has no clock, so `animation-delay` would mean nothing at all. What
     * moves is where in the range it begins.
     */
    expect(said).toContain('animation-range: entry 0% entry 70%');
    expect(said).toContain('animation-range: entry 10% entry 80%');
  });

  it('never pushes the last one past where the scroll can reach', () => {
    /*
     * The range ends at `entry 70%` and everything to `entry 100%` is reachable for every block
     * including the last — which is the property the range was chosen for. So a stagger has thirty
     * points to spend: ten each is right for three cards and would put the sixth of six at 120%,
     * where there is no scroll left, and the card would sit half-arrived forever. The same fault the
     * range itself was written to avoid, arriving from the other direction.
     */
    expect(revealRangeFor(2, 3)).toBe('entry 20% entry 90%');
    expect(revealRangeFor(5, 6)).toBe('entry 30% entry 100%');
    expect(revealRangeFor(9, 10)).toBe('entry 30% entry 100%');
    // One child, or the first of any number, is the ordinary range.
    expect(revealRangeFor(0, 4)).toBe('entry 0% entry 70%');
    expect(revealRangeFor(0, 1)).toBe('entry 0% entry 70%');
  });

  it('can be taken back', async () => {
    editor.executeCommand('setNode', { nodeIds: [band] });
    await run('setBlockFormat', { reveal: 'pop' });
    expect(rules()).toContain('st-pop');

    await run('setBlockFormat', { reveal: undefined });
    expect(attrs().reveal).toBeUndefined();
    expect(rules()).toBe('');
  });

  it('reaches a part of a definition, which is drawn once per placement', async () => {
    /*
     * The same hole a state found and older than states: a component lives beside the pages rather
     * than in one, so a rule keyed by the node's own id reaches nothing. A part is drawn as
     * `placement~part`, and one definition placed five times is five ids for the thing a reader set
     * once — which is why the selector names the ending rather than the id.
     */
    const inside: string[] = [];
    const walk = (sid: string, depth = 0) => {
      if (depth > 40) return;
      const one = store.getNode(sid) as any;
      if (!one) return;
      if (one.stype === 'frame' && depth > 0) inside.push(sid);
      for (const child of one.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    const definition = definitionsOf(doc).find((one) => one.id === 'product-card');
    expect(definition).toBeTruthy();
    walk(String(definition!.sid));
    expect(inside.length).toBeGreaterThan(0);

    editor.executeCommand('setNode', { nodeIds: [inside[0]] });
    await run('setBlockFormat', { reveal: 'rise' });

    const css = rules();
    expect(css).toContain('st-rise');
    expect(css).toContain('~');
  });
});
