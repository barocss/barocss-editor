import { describe, it, expect } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { createDeckEnv } from '../src/layout-format';
import { twipToPx } from '../src/geometry';
import { WORD_ENV_KEY } from '@barocss/office-text';

/**
 * A deck, drawn.
 *
 * The claim the whole product rests on is that a slide needs no layout pass:
 * Word mounts one that measures the render, computes page breaks, applies them
 * and renders again until it converges, and this test mounts **no layout pass
 * at all**. If the deck draws in one pass with everything in the right place,
 * the claim holds.
 *
 * Assertions are on the computed geometry rather than on markup, because the
 * markup is an implementation detail and the positions are the product. jsdom
 * does no layout, so `style.left` is what the renderer wrote — which is exactly
 * the thing worth checking, and checking it here costs milliseconds instead of
 * a browser round trip.
 */

/**
 * A placement of a component draws **the definition**, live.
 *
 * This is the second answer, and the first one is worth keeping because of how it was wrong. It
 * said a placement cannot reach into its definition at draw time, because a template renders nodes
 * only through `slot`, which reads this node's own data. That is true of a *renderer* and it is not
 * true of the engine: children are resolved in one place — the proxy the view reads them through —
 * and a resolver there hands back the definition's parts, each of which then arrives as itself.
 *
 * Measured both ways. A renderer that built the parts' elements itself evaluated every one of them
 * against the placement, so two parts came out with the placement's box and the placement's sid.
 * Resolved in the proxy, each part has its own coordinates, its own colour and its own words.
 *
 * Which is what a component *is*: a template is a document you copy and then own, and a component
 * follows its definition as the definition is edited.
 */
describe('a placement draws', () => {
  const drawn = (deck: unknown) => {
    registerSlidesRenderers();
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const dataStore = new DataStore(undefined, schema);
    const editor = createSlidesEditor({ editable: true, schema, dataStore });
    editor.loadDocument(deck as never, 'slides');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry(),
      env: {
        [WORD_ENV_KEY]: createDeckEnv({
          rootId: (editor as any).getRootId(),
          getNode: (sid: string) => dataStore.getNode(sid) as never
        })
      }
    } as never);
    view.render(undefined, { sync: true });
    return container;
  };

  const deckWith = (parts: unknown[]) => ({
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'surface',
        attributes: { kind: 'slide' },
        content: [
          {
            stype: 'instance',
            attributes: { componentId: 'card', x: 3000, y: 1500, width: 4000, height: 2000 },
            content: parts
          }
        ]
      },
      {
        // The definition is a **resource**, not a page: it is not in the deck's sequence, it
        // is never presented, and it is drawn hidden until a reader opens it.
        stype: 'components',
        attributes: {},
        content: [
          {
            stype: 'component',
            attributes: { id: 'card', name: '카드', width: 4000, height: 2000 },
            content: [
              {
                stype: 'rectangle',
                attributes: { partId: 'p1', x: 0, y: 0, width: 4000, height: 2000, fill: '#eee' }
              }
            ]
          }
        ]
      }
    ]
  });

  it('draws the definition’s parts, at its own place, holding nothing itself', () => {
    // The placement holds no parts at all: what is drawn is the definition's.
    const container = drawn(deckWith([]));

    const placement = container.querySelector<HTMLElement>('.sl-instance');
    expect(placement, '배치가 그려지지 않았습니다').not.toBeNull();
    // Its own place, in the slide's coordinates.
    expect(placement!.style.left).toBe(`${twipToPx(3000)}px`);
    expect(placement!.style.top).toBe(`${twipToPx(1500)}px`);

    // And the definition's part inside it, at the numbers the definition has — evaluated against
    // the *part*, which is what resolving in the proxy buys and what a renderer could not do.
    const parts = [...placement!.querySelectorAll<HTMLElement>('.sl-shape')];
    expect(parts).toHaveLength(1);
    expect(parts[0].style.left).toBe('0px');
    expect(parts[0].style.width).toBe(`${twipToPx(4000)}px`);
  });

  it('marks a drawn part as not being a node in the document', () => {
    const container = drawn(deckWith([]));
    const part = container.querySelector<HTMLElement>('.sl-instance .sl-shape');
    /*
     * A synthetic id, and the reason is duplication: two placements of one card would otherwise
     * draw two elements claiming the same identity, and every lookup by sid would find both. `~`
     * appears in no store id, so a reader of the DOM can tell a piece of a placement from a node
     * a reader can select.
     */
    expect(part?.getAttribute('data-bc-sid')).toContain('~');
  });

  it('says what it is a placement of', () => {
    const container = drawn(deckWith([]));
    // A placement that looked like an ordinary box would be one nobody could tell had a
    // definition behind it — and the panel, the overlay's badge and this test all ask.
    expect(container.querySelector('.sl-instance')?.getAttribute('data-component-id')).toBe('card');
  });

  it('follows the definition as it is edited', async () => {
    /*
     * The whole point of a component, and the difference from a template: a template is a document
     * you copy and then own, and a component keeps following. Nothing is applied and nothing is
     * copied here — the definition's part changes and the placement draws the change.
     */
    registerSlidesRenderers();
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const dataStore = new DataStore(undefined, schema);
    const editor: any = createSlidesEditor({ editable: true, schema, dataStore });
    editor.loadDocument(deckWith([]) as never, 'slides');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new EditorViewDOM(editor, {
      container,
      registry: getGlobalRegistry(),
      env: {
        [WORD_ENV_KEY]: createDeckEnv({
          rootId: editor.getRootId(),
          getNode: (sid: string) => dataStore.getNode(sid) as never
        })
      }
    } as never);
    view.render(undefined, { sync: true });
    expect(container.querySelector<HTMLElement>('.sl-instance .sl-shape')?.style.width).toBe(
      `${twipToPx(4000)}px`
    );

    // The definition's part, made narrower.
    const root = dataStore.getNode(editor.getRootId()) as any;
    const library = (root.content as string[])
      .map((sid) => dataStore.getNode(sid) as any)
      .find((one) => one?.stype === 'components');
    const part = ((dataStore.getNode((library.content as string[])[0]) as any).content as string[])[0];
    await editor.executeCommand('setBoxGeometry', { nodeIds: [part], width: 2000 });
    view.render(undefined, { sync: true });

    expect(container.querySelector<HTMLElement>('.sl-instance .sl-shape')?.style.width).toBe(
      `${twipToPx(2000)}px`
    );
  });

  it('draws the definition hidden, and only one page', () => {
    /*
     * The deck has one slide, and the definition is not one of them — which is the whole
     * reason it moved out of `surface+`. It is still *drawn*, for `slideLayout`'s reason: a
     * node with no element has no place in the sid map, and every mapping from a DOM position
     * back to the model goes through that. The stage shows it when a reader opens it.
     */
    const container = drawn(deckWith([]));
    expect(container.querySelectorAll('.sl-slide')).toHaveLength(1);

    const definition = container.querySelector<HTMLElement>('.sl-def-component');
    expect(definition, '정의가 그려지지 않았습니다').not.toBeNull();
    expect(definition!.style.display).toBe('none');
    expect(definition!.getAttribute('data-component-id')).toBe('card');
  });
});
