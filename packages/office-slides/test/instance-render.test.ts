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
import { WORD_ENV_KEY } from '@barocss/office-word';

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
 * A placement of a component.
 *
 * The expectation worth writing down, because it is the one that turned out to be wrong: a
 * placement does **not** reach into its definition at draw time. It cannot — a template can
 * only render nodes through `slot`, which reads this node's own data (canvas-model §10b-2) —
 * so a placement holds real copies and drawing it is drawing its children, like a group's.
 *
 * Which is what makes the geometry work: a part's coordinates are relative to its parent, so
 * a copy of a definition's part keeps the numbers it had on the definition's own surface and
 * lands in the same arrangement wherever the placement is put.
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

  it('puts its parts where the definition had them, at its own place', () => {
    const container = drawn(
      deckWith([
        {
          stype: 'rectangle',
          attributes: { partOf: 'p1', x: 0, y: 0, width: 4000, height: 2000, fill: '#eee' }
        },
        {
          stype: 'ellipse',
          attributes: { partOf: 'p2', x: 3600, y: 1600, width: 600, height: 600, fill: '#f00' }
        }
      ])
    );

    const placement = container.querySelector<HTMLElement>('.sl-instance');
    expect(placement, '배치가 그려지지 않았습니다').not.toBeNull();
    // Its own place, in the slide's coordinates.
    expect(placement!.style.left).toBe(`${twipToPx(3000)}px`);
    expect(placement!.style.top).toBe(`${twipToPx(1500)}px`);

    // And its parts inside it, at the numbers the definition had — the badge sticking out
    // past the card's own box, which is why a placement does not clip.
    const parts = [...placement!.querySelectorAll<HTMLElement>('.sl-shape')];
    expect(parts).toHaveLength(2);
    expect(parts[1].style.left).toBe(`${twipToPx(3600)}px`);
  });

  it('says what it is a placement of', () => {
    const container = drawn(deckWith([]));
    // A placement that looked like an ordinary box would be one nobody could tell had a
    // definition behind it — and the panel, the overlay's badge and this test all ask.
    expect(container.querySelector('.sl-instance')?.getAttribute('data-component-id')).toBe('card');
  });

  it('is findable when it holds nothing yet', () => {
    // A definition with no parts, placed, draws nothing at all. A box nobody can find is the
    // fault the frame's outline exists for.
    const container = drawn(deckWith([]));
    expect(container.querySelector('.sl-instance')?.className).toContain('sl-instance-empty');
  });

  it('draws nothing of the definition that the placement has not taken', () => {
    /*
     * The whole design in one assertion. The definition has a part; this placement holds
     * none. Nothing arrives at draw time — which is why apply exists, and why a placement
     * that has fallen behind is something the product has to *say* rather than something the
     * renderer quietly fixes.
     */
    const container = drawn(deckWith([]));
    expect(container.querySelector('.sl-instance')?.querySelectorAll('.sl-shape')).toHaveLength(0);
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
