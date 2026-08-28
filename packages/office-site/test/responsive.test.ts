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
import { SITE_ENV_KEY, createSiteEnv, scopesFor } from '../src/breakpoints';
import { attrsAt, overriddenAt, overrideFaults, withOverride } from '../src/responsive';

/**
 * One page, three widths, and only what differs written down.
 *
 * The arithmetic first, because it can be held in a millisecond and the browser cannot; then the
 * drawing, because the claim is not that a function merges two maps — it is that **two views of one
 * document draw the same node differently at the same instant**, which is a thing only a rendered
 * tree can show.
 */
describe('what a narrower width says', () => {
  const row = { layoutMode: 'row', gap: 240, padding: 720, overrides: { mobile: { layoutMode: 'column', padding: 360 } } };

  it('is the page itself at the widest width', () => {
    // Not "no overrides apply" by accident — the base width *is* the node, which is what makes an
    // override a difference rather than a second document.
    expect(attrsAt(row, 'desktop')).toBe(row);
  });

  it('replaces only what it names', () => {
    const at = attrsAt(row, 'mobile');
    expect(at.layoutMode).toBe('column');
    expect(at.padding).toBe(360);
    // The gap was never mentioned at 390, so it is still the page's.
    expect(at.gap).toBe(240);
  });

  it('does not hand the renderer the map itself', () => {
    // `frameCss` has no answer for an attribute called `overrides`, and a stray key in a style
    // object is the kind of thing that draws once and is never explained.
    expect(attrsAt(row, 'mobile').overrides).toBeUndefined();
  });

  it('cascades widest to narrowest, so one statement covers both narrow widths', () => {
    const padded = { padding: 720, overrides: { tablet: { padding: 480 } } };
    expect(attrsAt(padded, 'tablet').padding).toBe(480);
    // Said on tablet, inherited by mobile — the shape of a CSS `max-width` query, and what a reader
    // means by "on small screens".
    expect(attrsAt(padded, 'mobile').padding).toBe(480);
    // And a mobile statement still wins over the tablet's.
    expect(attrsAt({ ...padded, overrides: { tablet: { padding: 480 }, mobile: { padding: 240 } } }, 'mobile').padding).toBe(240);
  });

  it('asks narrowest-first, which is the same answer said the other way', () => {
    expect(scopesFor('mobile')).toEqual(['mobile', 'tablet', 'desktop']);
    expect(scopesFor('desktop')).toEqual(['desktop']);
  });

  it('says which attributes this width changed', () => {
    // What a panel marks. Without it a reader edits a value on the mobile frame, cannot tell it did
    // not apply everywhere, and finds out on the desktop frame.
    expect(overriddenAt(row, 'mobile')).toEqual(['layoutMode', 'padding']);
    expect(overriddenAt(row, 'desktop')).toEqual([]);
  });

  it('adds, replaces and takes back one statement, pruning what is left empty', () => {
    const one = withOverride(row, 'mobile', 'gap', 120);
    expect(one.mobile).toEqual({ layoutMode: 'column', padding: 360, gap: 120 });

    const back = withOverride({ overrides: { mobile: { gap: 120 } } }, 'mobile', 'gap', undefined);
    // Not `{ mobile: {} }`, which is a line in a saved file a reader would have to wonder about.
    expect(back.mobile).toBeUndefined();
  });

  it('is checkable, which is the reason it is allowed to be a map', () => {
    const declared = ['layoutMode', 'gap', 'padding'];
    expect(overrideFaults(row, declared)).toEqual([]);
    // A width nobody draws.
    expect(overrideFaults({ overrides: { watch: { gap: 1 } } }, declared)).toEqual([
      "'watch' 너비는 그려지지 않습니다"
    ]);
    // The base width, which is the node itself and therefore never an override.
    expect(overrideFaults({ overrides: { desktop: { gap: 1 } } }, declared)).toEqual([
      "'desktop' 너비는 그려지지 않습니다"
    ]);
    // An attribute this node does not have — how `layoutMode` written on a heading is caught
    // instead of silently drawing nothing.
    expect(overrideFaults({ overrides: { mobile: { layoutMode: 'column' } } }, ['level'])).toEqual([
      "'mobile'에서 'layoutMode'을(를) 바꾸는데, 이 블록에는 없는 속성입니다"
    ]);
  });
});

