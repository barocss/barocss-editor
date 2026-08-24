/**
 * How Slides draws a deck.
 *
 * Two thirds of this file is a single line — `registerWordRenderers()` — and
 * that is the finding, not a shortcut. A slide's text is Word's text: a
 * `textFrame` holds `block+`, so a title is a paragraph, a bullet list is a
 * `list`, a table on a slide is a `bTable`, and every renderer, style resolver,
 * mark and command written for the first product draws the second one's
 * contents without being asked. The schema said this would work
 * (`textFrame`: "its children are ordinary blocks, so every text command
 * written for Word works inside a slide"); this is the first code to depend on
 * it.
 *
 * What is genuinely new is *placement*, and it is small. A page flows and a
 * slide places, so where Word needs a pagination loop that measures, lays out,
 * applies and converges, a slide needs a coordinate conversion — see
 * `geometry.ts`, which is the entire layout engine.
 *
 * ## What this being one registry costs
 *
 * Renderers are registered per node type, globally, so a node type has exactly
 * one drawing wherever it appears. That is fine until two products want the
 * same type drawn differently, which is exactly what happened here: Word draws
 * `rectangle` as an SVG `<rect>` because in Word a rectangle only ever appears
 * inside a `canvasBlock`, which is an `<svg>`. On a slide the same node sits
 * directly on the surface among text frames that must stay real
 * contenteditable HTML.
 *
 * A renderer *could* in principle ask where it is — a function renderer gets
 * the node, and the node carries `parentId`. It was not done, because the
 * answer does not reliably arrive: `exportToTree` drops `parentId`, so a tree
 * rendered outside the proxy path has none, and `renderer-react`'s context stub
 * carries no `env`, so the other route to the document is absent there too. A
 * renderer that draws correctly under one renderer and wrongly under another is
 * worse than one that draws one way and says so. Written up in
 * `docs/BACKLOG.md`: **a renderer cannot reliably know its container**, and
 * that is an engine gap this product found rather than a slides decision.
 *
 * The other alternative was to draw the whole slide as one `<svg>` and put each
 * text frame in a `<foreignObject>`, which would have reused Word's shape
 * renderers untouched. It was rejected on purpose: caret placement, selection
 * and IME inside `foreignObject` are unreliable across browsers, and input
 * correctness is the thing this engine is for.
 *
 * So Slides overrides the four shape types with placed HTML boxes, and paid for
 * it in `canvasBlock` — a drawing embedded in flow, which Word draws as an
 * `<svg>` holding those same four types. In a deck that `<svg>` held `<div>`s
 * and drew nothing.
 *
 * **This paragraph used to say the harness could not catch it**, and that was
 * the reason to write it here: `every-node-is-drawn` asks whether a renderer
 * exists, `canvasBlock` had one, and the check passed on a node this product
 * drew wrongly. A comment was the only thing holding the knowledge, which is the
 * failure the harness exists to remove, met from the other side.
 *
 * It can catch it now. `every-drawing-can-hold-what-it-contains` reads the tag a
 * product draws each node type as and compares it against the tags of the types
 * the schema lets that node contain — an `<svg>` may only hold SVG, so a
 * container and its contents drawn in different namespaces is a box that draws
 * empty. It found six pairs here, four more than this comment had named, and
 * `canvasBlock` is now drawn below as a placed HTML box like everything else a
 * deck puts on a slide.
 */
import { define, element, slot } from '@barocss/dsl';
import { getWordDocument, registerWordRenderers } from '@barocss/office-word';
import { placementCss, slideSize, twipToPx, type CssStyle, type Placement } from './geometry';
import { deckFillLayers, deckPaintCss, svgDash, svgFlow } from './paint';
import { svgPaintOf, type SvgNode } from './svg-paint';
import {
  capAngle,
  capDrawing,
  connectorTrack,
  labelAt,
  labelNear,
  endLabelOf,
  labelBox,
  labelOf,
  LABEL_SIZE,
  capInset,
  capSizeOf,
  connectorBoxOf,
  connectorBounds,
  connectorCapsOf,
  connectorPath,
  CORNER,
  connectorPoints,
  connectorSpecOf,
  pulledBack
} from '@barocss/office-word';
import { textBoxCss } from './text-box';
import { cornerCss } from './corners';
import { cropCss } from './crop';
import { showsNotes } from './render-context';
import { resolveThemeAttrs, themeFor } from './theme';
import { backgroundOf } from './layout-format';
import { connectorRouteOf, type DeckAccess } from './deck';
import { jumpsFromEnv, routeFromEnv } from './connector-pass';

/** The attributes bag as the DSL hands it to a template function. */
type NodeData = Record<string, any>;

const attrsOf = (data: NodeData): Placement & NodeData => (data?.attributes ?? {}) as never;

/**
 * How many children a node's data has, for a container that must be visible when empty.
 *
 * The data's own `content`, not the document's: a renderer is handed a node and answers about
 * that node, and a count taken from anywhere else would be a second opinion about the same
 * thing.
 */
const childCount = (data: NodeData): number =>
  Array.isArray((data as { content?: unknown[] })?.content)
    ? ((data as { content?: unknown[] }).content as unknown[]).length
    : 0;

/**
 * A box where the model says it is, plus whatever this drawing adds.
 *
 * ## `display: none` wins
 *
 * The extra styles are spread after the placement, which is right for everything
 * except one: a renderer that sets its own `display` — the text frame is
 * `flex`, so is a frame — **overwrote the `display: none` that `visible: false`
 * had just produced**. Measured: the attribute was written, the node said
 * `visible: false`, and the shape stayed on the slide with `display: flex`.
 *
 * Not drawn is not a style choice, so it is applied last and cannot be argued
 * with. Which also means a renderer may go on saying `display: flex` without
 * having to know that hiding exists — and none of the twelve had to change.
 */
/**
 * That this box is a **button**, in the drawing.
 *
 * Every placed shape carries it, because any of them can be one: a rectangle a reader labelled
 * 목차, a picture of a section, a card. Two `data-` attributes rather than a class, because what
 * a test and a stylesheet both want to know is *where it goes* — and the cursor comes from CSS
 * (`[data-go-to]` while presenting), so the shape says it is pressable in the one place a
 * pointer is about to be.
 *
 * The show does not need this: it finds buttons by sid, from the model (`jumpsOn`). What needs
 * it is the reader — a shape that leads somewhere and looks exactly like one that does not is a
 * deck nobody can proof-read — and the conformance check, which asks the *drawing* whether an
 * attribute is read and is right to.
 */
const jumpData = {
  'data-go-to': (d: NodeData) => {
    const to = attrsOf(d).goTo;
    return typeof to === 'string' && to.length > 0 ? to : undefined;
  },
  'data-go-to-kind': (d: NodeData) => {
    const kind = attrsOf(d).goToKind;
    return typeof kind === 'string' && kind.length > 0 ? kind : undefined;
  },
  /**
   * And that the page is in **another deck**, which a reader has to be able to see.
   *
   * A button that leaves the deck is a different promise from one that moves inside it — the deck
   * it points at has to exist wherever the reader is presenting from — so it is in the drawing
   * too, and the stylesheet can mark it while the show is running.
   */
  'data-go-to-deck': (d: NodeData) => {
    const deck = attrsOf(d).goToDeck;
    return typeof deck === 'string' && deck.length > 0 ? deck : undefined;
  }
};

