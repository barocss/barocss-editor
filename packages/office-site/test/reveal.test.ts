import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { REVEALS, REVEAL_IDS, REVEAL_KEYFRAMES, revealOf, revealRangeFor } from '../src/reveal';
import { exportPage, revealRules, sitemapFor } from '../src/export-html';
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
  /**
   * **What a crawler and a chat read**, and a way past the navigation.
   *
   * The other half of what makes a published page real, measured in the same reading that found the
   * forty `<div>`s: the page had a `lang`, a `<title>`, a viewport and no script — and no
   * description, no Open Graph, and no skip link.
   */
  it('says what the page is about, once a reader has said it', async () => {
    /*
     * Nothing written is **nothing said**: an empty `description` tells an engine the page has been
     * described and the description is nothing, which is worse than leaving it out.
     *
     * Cleared rather than assumed. This used to read the sample's home page as it came, which was
     * bare — and stayed true only until somebody described the sample, which `faults.ts` now asks
     * every page to do. A test that holds because the fixture is thin is a test that reports the
     * fixture rather than the product.
     */
    await run('setPageInfo', { nodeId: home, description: '' });
    expect(exportPage(editor, home).html).not.toContain('name="description"');

    await run('setPageInfo', { nodeId: home, description: '문서 한 벌로 세 가지를 만듭니다.' });
    const html = exportPage(editor, home).html;
    expect(html).toContain('<meta name="description" content="문서 한 벌로 세 가지를 만듭니다.">');
    expect(html).toContain('og:description');
    // A title with no body is an unfurl that looks like a template, so the pair goes together.
    expect(html).toContain('og:title');
  });

  /**
   * **Where the site lives**, which is the first fact this model has wanted that is about publishing
   * rather than about the document — and which three separate things turned out to need.
   */
  it('says where a page is, once the site says where it is', async () => {
    /*
     * A site that has not said gets neither, rather than a relative one: Open Graph will not take a
     * relative address, and a canonical link that is relative says the page is canonical to itself —
     * which is what a duplicate looks like to a crawler.
     */
    /*
     * **Emptied first**, rather than read off a fixture that happened to be bare. This held only
     * while the sample had no address, and the sample now has one — because four separate things in
     * the export need it and a fixture exercising none of them was reporting the fixture rather than
     * the product. `'  '` is what a reader clearing the field writes, which is the state this is
     * about.
     */
    await run('setSiteAddress', { address: '  ' });
    expect(exportPage(editor, home).html).not.toContain('rel="canonical"');

    await run('setSiteAddress', { address: 'https://barocss.example/' });
    const html = exportPage(editor, home).html;
    // Joined in one place, because the two halves disagree about slashes in exactly the way that
    // produces `https://x.example//about` and `https://x.examplepricing`.
    expect(html).toContain('<link rel="canonical" href="https://barocss.example/">');
    expect(html).toContain('<meta property="og:url" content="https://barocss.example/">');
  });

  it('writes a sitemap, and none at all without an address', async () => {
    // Emptied first — see the canonical test above for why the fixture can no longer be read bare.
    await run('setSiteAddress', { address: '  ' });
    expect(sitemapFor(editor)).toBeUndefined();

    await run('setSiteAddress', { address: 'https://barocss.example' });
    const map = sitemapFor(editor)!;
    expect(map).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(map).toContain('<loc>https://barocss.example/</loc>');
    // One `<url>` per page of the site, which is what a sitemap is.
    expect(map.match(/<loc>/g)?.length).toBe(pagesOf(doc).length);

    /*
     * And **no `<lastmod>`**, which is a decision rather than an omission: this model records no
     * times, and stamping the export's own clock would tell a crawler every page changed every time
     * anybody published — which is how a site teaches a crawler to stop believing its sitemap.
     */
    expect(map).not.toContain('lastmod');

    // Emptied means the site has not said, which is a value: the sitemap goes with it.
    await run('setSiteAddress', { address: '  ' });
    expect(sitemapFor(editor)).toBeUndefined();
  });

  it('offers a way past the navigation, and only when there is somewhere to go', async () => {
    /*
     * The first thing on every page of this sample is a header with four links, so reaching the words
     * costs five presses of Tab, on every page. The link could not be written until a page could say
     * **where its body is** — one that points at nothing is worse than none, because it looks like
     * the page has one.
     */
    expect(exportPage(editor, home).html).not.toContain('st-skip"');

    const body = blocksIn(doc, home).find((sid) => (store.getNode(sid) as any)?.stype === 'frame')!;
    editor.executeCommand('setNode', { nodeIds: [body] });
    await run('setBlockFormat', { landmark: 'main' });

    const html = exportPage(editor, home).html;
    expect(html).toContain('<a class="st-skip" href="#main">');
    expect(html).toMatch(/<main[^>]*id="main"/);
  });

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
