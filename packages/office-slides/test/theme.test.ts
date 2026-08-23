import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import {
  DECK_THEMES,
  isThemeRef,
  resolveDeckFormat,
  resolveThemeAttrs,
  resolveThemeValue,
  themeFor,
  themeMatching,
  themeNow,
  themeRef,
  type DeckAccess
} from '../src/index';

/**
 * A theme, and what naming a colour buys.
 *
 * A shape's fill is a hex string, so a deck built by hand has that string copied
 * onto forty shapes — and re-colouring it means finding all forty, including the
 * ones on the slide nobody scrolled to. A slot is written where a colour goes,
 * and one place says what the slots are.
 */
describe('a value that names a slot', () => {
  it('is told apart from a colour by its prefix, which no colour can have', () => {
    expect(isThemeRef('theme:accent1')).toBe(true);
    expect(isThemeRef('#0ea5e9')).toBe(false);
    expect(isThemeRef('rgb(1,2,3)')).toBe(false);
    // The prefix alone names nothing.
    expect(isThemeRef('theme:')).toBe(false);
    expect(themeRef('accent1')).toBe('theme:accent1');
  });
});

describe('resolving a slot', () => {
  const theme = {
    stype: 'theme',
    attributes: { id: 't', accent1: '#0ea5e9', majorFont: 'Georgia' }
  };

  it('gives the colour the theme names', () => {
    expect(resolveThemeValue(theme as never, 'theme:accent1')).toBe('#0ea5e9');
  });

  it('gives a face for a font slot, which is a different attribute', () => {
    expect(resolveThemeValue(theme as never, 'theme:major')).toBe('Georgia');
  });

  /** Anything that is not a reference is untouched, which is what keeps every
      deck written before themes drawing exactly as it did. */
  it('leaves a real colour alone', () => {
    expect(resolveThemeValue(theme as never, '#ff0000')).toBe('#ff0000');
    expect(resolveThemeValue(undefined, '#ff0000')).toBe('#ff0000');
  });

  /**
   * A slot the theme cannot answer resolves to nothing rather than to black:
   * a deck from a tool with more slots than this one should lose the colour it
   * cannot express, not gain one nobody chose.
   */
  it('gives nothing for a slot the theme does not fill, or with no theme at all', () => {
    expect(resolveThemeValue(theme as never, 'theme:accent5')).toBeUndefined();
    expect(resolveThemeValue(theme as never, 'theme:honeycomb')).toBeUndefined();
    expect(resolveThemeValue(undefined, 'theme:accent1')).toBeUndefined();
  });

  it('resolves a whole set of attributes, and drops what it cannot fill', () => {
    expect(
      resolveThemeAttrs(theme as never, {
        fill: 'theme:accent1',
        stroke: '#000000',
        gradientFrom: 'theme:accent4',
        strokeWidth: 30
      })
    ).toEqual({ fill: '#0ea5e9', stroke: '#000000', strokeWidth: 30 });
  });

  it('returns the same object when there is no slot in it', () => {
    const attrs = { fill: '#ff0000' };
    expect(resolveThemeAttrs(theme as never, attrs)).toBe(attrs);
  });
});

describe('which theme a deck resolves through', () => {
  let store: DataStore;
  let doc: DeckAccess;

  const load = (resources: unknown[]) => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    const editor: any = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide', layoutId: 'l' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 100, height: 100 },
                content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'T' }] }]
              }
            ]
          },
          { stype: 'resources', attributes: {}, content: resources }
        ]
      } as never,
      'slides'
    );
    const root = store.getNode(editor.getRootId()) as any;
    doc = { rootId: root.sid, getNode: (sid: string) => store.getNode(sid) as never };
    return root;
  };

  const theme = (id: string, accent: string) => ({
    stype: 'theme',
    attributes: { id, accent1: accent, majorFont: 'Georgia' }
  });

  it('is the one the master names', () => {
    load([
      theme('a', '#111111'),
      theme('b', '#222222'),
      { stype: 'slideMaster', attributes: { id: 'm', themeId: 'b' }, content: [] },
      { stype: 'slideLayout', attributes: { id: 'l', masterId: 'm' }, content: [] }
    ]);
    expect(themeFor(doc, 'm')?.attributes?.accent1).toBe('#222222');
  });

  /**
   * A deck with one theme and a master that forgot to name it is a deck somebody
   * wrote by hand, and drawing it grey would be punishing a document for an
   * attribute that can be inferred with certainty.
   */
  it('is the only one, when nothing names one', () => {
    load([theme('a', '#111111')]);
    expect(themeFor(doc, undefined)?.attributes?.accent1).toBe('#111111');
  });

  it('is none, when two exist and nothing says which', () => {
    load([theme('a', '#111111'), theme('b', '#222222')]);
    expect(themeFor(doc, undefined)).toBeUndefined();
  });

  /**
   * The point of a font slot: the master says which *kind* of face a title is,
   * and the theme says what that face is — so changing a deck's heading face is
   * one attribute rather than one per layout.
   */
  it('fills a master’s font slot when a slide’s title is resolved', () => {
    const root = load([
      theme('a', '#111111'),
      {
        stype: 'slideMaster',
        attributes: { id: 'm', themeId: 'a' },
        content: [
          {
            stype: 'textFrame',
            attributes: { role: 'title', x: 0, y: 0, width: 10, height: 10 },
            content: [
              {
                stype: 'paragraph',
                attributes: { fontFamily: 'theme:major', fontSize: 66 },
                content: [{ stype: 'inline-text', text: 'Title' }]
              }
            ]
          }
        ]
      },
      { stype: 'slideLayout', attributes: { id: 'l', masterId: 'm' }, content: [] }
    ]);

    const slide = (root.content as string[])[0];
    const title = ((store.getNode(slide) as any).content as string[])[0];
    const paragraph = ((store.getNode(title) as any).content as string[])[0];

    const format = resolveDeckFormat(doc, paragraph, 'character');
    expect(format.fontFamily).toBe('Georgia');
    expect(format.fontSize).toBe(66);
  });
});