const placed = (data: NodeData, extra: CssStyle = {}): CssStyle => {
  const placement = placementCss(attrsOf(data));
  const css = { ...placement, ...extra };
  if (placement.display === 'none') css.display = 'none';
  return css;
};

/**
 * Fill and stroke, as a placed box wants them.
 *
 * Silence means none, matching `office-word/shapes`: a shape with no fill is
 * not a shape filled with black, and a `textFrame` with no fill must not paint
 * a white rectangle over whatever is behind it.
 */
/**
 * What a shape is painted with — see `paint.ts` for the vocabulary.
 *
 * This was the whole of it: a flat `background` and a solid border. The
 * arithmetic moved out so a gradient, a shadow and a dash could be tested in
 * milliseconds rather than by looking at a slide, and so the attributes and
 * their reader arrive in one place.
 */
function paintCss(data: NodeData, ctx?: any): CssStyle {
  /**
   * Through the theme, when the view has a document to find one in.
   *
   * A shape may say `theme:accent1` where a colour goes, and the slot is filled
   * in here rather than in `deckPaintCss` — the CSS knows what a gradient is and
   * the document knows what accent 1 is, and neither has to learn the other.
   */
  const doc = getWordDocument(ctx?.env) as unknown as DeckAccess | undefined;
  const theme = doc ? themeFor(doc, undefined) : undefined;
  return deckPaintCss(resolveThemeAttrs(theme, attrsOf(data)) as never);
}

/**
 * A shape's fills, as the elements that draw them.
 *
 * A stack of paints was one `background` and is now one element each — see
 * `fill-layers.ts` for the three things a property could not do (zoom a covered
 * picture, give a picture an opacity, cross-fade two of them) and for the
 * measurement that puts them behind the shape's own content.
 *
 * Children of the shape rather than a wrapper around its content, so a text
 * frame's paragraphs stay exactly where Word's renderers put them. Empty for the
 * common shape — one opaque colour is still the box's own `background` — so a
 * plain rectangle gains no elements at all.
 *
 * Through the theme, like the CSS beside it: a fill may say `theme:accent1`, and
 * only the environment carries the document that knows what that is.
 */
function fillElements(data: NodeData, ctx?: any): any[] {
  const doc = getWordDocument(ctx?.env) as unknown as DeckAccess | undefined;
  const theme = doc ? themeFor(doc, undefined) : undefined;
  return deckFillLayers(resolveThemeAttrs(theme, attrsOf(data)) as never).map((layer) =>
    element(
      'div',
      {
        className: 'sl-fill',
        /**
         * The **model's** index, which is what a panel, a track and a test all
         * name a fill by — not its position among the elements, which is reversed
         * (a later sibling paints on top, where CSS's first background layer
         * does).
         */
        'data-fill': String(layer.index),
        style: layer.style
      } as never,
      layer.image
        ? [
            element('img', {
              className: 'sl-fill-image',
              src: layer.image.src,
              /**
               * Empty and deliberately so: a fill is decoration, and the shape it
               * fills carries whatever meaning there is. A `picture` node is the
               * other thing — content, with its own `alt`.
               */
              alt: '',
              draggable: 'false',
              style: layer.image.style
            } as never)
          ]
        : []
    )
  );
}

/** How thick a line's ink is, in twips. */
function lineStroke(data: NodeData): number {
  const width = attrsOf(data).strokeWidth;
  return typeof width === 'number' && width > 0 ? width : 15;
}

/**
 * The box a line is *drawn* in: its own, grown to the ink's thickness.
 *
 * A horizontal line has zero height, and a zero-height `<svg>` with a
 * zero-height `viewBox` is degenerate — the browser has no scale to map user
 * units onto and draws nothing. Growing only the drawing leaves the model's two
 * points exactly where the author put them.
 */
function lineExtent(data: NodeData): { width: number; height: number } {
  const attrs = attrsOf(data);
  const stroke = lineStroke(data);
  const width = Math.abs(typeof attrs.width === 'number' ? attrs.width : 0);
  const height = Math.abs(typeof attrs.height === 'number' ? attrs.height : 0);
  return { width: Math.max(width, stroke), height: Math.max(height, stroke) };
}

/**
 * The two points, in the drawn box's coordinates.
 *
 * A negative extent means the line runs the other way, which is why this reads
 * the raw attributes rather than `boxOf` — normalising would lose the
 * direction. On an axis the box had to be grown on, the line runs down the
 * middle of what it was grown to.
 */
function lineEnds(data: NodeData): { x1: number; y1: number; x2: number; y2: number } {
  const attrs = attrsOf(data);
  const extent = lineExtent(data);
  const width = typeof attrs.width === 'number' ? attrs.width : 0;
  const height = typeof attrs.height === 'number' ? attrs.height : 0;

  const along = (value: number, size: number) =>
    value === 0
      ? { from: size / 2, to: size / 2 }
      : value < 0
        ? { from: Math.abs(value), to: 0 }
        : { from: 0, to: value };

  const x = along(width, extent.width);
  const y = along(height, extent.height);
  return { x1: x.from, y1: y.from, x2: x.to, y2: y.to };
}

/**
 * Register every Slides renderer in the global DSL registry.
 *
 * Word's go in first and Slides' override the ones it draws differently —
 * `surface` above all, which in Word means a section drawn as the pages its
 * text reached, and here means one slide.
 *
 * Idempotent, like Word's.
 */
