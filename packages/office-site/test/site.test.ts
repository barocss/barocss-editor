import { describe, it, expect, beforeAll } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { sizingCss } from '../src/sizing';

/**
 * A site, drawn.
 *
 * The claim the third product exists to test is that it is a schema, a kit and a handful of
 * renderers — so the first test is the whole product standing up: the sample site loads against the
 * schema without complaint, draws in one pass, and what comes out is a column of stacks holding a
 * word processor's headings and paragraphs.
 *
 * Assertions are on the computed layout rather than on markup where it matters, because *the
 * browser laying it out* is the design: a site builder's output is CSS, and a page that draws as a
 * flex column is the product working.
 */
describe('a site draws', () => {
  let container: HTMLElement;
  let editor: any;

  beforeAll(() => {
    registerSiteRenderers();

    const schema = createSchema('site', getSiteSchemaDefinition());
    const dataStore = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore } as never);
    editor.loadDocument(createSampleSite(), 'site');

    container = document.createElement('div');
    document.body.appendChild(container);

    const view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry(),
      /*
       * The **text** environment, which is all a page needs: the document and the resolvers built
       * from it. A page has no layout to carry — no sheets, no pushes, no page numbers — and asking
       * for the page environment would have been asking for maps that are always empty.
       */
      env: {
        [WORD_ENV_KEY]: createTextEnv({
          rootId: editor.getRootId(),
          getNode: (sid: string) => dataStore.getNode(sid) as never
        } as never)
      }
    } as never);
    // One pass. A page places nothing, so there is nothing to converge.
    view.render(undefined, { sync: true });
  });

  const pages = () => [...container.querySelectorAll<HTMLElement>('.st-page')];

  it('loads the sample without the schema complaining', () => {
    /*
     * `documentFaults`, which is a **getter** — this asked for `getDocumentFaults?.()`, a method no
     * editor has ever had, and optional chaining turned "the API is not there" into "there are no
     * faults". It passed for as long as the product has existed while the editor logged a schema
     * complaint on every load: the sample put its `components` before its pages, and the document's
     * content model says resources come after them.
     *
     * The lesson is the optional call, not the ordering: `?.` on an assertion's own subject means
     * the test cannot fail.
     */
    expect(editor.documentFaults).toEqual([]);
  });

  it('draws every page, with the address that makes it a page of a site', () => {
    expect(pages()).toHaveLength(2);
    expect(pages().map((page) => page.dataset.path)).toEqual(['/', '/about']);
    // The kind is the schema's record of which shape of surface this is, and a site's is a page's.
    expect(pages()[0].dataset.kind).toBe('flow');
  });

  it('is a column of stacks, laid out by the browser', () => {
    const home = pages()[0];
    expect(home.style.display).toBe('flex');
    expect(home.style.flexDirection).toBe('column');

    const stacks = [...home.querySelectorAll<HTMLElement>(':scope > .st-stack')];
    // The hero, the row of cards, the footer — the placement of the header is drawn as its parts.
    expect(stacks.length).toBeGreaterThanOrEqual(3);
    expect(stacks.map((one) => one.dataset.layout)).toContain('row');
  });

  it('draws a document’s headings and paragraphs inside them, unchanged', () => {
    const home = pages()[0];
    // Not a site renderer anywhere in this: `h1` and `p` are the text stack's, drawn from the same
    // renderers a word processor uses, inside a page that has never heard of them.
    expect(home.querySelector('h1')?.textContent).toContain('한 엔진');
    expect(home.querySelectorAll('p').length).toBeGreaterThan(3);
  });

  it('places the header on both pages from one definition', () => {
    // A reusable block on a site is a card on a slide: one definition, two placements, and the
    // placements draw the definition live rather than holding a copy.
    for (const page of pages()) {
      expect(page.textContent).toContain('Barocss');
    }
  });
});

/**
 * What a stack's child says about its own width.
 *
 * The one thing this product had to add to the model, so it is tested on its own terms: the CSS a
 * declared intent becomes, and the silence that stays silent.
 */
describe('sizing', () => {
  it('fills the axis, and cannot be pushed out of the row by one long word', () => {
    // `min-width: 0` is the line every layout tool sets and none of them mentions: a flex item's
    // min-width is `auto`, so one unbreakable string makes a row wider than its container.
    expect(sizingCss({ sizing: 'fill' })).toEqual({ flex: '1 1 0%', minWidth: '0' });
  });

  it('hugs its content', () => {
    expect(sizingCss({ sizing: 'hug' })).toEqual({ flex: '0 0 auto', width: 'fit-content' });
  });

  it('leaves a stated width alone', () => {
    expect(sizingCss({ sizing: 'fixed' })).toEqual({ flex: 'none' });
  });

  it('says nothing when the node says nothing', () => {
    // Silence keeps meaning silence: a page drawn before this attribute existed draws the same.
    expect(sizingCss(undefined)).toEqual({});
    expect(sizingCss({})).toEqual({});
  });

  it('turns a minimum and a maximum into lengths, in twips like everything else', () => {
    // 1440 twips is an inch, which is 96 pixels at the one resolution this model converts at.
    expect(sizingCss({ minWidth: 1440, maxWidth: 2880 })).toEqual({
      minWidth: '96px',
      maxWidth: '192px'
    });
  });
});
