import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { PAGE_CSS } from '../src/page-css';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { exportPage } from '../src/export-html';
import { FACES, SCALES, typeCss, typeRule } from '../src/type-scale';

/**
 * **What a site is set in.**
 *
 * Colour has been a token since the day the page had one; the second thing a brand changes was
 * unreachable. Four heading sizes and a font stack lived in `page-css.ts`, so every site this product
 * made came out in the same type — which is the kind of gap that does not look like one, because the
 * default is perfectly reasonable and there is simply no way past it.
 */
describe('what a site is set in', () => {
  it('is a ratio, and the steps are geometric', () => {
    /*
     * What a design system means by a scale, and what four hand-picked numbers only approximate: a
     * reader who wants bigger headings wants all of them bigger **in proportion**, and keeping four
     * numbers in proportion by hand is the work this replaces.
     */
    const said = typeCss({ scale: 'loud' });
    expect(said['--st-h4']).toBe('1rem');
    expect(said['--st-h3']).toBe('1.5rem');
    expect(said['--st-h2']).toBe('3.375rem');
    expect(said['--st-h1']).toBe('5.063rem');
  });

  it('sets the headings in the body’s face unless it is told otherwise', () => {
    // A site that says nothing about its headings is set in one face, which is what most sites are.
    const one = typeCss({ bodyFace: 'serif' });
    expect(one['--st-head-face']).toBe(one['--st-body-face']);
    expect(one['--st-body-face']).toContain('serif');

    const two = typeCss({ bodyFace: 'serif', headingFace: 'mono' });
    expect(two['--st-head-face']).not.toBe(two['--st-body-face']);
  });

  it('refuses a size a page would be unreadable at, and a face it does not have', () => {
    // Not a matter of taste: 6px is not small text, it is text nobody reads.
    /*
     * **Twips**, which is what the panel writes and what every other length here is. Written in the
     * unit the document uses rather than the one a reader types, because the two came apart exactly
     * once and it cost a feature: a reader typing 20 wrote 300, and 300 is outside the bounds, so
     * the site went on being drawn at 16 with nothing saying anything.
     */
    expect(typeCss({ baseSize: 6 * 15 })['--st-base']).toBe('16px');
    expect(typeCss({ baseSize: 40 * 15 })['--st-base']).toBe('16px');
    expect(typeCss({ baseSize: 18 * 15 })['--st-base']).toBe('18px');
    // And the number a reader actually types, through the panel's own arithmetic.
    expect(typeCss({ baseSize: 300 })['--st-base']).toBe('20px');
    // A face this document does not know reads as the default rather than as nothing at all.
    expect(typeCss({ bodyFace: 'papyrus' })['--st-body-face']).toBe(FACES[0].stack);
  });

  it('reaches the visitor as one rule the page’s own stylesheet reads', async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const home = pagesOf(doc as never)[0].sid;

    /*
     * A **rule**, which is the fourth thing this product publishes that way after a state, a reveal
     * and a transition — and for the same reason each time: it is a promise about a value rather
     * than a value, so no block's own drawing carries it and every block obeys it.
     */
    await editor.executeCommand('setSiteType', { bodyFace: 'serif', scale: 'clear', baseSize: 18 * 15 });

    const html = exportPage(editor, home).html;
    expect(html).toContain('--st-base: 18px');
    expect(html).toContain('--st-h1: 3.157rem');
    // And the stylesheet names the properties without knowing what they are.
    expect(html).toContain('font-size: var(--st-h1');
  });

  it('draws exactly as it did for a document that says nothing', () => {
    /*
     * The fallbacks in `PAGE_CSS` are the numbers that were written into it, so a site that has said
     * nothing is unchanged — which is what let this be added without redrawing every page ever made
     * with the product.
     */
    expect(typeRule(undefined)).toContain('--st-h1: 2.441rem');
    expect(SCALES[0].ratio).toBe(1.25);
  });
});

/**
 * **A table on a page had no table in it.**
 *
 * The model was right, the cells took text, the eight commands worked — and the drawing had no
 * borders, no padding and shrank to its content, because nothing in `page-css.ts` had ever mentioned
 * a table. Every check that could have caught it was asking about the document.
 */
describe('what a table is drawn with', () => {
  it('gives a page table borders, padding and a full width', () => {
    expect(PAGE_CSS).toContain('.st-page table');
    expect(PAGE_CSS).toMatch(/\.st-page table \{[^}]*width: 100%/);
    expect(PAGE_CSS).toMatch(/\.st-page th,\s*\.st-page td \{[^}]*padding:/);
    // A rule under the head, and none under the last row — the two lines that make it read as a table.
    expect(PAGE_CSS).toMatch(/\.st-page th \{[^}]*border-bottom:/);
    expect(PAGE_CSS).toContain('.st-page tr:last-child td');
  });
});
