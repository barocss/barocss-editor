import { describe, it, expect, beforeAll } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { registerSlidesRenderers } from '../src/renderers';
import { createSampleDeck } from '../src/sample-deck';
import { createDeckEnv } from '../src/layout-format';
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
describe('a deck draws', () => {
  let container: HTMLElement;

  beforeAll(() => {
    registerSlidesRenderers();

    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const dataStore = new DataStore(undefined, schema);
    const editor = createSlidesEditor({ editable: true, schema, dataStore });
    editor.loadDocument(createSampleDeck(), 'slides');

    container = document.createElement('div');
    document.body.appendChild(container);

    /**
     * With the deck's environment, which is what the product renders with.
     *
     * The stage, the notes pane and every thumbnail build one — `createDeckEnv`
     * exists so that three places cannot drift apart — and it carries the
     * document that a *slot* is resolved in: a shape saying `theme:accent1`, a
     * slide taking its background from a master. Rendered without it, this test
     * drew a rectangle with no fill at all and said so, which is the honest
     * behaviour and not the product's.
     */
    // No `registerLayoutPass`. A slide places; there is nothing to converge.
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
    // One pass, synchronously, and that is the whole of it.
    view.render(undefined, { sync: true });
  });

  const slides = () => [...container.querySelectorAll<HTMLElement>('.sl-slide')];

  it('draws every slide in the deck, hidden ones included', () => {
    // Six surfaces, one of them hidden — which is in the document, in the
    // outline and addressable, and is the difference between hiding a slide
    // and deleting it.
    expect(slides()).toHaveLength(6);
    expect(slides().filter((slide) => slide.dataset.hidden === 'true')).toHaveLength(1);
  });

  /**
   * And the deck's **definitions** are drawn, and not on the screen.
   *
   * Both halves matter. Drawn, because a node with no element has no place in the sid map and
   * every mapping from a DOM position back to the model goes through that — a definition that
   * was left out could not be selected, moved or edited when a reader opened it. Hidden,
   * because it is not a page: the card belongs to the deck, not to slide six.
   */
  it('draws a definition, hidden, out of the page sequence', () => {
    const definitions = [...container.querySelectorAll<HTMLElement>('.sl-def-component')];
    expect(definitions).toHaveLength(1);
    expect(definitions[0].dataset.componentId).toBe('metric-card');
    expect(definitions[0].style.display).toBe('none');
    // Not one of the slides, which is what the count, the filmstrip and the presenter read.
    expect(definitions[0].closest('.sl-slide')).toBeNull();
  });

  /**
   * A placement draws **the definition**, live.
   *
   * The first design copied the parts into the placement, because a renderer cannot draw a foreign
   * node. The engine can: children are resolved in one place — the proxy the view reads them
   * through — and a resolver there hands back the definition's parts, each arriving as itself.
   * Which is what a component is, as against a template: a template is copied and then owned, and a
   * component follows.
   */
  it('draws a placement as the definition’s parts', () => {
    const placements = [...container.querySelectorAll<HTMLElement>('.sl-instance')];
    expect(placements).toHaveLength(3);
    for (const placement of placements) {
      expect(placement.dataset.componentId).toBe('metric-card');
      // The card's five parts: the back, the badge, the two texts and the slot. Drawn from the
      // definition, so a placement's own children are only what a reader put in the slot.
      expect(placement.children).toHaveLength(5);
      // And each is marked as a piece of a placement rather than a node in the document.
      for (const part of placement.children) {
        expect(part.getAttribute('data-bc-sid')).toContain('~');
      }
    }
    // The one whose badge its placement turned off draws nothing where the badge is.
    const hidden = [...container.querySelectorAll<HTMLElement>('.sl-instance .sl-ellipse')].filter(
      (badge) => badge.style.display === 'none'
    );
    expect(hidden).toHaveLength(1);
  });

  it('gives each slide its natural size, which the app scales', () => {
    // 19200x10800 twips is 1280x720 CSS pixels exactly. The fitting is
    // `transform: scale` applied by the app, so the box itself never changes.
    for (const slide of slides()) {
      expect(slide.style.width).toBe('1280px');
      expect(slide.style.height).toBe('720px');
      expect(slide.style.position).toBe('relative');
      expect(slide.style.overflow).toBe('hidden');
    }
  });

  it('puts each placed box where the model says', () => {
    const title = slides()[0].querySelector<HTMLElement>('[data-role="title"]');
    expect(title).not.toBeNull();
    // x: 1920, y: 3600, width: 15360, height: 2400 twips → /15
    expect(title!.style.position).toBe('absolute');
    expect(title!.style.left).toBe('128px');
    expect(title!.style.top).toBe('240px');
    expect(title!.style.width).toBe('1024px');
    expect(title!.style.height).toBe('160px');
  });

  it('honours vertical alignment, which is the only thing a placed box adds to text', () => {
    const title = slides()[0].querySelector<HTMLElement>('[data-role="title"]');
    expect(title!.style.display).toBe('flex');
    expect(title!.style.flexDirection).toBe('column');
    expect(title!.style.justifyContent).toBe('center');

    const subtitle = slides()[0].querySelector<HTMLElement>('[data-role="subtitle"]');
    expect(subtitle!.style.justifyContent).toBe('flex-start');
  });

  /**
   * The claim `textFrame` carries, and the reason this product was cheap.
   */
  it('draws the text inside with Word’s renderers, unmodified', () => {
    const body = slides()[1].querySelector<HTMLElement>('[data-role="body"]');
    expect(body).not.toBeNull();

    // `w-` prefixed classes are Word's. Nothing in office-slides drew these.
    expect(body!.querySelector('.w-list')).not.toBeNull();
    expect(body!.querySelectorAll('.w-text').length).toBeGreaterThanOrEqual(4);
    expect(body!.textContent).toContain('the schema had a slide already');
  });

  it('draws a Word table on a slide with no slides code involved', () => {
    const table = slides()[3].querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('tr')).toHaveLength(3);
    expect(table!.querySelectorAll('th')).toHaveLength(3);
    expect(table!.textContent).toContain('Convert coordinates');
  });

  describe('shapes', () => {
    const shapesSlide = () => slides()[2];

    it('places children against their frame, not against the slide', () => {
      // The reason a frame is worth having: moving it moves everything in it
      // and nothing rewrites a coordinate.
      const frame = shapesSlide().querySelector<HTMLElement>('.sl-frame');
      expect(frame!.style.left).toBe('96px'); // 1440 twips
      expect(frame!.style.overflow).toBe('hidden');

      const rect = frame!.querySelector<HTMLElement>('.sl-rectangle');
      // 720 twips from the frame's edge, not from the slide's.
      expect(rect!.style.left).toBe('48px');
      /**
       * The colour through its track, and the shape's own declaration beside it.
       *
       * Read from the declaration rather than from the resolved value on purpose:
       * a fill goes through `var(--sl-f0-color)` now, and **jsdom does not resolve
       * custom properties** — it hands back the `var()` untouched. A browser does,
       * which is checked where a browser is (`apps/slide/tests/theme.spec.ts` reads
       * the computed `backgroundColor` and still gets `rgb(37, 99, 235)`).
       */
      expect(rect!.style.background).toBe('var(--sl-f0-color, transparent)');
      // Kept as written, not normalised: a custom property is a token stream, so
      // jsdom hands back the hex the document holds rather than a colour it parsed.
      expect(rect!.style.getPropertyValue('--sl-f0-color')).toBe('#2563eb');
      expect(rect!.style.borderRadius).toBe('8px');
    });

    it('draws a **document variable** as the colour it names', () => {
      /*
       * The cards slide's button says `fill: 'var:주의'`, and what reaches the page is the value the
       * document declares — resolved in the same walk that fills in a theme slot, because both hide
       * in the same three places (an attribute, a paint, a gradient stop) and two walks would be
       * two chances to miss the third.
       *
       * Read from the custom property for the reason above: jsdom hands back the token stream, so
       * this is the value the renderer wrote rather than a colour a browser parsed.
       */
      const button = [...slides()[5].querySelectorAll<HTMLElement>('.sl-rectangle')].find(
        (shape) => shape.dataset.bcSid && shape.style.getPropertyValue('--sl-f0-color') === '#ef4444'
      );
      expect(button).toBeDefined();
    });

    it('draws an ellipse as a box that is round', () => {
      const ellipse = shapesSlide().querySelector<HTMLElement>('.sl-ellipse');
      expect(ellipse!.style.borderRadius).toBe('50%');
      expect(ellipse!.style.width).toBe('192px'); // 2880 twips
    });

    it('draws a line corner to corner of the box it declares', () => {
      const line = shapesSlide().querySelector('.sl-line');
      expect(line).not.toBeNull();
      const segment = line!.querySelector('line');
      expect(segment!.getAttribute('x2')).toBe('3360');
      expect(segment!.getAttribute('y2')).toBe('960');
      expect(segment!.getAttribute('stroke')).toBe('#334155');
    });

    /**
     * A horizontal line has zero height, and a zero-height `<svg>` with a
     * zero-height `viewBox` is degenerate: the browser has no scale to map user
     * units onto and draws nothing. A perfectly ordinary horizontal line was
     * invisible in the browser.
     */
    it('gives a flat line a box as thick as its ink', () => {
      registerSlidesRenderers();
      const host = document.createElement('div');
      document.body.appendChild(host);

      const schema = createSchema('slides', getSlidesSchemaDefinition());
      const store = new DataStore(undefined, schema);
      const flat = createSlidesEditor({ editable: true, schema, dataStore: store });
      flat.loadDocument(
        {
          stype: 'document',
          attributes: {},
          content: [
            {
              stype: 'surface',
              attributes: { kind: 'slide' },
              content: [
                {
                  stype: 'line',
                  attributes: { x: 0, y: 1000, width: 4800, height: 0, stroke: '#000', strokeWidth: 30 }
                }
              ]
            }
          ]
        } as never,
        'slides'
      );
      const flatView = new EditorViewDOM(flat, { container: host, registry: getGlobalRegistry() });
      flatView.render(undefined, { sync: true });

      const svg = host.querySelector<SVGElement>('.sl-line')!;
      // Grown to the stroke, not to nothing.
      expect(svg.getAttribute('viewBox')).toBe('0 0 4800 30');
      expect((svg as unknown as HTMLElement).style.height).toBe('2px');

      // ...and the line runs down the middle of what it was grown to.
      const segment = svg.querySelector('line')!;
      expect(segment.getAttribute('y1')).toBe('15');
      expect(segment.getAttribute('y2')).toBe('15');
      expect(segment.getAttribute('x2')).toBe('4800');
    });

    it('keeps a stroked box the size the model says it is', () => {
      // Without `border-box` a stroked shape is wider than its geometry, and
      // two boxes placed edge to edge overlap by their stroke widths.
      const outline = shapesSlide().querySelector<HTMLElement>('.sl-group .sl-rectangle');
      expect(outline!.style.boxSizing).toBe('border-box');
      expect(outline!.style.width).toBe('512px'); // 7680 twips, stroke included
    });

    it('gives a group no appearance of its own', () => {
      const group = shapesSlide().querySelector<HTMLElement>('.sl-group');
      expect(group!.style.background).toBe('');
      expect(group!.style.border).toBe('');
      // But it still positions its children, so its own box has to be honest.
      expect(group!.style.left).toBe('672px'); // 10080 twips
    });
  });

  /**
   * The kind of list the *model* says, not a name the renderer made up.
   *
   * This drew `data-list-type` from `listType`, an attribute nothing writes:
   * `wrapInList` writes `type`, the schema declares `type`, and the PDF exporter
   * reads `type`. So the numbered-list button produced a list drawn with bullets,
   * and the sample deck agreed with the renderer instead of the schema, so every
   * test passed.
   *
   * Asked of the template directly rather than through a document, which is what
   * makes it cheap enough to do for one attribute: the drawing is a function of the
   * node, so a node is all it takes.
   */
  it('draws a list as the kind the model writes', () => {
    const template = getGlobalRegistry().get('list')?.template as
      | { component?: (props: unknown, node?: unknown, ctx?: unknown) => any }
      | undefined;
    const drawn = (type: string) => {
      const node = { sid: 'x:1', stype: 'list', attributes: { type }, content: [] };
      const kind = template!.component!(node, node, { env: {} })?.attributes?.['data-list-type'];
      return typeof kind === 'function' ? kind(node) : kind;
    };

    expect(drawn('ordered')).toBe('ordered');
    expect(drawn('bullet')).toBe('bullet');
  });

  /**
   * A definition is referenced, never placed. Drawn as a hidden element rather
   * than left out: a node with no element has no place in the sid map, and
   * every mapping from a DOM position back to the model goes through that.
   */
  it('keeps layouts and notes in the document and off the slide', () => {
    const layouts = container.querySelectorAll<HTMLElement>('.sl-def-layout');
    expect(layouts).toHaveLength(2);
    for (const layout of layouts) expect(layout.style.display).toBe('none');

    // And none of a layout's placeholder text reached a slide.
    for (const slide of slides()) {
      expect(slide.textContent).not.toContain('Click to add');
    }
  });
});
