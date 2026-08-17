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
 * So Slides overrides the four shape types with placed HTML boxes, and pays for
 * it in `canvasBlock` — a drawing embedded in flow, which Word draws as an
 * `<svg>` holding those same four types. In a deck that `<svg>` would hold
 * `<div>`s and draw nothing.
 *
 * **The harness cannot catch this one**, and saying so is the point of writing
 * it here. `every-node-is-drawn` asks whether a renderer exists, `canvasBlock`
 * has one, and the check passes on a node this product draws wrongly. It is in
 * `docs/BACKLOG.md` because a comment is the only thing holding it — which is
 * exactly the failure mode the harness exists to remove, met from the other
 * side.
 */
import { define, element, slot } from '@barocss/dsl';
import { registerWordRenderers } from '@barocss/office-word';
import { placementCss, slideSize, twipToPx, type CssStyle, type Placement } from './geometry';

/** The attributes bag as the DSL hands it to a template function. */
type NodeData = Record<string, any>;

const attrsOf = (data: NodeData): Placement & NodeData => (data?.attributes ?? {}) as never;

const placed = (data: NodeData, extra: CssStyle = {}): CssStyle => ({
  ...placementCss(attrsOf(data)),
  ...extra
});

/**
 * Fill and stroke, as a placed box wants them.
 *
 * Silence means none, matching `office-word/shapes`: a shape with no fill is
 * not a shape filled with black, and a `textFrame` with no fill must not paint
 * a white rectangle over whatever is behind it.
 */
function paintCss(data: NodeData): CssStyle {
  const attrs = attrsOf(data);
  const css: CssStyle = {};

  if (typeof attrs.fill === 'string' && attrs.fill.length > 0) css.background = attrs.fill;
  if (typeof attrs.stroke === 'string' && attrs.stroke.length > 0) {
    const width = typeof attrs.strokeWidth === 'number' ? attrs.strokeWidth : 1;
    css.border = `${twipToPx(width)}px solid ${attrs.stroke}`;
    // Otherwise a stroked box is wider than the model says it is, and two boxes
    // the document places edge to edge overlap by their stroke widths.
    css.boxSizing = 'border-box';
  }

  return css;
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

/** Where text sits in a box taller than the text is. */
function verticalAlignCss(data: NodeData): CssStyle {
  const value = attrsOf(data).verticalAlign;
  if (value === 'middle' || value === 'center') return { justifyContent: 'center' };
  if (value === 'bottom') return { justifyContent: 'flex-end' };
  return { justifyContent: 'flex-start' };
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
    element(
      'section',
      {
        className: 'sl-slide',
        'data-hidden': (d: NodeData) => (attrsOf(d).hidden === true ? 'true' : undefined),
        'data-layout': (d: NodeData) =>
          typeof attrsOf(d).layoutId === 'string' ? attrsOf(d).layoutId : undefined,
        style: (d: NodeData): CssStyle => {
          const size = slideSize(attrsOf(d));
          return {
            position: 'relative',
            width: `${twipToPx(size.width)}px`,
            height: `${twipToPx(size.height)}px`,
            overflow: 'hidden',
            background: typeof attrsOf(d).fill === 'string' ? attrsOf(d).fill : '#ffffff'
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
    element(
      'div',
      {
        className: 'sl-text-frame',
        'data-role': (d: NodeData) =>
          typeof attrsOf(d).role === 'string' ? attrsOf(d).role : undefined,
        style: (d: NodeData): CssStyle =>
          placed(d, {
            display: 'flex',
            flexDirection: 'column',
            ...verticalAlignCss(d),
            ...paintCss(d)
          })
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
    element(
      'div',
      {
        className: 'sl-frame',
        style: (d: NodeData): CssStyle =>
          placed(d, {
            ...paintCss(d),
            overflow: attrsOf(d).clipsContent === false ? 'visible' : 'hidden'
          })
      } as never,
      [slot('content')]
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
      { className: 'sl-group', style: (d: NodeData): CssStyle => placed(d) } as never,
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
    element(
      'div',
      {
        className: 'sl-sticky',
        style: (d: NodeData): CssStyle =>
          placed(d, {
            background: '#fff9b1',
            ...paintCss(d),
            padding: '12px',
            overflow: 'hidden'
          })
      } as never,
      [slot('content')]
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
    element('div', {
      className: 'sl-shape sl-rectangle',
      style: (d: NodeData): CssStyle => {
        const radius = attrsOf(d).cornerRadius;
        return placed(d, {
          ...paintCss(d),
          ...(typeof radius === 'number' && radius > 0
            ? { borderRadius: `${twipToPx(radius)}px` }
            : {})
        });
      }
    } as never)
  );

  define(
    'ellipse',
    element('div', {
      className: 'sl-shape sl-ellipse',
      style: (d: NodeData): CssStyle => placed(d, { ...paintCss(d), borderRadius: '50%' })
    } as never)
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
   * Vector ink. The path data is in the node's own coordinates, so the box it
   * is placed in is also the space it is drawn in.
   */
  define(
    'path',
    element(
      'svg',
      {
        className: 'sl-shape sl-path',
        viewBox: (d: NodeData) => {
          const attrs = attrsOf(d);
          const width = typeof attrs.width === 'number' ? Math.abs(attrs.width) : 0;
          const height = typeof attrs.height === 'number' ? Math.abs(attrs.height) : 0;
          return `0 0 ${width || 1} ${height || 1}`;
        },
        style: (d: NodeData): CssStyle => placed(d, { overflow: 'visible' })
      } as never,
      [
        element('path', {
          d: (d: NodeData) => (typeof attrsOf(d).d === 'string' ? attrsOf(d).d : ''),
          fill: (d: NodeData) => (typeof attrsOf(d).fill === 'string' ? attrsOf(d).fill : 'none'),
          stroke: (d: NodeData) =>
            typeof attrsOf(d).stroke === 'string' ? attrsOf(d).stroke : '#1f2937',
          'stroke-width': (d: NodeData) =>
            typeof attrsOf(d).strokeWidth === 'number' ? attrsOf(d).strokeWidth : 1
        } as never)
      ]
    )
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
        'data-list-type': (d: NodeData) =>
          typeof attrsOf(d).listType === 'string' ? attrsOf(d).listType : 'bullet'
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
  define(
    'slideLayout',
    element('div', { className: 'sl-def sl-def-layout', style: { display: 'none' } }, [
      slot('content')
    ])
  );
}