/**
 * The same node, drawn by two views, at the same instant.
 *
 * This is the test the feature exists for. Two `EditorViewDOM`s over **one editor and one store**,
 * differing only in the env each was given — which is the only per-view channel there is, and the
 * reason an override cannot live in the store's content resolver.
 */
describe('two widths of one document', () => {
  let wide: HTMLElement;
  let narrow: HTMLElement;
  let editor: any;
  let dataStore: DataStore;

  const draw = (container: HTMLElement, breakpoint: 'desktop' | 'mobile') => {
    const view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry(),
      env: {
        [WORD_ENV_KEY]: createTextEnv({
          rootId: editor.getRootId(),
          getNode: (sid: string) => dataStore.getNode(sid) as never
        } as never),
        [SITE_ENV_KEY]: createSiteEnv(breakpoint)
      }
    } as never);
    view.render(undefined, { sync: true });
    return view;
  };

  beforeAll(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    dataStore = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore } as never);
    editor.loadDocument(createSampleSite(), 'site');

    wide = document.createElement('div');
    narrow = document.createElement('div');
    document.body.append(wide, narrow);
    draw(wide, 'desktop');
    draw(narrow, 'mobile');
  });

  /**
   * The row of cards, **by name**.
   *
   * It was "the stack with three stacks in it", which is a description the sample outgrew twice: a
   * grid of six and a row of three numbers both match it, and the first one to be drawn wins. A
   * name is what the document actually says, and it is what the browser suite already looks for.
   */
  const cardRow = (root: HTMLElement) =>
    root.querySelector<HTMLElement>('.st-stack[data-name="제품 셋"]')!;

  it('draws the same row as a row and as a column', () => {
    expect(cardRow(wide).style.flexDirection).toBe('row');
    expect(cardRow(narrow).style.flexDirection).toBe('column');
  });

  it('takes the narrower gap with it and leaves the rest alone', () => {
    // 360 twips is 24px and 240 is 16px. The row's padding is the section's, and is never mentioned
    // at either width — so the two agree about it, which is the other half of the same claim.
    expect(cardRow(wide).style.gap).toBe('24px');
    expect(cardRow(narrow).style.gap).toBe('16px');
    expect(cardRow(wide).style.padding).toBe(cardRow(narrow).style.padding);
  });

  it('says in the drawing which width each view is', () => {
    expect(cardRow(wide).dataset.at).toBe('desktop');
    expect(cardRow(narrow).dataset.at).toBe('mobile');
  });

  it('stretches what a stack holds, because a section is the width of the page', () => {
    /*
     * The default `frameCss` gives a canvas is `flex-start`, where a box is as wide as what is in
     * it. On a page that produced a staircase — three cards stacked on a phone, each as wide as its
     * own longest line — and no assertion in the suite could see it, because every test asked about
     * `flex-direction` and none about width. A screenshot found it.
     */
    expect(cardRow(narrow).style.alignItems).toBe('stretch');
    expect(cardRow(wide).style.alignItems).toBe('stretch');

    // And never over a reader: the header's bar says `center`, and still says it.
    const bar = narrow.querySelector<HTMLElement>('.st-placement .st-stack')!;
    expect(bar.style.alignItems).toBe('center');
    // The same bar is the one row on the site that pushes its ends apart, which silence cannot say.
    expect(bar.style.justifyContent).toBe('space-between');
  });

  it('is one document: the words are the same in both', () => {
    // The point of the whole design. Three widths and no copy — so a heading typed in one frame is
    // the heading, and the narrow view is not a page that will drift.
    const words = (root: HTMLElement) =>
      [...cardRow(root).querySelectorAll('h3')].map((one) => one.textContent);
    expect(words(narrow)).toEqual(words(wide));
    expect(words(wide)).toEqual(['사이트', '문서', '덱']);
  });
});
