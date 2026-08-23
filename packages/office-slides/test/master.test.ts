import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import {
  backgroundOf,
  masterOf,
  placeholderChainFor,
  placeholderFor,
  resolveDeckFormat,
  type DeckAccess
} from '../src/index';

/**
 * The master, which is the layer above the layouts.
 *
 * Without one, every layout repeats the deck's background and the deck's idea of
 * what a title looks like — and two layouts that disagree about the title's font
 * are a deck with no design and no way to tell which of the two was the mistake.
 *
 * The cascade is the same shape it already was, one level longer: master, then
 * layout, then the node itself. Matched by *role* at every level, never by
 * position, for the reason `layout-format.ts` gives — a slide that has moved or
 * deleted a box would otherwise be formatted from whichever placeholder happened
 * to be third.
 */
describe('formatting through the master', () => {
  let store: DataStore;
  let doc: DeckAccess;
  let title: string;
  let body: string;
  let unmastered: string;
  let slide: string;
  let plainSlide: string;

  const childrenOf = (sid: string) => ((store.getNode(sid) as any).content ?? []) as string[];

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    const editor: any = createSlidesEditor({ editable: true, schema, dataStore: store });

    const para = (text: string, attributes: Record<string, unknown> = {}) => ({
      stype: 'paragraph',
      attributes,
      content: [{ stype: 'inline-text', text }]
    });
    const frame = (role: string, content: unknown[]) => ({
      stype: 'textFrame',
      attributes: { role, x: 0, y: 0, width: 100, height: 100 },
      content
    });

    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide', layoutId: 'body' },
            content: [frame('title', [para('A title')]), frame('body', [para('Some text')])]
          },
          {
            // A slide whose layout follows no master: everything it had before
            // masters existed, drawing exactly as it did.
            stype: 'surface',
            attributes: { kind: 'slide', layoutId: 'loose' },
            content: [frame('title', [para('On its own')])]
          },
          {
            stype: 'resources',
            attributes: {},
            content: [
              {
                stype: 'slideMaster',
                attributes: { id: 'office', name: 'Office', fill: '#101820' },
                content: [
                  // The master says the face and the size; where a title *goes*
                  // is what the layouts differ about, so it says nothing of it.
                  frame('title', [para('Title', { fontFamily: 'Georgia', fontSize: 66 })]),
                  frame('body', [para('Body', { fontFamily: 'Georgia', fontSize: 40 })])
                ]
              },
              {
                stype: 'slideLayout',
                attributes: { id: 'body', name: 'Title and content', masterId: 'office' },
                content: [
                  // Only what this layout differs about.
                  frame('title', [para('Click to add a title', { fontSize: 88 })])
                ]
              },
              {
                stype: 'slideLayout',
                attributes: { id: 'loose', name: 'No master' },
                content: [frame('title', [para('Click to add a title', { fontSize: 44 })])]
              }
            ]
          }
        ]
      } as never,
      'slides'
    );

    const root = store.getNode(editor.getRootId()) as any;
    doc = { rootId: root.sid, getNode: (sid: string) => store.getNode(sid) as never };

    [slide, plainSlide] = root.content;
    [title, body] = childrenOf(slide);
    [unmastered] = childrenOf(plainSlide);
  });

  it('finds the master a layout follows, and none for one that follows nothing', () => {
    expect(masterOf(doc, 'body')?.attributes?.name).toBe('Office');
    expect(masterOf(doc, 'loose')).toBeUndefined();
    expect(masterOf(doc, undefined)).toBeUndefined();
  });

  it('is a chain, master first and layout nearest', () => {
    const chain = placeholderChainFor(doc, title);
    expect(chain).toHaveLength(2);
    // Nearest last, which is the order the cascade applies them in.
    expect((chain[0].content as string[]).length).toBeGreaterThan(0);
    expect(placeholderFor(doc, title)).toBe(chain[1]);
  });

  /**
   * The whole point. The layout says a title-slide title is 88 and says nothing
   * about the face; the master says Georgia. Both arrive.
   */
  it('takes the layout’s size and the master’s face', () => {
    const format = resolveDeckFormat(doc, childrenOf(title)[0], 'character');
    expect(format.fontSize).toBe(88);
    expect(format.fontFamily).toBe('Georgia');
  });

  /**
   * A role the layout never mentions still finds the master's, which is what
   * stops every layout from having to repeat every placeholder.
   */
  it('formats a role the layout says nothing about', () => {
    const format = resolveDeckFormat(doc, childrenOf(body)[0], 'character');
    expect(format.fontSize).toBe(40);
    expect(format.fontFamily).toBe('Georgia');
  });

  it('leaves a layout with no master exactly as it was', () => {
    expect(placeholderChainFor(doc, unmastered)).toHaveLength(1);
    const format = resolveDeckFormat(doc, childrenOf(unmastered)[0], 'character');
    expect(format.fontSize).toBe(44);
    expect(format.fontFamily).toBeUndefined();
  });
});

/**
 * The background, which is the other thing a master is for: one place says what
 * colour this deck is, instead of every layout repeating it.
 */
describe('the background a slide shows', () => {
  let store: DataStore;
  let doc: DeckAccess;
  let slides: string[];

  const load = (surfaces: unknown[], resources: unknown[]) => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    const editor: any = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [...surfaces, { stype: 'resources', attributes: {}, content: resources }]
      } as never,
      'slides'
    );
    const root = store.getNode(editor.getRootId()) as any;
    doc = { rootId: root.sid, getNode: (sid: string) => store.getNode(sid) as never };
    slides = (root.content as string[]).filter(
      (sid) => (store.getNode(sid) as any)?.stype === 'surface'
    );
  };

  const master = { stype: 'slideMaster', attributes: { id: 'm', fill: '#101820' }, content: [] };

  it('is the master’s, when nothing nearer says anything', () => {
    load(
      [{ stype: 'surface', attributes: { kind: 'slide', layoutId: 'l' }, content: [] }],
      [master, { stype: 'slideLayout', attributes: { id: 'l', masterId: 'm' }, content: [] }]
    );
    expect(backgroundOf(doc, slides[0])).toBe('#101820');
  });

  it('is the layout’s, over the master it follows', () => {
    load(
      [{ stype: 'surface', attributes: { kind: 'slide', layoutId: 'l' }, content: [] }],
      [
        master,
        { stype: 'slideLayout', attributes: { id: 'l', masterId: 'm', fill: '#ffffff' }, content: [] }
      ]
    );
    expect(backgroundOf(doc, slides[0])).toBe('#ffffff');
  });

  it('is the slide’s own, over everything', () => {
    load(
      [{ stype: 'surface', attributes: { kind: 'slide', layoutId: 'l', fill: '#ff0000' }, content: [] }],
      [
        master,
        { stype: 'slideLayout', attributes: { id: 'l', masterId: 'm', fill: '#ffffff' }, content: [] }
      ]
    );
    expect(backgroundOf(doc, slides[0])).toBe('#ff0000');
  });

  it('is nothing at all for a deck that says nothing, which draws white', () => {
    load([{ stype: 'surface', attributes: { kind: 'slide' }, content: [] }], []);
    expect(backgroundOf(doc, slides[0])).toBeUndefined();
  });
});