/**
 * A slot inside a list, which is where colours live now.
 *
 * A shape's paints and effects are arrays of objects, and a slot inside one is
 * exactly as much a reference as `fill: 'theme:accent1'` was. Walking only the
 * top level meant a reader could pick a theme colour for a fill and watch the
 * shape lose its colour entirely — `theme:accent1` is not a colour any browser
 * knows.
 */
describe('a slot inside a shape’s lists', () => {
  const theme = {
    stype: 'theme',
    attributes: { id: 't', accent1: '#0ea5e9', accent2: '#f59e0b' }
  };

  it('resolves a paint’s colour', () => {
    const resolved = resolveThemeAttrs(theme as never, {
      fills: [{ kind: 'solid', color: 'theme:accent1' }]
    });
    expect((resolved.fills as never as { color: string }[])[0].color).toBe('#0ea5e9');
  });

  it('resolves every stop of a gradient', () => {
    const resolved = resolveThemeAttrs(theme as never, {
      fills: [
        {
          kind: 'linear',
          stops: [
            { offset: 0, color: 'theme:accent1' },
            { offset: 1, color: 'theme:accent2' }
          ]
        }
      ]
    });
    const stops = (resolved.fills as never as { stops: { color: string }[] }[])[0].stops;
    expect(stops.map((stop) => stop.color)).toEqual(['#0ea5e9', '#f59e0b']);
  });

  it('resolves an effect’s colour', () => {
    const resolved = resolveThemeAttrs(theme as never, {
      effects: [{ kind: 'drop', color: 'theme:accent2' }]
    });
    expect((resolved.effects as never as { color: string }[])[0].color).toBe('#f59e0b');
  });

  it('leaves a list with no slot in it exactly as it was', () => {
    const attrs = { fills: [{ kind: 'solid', color: '#ff0000' }] };
    expect(resolveThemeAttrs(theme as never, attrs)).toBe(attrs);
  });
});

/**
 * Editing the theme rather than choosing one.
 *
 * The one thing every real deck starts with — the company's own accent — was the
 * one thing that could not be typed in: a shape's colour could *reference* a slot
 * and the slots themselves were whatever the named preset said.
 */
describe('the theme as a set of values', () => {
  const node = (attrs: Record<string, unknown>) => ({ sid: 't', stype: 'theme', attributes: attrs }) as never;

  it('fills the gaps from the first preset', () => {
    // A theme node carries whichever slots have been written, so a deck may name
    // a theme and have four of its twelve colours. A colour field with nothing in
    // it cannot be nudged, and a row of twelve with four blank reads as a broken
    // panel rather than as a theme with four slots set.
    const now = themeNow(node({ id: 'theme-1', accent1: '#ff0000' }));
    expect(now.colours.accent1).toBe('#ff0000');
    expect(now.colours.accent2).toBe(DECK_THEMES[0].colours.accent2);
    expect(now.majorFont).toBe(DECK_THEMES[0].majorFont);
  });

  it('is the first preset for a deck with no theme at all', () => {
    expect(themeNow(undefined).colours).toEqual(DECK_THEMES[0].colours);
  });

  it('says which preset it is', () => {
    const office = DECK_THEMES[0];
    expect(themeMatching(node({ ...office.colours, majorFont: office.majorFont, minorFont: office.minorFont }))?.name).toBe(
      office.name
    );
  });

  /**
   * The defect this exists for.
   *
   * The theme row read the stored `name`, so a deck whose accent had been changed
   * to the company's red went on calling itself "Office" — and a reader who
   * cannot see that they have a custom theme cannot see why the list will not put
   * it back.
   */
  it('says nothing once a slot has been changed, whatever the name still claims', () => {
    const office = DECK_THEMES[0];
    const edited = node({
      ...office.colours,
      accent1: '#c0392b',
      name: 'Office',
      majorFont: office.majorFont,
      minorFont: office.minorFont
    });
    expect(themeMatching(edited)).toBeUndefined();
    // The name is still in the document; it is simply no longer the answer.
    expect(themeNow(edited).name).toBe('Office');
  });

  it('is the same preset in either case of the same colour', () => {
    const office = DECK_THEMES[0];
    const shouted = Object.fromEntries(
      Object.entries(office.colours).map(([slot, value]) => [slot, value.toUpperCase()])
    );
    expect(
      themeMatching(node({ ...shouted, majorFont: office.majorFont, minorFont: office.minorFont }))?.name
    ).toBe(office.name);
  });

  it('is not a preset when only the fonts differ', () => {
    const office = DECK_THEMES[0];
    expect(
      themeMatching(node({ ...office.colours, majorFont: 'Comic Sans MS', minorFont: office.minorFont }))
    ).toBeUndefined();
  });
});
