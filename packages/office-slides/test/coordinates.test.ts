import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSlidesEditor } from '../src/slides-kit';
import { fromSurface, toSurface, type DeckAccess } from '../src/index';

/**
 * A coordinate belongs to its container.
 *
 * A scene node's `x` and `y` are measured from the nearest scene ancestor, and a
 * node with no scene ancestor is measured from the slide. The rule is in
 * `docs/specs/canvas-model.md`; these are the arithmetic it implies.
 *
 * The overlay implemented it inline and a clipboard would have implemented it
 * again. Grouping's rebase is a different problem wearing the same arithmetic:
 * it is rebasing against a frame that does not exist yet, so it takes the box
 * explicitly (`intoFrame`) rather than walking to it.
 */
describe('a box in one container, expressed in another', () => {
  let store: DataStore;
  let doc: DeckAccess;
  let slide: string;
  let frame: string;
  let inner: string;
  let deep: string;
  let loose: string;

  beforeEach(() => {
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
            attributes: { kind: 'slide' },
            content: [
              {
                stype: 'frame',
                attributes: { x: 1000, y: 500, width: 5000, height: 4000 },
                content: [
                  /**
                   * A group whose box already agrees with its children.
                   *
                   * It held one child at (30,20), which is a group describing an
                   * area its contents do not fill — and a group's box follows
                   * its children now, so the deck tightened it the moment the
                   * document loaded and this test measured the tightened
                   * numbers. The subject here is the coordinate conversion, so
                   * the fixture is a document the fitting rule has nothing to
                   * say about: a second child at the origin, and the offsets
                   * this test is about survive untouched.
                   */
                  {
                    stype: 'group',
                    attributes: { x: 200, y: 100, width: 2000, height: 1500 },
                    content: [
                      { stype: 'rectangle', attributes: { x: 0, y: 0, width: 2000, height: 1500 } },
                      { stype: 'rectangle', attributes: { x: 30, y: 20, width: 400, height: 300 } }
                    ]
                  },
                  { stype: 'ellipse', attributes: { x: 700, y: 600, width: 400, height: 300 } }
                ]
              },
              { stype: 'rectangle', attributes: { x: 9000, y: 8000, width: 400, height: 300 } }
            ]
          }
        ]
      } as never,
      'slides'
    );

    const root = store.getNode(editor.getRootId()) as any;
    doc = { rootId: root.sid, getNode: (sid: string) => store.getNode(sid) as never };
    slide = root.content[0];
    const onSlide = (store.getNode(slide) as any).content;
    frame = onSlide[0];
    loose = onSlide[1];
    const inFrame = (store.getNode(frame) as any).content;
    inner = inFrame[0];
    // The second child: the first is the one that holds the group's origin.
    deep = ((store.getNode(inner) as any).content ?? [])[1];
  });

  const box = (sid: string) => {
    const attributes = (store.getNode(sid) as any).attributes;
    return { x: attributes.x, y: attributes.y, width: attributes.width, height: attributes.height };
  };

  it('leaves a box that is already on the slide where it is', () => {
    expect(toSurface(doc, loose, box(loose))).toMatchObject({ x: 9000, y: 8000 });
  });

  it('adds the container it is in', () => {
    // The group is at (200,100) inside a frame at (1000,500).
    expect(toSurface(doc, inner, box(inner))).toMatchObject({ x: 1200, y: 600 });
  });

  it('adds every container between it and the slide', () => {
    // 30 + 200 + 1000, 20 + 100 + 500.
    expect(toSurface(doc, deep, box(deep))).toMatchObject({ x: 1230, y: 620 });
  });

  it('takes the destination container off again', () => {
    // The whole point: a shape dropped into the frame keeps the place it looked
    // like it was in, which means its numbers change.
    const onSlide = toSurface(doc, deep, box(deep));
    expect(fromSurface(doc, frame, onSlide)).toMatchObject({ x: 230, y: 120 });
  });

  it('is its own inverse for the container a box is already in', () => {
    const parent = (store.getNode(deep) as any).parentId;
    const there = toSurface(doc, deep, box(deep));
    expect(fromSurface(doc, parent, there)).toMatchObject(box(deep));
  });

  it('treats the slide as the container of last resort', () => {
    // Nothing to subtract: a slide is not a scene node and has no origin of its
    // own inside itself.
    const onSlide = toSurface(doc, deep, box(deep));
    expect(fromSurface(doc, slide, onSlide)).toMatchObject({ x: 1230, y: 620 });
    expect(fromSurface(doc, undefined, onSlide)).toMatchObject({ x: 1230, y: 620 });
  });

  it('carries the size through untouched', () => {
    // Nothing here scales, so a width is a width in any container.
    expect(toSurface(doc, deep, box(deep))).toMatchObject({ width: 400, height: 300 });
    expect(fromSurface(doc, frame, box(deep))).toMatchObject({ width: 400, height: 300 });
  });
});