export function registerSlidesRenderers(): void {
  // Everything a text frame holds. See the header: this is the product.
  registerWordRenderers();

  // ── The slide ──────────────────────────────────────────────────────────────
  /**
   * One slide, at its natural size.
   *
   * Sized in pixels from the model's twips rather than left to fill its parent,
   * because a slide is a fixed surface and everything on it is placed against
   * that surface's origin. The app scales the whole box with `transform` to fit
   * the window — visual and exact, where CSS `zoom` would re-lay-out and drift.
   *
   * `position: relative` is the only reason the placements inside it mean
   * anything: an absolutely placed child positions against its nearest
   * positioned ancestor, and without this it would be the viewport.
   *
   * `overflow: hidden` because a slide is what a projector shows. A shape half
   * off the edge is half drawn — it stays in the model, keeps its sid, and can
   * be dragged back.
   */
  define(
    'surface',
    /**
     * A function template, so the slide can see the environment.
     *
     * Its background comes down the chain — the slide's own, the layout's, the
     * master's — and only the environment carries the document those are looked
     * up in. An attribute function gets the node's data and nothing else.
     */
    (_props: Record<string, unknown>, node: NodeData, ctx: any) =>
    element(
      'section',
      {
        className: 'sl-slide',
        /**
         * Which kind of surface this is — `block+ | scene*` is the whole product
         * split, and `kind` is the schema's record of which side a surface is on.
         * Word's surface has always drawn it; a slide's did not, so a deck's own
         * surfaces were the one place the answer could not be read back.
         */
        'data-kind': (d: NodeData) =>
          typeof attrsOf(d).kind === 'string' ? attrsOf(d).kind : 'scene',
        'data-hidden': (d: NodeData) => (attrsOf(d).hidden === true ? 'true' : undefined),
        'data-layout': (d: NodeData) =>
          typeof attrsOf(d).layoutId === 'string' ? attrsOf(d).layoutId : undefined,
        style: (d: NodeData): CssStyle => {
          const size = slideSize(attrsOf(d));
          /**
           * The background comes down the same chain the formatting does: the
           * slide's own, then its layout's, then the master's — which is the
           * reason a master is worth having, since otherwise every layout
           * repeats what colour the deck is.
           *
           * Through the deck's document access, when the renderer has one. A
           * renderer with no environment — a thumbnail built before the deck is
           * loaded — falls back to the slide's own fill, which is what this drew
           * before there was anything above it.
           */
          const doc = getWordDocument(ctx?.env) as unknown as DeckAccess | undefined;
          const sid = typeof (node as { sid?: unknown })?.sid === 'string' ? (node as any).sid : undefined;
          const inherited = doc && sid ? backgroundOf(doc, sid) : undefined;
          const own = attrsOf(d).fill;

          return {
            position: 'relative',
            width: `${twipToPx(size.width)}px`,
            height: `${twipToPx(size.height)}px`,
            overflow: 'hidden',
            background:
              (typeof own === 'string' && own ? own : undefined) ?? inherited ?? '#ffffff'
          };
        }
      } as never,
      [slot('content')]
    )
  );

  // ── Containers ─────────────────────────────────────────────────────────────
  /**
   * Rich text placed on a slide — the node the whole product is built on.
   *
   * A flex column so `verticalAlign` can mean something: the blocks inside keep
   * their own flow and the column decides where that flow sits in a box taller
   * than it. A title centred in its placeholder is this and nothing else.
   *
   * The blocks inside are Word's, drawn by Word's renderers, formatted by
   * Word's style resolver. There is no slide-specific paragraph.
   */
  define(
    'textFrame',
    /**
     * A function template, so the shape can see the environment.
     *
     * A fill may name a theme slot — `theme:accent1` — and the theme is looked
     * up in the document, which travels on the environment. An attribute
     * function is handed the node's data and nothing else.
     */
    (_props: Record<string, unknown>, node: NodeData, ctx: any) =>
    element(
      'div',
      {
        className: 'sl-text-frame',
        ...jumpData,
        'data-role': (d: NodeData) =>
          typeof attrsOf(d).role === 'string' ? attrsOf(d).role : undefined,
        style: (d: NodeData): CssStyle =>
          placed(d, {
            display: 'flex',
            flexDirection: 'column',
            ...textBoxCss(attrsOf(d) as never),
            ...paintCss(d, ctx)
          })
      } as never,
      /**
       * The fills come **after** the content, and that is about the editor rather
       * than about painting: they are `z-index: -1`, so paint order is the same
       * either way, and a container whose *first* child is not one of the model's
       * would shift every index a reader of this DOM counts. Trailing changes
       * nothing for anything that counts blocks.
       */
      [slot('content'), ...fillElements(node, ctx)] as never
    )
  );

  /**
   * The presenter's note.
   *
   * A resource, and until now an undrawn one — it lives in `resources`, bound to
   * a slide by id, and nothing on the stage shows it. What draws it is the notes
   * pane: a second view over the same document, rendering this subtree on its
   * own. So the renderer is deliberately plain, because the pane around it is
   * the chrome and this is only the content.
   *
   * `block+`, like a sticky and a text frame, which is why the paragraphs inside
   * are Word's paragraphs and a note can hold a bulleted list.
   */
  define('surfaceNote', (_props: Record<string, any>, _node: Record<string, any>, ctx: any) =>
    element(
      'div',
      {
        className: 'sl-note',
        ...jumpData,
        // Drawn where notes are wanted and nowhere else. The stage renders the
        // whole document, `resources` included, so without this every slide's
        // note would appear under the slide.
        style: showsNotes(ctx?.env) ? {} : { display: 'none' }
      },
      [slot('content')]
    )
  );

  /**
   * A picture, placed like every other object on the slide.
   *
   * An `<img>` rather than a `<div>` with a background: a background image is
   * invisible to a screen reader, to a text search and to a native drag, and a
   * picture on a slide is content rather than decoration. `alt` rides along for
   * the same reason.
   *
   * `objectFit` is what makes the box and the picture two different shapes.
   * `contain` fits the whole picture inside the box the reader dragged, which is
   * what a reader who resizes without holding anything expects; `cover` fills
   * the box and crops; `fill` stretches. The box is the model's, always — a
   * picture that resized its own box would move the other things around it.
   */
  define(
    'picture',
    /**
     * A function template, so the two elements can be built from one read of the
     * attributes — and it takes `(props, node, ctx)` like every other one.
     *
     * Written first as `(d: NodeData) => …`, which type-checks and is wrong: the
     * first argument is the element's *props*, and the node is the second. Every
     * style came out empty, so the picture drew at the slide's origin with no
     * width and no height, and nothing said so — a zero-by-zero box is a picture
     * that failed to load as far as anyone looking can tell.
     */
    (_props: Record<string, unknown>, d: NodeData, ctx: any) => {
      const attrs = attrsOf(d);
      const fit = attrs.fit;
      const crop = cropCss(attrs as never);

      /**
       * A box that clips, holding a picture that may be bigger than it.
       *
       * It was one `<img>` carrying the placement, which cannot crop: the only
       * way for one element to hide part of itself is `clip-path`, and that
       * hides without moving what is left — the kept part stays where it was and
       * the box is half empty, which is not what a reader means by cropping. So
       * the element the model places is the one that clips, and the picture
       * inside it is free to be larger and offset. See `crop.ts`.
       *
       * With no crop the inner style is empty and the image fills its box
       * exactly as it did before this existed, `object-fit` and all.
       */
      return element(
        'div',
        {
          className: 'sl-picture',
          ...jumpData,
          style: placed(d, { ...paintCss(d, ctx), ...crop.outer })
        } as never,
        [
          ...fillElements(d, ctx),
          element('img', {
            className: 'sl-picture-image',
            src: typeof attrs.src === 'string' ? attrs.src : '',
            alt: typeof attrs.alt === 'string' ? attrs.alt : '',
            draggable: 'false',
            style: {
              width: '100%',
              height: '100%',
              /**
               * The preflight's `img { max-width: 100% }` does not apply here.
               *
               * A cropped picture is *meant* to be wider than the box that shows
               * it — that is what cropping is — and the reset clamped it back to
               * the box, so the crop scaled nothing and only the offset moved.
               * Measured: an image styled `width: 133.33%` drawn at exactly
               * 100%, with the model, the schema and the renderer all correct.
               */
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: typeof fit === 'string' && fit.length > 0 ? fit : 'contain',
              ...crop.inner
            } as CssStyle
          } as never)
        ]
      );
    }
  );

  /**
   * A film on a slide.
   *
   * The element itself is placed, rather than a `<div>` holding one: a `<video>`
   * *is* a box with a size, and wrapping it would mean two boxes to keep in
   * agreement with the model for no gain — the picture needed a wrapper only
   * because a crop has to clip something.
   *
   * `object-fit: contain`, like a picture: a film in a box of the wrong shape is
   * letterboxed rather than stretched, because the one thing nobody wants is
   * their video subtly the wrong shape on a projector.
   *
   * The playback attributes are written only when they are asked for. An
   * `autoplay="false"` is `autoplay` as far as HTML is concerned — the attribute
   * being *present* is what turns it on — so a document that says no would have
   * played the film.
   */
  define(
    'mediaVideo',
    element('video', {
      className: 'sl-media sl-media-video',
      ...jumpData,
      src: (d: NodeData) => (typeof attrsOf(d).src === 'string' ? attrsOf(d).src : ''),
      poster: (d: NodeData) =>
        typeof attrsOf(d).poster === 'string' ? attrsOf(d).poster : undefined,
      controls: (d: NodeData) => (attrsOf(d).controls === false ? undefined : 'true'),
      /**
       * `data-autoplay`, not `autoplay`.
       *
       * A real `autoplay` starts the film the moment it is drawn — and it is
       * drawn in the *editor*, so a deck with three films would begin playing all
       * three the moment it opened, and again after every keystroke that redrew
       * one. What the document means by autoplay is "start when this slide comes
       * up in the show", which is a fact about presenting and belongs to the
       * stage. See `stage.tsx`.
       */
      'data-autoplay': (d: NodeData) => (attrsOf(d).autoplay === true ? 'true' : undefined),
      loop: (d: NodeData) => (attrsOf(d).loop === true ? 'true' : undefined),
      /**
       * Muted when the document says so — and a browser refuses to start a film
       * with sound without a gesture, so one that starts itself is muted whatever
       * it says. That is the browser's rule, not this product's, and drawing it
       * any other way would be a slide that silently does not start.
       */
      muted: (d: NodeData) =>
        attrsOf(d).muted === true || attrsOf(d).autoplay === true ? 'true' : undefined,
      playsinline: 'true',
      style: (d: NodeData): CssStyle =>
        placed(d, { objectFit: 'contain', background: '#000000', ...cornerCss(attrsOf(d) as never) })
    } as never)
  );

  /**
   * A sound on a slide.
   *
   * Drawn as the browser's own player, which is a strip rather than a box —
   * there is nothing to see, so the size is whatever the model placed and the
   * default is a strip's worth of it.
   */
  define(
    'mediaAudio',
    element('audio', {
      className: 'sl-media sl-media-audio',
      ...jumpData,
      src: (d: NodeData) => (typeof attrsOf(d).src === 'string' ? attrsOf(d).src : ''),
      controls: (d: NodeData) => (attrsOf(d).controls === false ? undefined : 'true'),
      // The same as the film: starting is the show's business, not the drawing's.
      'data-autoplay': (d: NodeData) => (attrsOf(d).autoplay === true ? 'true' : undefined),
      loop: (d: NodeData) => (attrsOf(d).loop === true ? 'true' : undefined),
      style: (d: NodeData): CssStyle => placed(d, {})
    } as never)
  );

  /**
   * A canvas embedded in flow content — a diagram in the middle of the text.
   *
   * Word draws this as an `<svg>`, because in Word a canvas only ever holds
   * shapes and Word draws its shapes as `<rect>`, `<ellipse>` and `<line>`. In a
   * deck the same four types are placed HTML boxes, for the reason in this
   * file's header: they sit among text frames that have to stay real
   * contenteditable HTML. So Word's `<svg>` inherited into a deck would hold
   * `<div>`s — kept by the parser, laid out by nothing, an empty box on the
   * page.
   *
   * That was written down at the top of this file as something the harness could
   * not see, and it can now: `every-drawing-can-hold-what-it-contains` reads the
   * tag each product draws a type as and compares it against the tags of the
   * types the schema lets it contain. It reported six pairs here, four more than
   * the comment had named — `frame`, `group`, `sticky` and `textFrame` as well
   * as `rectangle` and `ellipse`.
   *
   * A relative box, so the absolutely-placed children inside land against it
   * rather than against the slide — the same arrangement `frame` uses, and for
   * the same reason.
   *
   * **The size is read as twips**, like every other measurement a deck places
   * with, and unlike Word, which reads these two attributes as pixels. The
   * schema declares `width` and `height` as plain numbers and says nothing about
   * the unit, so each product has picked one; a canvas authored in a deck is
   * consistent with itself, and one pasted from a Word document is not. That is
   * a schema gap rather than a renderer's decision to make, and it is in
   * `docs/BACKLOG.md`.
   */
  define(
    'canvasBlock',
    element(
      'div',
      {
        className: 'sl-canvas',
        style: (d: NodeData): CssStyle => {
          const attrs = attrsOf(d);
          return {
            position: 'relative',
            width: `${twipToPx(typeof attrs.width === 'number' ? attrs.width : 0)}px`,
            height: `${twipToPx(typeof attrs.height === 'number' ? attrs.height : 0)}px`,
            overflow: 'hidden'
          };
        }
      } as never,
      [slot('content')]
    )
  );

  /**
   * A box that holds other placed things.
   *
   * Its children position against it rather than against the slide, which is
   * what makes a frame worth having: moving the frame moves everything in it,
   * and nothing has to rewrite the children's coordinates.
   */
  define(
    'frame',
    /**
     * A function template, so the shape can see the environment.
     *
     * A fill may name a theme slot — `theme:accent1` — and the theme is looked
     * up in the document, which travels on the environment. An attribute
     * function is handed the node's data and nothing else.
     */
    (_props: Record<string, unknown>, node: NodeData, ctx: any) =>
    element(
      'div',
      {
        className: 'sl-frame',
        ...jumpData,
        style: (d: NodeData): CssStyle =>
          placed(d, {
            ...paintCss(d, ctx),
            overflow: attrsOf(d).clipsContent === false ? 'visible' : 'hidden'
          })
      } as never,
      // Trailing, like the text frame's — see there for why.
      [slot('content'), ...fillElements(node, ctx)] as never
    )
  );

  /**
   * A group: a selection given a name, with no appearance of its own.
   *
   * Nothing is painted and nothing is clipped, because a group is not a box the
   * author drew — it is the fact that these things move together. Its children
   * are still placed against it, so the group's own box has to be honest about
   * where they are.
   */
  define(
    'group',
    element(
      'div',
      { className: 'sl-group', ...jumpData, style: (d: NodeData): CssStyle => placed(d) } as never,
      [slot('content')]
    )
  );

  /**
   * A **placement** of a component: a box whose children came from a definition.
   *
   * ## Why this is nearly a group, and where the definition's parts come from
   *
   * A placement draws the **definition**, live, and this template does not know that: it draws
   * its children like a group, and its children *are* the definition's parts — resolved one
   * layer down, in the proxy the view reads children through (`instance-parts.ts`, §10b-2a).
   *
   * Measured both ways, and the order matters. A first attempt had this template reach into the
   * definition itself, which cannot work: a template renders nodes through `slot(name)`, which
   * reads **this** node's own data, so every part was evaluated against the placement and two of
   * them came out with the placement's box and the placement's sid. Resolved in the datastore,
   * each part arrives as itself and this template stays as simple as a group's.
   *
   * The parts' coordinates work for the same reason they did when they were copies: they are
   * relative to their parent, so a part keeps the numbers it had on the definition's own surface
   * and lands in the same arrangement wherever the placement is put.
   *
   * ## The three things it does that a group's does not
   *
   * - **It says what it is a placement of** (`data-component-id`), because the panel, the
   *   overlay's badge and a test all need to ask — and because a placement that looked like
   *   an ordinary box would be one nobody could tell had a definition behind it.
   * - **It is visible when it is empty.** A placement whose definition has no parts yet draws
   *   nothing at all, and a box nobody can find is the fault the frame's outline exists for.
   * - **It reads nothing foreign.** Whether the definition has moved on is *not* drawn here:
   *   an instance's node does not change when its definition does, so a renderer that read the
   *   definition would draw a stale answer — the connector's fault (§8.11) in a new place. The
   *   badge belongs to the overlay, which redraws with the document.
   */
  define(
    'instance',
    element(
      'div',
      {
        className: (d: NodeData) =>
          `sl-instance${childCount(d) === 0 ? ' sl-instance-empty' : ''}`,
        'data-component-id': (d: NodeData) =>
          typeof attrsOf(d).componentId === 'string' ? attrsOf(d).componentId : undefined,
        ...jumpData,
        style: (d: NodeData): CssStyle => placed(d)
      } as never,
      [slot('content')]
    )
  );

  /**
   * A sticky note: flow content in a coloured box.
   *
   * A default colour, unlike every other shape, because a sticky note with no
   * fill is invisible and nobody has ever wanted one. A shape is a shape; a
   * sticky is a piece of paper.
   */
  define(
    'sticky',
    /**
     * A function template, so the shape can see the environment.
     *
     * A fill may name a theme slot — `theme:accent1` — and the theme is looked
     * up in the document, which travels on the environment. An attribute
     * function is handed the node's data and nothing else.
     */
    (_props: Record<string, unknown>, node: NodeData, ctx: any) =>
    element(
      'div',
      {
        className: 'sl-sticky',
        ...jumpData,
        style: (d: NodeData): CssStyle =>
          placed(d, {
            background: '#fff9b1',
            ...paintCss(d, ctx),
            padding: '12px',
            overflow: 'hidden'
          })
      } as never,
      [slot('content'), ...fillElements(node, ctx)] as never
    )
  );

  // ── Shapes ─────────────────────────────────────────────────────────────────
  /**
   * The shapes, as placed HTML boxes rather than as Word's SVG.
   *
   * See the header for why this override exists and what it costs. Written out
   * one by one rather than generated, matching Word's shape block for the same
   * reason: what differs between them is the only interesting part.
   *
   * A hidden shape is drawn as nothing rather than left out — removing it would
   * change which node the sids either side of it belong to, and a hidden shape
   * is still in the document.
   */
  define(
    'rectangle',
    /**
     * A function template, so the shape can see the environment.
     *
     * A fill may name a theme slot — `theme:accent1` — and the theme is looked
     * up in the document, which travels on the environment. An attribute
     * function is handed the node's data and nothing else.
     */
    (_props: Record<string, unknown>, node: NodeData, ctx: any) =>
    element(
      'div',
      {
        className: 'sl-shape sl-rectangle',
        ...jumpData,
        // The corner radius is `paintCss`'s now, like the fill and the shadow —
        // and four corners rather than one. See `corners.ts`.
        style: (d: NodeData): CssStyle => placed(d, paintCss(d, ctx))
      } as never,
      // A stack of fills, when it is a stack; nothing at all for one flat colour.
      fillElements(node, ctx) as never
    )
  );

  define(
    'ellipse',
    /**
     * A function template, so the shape can see the environment.
     *
     * A fill may name a theme slot — `theme:accent1` — and the theme is looked
     * up in the document, which travels on the environment. An attribute
     * function is handed the node's data and nothing else.
     */
    (_props: Record<string, unknown>, node: NodeData, ctx: any) =>
    element(
      'div',
      {
        className: 'sl-shape sl-ellipse',
        ...jumpData,
        style: (d: NodeData): CssStyle => placed(d, { ...paintCss(d, ctx), borderRadius: '50%' })
      } as never,
      // `borderRadius: inherit` on each layer is what keeps them inside the
      // ellipse rather than filling its box — see `fill-layers.ts`.
      fillElements(node, ctx) as never
    )
  );

  /**
   * A line, drawn corner to corner of the box it declares.
   *
   * The one shape whose geometry is not a box it fills: `x, y, width, height`
   * for a line means the two points it runs between, so a line with a negative
   * width runs up-left and `boxOf`'s normalising would lose which way. Hence
   * the raw attributes here and the SVG, which can draw a diagonal — a bordered
   * `div` cannot.
   *
   * ## The box a line is drawn in is at least as thick as the line
   *
   * A horizontal line has a height of zero, and an `<svg>` of zero height with
   * a `viewBox` of zero height is degenerate: the browser has no scale to map
   * user units onto and draws nothing at all. A perfectly ordinary horizontal
   * line was invisible.
   *
   * So the drawn box is the model's box grown to the stroke's thickness on any
   * axis that has none, and the line is drawn down the middle of it. The
   * *model* keeps the zero — the two points are still the two points — and only
   * the drawing is inflated, by exactly the amount the ink needs.
   */
  define(
    'line',
    element(
      'svg',
      {
        className: 'sl-shape sl-line',
        ...jumpData,
        // Its own coordinate space, so the points below are the model's numbers.
        viewBox: (d: NodeData) => {
          const { width, height } = lineExtent(d);
          return `0 0 ${width} ${height}`;
        },
        preserveAspectRatio: 'none',
        // No fill and no stroke on the box itself; the line inside carries them.
        style: (d: NodeData): CssStyle => {
          const extent = lineExtent(d);
          return placed(d, {
            overflow: 'visible',
            width: `${twipToPx(extent.width)}px`,
            height: `${twipToPx(extent.height)}px`
          });
        }
      } as never,
      [
        element('line', {
          x1: (d: NodeData) => lineEnds(d).x1,
          y1: (d: NodeData) => lineEnds(d).y1,
          x2: (d: NodeData) => lineEnds(d).x2,
          y2: (d: NodeData) => lineEnds(d).y2,
          stroke: (d: NodeData) =>
            typeof attrsOf(d).stroke === 'string' ? attrsOf(d).stroke : '#1f2937',
          'stroke-width': (d: NodeData) => lineStroke(d)
        } as never)
      ]
    )
  );

  /**
   * A line that remembers **what it joins**.
   *
   * The difference from a `line` is the whole feature: a line remembers a place, and a
   * connector remembers the pair — so moving either shape moves the line, and a
   * flowchart survives being rearranged. `docs/specs/canvas-model.md` §8 has the
   * decisions; `canvas-connector.ts` has the arithmetic and fifty tests.
   *
   * ## It has no box of its own, so this one is computed
   *
   * A connector stores no geometry (§8.1) — its extent is whatever the two shapes make
   * — so the drawing resolves the ends against the document every time. Which is why
   * this is a function template: the *document* is what it needs, and only the
   * environment carries it. A renderer with no environment — a thumbnail built before
   * the deck is loaded — draws from the ends' own remembered places, which is exactly
   * what a deleted shape leaves behind.
   *
   * ## Why the ink is drawn twice
   *
   * A visible stroke, and a fat transparent one under it. A one-point line is
   * impossible to hit with a pointer, and a `<svg>` box big enough to catch it would
   * swallow every click meant for the shapes underneath — so the box takes no pointer
   * events at all and only the two strokes do.
   */
  define(
    'connector',
    (_props: Record<string, unknown>, node: NodeData, ctx: any) => {
      const doc = getWordDocument(ctx?.env) as unknown as DeckAccess | undefined;
      /**
       * Through the theme, like every other painted thing here.
       *
       * A line could not say `theme:accent1` — its `stroke` was read raw — so re-colouring
       * a deck re-coloured the shapes and left the lines between them behind. Found while
       * adding the label's own colour: the label had to resolve, and there was no reason
       * the stroke should not.
       */
      const attrs = resolveThemeAttrs(doc ? themeFor(doc, undefined) : undefined, attrsOf(node));

      const spec = connectorSpecOf(node as never);
      const caps = connectorCapsOf(node as never);
      const boxOf = (sid: string | undefined) =>
        sid && doc ? connectorBoxOf(doc.getNode(sid) as never) : undefined;

      const stroke = typeof attrs.stroke === 'string' ? attrs.stroke : '#1f2937';
      const width = Math.max(1, typeof attrs.strokeWidth === 'number' ? attrs.strokeWidth : 15);
      /**
       * A cap grows with the line but not in step with it: four times the stroke is
       * about what a reader draws by hand, and 180 twips (12px) is the smallest head
       * that still reads as one. Asked of the model, because tidying a diagram needs the
       * same number to leave room for the arrowhead between two ranks.
       */
      const capSize = capSizeOf(width);

      /**
       * And what it has to get past.
       *
       * The route is a drawing question — nothing about it is stored — so the obstacles
       * are gathered here every time. `obstaclesFor` is the deck's, because which
       * siblings count is a question about the document.
       */
      const sid = typeof (node as { sid?: unknown })?.sid === 'string' ? (node as any).sid : '';
      /**
       * Through the deck's one answer, so this and the overlay cannot disagree.
       *
       * The route depends on the shapes it joins, the shapes in the way, and — when an
       * end holds another line — on that line's route. Three inputs and two callers is
       * how a line and its own handles end up in different places.
       *
       * With no environment there is no document to ask, which is a thumbnail drawn
       * before the deck is loaded: the ends' remembered places are what is left, and
       * that is exactly what a deleted shape leaves behind.
       */
      /**
       * The layout pass's answer first.
       *
       * Which is the difference between a line that follows its shapes and one that does
       * not: the view redraws a node when *that node* changes, and a connector's route
       * depends on nodes that are not its own. The pass puts the routes on the
       * environment, so a shape moving changes the environment and every line is drawn
       * again — see `connector-pass.ts` for why this is not the document's business.
       *
       * Worked out here when there is no pass: a thumbnail built before the deck is
       * loaded, or a test rendering one node. With no document either, the ends' own
       * remembered places are what is left — which is exactly what a deleted shape
       * leaves behind.
       */
      const fromPass = sid ? routeFromEnv(ctx?.env, sid) : undefined;
      const points =
        fromPass ??
        (doc && sid
          ? connectorRouteOf(doc, sid)
          : connectorPoints(spec, { start: boxOf(spec.start.nodeId), end: boxOf(spec.end.nodeId) }));
      const trimmed = pulledBack(
        pulledBack(points, 'start', capInset(caps.start, capSize)),
        'end',
        capInset(caps.end, capSize)
      );
      // Room for the ink and the ends, so neither is clipped by the box.
      const bounds = connectorBounds(points, capSize + width);
      /**
       * The lines this one passes **over**, worked out by the pass.
       *
       * Not asked for here, and it could not be: which of two crossing lines hops is a
       * fact about the pair, and a renderer can only see its own node — asking twice
       * would draw two hops at one crossing, which reads as a broken line. With no pass
       * (a thumbnail, a test) there are no hops, and a plain crossing is the honest
       * fallback rather than a guess.
       */
      const path = connectorPath(trimmed, spec.kind, CORNER, sid ? jumpsFromEnv(ctx?.env, sid) : []);

      // A flow is a fact about the line rather than about its ends, so it is read here
      // beside the stroke it changes.
      const flow = attrs.flow === true ? svgFlow(attrs as never) : undefined;

      const label = labelOf(node as never);
      /**
       * How the label is set, which is the reader's and not a constant.
       *
       * A diagram's words carry weight the line cannot: "예"/"아니오" on a decision, a
       * red "실패" on the path nobody wants, a bold "필수" on the one they must take. The
       * size goes into `labelBox` as well as into the type, or the pill is drawn for a
       * size the text is not.
       */
      const labelSize =
        typeof attrs.labelSize === 'number' && attrs.labelSize > 0 ? attrs.labelSize : LABEL_SIZE;
      // On the **track**: a label placed by walking a curve's control points sits beside
      // its own line, because a control point is twice as far out as the curve goes.
      const track = connectorTrack(points, spec.kind);
      const labelPoint = labelAt(track);
      /**
       * The three words a line can carry, each with where it goes and how a test finds it.
       *
       * The middle one names the relationship; the two at the ends say something about
       * *that* end — UML's multiplicity, a scenario's condition. Only the ones that exist:
       * an empty pill is a white smudge on a line.
       */
      const words: [string, { x: number; y: number }, string][] = [
        ...(label ? ([[label, labelPoint, 'data-connector-label']] as const) : []),
        ...(endLabelOf(node as never, 'start')
          ? ([
              [
                endLabelOf(node as never, 'start'),
                labelNear(track, 'start', labelSize),
                'data-connector-start-label'
              ]
            ] as const)
          : []),
        ...(endLabelOf(node as never, 'end')
          ? ([
              [
                endLabelOf(node as never, 'end'),
                labelNear(track, 'end', labelSize),
                'data-connector-end-label'
              ]
            ] as const)
          : [])
      ] as [string, { x: number; y: number }, string][];

      const capAt = (which: 'start' | 'end') => {
        const cap = which === 'start' ? caps.start : caps.end;
        const drawing = capDrawing(cap, which === 'start' ? points[0] : points[points.length - 1], capAngle(points, which), capSize);
        if (!drawing) return [];
        const paint = { fill: drawing.filled ? stroke : 'none', stroke, 'stroke-width': width };
        return [
          drawing.shape === 'circle'
            ? element('circle', { cx: drawing.cx, cy: drawing.cy, r: drawing.r, ...paint } as never)
            : element('path', { d: drawing.d, ...paint } as never)
        ];
      };

      return element(
        'svg',
        {
          className: 'sl-shape sl-connector',
          ...jumpData,
          style: (d: NodeData): CssStyle => ({
            position: 'absolute',
            left: `${twipToPx(bounds.x)}px`,
            top: `${twipToPx(bounds.y)}px`,
            width: `${twipToPx(bounds.width)}px`,
            height: `${twipToPx(bounds.height)}px`,
            overflow: 'visible',
            // The box is a rectangle around a line: without this it would take the
            // clicks meant for whatever is under the empty part of it.
            pointerEvents: 'none',
            ...(attrsOf(d).visible === false ? { display: 'none' } : {}),
            ...(typeof attrsOf(d).opacity === 'number' && attrsOf(d).opacity !== 1
              ? { opacity: String(attrsOf(d).opacity) }
              : {})
          }),
          viewBox: `0 0 ${bounds.width} ${bounds.height}`,
          preserveAspectRatio: 'none',
          'data-connector-kind': spec.kind
        } as never,
        [
          element(
            'g',
            { transform: `translate(${-bounds.x} ${-bounds.y})` } as never,
            [
              // The one a pointer can actually hit, under the ink and invisible.
              element('path', {
                d: path,
                fill: 'none',
                stroke: 'transparent',
                'stroke-width': Math.max(width * 3, 180),
                'stroke-linecap': 'round',
                style: { pointerEvents: 'stroke' } as never
              } as never),
              element('path', {
                d: path,
                fill: 'none',
                stroke,
                'stroke-width': width,
                'stroke-linejoin': 'round',
                'stroke-linecap': 'butt',
                /**
                 * A flowing line is dashed even when the document says solid, because a
                 * flow is dashes *travelling* and a solid line has nothing to travel.
                 * The animation is CSS (`.sl-conn-flow` in `slides.css`), so it flows in
                 * the presenting view — which is a clone of this DOM — and stops under
                 * `prefers-reduced-motion`.
                 */
                'stroke-dasharray': flow ? flow.dash : svgDash(attrs as never),
                className: flow ? 'sl-conn-flow' : undefined,
                style: {
                  pointerEvents: 'stroke',
                  /**
                   * One period of the pattern, so the loop has no seam: shifting the
                   * offset by exactly the sum of the dashes lands on the same picture.
                   * A fixed distance judders on every line whose weight is not the one
                   * it was chosen for.
                   */
                  ...(flow ? ({ ['--sl-flow']: `${flow.period}` } as never) : {})
                } as never
              } as never),
              ...capAt('start'),
              ...capAt('end'),
              /**
               * The line's words: one in the middle, and one for each end.
               *
               * In the same SVG as the route, which is what makes them travel with the
               * line for free — an HTML box beside it would need its own placement and
               * would arrive a frame late. Each pill's size is *estimated* from the
               * characters (`labelBox`), because SVG cannot measure text before it
               * draws it, and a Korean label needs half again the room a Latin one
               * does.
               *
               * All three in one helper, and all three in one type: a diagram whose
               * multiplicity was set in a different size from the name it belongs to is a
               * diagram with a typo in it.
               */
              ...words.flatMap(([text, at, mark]) => {
                const room = labelBox(text, labelSize);
                return [
                  element('rect', {
                    x: Math.round(at.x - room.width / 2),
                    y: Math.round(at.y - room.height / 2),
                    width: room.width,
                    height: room.height,
                    rx: 45,
                    fill: '#ffffff',
                    stroke: 'rgba(15, 23, 42, 0.12)',
                    'stroke-width': 8
                  } as never),
                  element(
                    'text',
                    {
                      x: Math.round(at.x),
                      y: Math.round(at.y),
                      'text-anchor': 'middle',
                      'dominant-baseline': 'central',
                      'font-size': labelSize,
                      ...(attrs.labelBold === true ? { 'font-weight': 700 } : {}),
                      fill:
                        typeof attrs.labelColor === 'string' && attrs.labelColor.length > 0
                          ? attrs.labelColor
                          : '#0f172a',
                      [mark]: text
                    } as never,
                    text as never
                  )
                ];
              })
            ] as never
          )
        ] as never
      );
    }
  );

  /**
   * Vector ink. The path data is in the node's own coordinates, so the box it
   * is placed in is also the space it is drawn in.
   *
   * A function template, because a gradient in SVG is a `<defs>` entry the shape
   * *refers to* — so the drawing depends on the node in a way an attribute function
   * cannot express, and the defs have to be built as children.
   *
   * Until this, a path read `d`, `fill`, `stroke` and `strokeWidth` and nothing else:
   * the deck's whole design vocabulary — gradient, shadow, dash — was set by the same
   * panel that sets it on a rectangle and drew nothing at all. Found by
   * `every-attribute-is-read`; see `svg-paint.ts` for what SVG can and cannot say.
   */
  define(
    'path',
    (_props: Record<string, unknown>, node: NodeData, _ctx: unknown) => {
      const sid = typeof (node as { sid?: unknown })?.sid === 'string' ? (node as any).sid : 'path';
      const paint = svgPaintOf(sid, attrsOf(node as never));

      /** The descriptors `svg-paint.ts` returns, in the DSL's own spelling. */
      const drawn = (shape: SvgNode): unknown =>
        element(shape.tag as never, shape.attributes as never, (shape.children ?? []).map(drawn) as never);

      return element(
        'svg',
        {
          className: 'sl-shape sl-path',
          ...jumpData,
          viewBox: (d: NodeData) => {
            const attrs = attrsOf(d);
            const width = typeof attrs.width === 'number' ? Math.abs(attrs.width) : 0;
            const height = typeof attrs.height === 'number' ? Math.abs(attrs.height) : 0;
            return `0 0 ${width || 1} ${height || 1}`;
          },
          style: (d: NodeData): CssStyle => placed(d, { overflow: 'visible' })
        } as never,
        [
          // `<defs>` first, because a reference to one is only resolved once it is in
          // the document — and empty when there is nothing to refer to, rather than an
          // empty `<defs>` on every path in the deck.
          ...(paint.defs.length > 0
            ? [element('defs', {} as never, paint.defs.map(drawn) as never)]
            : []),
          element('path', {
            d: (d: NodeData) => (typeof attrsOf(d).d === 'string' ? attrsOf(d).d : ''),
            /**
             * Through `paintsOf`, so a path is painted by the same reader as every
             * other shape: a `fills` stack, or the flat `fill` as the one-item case.
             * Reading `fill` here would be a second answer to a question that has one.
             */
            fill: paint.fill,
            filter: paint.filter,
            stroke: (d: NodeData) =>
              typeof attrsOf(d).stroke === 'string' ? attrsOf(d).stroke : '#1f2937',
            'stroke-width': (d: NodeData) =>
              typeof attrsOf(d).strokeWidth === 'number' ? attrsOf(d).strokeWidth : 1,
            /**
             * The dash, in the SVG spelling of it. `deckPaintCss` answers in
             * `border-style`, which a path has no notion of; the lengths are multiples
             * of the stroke width so a dash looks like a dash at any weight.
             */
            'stroke-dasharray': (d: NodeData) => svgDash(attrsOf(d) as never)
          } as never)
        ] as never
      );
    }
  );

  // ── Lists ──────────────────────────────────────────────────────────────────
  /**
   * A bulleted or numbered list, saying which it is.
   *
   * Word draws a `listItem`'s marker from its **numbering**: a `numberingDef`
   * in resources, and paragraphs carrying `numId` and `ilvl`, which is what a
   * `.docx` list is. Word's own lists are numbered paragraphs and this node
   * type is barely used there, so `listMarker` returns nothing for it and the
   * deck's bullets drew as four unmarked lines.
   *
   * A deck's bullets are simpler than that and Slides ships the shared kit's
   * list commands, so it has to draw what those commands make. The type is
   * written onto the element and the marker is drawn in CSS — from the *list*,
   * which is where the answer is, rather than from the item, which would need a
   * renderer to know its container.
   *
   * Word's numbering is still there for a deck that wants outline numbering:
   * this is the simple case drawn simply, not a replacement for it.
   */
  define(
    'list',
    element(
      'div',
      {
        className: 'w-list sl-list',
        /**
         * `type`, which is the name the schema declares and `wrapInList` writes.
         *
         * This read `listType` — a name nothing writes. So a reader who pressed the
         * numbered-list button got `type: 'ordered'` from the operation and a list
         * drawn `data-list-type="bullet"`: **a numbered list with bullets.** The
         * sample deck hid it by writing `listType` too, matching the renderer rather
         * than the schema, so every test agreed with the bug.
         *
         * Found by `every-attribute-is-read`, which is the shape of finding this
         * harness is for: nothing was wrong in any one file.
         */
        'data-list-type': (d: NodeData) =>
          typeof attrsOf(d).type === 'string' ? attrsOf(d).type : 'bullet'
      } as never,
      [slot('content')]
    )
  );

  // ── Definitions ────────────────────────────────────────────────────────────
  /**
   * A layout is referenced, never placed, so it is in the document and not on
   * the screen. Drawn as a hidden element rather than left out for the same
   * reason Word draws its style definitions that way: a node with no element
   * has no place in the sid map, and every mapping from a DOM position back to
   * the model goes through that.
   */
  /**
   * A component's **definition**: drawn, and hidden until a reader opens it.
   *
   * The same shape as a layout's for the same reason, written where that was decided: *a node
   * with no element has no place in the sid map, and every mapping from a DOM position back to
   * the model goes through that.* So it is not left out of the drawing — it is drawn
   * `display: none`, and the stage shows the one it is focused on.
   *
   * Which is what gives a definition the whole editing apparatus for nothing: the overlay, the
   * panel, the guides and the layer list key on a sid and its children, not on what kind of
   * thing they are looking at.
   */
  define(
    'component',
    element(
      'div',
      {
        className: 'sl-def sl-def-component',
        'data-component-id': (d: NodeData) =>
          typeof attrsOf(d).id === 'string' ? attrsOf(d).id : undefined,
        style: (d: NodeData): CssStyle => {
          const attrs = attrsOf(d);
          const width = typeof attrs.width === 'number' ? attrs.width : 4000;
          const height = typeof attrs.height === 'number' ? attrs.height : 3000;
          return {
            display: 'none',
            width: `${twipToPx(width)}px`,
            height: `${twipToPx(height)}px`
          };
        }
      } as never,
      [slot('content')]
    )
  );

  define(
    'slideLayout',
    element('div', { className: 'sl-def sl-def-layout', style: { display: 'none' } }, [
      slot('content')
    ])
  );

  /**
   * A **master**, drawn the same way — and it was drawn by nothing at all.
   *
   * Measured while opening one for editing: `slideMaster` had no renderer, and neither did
   * `theme`. Which is the sentence beside `slideLayout` biting: *a node with no element has no
   * place in the sid map, and every mapping from a DOM position back to the model goes through
   * that.* So a master's placeholders could be read by the formatting cascade and could not be
   * clicked, moved or typed in — there was nothing on the page to point at.
   *
   * The conformance harness could not see it either, which is a known blind spot rather than a
   * surprise: `every-node-is-drawn` walks what a *canvas* can hold, and a resource is reachable
   * only through `resources`. It is in `docs/BACKLOG.md`, and this is the second thing it hid.
   */
  define(
    'slideMaster',
    element('div', { className: 'sl-def sl-def-master', style: { display: 'none' } }, [
      slot('content')
    ])
  );

  /**
   * And the **theme**, which has nothing to draw and still has to be drawn.
   *
   * Its whole content is attributes — twelve colours and two fonts — so this is an empty hidden
   * span, exactly like a component's variable. Not for the reader: for the sid map, so a theme
   * is a node the product can point at, and so the harness has something to ask about instead of
   * a hole it cannot see.
   */
  define(
    'theme',
    element('span', {
      className: 'sl-def sl-def-theme',
      style: { display: 'none' },
      'data-theme-id': (d: NodeData) =>
        typeof attrsOf(d).id === 'string' ? attrsOf(d).id : undefined,
      'data-theme-name': (d: NodeData) =>
        typeof attrsOf(d).name === 'string' ? attrsOf(d).name : undefined
    } as never)
  );

  /**
   * The **library**: where the definitions live.
   *
   * A container beside `resources` rather than inside it, and the reason is right here in the
   * drawing. `resources` is hidden as a whole because none of it belongs on the screen; a
   * definition being edited is the one thing that does. Showing it through that container meant
   * a `:has()` rule reaching past a `display: none` written to hide layouts and themes —
   * un-hiding the container outright put the ruler 6px off, because it then took part in the
   * stage's layout.
   *
   * So it is hidden as a whole *and* its children carry their own `display: none`, and the
   * stage shows the focused definition with the container set to `display: contents` — no box
   * of its own, so the definition becomes a child of the stage exactly like the slide it
   * replaces. Measured the other way first: a library left visible because its children were
   * hidden anyway still put a box in the stage's flow, and the ruler came out six pixels off
   * the slide it measures — the same fault as `resources`, in the container written to avoid
   * it.
   */
  define(
    'components',
    element('div', { className: 'sl-library', style: { display: 'none' } }, [slot('content')])
  );

  /**
   * A **declaration**, drawn as nothing a reader can see or click.
   *
   * Drawn at all for the sid-map reason above — and drawn *empty*, because what it says is not
   * something to look at on the canvas: a variable's field belongs in a panel, beside the
   * placement being edited. `data-var` is how a test can see the document reached the page.
   */
  define(
    'componentVar',
    element('span', {
      className: 'sl-var',
      style: { display: 'none' },
      'data-var': (d: NodeData) =>
        typeof attrsOf(d).name === 'string' ? attrsOf(d).name : undefined,
      'data-var-kind': (d: NodeData) =>
        typeof attrsOf(d).kind === 'string' ? attrsOf(d).kind : 'text',
      'data-var-label': (d: NodeData) =>
        typeof attrsOf(d).label === 'string' ? attrsOf(d).label : undefined,
      'data-var-choices': (d: NodeData) =>
        Array.isArray(attrsOf(d).choices) ? (attrsOf(d).choices as unknown[]).join('|') : undefined,
      'data-var-value': (d: NodeData) =>
        typeof attrsOf(d).value === 'string' ? attrsOf(d).value : undefined
    } as never)
  );

  /**
   * A **binding**, drawn as nothing — like the variable it names.
   *
   * A declaration is not something to look at on a canvas: what it says belongs in a panel, beside
   * the part it is about. Drawn at all for the sid map, which is the reason every hidden thing here
   * is drawn.
   */
  define(
    'componentBind',
    element('span', {
      className: 'sl-bind',
      style: { display: 'none' },
      'data-bind-part': (d: NodeData) =>
        typeof attrsOf(d).part === 'string' ? attrsOf(d).part : undefined,
      'data-bind-attr': (d: NodeData) =>
        typeof attrsOf(d).attr === 'string' ? attrsOf(d).attr : undefined,
      'data-bind-var': (d: NodeData) =>
        typeof attrsOf(d).var === 'string' ? attrsOf(d).var : undefined
    } as never)
  );

  /** What one placement answers. Hidden for the same reason, and read by the same panel. */
  define(
    'componentValue',
    element('span', {
      className: 'sl-value',
      style: { display: 'none' },
      'data-value-of': (d: NodeData) =>
        typeof attrsOf(d).name === 'string' ? attrsOf(d).name : undefined,
      'data-value': (d: NodeData) =>
        typeof attrsOf(d).value === 'string' ? attrsOf(d).value : undefined
    } as never)
  );
}
