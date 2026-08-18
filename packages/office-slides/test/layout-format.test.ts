import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { placeholderFor, resolveDeckFormat, type DeckAccess } from '../src/index';

/**
 * A slide's formatting, resolved through its layout.
 *
 * `slideLayout` was declared, drawn (hidden) and read by exactly one thing —
 * `insertSlide`, which copies its placeholders into a new slide and then leaves
 * the copy on its own. Everything below is what "follows the layout" has to mean
 * before a font control can honestly say what font a title is in.
 */
describe('formatting through the layout', () => {
  let store: DataStore;
  let doc: DeckAccess;
  let title: string;
  let titleParagraph: string;
  let body: string;
  let bodySecond: string;
  let loose: string;
  let unlaidTitle: string;

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

    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide', layoutId: 'body' },
            content: [
              // Nothing set on the slide's own title: everything it looks like
              // comes from the layout.
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 100, height: 100 },
                content: [para('Written by a reader')]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 0, y: 200, width: 100, height: 100 },
                content: [para('First'), para('Second'), para('Third')]
              },
              // A box with no role at all — a shape a reader added.
              {
                stype: 'textFrame',
                attributes: { x: 0, y: 400, width: 100, height: 100 },
                content: [para('Loose')]
              }
            ]
          },
          {
            // A slide that follows no layout.
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 100, height: 100 },
                content: [para('No layout here')]
              }
            ]
          },
          {
            stype: 'resources',
            attributes: {},
            content: [
              {
                stype: 'slideLayout',
                attributes: { id: 'body', name: 'Title and content' },
                content: [
                  {
                    stype: 'textFrame',
                    // The position is the layout's and must never cascade: a
                    // slide's title may have been moved.
                    attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                    content: [para('Click to add a title', { fontSize: 66, alignment: 'center' })]
                  },
                  {
                    stype: 'textFrame',
                    attributes: { role: 'body', x: 1440, y: 3120, width: 16320, height: 6240 },
                    content: [
                      para('Level one', { fontSize: 40 }),
                      para('Level two', { fontSize: 28 })
                    ]
                  }
                ]
              }
            ]
          }
        ]
      } as never,
      'slides'
    );

    const root = store.getNode(editor.getRootId()) as any;
    doc = { rootId: root.sid, getNode: (sid: string) => store.getNode(sid) as never };

    const [slide, plain] = root.content;
    [title, body, loose] = childrenOf(slide);
    [titleParagraph] = childrenOf(title);
    bodySecond = childrenOf(body)[1];
    [unlaidTitle] = childrenOf(plain);
  });

  it('finds the placeholder a box follows, by role', () => {
    expect(placeholderFor(doc, title)?.attributes?.role).toBe('title');
    expect(placeholderFor(doc, body)?.attributes?.role).toBe('body');
  });

  it('finds nothing for a box with no role', () => {
    // The honest answer. A box the layout does not describe inherits nothing
    // rather than inheriting whatever happened to be nearby.
    expect(placeholderFor(doc, loose)).toBeUndefined();
  });

  it('finds nothing when the slide follows no layout', () => {
    expect(placeholderFor(doc, unlaidTitle)).toBeUndefined();
  });

  it('gives a paragraph the layout’s formatting when it sets none itself', () => {
    expect(resolveDeckFormat(doc, titleParagraph, 'character')).toMatchObject({ fontSize: 66 });
    expect(resolveDeckFormat(doc, titleParagraph, 'paragraph')).toMatchObject({
      alignment: 'center'
    });
  });

  it('answers for the paragraph a run is in', () => {
    const run = childrenOf(titleParagraph)[0];
    expect(resolveDeckFormat(doc, run, 'character')).toMatchObject({ fontSize: 66 });
  });

  it('lets what is set on the node win', async () => {
    const schema = (store as any).getActiveSchema?.();
    void schema;
    (store as any).updateNode(titleParagraph, { attributes: { fontSize: 12 } } as never);
    expect(resolveDeckFormat(doc, titleParagraph, 'character')).toMatchObject({ fontSize: 12 });
  });

  /**
   * The nearest thing to PowerPoint's per-level formatting the schema can say
   * today: the placeholder's paragraph at the same index, and the last one after
   * that.
   */
  it('takes the second paragraph’s formatting for the second paragraph', () => {
    expect(resolveDeckFormat(doc, bodySecond, 'character')).toMatchObject({ fontSize: 28 });
  });

  it('falls back to the placeholder’s last paragraph past the end', () => {
    const third = childrenOf(body)[2];
    expect(resolveDeckFormat(doc, third, 'character')).toMatchObject({ fontSize: 28 });
  });

  /**
   * The one that would ruin a deck. A layout's title sits at (1440, 960); a
   * slide's title has been moved to (0, 0). Cascading position would drag every
   * title back the moment anything asked what font it was in.
   */
  it('never cascades where the placeholder is', () => {
    const format = resolveDeckFormat(doc, title, 'paragraph');
    expect(format.x).toBeUndefined();
    expect(format.y).toBeUndefined();
    expect(format.width).toBeUndefined();
    expect((store.getNode(title) as any).attributes.x).toBe(0);
  });

  it('gives nothing for a box the layout does not describe', () => {
    const paragraph = childrenOf(loose)[0];
    expect(resolveDeckFormat(doc, paragraph, 'character')).toEqual({});
  });
});
