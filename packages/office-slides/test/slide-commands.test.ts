import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { deckSlides, type DeckAccess } from '../src/deck';

/**
 * The five commands a deck has that a document does not.
 *
 * Each is checked for what it did *and* for undoing cleanly, because that is
 * the part a command can silently fail at: `transaction` collects the
 * operations' inverses and is undo, so a command assembled from an operation
 * that declines to say how to undo it reports success and leaves the reader
 * unable to take it back. The operation roster found fourteen of those.
 */
describe('the commands a deck has', () => {
  let editor: Editor;
  let store: DataStore;

  const doc = (): DeckAccess => ({
    rootId: (editor as any).getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });

  const names = () => deckSlides(doc()).map((slide) => slide.name);
  /**
   * Awaited, always. Every command here commits a transaction, which is async,
   * and asserting without waiting reads the deck before the edit lands — the
   * insert tests failed that way and the *undo* tests passed vacuously, having
   * undone nothing at all.
   */
  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });

    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          { stype: 'docMeta', attributes: {}, content: [] },
          {
            stype: 'surface',
            attributes: { kind: 'slide', name: 'One', layoutId: 'body' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 100, height: 100 },
                content: [
                  { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'One' }] }
                ]
              }
            ]
          },
          { stype: 'surface', attributes: { kind: 'slide', name: 'Two' }, content: [] },
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
                    attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                    content: [
                      {
                        stype: 'paragraph',
                        attributes: {},
                        content: [{ stype: 'inline-text', text: 'Click to add a title' }]
                      }
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
  });

  it('starts from the fixture, so a failure below is the command and not the setup', async () => {
    expect(names()).toEqual(['One', 'Two']);
  });

  describe('adding a slide', () => {
    it('puts it after the one it follows, not at the end', async () => {
      const [one] = deckSlides(doc());
      expect(await run('insertSlide', { after: one.sid })).toBeTruthy();

      const slides = deckSlides(doc());
      expect(slides).toHaveLength(3);
      // Named by the layout's placeholder text, which is what a rail shows for
      // a slide nobody has written a title on yet.
      expect(slides[1].name).toBe('Click to add a title');
      expect(slides[2].name).toBe('Two');
    });

    /**
     * The first thing in this repository to read a `slideLayout`. It was
     * declared, drawn (hidden) and used by nothing.
     */
    it('starts with the layout’s placeholders, copied', async () => {
      const [one] = deckSlides(doc());
      await run('insertSlide', { after: one.sid });

      const made = deckSlides(doc())[1];
      const surface = store.getNode(made.sid) as any;
      const frame = store.getNode(surface.content[0]) as any;

      expect(frame.stype).toBe('textFrame');
      expect(frame.attributes.role).toBe('title');
      expect(frame.attributes.width).toBe(16320);

      // Copied, not shared: editing this slide's title must not rewrite the
      // layout every other slide follows.
      const layout = store.findNodes?.((n: any) => n.stype === 'slideLayout')?.[0] as any;
      expect(frame.sid).not.toBe(layout?.content?.[0]);
    });

    it('follows the layout of the slide it comes after', async () => {
      const [one] = deckSlides(doc());
      await run('insertSlide', { after: one.sid });
      expect(deckSlides(doc())[1].layoutId).toBe('body');
    });

    it('gives a slide with no layout something to type in', async () => {
      // An empty `surface` is legal and useless: no box means no caret and no
      // way to make one.
      const slides = deckSlides(doc());
      await run('insertSlide', { after: slides[1].sid });

      const made = store.getNode(deckSlides(doc())[2].sid) as any;
      expect(made.content).toHaveLength(1);
      expect((store.getNode(made.content[0]) as any).stype).toBe('textFrame');
    });

    it('appends when nothing says where', async () => {
      await run('insertSlide');
      expect(deckSlides(doc())).toHaveLength(3);
      expect(deckSlides(doc())[1].name).toBe('Two');
    });

    it('undoes to the deck that was there', async () => {
      await run('insertSlide');
      await (editor as any).undo();
      expect(names()).toEqual(['One', 'Two']);
    });
  });

  describe('deleting a slide', () => {
    it('removes it', async () => {
      const [one] = deckSlides(doc());
      expect(await run('deleteSlide', { slideId: one.sid })).toBeTruthy();
      expect(names()).toEqual(['Two']);
    });

    it('refuses the last one', async () => {
      // A deck with no slides has nowhere to put a caret and nothing to draw,
      // the way a document keeps one paragraph.
      const [one] = deckSlides(doc());
      await run('deleteSlide', { slideId: one.sid });

      const [last] = deckSlides(doc());
      expect((editor as any).canExecuteCommand?.('deleteSlide', { slideId: last.sid })).toBe(false);
      await run('deleteSlide', { slideId: last.sid });
      expect(names()).toEqual(['Two']);
    });

    it('undoes with its contents intact', async () => {
      const [one] = deckSlides(doc());
      await run('deleteSlide', { slideId: one.sid });
      await (editor as any).undo();

      expect(names()).toEqual(['One', 'Two']);
      // The whole subtree, not an empty slide with the right name.
      const restored = store.getNode(deckSlides(doc())[0].sid) as any;
      expect(restored.content).toHaveLength(1);
    });
  });

  describe('duplicating a slide', () => {
    it('puts the copy directly after the original', async () => {
      const [one] = deckSlides(doc());
      expect(await run('duplicateSlide', { slideId: one.sid })).toBeTruthy();
      expect(names()).toEqual(['One', 'One', 'Two']);
    });

    it('copies the contents, with an identity of their own', async () => {
      const [one] = deckSlides(doc());
      await run('duplicateSlide', { slideId: one.sid });

      const [original, copy] = deckSlides(doc());
      expect(copy.sid).not.toBe(original.sid);

      const originalFrame = (store.getNode(original.sid) as any).content[0];
      const copiedFrame = (store.getNode(copy.sid) as any).content[0];
      // Two nodes with one sid would give two nodes one identity, which every
      // mapping from a DOM position back to the model resolves through.
      expect(copiedFrame).not.toBe(originalFrame);
      expect((store.getNode(copiedFrame) as any).attributes.role).toBe('title');
    });

    it('is one thing to undo, not two', async () => {
      const [one] = deckSlides(doc());
      await run('duplicateSlide', { slideId: one.sid });
      await (editor as any).undo();
      expect(names()).toEqual(['One', 'Two']);
    });
  });

  describe('reordering', () => {
    it('moves a slide to the position asked for', async () => {
      const [, two] = deckSlides(doc());
      expect(await run('moveSlide', { slideId: two.sid, to: 0 })).toBeTruthy();
      expect(names()).toEqual(['Two', 'One']);
    });

    /**
     * The translation this command exists to get right: a reader counts slides
     * and `moveNode` counts the document's children, which include `docMeta`
     * and `resources`.
     */
    it('counts in slides, not in the document’s children', async () => {
      const [one] = deckSlides(doc());
      await run('moveSlide', { slideId: one.sid, to: 1 });
      expect(names()).toEqual(['Two', 'One']);

      // And `resources` is still last, rather than having a slide moved past it.
      const root = store.getNode((editor as any).getRootId()) as any;
      const last = store.getNode(root.content[root.content.length - 1]) as any;
      expect(last.stype).toBe('resources');
    });

    it('refuses a position that is not one, and a move to where it already is', async () => {
      const [one] = deckSlides(doc());
      const can = (to: unknown) =>
        (editor as any).canExecuteCommand?.('moveSlide', { slideId: one.sid, to });

      expect(can(0)).toBe(false); // already there: an edit that undoes to itself
      expect(can(-1)).toBe(false);
      expect(can(9)).toBe(false);
      expect(can(1.5)).toBe(false);
      expect(can(undefined)).toBe(false);
    });

    it('undoes back to the order that was there', async () => {
      const [, two] = deckSlides(doc());
      await run('moveSlide', { slideId: two.sid, to: 0 });
      await (editor as any).undo();
      expect(names()).toEqual(['One', 'Two']);
    });
  });

  describe('hiding a slide', () => {
    it('keeps it in the deck', async () => {
      const [one] = deckSlides(doc());
      await run('toggleSlideHidden', { slideId: one.sid });

      const slides = deckSlides(doc());
      expect(slides).toHaveLength(2);
      expect(slides[0].hidden).toBe(true);
    });

    it('toggles back', async () => {
      const [one] = deckSlides(doc());
      await run('toggleSlideHidden', { slideId: one.sid });
      await run('toggleSlideHidden', { slideId: one.sid });
      expect(deckSlides(doc())[0].hidden).toBe(false);
    });

    it('undoes', async () => {
      const [one] = deckSlides(doc());
      await run('toggleSlideHidden', { slideId: one.sid });
      await (editor as any).undo();
      expect(deckSlides(doc())[0].hidden).toBe(false);
    });
  });
});

