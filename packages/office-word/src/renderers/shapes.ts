/**
 * What **Word** draws a canvas with.
 *
 * A drawing in a page is an `<svg>` whose size is declared, and the shapes on it are SVG elements
 * placed by coordinate. A deck draws the same nodes as placed HTML boxes and overrides every one of
 * these — which is the point: two products drawing a rectangle differently is not one of them being
 * wrong, and a shared renderer that asked which product it was serving would be coupled in both
 * directions (`docs/SHARED-LAYER.md`).
 *
 * So this is Word's, and it is a file of its own so that the *text* renderers can be a package
 * without it. The arithmetic underneath — where a shape is, what a handle does to it, how a frame
 * arranges what it holds — is `@barocss/office-canvas` and is shared; the drawing is not.
 */
import { define, element, slot } from '@barocss/dsl';
import {
  canvasCss,
  canvasViewBox,
  ellipseAttrs,
  frameCss,
  isVisible,
  lineAttrs,
  rectangleAttrs,
  shapePaint,
  shapeTransform
} from '../shapes';

/** The shape renderers, registered by whichever kit wants Word's drawing. */
export function registerShapeRenderers(): void {
  /**
   * A drawing: a canvas with shapes placed on it by coordinate.
   *
   * SVG, because that is what a canvas of placed shapes is. The canvas declares
   * its size rather than growing to fit, so the paginator can measure it like
   * any other block — a block whose height depended on what was drawn in it
   * could not be laid out before it was drawn.
   */
  define(
    'canvasBlock',
    element(
      'svg',
      {
        className: 'w-canvas',
        viewBox: (d: Record<string, any>) => canvasViewBox(d.attributes as never),
        style: (d: Record<string, any>) => canvasCss(d.attributes as never)
      },
      [slot('content')]
    )
  );

  /**
   * The shapes.
   *
   * Written out rather than generated from a table: the three differ in what
   * SVG asks them for — a box, a centre and two radii, two points — and a
   * helper that hid that difference would hide the only interesting part.
   *
   * A shape a document has hidden is drawn as nothing rather than left out.
   * Leaving it out would change which node the sids either side of it belong
   * to, and a hidden shape is still in the document.
   */
  const paint = (d: Record<string, any>, name: string) =>
    shapePaint(d.attributes as never)[name] ?? '';
  const hidden = (d: Record<string, any>) =>
    isVisible(d.attributes as never) ? {} : { display: 'none' };
  const turned = (d: Record<string, any>) => shapeTransform(d.attributes as never) ?? '';

  define(
    'rectangle',
    element('rect', {
      className: 'w-shape w-shape-rectangle',
      style: hidden,
      transform: turned,
      x: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).x,
      y: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).y,
      width: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).width,
      height: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).height,
      rx: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).rx ?? '',
      fill: (d: Record<string, any>) => paint(d, 'fill'),
      stroke: (d: Record<string, any>) => paint(d, 'stroke'),
      'stroke-width': (d: Record<string, any>) => paint(d, 'stroke-width'),
      opacity: (d: Record<string, any>) => paint(d, 'opacity')
    })
  );

  /**
   * A group on a canvas: `<g>` with a translate.
   *
   * That is what a container *is* in SVG — the children carry coordinates
   * relative to their parent, which is the rule for every canvas node
   * (`docs/specs/canvas-model.md`), and a translated group is exactly that rule
   * expressed in the drawing.
   *
   * It was exempted from the conformance check for as long as Word has had one,
   * with the reason "Word has no canvas surface". True, and about the wrong
   * thing: Word has a canvas *block*, and a group is a scene node, so a Word
   * document could hold one full of shapes and draw a blank space where they
   * were.
   *
   * A group has no appearance of its own — it is the fact that things move
   * together — so it paints nothing, and the schema gives it no `fill` to paint
   * with.
   *
   * A **frame** is drawn separately, below, and as a `<div>`: it is a block now,
   * a layout box in the flow rather than a drawing, and a box that arranges
   * blocks has to be something the browser can lay out.
   */
  const container = (stype: 'group', painted: boolean) => {
    // The frame's own surface, drawn at the origin because the translate below
    // has already moved the group to it. Built here rather than spread into the
    // call so the tag and the children infer as one shape.
    const surface = element('rect', {
      className: 'w-shape-frame-fill',
      x: 0,
      y: 0,
      width: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).width,
      height: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).height,
      fill: (d: Record<string, any>) => paint(d, 'fill'),
      stroke: (d: Record<string, any>) => paint(d, 'stroke'),
      'stroke-width': (d: Record<string, any>) => paint(d, 'stroke-width')
    } as never);

    const children = painted ? [surface, slot('content')] : [slot('content')];

    return define(
      stype,
      element(
        'g',
        {
          className: `w-shape w-shape-${stype}`,
          style: hidden,
          transform: (d: Record<string, any>) => {
            const attrs = d.attributes as Record<string, any> | undefined;
            const x = typeof attrs?.x === 'number' ? attrs.x : 0;
            const y = typeof attrs?.y === 'number' ? attrs.y : 0;
            const turn = turned(d);
            return `translate(${x} ${y})${turn ? ` ${turn}` : ''}`;
          },
          opacity: (d: Record<string, any>) => paint(d, 'opacity')
        } as never,
        children
      )
    );
  };

  container('group', false);

  /**
   * A frame: a box that holds other things and decides where they go.
   *
   * A `<div>`, and that is the whole point. A frame is a *layout* box — two
   * columns of text in a report, a row of cards, a grid of pictures — and a box
   * that arranges blocks has to be something the browser can lay out. Drawn as
   * an SVG `<g>` it could hold shapes and nothing else, which is a drawing tool
   * pretending to be a layout one.
   *
   * `layoutMode` is honoured two ways, and needs no second mechanism because
   * the difference is in the contents rather than in the frame:
   *
   * - **Blocks have no coordinates**, so the browser lays them out: `flex` for a
   *   row or a column, `grid` for a grid, with the gap and padding the frame
   *   declares.
   * - **Scene nodes carry `x` and `y`**, so the model computes them — see
   *   `canvas-layout.ts` — and the CSS below does nothing to them, since an
   *   absolutely positioned child ignores a flex container's placement.
   *
   * One frame, one renderer, and a document and a slide arranging the same node
   * the same way. What a frame *cannot* do is sit inside Word's `canvasBlock`,
   * which is an `<svg>`: a `<div>` in there is kept by the parser and laid out
   * by nothing. The conformance check says so and Word exempts that pair with
   * the reason.
   */
  define(
    'frame',
    element(
      'div',
      {
        className: 'w-frame',
        'data-layout': (d: Record<string, any>) => {
          const mode = (d.attributes as any)?.layoutMode;
          return mode === 'row' || mode === 'column' || mode === 'grid' ? mode : undefined;
        },
        style: (d: Record<string, any>) => frameCss(d.attributes as never)
      } as never,
      [slot('content')]
    )
  );

  /**
   * A picture on a canvas.
   *
   * SVG's `<image>`, because that is what a picture inside an `<svg>` is — the
   * same reasoning as the shapes beside it. In a deck the same node is a placed
   * `<img>`; here it sits in the drawing's coordinate space with everything
   * else, which is why `x`, `y`, `width` and `height` go straight through.
   *
   * `preserveAspectRatio` is the SVG spelling of `object-fit`, and the default —
   * fit the whole picture inside the box, centred — is the one a reader who
   * dragged a box expects.
   */
  define(
    'picture',
    element('image', {
      className: 'w-shape w-shape-picture',
      style: hidden,
      transform: turned,
      href: (d: Record<string, any>) =>
        typeof (d.attributes as any)?.src === 'string' ? (d.attributes as any).src : '',
      /**
       * What the picture is, for a reader who cannot see it.
       *
       * `aria-label` rather than an `alt`: this is an SVG `<image>` and `alt` means nothing on one.
       * Word keeps a drawing's alt text in Format Picture → Alt Text, `inline-image` in the flow has
       * drawn it since it was written, and the same node on a canvas drew nothing — so a picture a
       * reader dragged onto the page was invisible to a screen reader and one they typed into a
       * paragraph was not.
       *
       * `role` with it, because an `<image>` with a name and no role is announced as a graphic in
       * some readers and skipped in others.
       */
      'aria-label': (d: Record<string, any>) =>
        typeof (d.attributes as any)?.alt === 'string' ? (d.attributes as any).alt : '',
      role: (d: Record<string, any>) =>
        typeof (d.attributes as any)?.alt === 'string' && (d.attributes as any).alt.length > 0
          ? 'img'
          : 'presentation',
      x: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).x,
      y: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).y,
      width: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).width,
      height: (d: Record<string, any>) => rectangleAttrs(d.attributes as never).height,
      preserveAspectRatio: (d: Record<string, any>) => {
        const fit = (d.attributes as any)?.fit;
        if (fit === 'fill') return 'none';
        if (fit === 'cover') return 'xMidYMid slice';
        return 'xMidYMid meet';
      },
      opacity: (d: Record<string, any>) => paint(d, 'opacity')
      // `href` is SVG's own and is not in the DSL's attribute map for `<image>`,
      // so the call is widened the way the rest of this file widens a template
      // whose attributes the map does not carry.
    } as never)
  );

  define(
    'ellipse',
    element('ellipse', {
      className: 'w-shape w-shape-ellipse',
      style: hidden,
      transform: turned,
      cx: (d: Record<string, any>) => ellipseAttrs(d.attributes as never).cx,
      cy: (d: Record<string, any>) => ellipseAttrs(d.attributes as never).cy,
      rx: (d: Record<string, any>) => ellipseAttrs(d.attributes as never).rx,
      ry: (d: Record<string, any>) => ellipseAttrs(d.attributes as never).ry,
      fill: (d: Record<string, any>) => paint(d, 'fill'),
      stroke: (d: Record<string, any>) => paint(d, 'stroke'),
      'stroke-width': (d: Record<string, any>) => paint(d, 'stroke-width'),
      opacity: (d: Record<string, any>) => paint(d, 'opacity')
    })
  );

  define(
    'line',
    element('line', {
      className: 'w-shape w-shape-line',
      style: hidden,
      transform: turned,
      x1: (d: Record<string, any>) => lineAttrs(d.attributes as never).x1,
      y1: (d: Record<string, any>) => lineAttrs(d.attributes as never).y1,
      x2: (d: Record<string, any>) => lineAttrs(d.attributes as never).x2,
      y2: (d: Record<string, any>) => lineAttrs(d.attributes as never).y2,
      stroke: (d: Record<string, any>) => paint(d, 'stroke') || 'currentColor',
      'stroke-width': (d: Record<string, any>) => paint(d, 'stroke-width') || '1',
      opacity: (d: Record<string, any>) => paint(d, 'opacity')
    })
  );

  define(
    'path',
    element('path', {
      className: 'w-shape w-shape-path',
      style: hidden,
      transform: turned,
      d: (d: Record<string, any>) => String(d.attributes?.d ?? ''),
      fill: (d: Record<string, any>) => paint(d, 'fill'),
      stroke: (d: Record<string, any>) => paint(d, 'stroke'),
      'stroke-width': (d: Record<string, any>) => paint(d, 'stroke-width'),
      opacity: (d: Record<string, any>) => paint(d, 'opacity')
    })
  );
}
