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
import { SITE_ENV_KEY, createSiteEnv } from '../src/breakpoints';
import { cssFor, exportPage, exportSite, mediaRules } from '../src/export-html';
import { pagesOf } from '../src/selection';

/**
 * The page a visitor gets, held to the page the reader is looking at.
 *
 * This is what makes export worth building the way it is built. It **renders** — the same renderers
 * into a detached element — so an exported page cannot say something the editor would not draw. The
 * tests below are the proof of that rather than a hope: the editor draws the mobile board, the export
 * writes the mobile media query, and the two are compared property by property.
 *
 * Had the exporter been a walk that built HTML strings, this suite would only have shown that two
 * implementations agree with each other — which is exactly the check that lets them drift together.
 */
describe('the page a visitor gets', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let home: string;

  beforeAll(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc)[0].sid;
  });

  /** What the **editor** draws, at one width, as the app draws it. */
  const drawn = (breakpoint: 'desktop' | 'tablet' | 'mobile') => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorViewDOM(editor, {
      container: host,
      registry: getGlobalRegistry(),
      rootId: home,
      env: {
        [WORD_ENV_KEY]: createTextEnv({
          rootId: editor.getRootId(),
          getNode: (sid: string) => store.getNode(sid) as never
        } as never),
        [SITE_ENV_KEY]: createSiteEnv(breakpoint)
      }
    } as never);
    view.render(undefined, { sync: true });
    return host;
  };

  it('is a whole document, openable on its own', () => {
    const page = exportPage(editor, home);
    expect(page.path).toBe('/');
    expect(page.name).toBe('홈');
    expect(page.html).toMatch(/^<!doctype html>/);
    // A viewport, or a phone renders the page at 980 pixels and scales it down — which would make
    // every media query below meaningless.
    expect(page.html).toContain('width=device-width');
    expect(page.html).toContain('<title>홈</title>');
  });

  it('carries the words and the pictures, and none of the editing', () => {
    const page = exportPage(editor, home);
    expect(page.html).toContain('한 엔진, 여러 제품');
    expect(page.html).toContain('<img');

    // The caret filler is renderer bookkeeping and must never look like content.
    expect(page.html).not.toContain('data-bc-filler');
    // And a published page is not typable.
    expect(page.html).not.toContain('contenteditable');
  });

  it('draws the data, because a list is resolved and not stored', () => {
    /*
     * The rows are not in the document — one placement is — so an exporter that walked the stored
     * nodes would publish a page with one card on it. Rendering is what puts three there, sorted by
     * `순서` and filtered to `분류 = 제품`, exactly as the editor shows them.
     */
    const page = exportPage(editor, home);
    const cards = page.html.split('월 ').length - 1;
    expect(cards).toBe(3);
    expect(page.html.indexOf('사이트')).toBeLessThan(page.html.indexOf('월 9,900원'));
  });

  it('writes a media query for every width that says something different', () => {
    const css = mediaRules(store as never, home);
    // Narrowest last, so it wins the cascade — the same order `attrsAt` resolves in.
    expect(css.indexOf('max-width: 834px')).toBeLessThan(css.indexOf('max-width: 390px'));
    expect(css).toContain('flex-direction: column');
  });

  it('says at 390 exactly what the editor draws at 390', () => {
    /*
     * The check the whole design is for.
     *
     * For every block the page overrides, the editor's own drawing at that width is compared with the
     * media query the export wrote. A difference is a bug, and because export is a render there is
     * exactly one place it can be.
     */
    const board = drawn('mobile');
    const css = mediaRules(store as never, home);

    const overridden = [...board.querySelectorAll<HTMLElement>('[data-bc-sid]')].filter((el) => {
      const node = store.getNode(el.getAttribute('data-bc-sid')!) as any;
      return node?.attributes?.overrides?.mobile || node?.attributes?.overrides?.tablet;
    });
    expect(overridden.length).toBeGreaterThan(0);

    for (const el of overridden) {
      const sid = el.getAttribute('data-bc-sid')!;
      const rule = css.match(new RegExp(`\\[data-b="${sid}"\\] \\{([^}]*)\\}`, 'g'));
      expect(rule, `no rule for ${sid}`).toBeTruthy();

      // The last rule for this node is the narrowest one, which is what 390 gets.
      const declared = rule![rule!.length - 1];
      for (const [property, value] of Object.entries(cssFor(store.getNode(sid) as never, 'mobile'))) {
        if (value === 'initial') continue;
        const kebab = property.replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`);
        // Everything the editor draws at this width, the export says at this width.
        if (declared.includes(`${kebab}:`)) {
          expect(declared, `${sid} ${kebab}`).toContain(`${kebab}: ${value}`);
        } else {
          // Or it is the same as the base, in which case the media query is right to be silent.
          expect((el.style as any)[property], `${sid} ${kebab}`).toBe(value);
        }
      }
    }
  });

  it('exports every page of the site, each at its own address', () => {
    const pages = exportSite(editor);
    expect(pages.map((one) => one.path)).toEqual(['/', '/제품', '/가격', '/소개', '/블로그']);
    // The header is a definition placed on every page, so every page carries its parts.
    for (const page of pages) expect(page.html).toContain('Barocss');
  });

  it('leaves a page alone when nothing on it says anything narrower', () => {
    // `/블로그` states no overrides: no rules, rather than empty ones a reader would wonder about.
    const blog = pagesOf(doc).find((one: any) => one.path === '/블로그')!.sid;
    expect(mediaRules(store as never, blog)).toBe('');
  });
});