/**
 * The two that edit a box rather than a slide.
 *
 * Separate from the deck commands because the questions are different: a deck
 * command asks which slide, and these ask which box and whether it will allow
 * itself to be moved.
 */
describe('the commands a box has', () => {
  let editor: Editor;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    (editor as any).canExecuteCommand?.(command, payload);
  const attrs = (sid: string) => (store.getNode(sid) as any).attributes;

  let box: string;
  let locked: string;

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });

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
                stype: 'textFrame',
                attributes: { role: 'title', x: 100, y: 200, width: 300, height: 400 },
                content: [{ stype: 'paragraph', attributes: {}, content: [] }]
              },
              {
                stype: 'rectangle',
                attributes: { x: 0, y: 0, width: 50, height: 50, locked: true }
              }
            ]
          }
        ]
      } as never,
      'slides'
    );

    const surface = (store.getNode((editor as any).getRootId()) as any).content[0];
    [box, locked] = (store.getNode(surface) as any).content;
  });

  it('writes only the numbers it was given', () => {
    // A panel that sent all four would overwrite a width the reader never
    // touched with whatever its field happened to be showing.
    expect(can('setBoxGeometry', { nodeId: box, x: 999 })).toBe(true);
  });

  it('moves a box', async () => {
    expect(await run('setBoxGeometry', { nodeId: box, x: 999, width: 1234 })).toBeTruthy();
    expect(attrs(box)).toMatchObject({ x: 999, y: 200, width: 1234, height: 400 });
  });

  it('undoes a move', async () => {
    await run('setBoxGeometry', { nodeId: box, x: 999 });
    await (editor as any).undo();
    expect(attrs(box).x).toBe(100);
  });

  /**
   * `locked` had been in the schema since the canvas nodes were declared and
   * nothing had ever read it, because nothing could move a box.
   */
  it('refuses a locked box', async () => {
    expect(can('setBoxGeometry', { nodeId: locked, x: 5 })).toBe(false);
    expect(await run('setBoxGeometry', { nodeId: locked, x: 5 })).toBeFalsy();
    expect(attrs(locked).x).toBe(0);
  });

  it('refuses anything that is not a box', async () => {
    const paragraph = (store.getNode(box) as any).content[0];
    expect(can('setBoxGeometry', { nodeId: paragraph, x: 5 })).toBe(false);
    expect(can('setBoxGeometry', { nodeId: 'nope', x: 5 })).toBe(false);
  });

  it('refuses a change that says nothing', () => {
    // An empty payload is not an edit, and committing one would put an entry in
    // the history that undoes to the same document.
    expect(can('setBoxGeometry', { nodeId: box })).toBe(false);
    expect(can('setBoxGeometry', { nodeId: box, x: NaN })).toBe(false);
    expect(can('setBoxStyle', { nodeId: box })).toBe(false);
  });

  it('sets a fill, and clears one', async () => {
    await run('setBoxStyle', { nodeId: box, fill: '#ff0000' });
    expect(attrs(box).fill).toBe('#ff0000');

    // `null` is how a caller says "no fill" — a real answer, and not white.
    await run('setBoxStyle', { nodeId: box, fill: null });
    expect(attrs(box).fill).toBeUndefined();
  });

  it('undoes a cleared fill back to the colour', async () => {
    await run('setBoxStyle', { nodeId: box, fill: '#ff0000' });
    await run('setBoxStyle', { nodeId: box, fill: null });
    await (editor as any).undo();
    expect(attrs(box).fill).toBe('#ff0000');
  });
});
