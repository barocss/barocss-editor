import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { setAttrs, transaction } from '@barocss/model';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { exportPage } from '../src/export-html';
import { pagesOf } from '../src/selection';

/**
 * **The other half of a new attribute: it has to be published.**
 *
 * The base stylesheet of an exported page is *lifted* out of the drawing rather than computed a
 * second time, which is the design and is also why this needs a test of its own: a lift that keeps
 * a list of properties would silently drop the unusual ones, and `mix-blend-mode`, `backdrop-filter`
 * and `grid-column` are exactly the properties a list like that never has.
 *
 * Checked on a real page of the sample, through the real export, because the drawing is what the
 * lift reads — a unit test of `paintCss` proves the renderer and nothing about the publish.
 */
describe('what a visitor gets of the new vocabulary', () => {
  registerSiteRenderers();

  let editor: any;
  let store: DataStore;
  let doc: any;

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  /** The first band of the home page — a frame, which is what every one of these goes on. */
  const band = (): string => {
    const page = pagesOf(doc)[0];
    for (const child of (store.getNode(page.sid)?.content ?? []) as unknown[]) {
      if (typeof child === 'string' && store.getNode(child)?.stype === 'frame') return child;
    }
    throw new Error('no band');
  };

  const publishedWith = async (attrs: Record<string, unknown>): Promise<string> => {
    await transaction(editor, [setAttrs(band(), attrs)] as never).commit();
    return exportPage(editor, pagesOf(doc)[0].sid).html;
  };

  it('publishes the rhythm the words are set at', async () => {
    const html = await publishedWith({ letterSpacing: -2.5, lineHeight: 140 });
    expect(html).toContain('letter-spacing: -0.025em');
    expect(html).toContain('line-height: 1.4');
  });

  it('publishes a turned box and a blend', async () => {
    const html = await publishedWith({ rotate: -3, blend: 'multiply' });
    expect(html).toContain('transform: rotate(-3deg)');
    expect(html).toContain('mix-blend-mode: multiply');
  });

  /**
   * **Two of the nine cannot be checked here, and saying which is the point.**
   *
   * The published stylesheet is *lifted* out of the drawing by reading each element's `style`
   * attribute — so what this test can see is what **jsdom serialises**, and jsdom is a subset of a
   * browser. Measured rather than assumed: it stores `backdrop-filter` on the object and leaves it
   * out of the attribute, and it rejects a `background-image` containing `color-mix` outright.
   *
   * So the frosting and the sheet are asserted where they are decided — `paintCss`, in
   * `paint.test.ts` — and again in a **browser**, in `apps/site`. A test that quietly passed by
   * asserting the empty string is the shape of check this repository has already been burned by
   * twice today, so the gap is written down instead of papered over.
   */
  it('has nothing to say here about the frosting or the sheet, and says why', async () => {
    const html = await publishedWith({
      backdropBlur: 240,
      backgroundImage: '/hero.jpg',
      overlay: '#14110F',
      overlayOpacity: 0.55
    });
    /*
     * The claim, so that the day jsdom grows either of these this fails and the browser test can
     * stop being the only place they are checked.
     *
     * Scoped to the **lifted** declarations: `PAGE_CSS` uses `color-mix` for its own hairlines, so
     * a bare `not.toContain` would be asserting something about the wrong stylesheet — which is how
     * a check ends up passing for a reason nobody intended.
     */
    expect(html).not.toContain('backdrop-filter');
    for (const said of html.matchAll(/background-image:([^;]*)/g)) {
      expect(said[1]).not.toContain('color-mix');
    }
  });

  it('publishes a card that takes two columns of a grid', async () => {
    const html = await publishedWith({ span: 2 });
    expect(html).toContain('grid-column: span 2');
  });

  it('publishes a faded box', async () => {
    expect(await publishedWith({ opacity: 0.4 })).toContain('opacity: 0.4');
  });

  /**
   * **A resting value changes the published page by nothing at all**, which matters more than any
   * of the above.
   *
   * `opacity`, `rotate` and `backdropBlur` each make a stacking context, so a page that wrote a
   * resting value on every block would be a page whose sticky header could no longer escape its
   * section — a layout fault with no visible cause and nothing to search for.
   *
   * Compared against the page's own bytes rather than by looking for the properties: the sample now
   * *uses* three of these somewhere else, so a check that scanned the whole document for
   * `mix-blend-mode` was asking about a different element and would have passed for the wrong
   * reason the moment the design used one.
   */
  it('changes nothing at all when told a resting value', async () => {
    const before = exportPage(editor, pagesOf(doc)[0].sid).html;
    const after = await publishedWith({ opacity: 1, rotate: 0, blend: '', backdropBlur: 0, span: 1 });
    expect(after).toBe(before);
  });
});
