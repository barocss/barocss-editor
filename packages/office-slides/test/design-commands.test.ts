import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { childrenOf, editableSurface, type DeckAccess } from '../src/deck';
import { backgroundOf, deckDesigns } from '../src/layout-format';

/**
 * Changing what a deck **inherits from**.
 *
 * The state this replaces: `applySlideLayout` and `setSlideLayout` said which layout a slide
 * *follows*, and nothing said what a layout **is** — readable by everything, changeable by
 * nobody. `canvas-model.md` §10c wrote down, when a component's definition first became
 * something a reader could open, that the same mechanism is what a master and a layout need and
 * that building it for components alone would be building it twice. This is the other two.
 */
describe('the definitions a deck inherits from', () => {
  let editor: Editor;
  let store: DataStore;
  let doc: DeckAccess;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    (editor as any).canExecuteCommand(command, payload);

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
            attributes: { kind: 'slide', layoutId: 'body' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 9000, y: 8000, width: 4000, height: 1000 },
                content: [
                  { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '제목' }] }
                ]
              }
            ]
          },
          {
            stype: 'surface',
            attributes: { kind: 'slide', layoutId: 'body' },
            content: []
          },
          {
            stype: 'resources',
            attributes: {},
            content: [
              {
                stype: 'slideMaster',
                attributes: { id: 'master-1', name: 'Office', fill: '#ffffff' },
                content: []
              },
              {
                stype: 'slideLayout',
                attributes: { id: 'body', name: 'Title and content', masterId: 'master-1' },
                content: [
                  {
                    stype: 'textFrame',
                    attributes: { role: 'title', x: 1440, y: 960, width: 16320, height: 1680 },
                    content: [
                      { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '' }] }
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
    doc = {
      rootId: (editor as never as { getRootId: () => string }).getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };
  });

  const design = (id: string) => deckDesigns(doc).find((one) => one.id === id) as { sid: string };

  it('are surfaces a reader can put shapes in', () => {
    // The one question the insert commands ask, with two more answers than it had: a caller that
    // passed a layout's sid used to be refused outright, because a layout is not a slide.
    expect(editableSurface(doc, design('body').sid)).toBe(design('body').sid);
    expect(editableSurface(doc, design('master-1').sid)).toBe(design('master-1').sid);
    // And a theme is still not one: it is colours and two fonts, edited in a dialog because
    // there is nothing on a canvas to point at.
    expect(editableSurface(doc, 'nowhere')).toBeUndefined();
  });

  it('refuse what a design does not have, and take what it does', async () => {
    expect(can('setDesign', { nodeId: design('body').sid })).toBe(false);
    expect(can('setDesign', { nodeId: design('body').sid, name: '본문' })).toBe(true);

    expect(await run('setDesign', { nodeId: design('body').sid, name: '본문' })).toBeTruthy();
    expect(deckDesigns(doc).find((one) => one.id === 'body')?.name).toBe('본문');
  });

  it('give every slide that follows them a background, and take it back', async () => {
    const slides = childrenOf(doc.getNode(doc.rootId)).filter(
      (sid) => doc.getNode(sid)?.stype === 'surface'
    );
    // The master's, to start with: the chain is the slide's own, then its layout's, then the
    // master's — which is the reason a master is worth having.
    expect(backgroundOf(doc, slides[0])).toBe('#ffffff');

    await run('setDesign', { nodeId: design('body').sid, fill: '#ff0000' });
    for (const slide of slides) expect(backgroundOf(doc, slide)).toBe('#ff0000');

    // `null` is how it goes back to inheriting — the operation's own way of saying "not set",
    // which is the only one that works for every type.
    await run('setDesign', { nodeId: design('body').sid, fill: null });
    expect(backgroundOf(doc, slides[0])).toBe('#ffffff');
  });

  it('put the layout’s arrangement onto every slide that follows it', async () => {
    const slides = childrenOf(doc.getNode(doc.rootId)).filter(
      (sid) => doc.getNode(sid)?.stype === 'surface'
    );
    const title = childrenOf(doc.getNode(slides[0]))[0];
    // The slide's title is nowhere near the layout's slot for it.
    expect(doc.getNode(title)?.attributes?.x).toBe(9000);

    expect(await run('applyDesign', { layoutId: 'body' })).toBeTruthy();
    expect(doc.getNode(title)?.attributes?.x).toBe(1440);

    /*
     * And it is one entry: a reader who asked once and had to press undo twenty times would be
     * paying for the product's convenience — the same reason a component's apply does every
     * placement together.
     */
    await (editor as any).undo();
    expect(doc.getNode(title)?.attributes?.x).toBe(9000);
  });

  it('refuse to apply a layout nothing follows', () => {
    // Nothing to do is not success: an entry that undoes to itself is the fault this repository
    // keeps finding in a command that reports it did something.
    expect(can('applyDesign', { layoutId: 'nobody-follows-this' })).toBe(false);
  });
});
