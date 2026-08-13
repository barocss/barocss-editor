/**
 * How Word draws its nodes.
 *
 * Templates are declarative descriptions in the shared DSL; the same node types
 * would look different in another product, which is exactly why this lives with
 * the product and not with the schema.
 *
 * Formatting is applied by resolving each node against the document rather than
 * by reading its attributes directly — a paragraph with no attributes at all
 * still inherits from its style and from the document defaults. See
 * render-context for how the templates reach the document.
 */
import { data, define, element, slot, text } from '@barocss/dsl';
import type { RenderEnv } from '@barocss/dsl';
import { characterCss, flowCss, rowClipHeight, tableCellCss, tableRowCss, twipToCss } from './css';
import {
  getEditingFurniture,
  getFurniturePlacement,
  getWordDocument,
  getWordFields,
  getWordNow,
  getWordLayout,
  getWordStyles,
  getTab
} from './render-context';
import {
  childrenOf,
  documentSettings,
  indexResources,
  type DocumentAccess,
  type DocumentNode
} from './document-access';
import { tocEntries, tocPageNumber } from './toc';
import { formatDateField } from './date-field';
import {
  footnoteAreaTemplate,
  furnitureFor,
  furnitureTemplate,
  lineNumberTemplate,
  pageNumberFor
} from './page-furniture';
import { lineNumberingOf } from './line-numbers';
import { leaderStyle } from './tabs';
import { imageCss } from './image-layout';
import {
  canvasCss,
  canvasViewBox,
  ellipseAttrs,
  isVisible,
  lineAttrs,
  rectangleAttrs,
  shapePaint,
  shapeTransform
} from './shapes';
import { blockStyle, formatFor, listMarker } from './renderers/block-style';
import { cellBorders, cellMargins, gridOf, tableCss } from './table-format';
import { cellPlacementOf, cellStyleLayers, rowFormat, tableStyleLayer } from './table-style';
import { registerRevisionMarks, registerValuedMarks } from './renderers/marks';
import { registerMathRenderers } from './math-renderers';

/**
 * Register every Word renderer in the global DSL registry.
 *
 * Idempotent, so a hot reload or a second editor on the page does not double
 * register.
 */
export function registerWordRenderers(): void {
  // Equations. Their own file: they are a domain of their own, with two dozen
  // constructs, and none of the rest of Word's rendering has anything to say
  // about them.
  registerMathRenderers();

  // ── Structure ──────────────────────────────────────────────────────────────
  /**
   * The document, and the one property every word in it depends on.
   *
   * `white-space: pre-wrap` is not a style choice: without it the browser draws
   * a run of spaces as one, and a contenteditable caret can only be placed where
   * something is drawn. Typing two spaces and then a letter put the letter
   * *before* the second space — the model had both spaces, the page showed one,
   * and the next keystroke came back mapped to the position the page had. Two
   * bugs, one cause, and it is a property of how text is drawn rather than of
   * any block, so it is set once here and inherited by everything.
   *
   * `pre-wrap` and not `pre`: lines still break at the column width, which is
   * what pagination measures and what a page is. And not `break-spaces`, which
   * also keeps them but lets a run of spaces at a line's end push text onto the
   * next line — Word hangs them instead, and so does this.
   */
  define(
    'document',
    element('div', { className: 'w-document', style: { whiteSpace: 'pre-wrap' } }, [
      slot('content')
    ])
  );

  // Metadata and referenced definitions are content, but not *flow* content:
  // where a footnote or a title appears is a layout decision, and the flow is
  // not where it is made. They render into their own regions instead.
  define('docMeta', element('header', { className: 'w-meta' }, [slot('content')]));
  define('docTitle', element('h1', { className: 'w-doc-title' }, [slot('content')]));
  define('docSubtitle', element('p', { className: 'w-doc-subtitle' }, [slot('content')]));
  define('docAuthor', element('p', { className: 'w-doc-author' }, [slot('content')]));
  /**
   * Resource definitions, and the region at the end of the document.
   *
   * Not `display: none`: that hides the subtree unconditionally, and two kinds of
   * resource need to show — a header while it is being edited, and back matter,
   * which belongs after the last page. Each kind decides for itself instead, and
   * the ones that are pure definition render nothing at all.
   *
   * An ordinary block, so back matter simply follows the document. It takes no
   * height while everything in it is hidden, which is the usual case.
   */
  // Deliberately not positioned: a header being edited is placed in the
  // container's coordinates, and a positioned ancestor here would make it the
  // origin instead — putting the header at the end of the document.
  define('resources', element('div', { className: 'w-resources' }, [slot('content')]));

  /** Definitions are read, never drawn. */
  for (const stype of [
    'styleDef',
    'styleConditional',
    'numberingDef',
    'docDefaults',
    'docSettings',
    'personDef'
  ]) {
    define(stype, element('div', { className: `w-def w-def-${stype}`, style: { display: 'none' } }));
  }

  /**
   * A header or footer, which is normally drawn per page rather than rendered.
   *
   * Except while it is being edited. Then the copies drawn on the pages are the
   * wrong thing to type into — there are several of them and they all carry the
   * same node id — so the real node is shown instead, in the place the copy
   * would have been. Editing it is then ordinary editing: the caret lands in the
   * actual model node, and nothing about the input path is special-cased.
   */
  const furnitureNode = (stype: 'docHeader' | 'docFooter', placementKind: 'header' | 'footer') =>
    define(stype, (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
      const env = ctx?.env as RenderEnv | undefined;
      const id = String(node.attributes?.id ?? '');
      const editing = getEditingFurniture(env) === id && id !== '';
      const placement = getFurniturePlacement(env, id, placementKind);
      const className = `w-${placementKind}-source`;

      return element(
        'div',
        {
          className: `${className}${editing ? ' is-editing' : ''}`,
          style: editing && placement
            ? {
                position: 'absolute',
                left: `${placement.left}px`,
                top: `${placement.top}px`,
                width: `${placement.width}px`
              }
            : { display: 'none' }
        },
        [slot('content')]
      );
    });

  furnitureNode('docHeader', 'header');
  furnitureNode('docFooter', 'footer');

  /**
   * Back matter: endnotes, a bibliography, an index.
   *
   * All three are resources that belong at the end of the document rather than
   * on a page, which is what separates them from footnotes — a footnote's whole
   * point is being on the page that refers to it, and these three exist so the
   * reader can look something up afterwards.
   *
   * Rendered as flow content, unlike page furniture: they appear once, in
   * document order, and they can be edited. Only their position is a layout
   * decision, and the layout's answer is "after everything else".
   */
  const backMatter = (stype: string, className: string, heading: string) =>
    define(
      stype,
      element('section', { className: `w-back-matter ${className}` }, [
        element('h2', { className: 'w-back-matter-title' }, heading),
        slot('content')
      ])
    );

  backMatter('endnoteDef', 'w-endnotes', 'Notes');
  backMatter('bibliography', 'w-bibliography', 'Bibliography');
  backMatter('indexBlock', 'w-index', 'Index');

  /**
   * A section, drawn as the pages its text reached.
   *
   * The sheets are siblings of the content, not containers for it. Putting each
   * page's blocks inside their own element would reparent model nodes under
   * elements that exist in no model, and tracing a DOM mutation back to the node
   * it belongs to depends on that containment. So the flow stays continuous and
   * the sheets are painted behind it.
   *
   * Written as a component rather than a plain template because the number of
   * sheets comes from the layout, not from the node — and going through the DSL
   * rather than around it is what keeps this renderable by renderer-react too.
   */
  define('surface', (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
    const env = ctx?.env as RenderEnv | undefined;
    const styles = getWordStyles(env);
    const format = styles ? styles.resolveNode(node as never, 'page') : {};
    const layout = getWordLayout(env, String(node.sid ?? ''));

    // Headers and footers are drawn per page, from the resources the section
    // points at. See page-furniture for why they are drawn rather than rendered.
    const doc = getWordDocument(env);
    const resources = doc ? indexResources(doc) : new Map();
    const binding = (role: 'Header' | 'Footer') => ({
      first: node.attributes?.[`firstPage${role}Id`] as string | undefined,
      even: node.attributes?.[`evenPage${role}Id`] as string | undefined,
      default: node.attributes?.[`${role.toLowerCase()}Id`] as string | undefined
    });

    /**
     * Whether those variants are used at all.
     *
     * Odd and even headers are a document-wide decision in Word and a section
     * property here, so the section answers when it says anything and the
     * document answers when it does not — which is the same thing for a document
     * whose sections agree, and the only reading that lets one section differ.
     */
    const settings = doc ? documentSettings(doc) : undefined;
    const switches = {
      titlePage: node.attributes?.titlePage === true,
      differentOddEven:
        typeof node.attributes?.differentOddEven === 'boolean'
          ? node.attributes.differentOddEven
          : settings?.attributes?.evenAndOddHeaders === true
    };

    const furniture: any[] = [];
    if (doc && layout) {
      for (const page of layout.pages) {
        const context = {
          index: page.index,
          number: pageNumberFor(page.index, format),
          total: layout.pages.length
        };
        for (const placement of ['header', 'footer'] as const) {
          const role = placement === 'header' ? 'Header' : 'Footer';
          const id = furnitureFor(binding(role), context, switches);
          // The real node is showing in place of this copy, and two of the same
          // thing on one page is worse than none.
          if (id && id === getEditingFurniture(env)) continue;

          const drawn = furnitureTemplate({
            doc,
            node: id ? resources.get(id) : undefined,
            page: context,
            metrics: layout.metrics,
            format,
            placement
          });
          if (drawn) furniture.push(drawn);
        }
      }
    }

    // Numbers down the margin, for a section that asks for them. Grouped by the
    // page they belong to, so each page draws one box of them.
    if (layout && layout.lineNumbers.length > 0) {
      const numbering = lineNumberingOf(format);
      const byPage = new Map<number, typeof layout.lineNumbers>();
      for (const mark of layout.lineNumbers) {
        byPage.set(mark.page, [...(byPage.get(mark.page) ?? []), mark]);
      }
      for (const [pageIndex, marks] of byPage) {
        const drawn = lineNumberTemplate({
          marks,
          pageIndex,
          metrics: layout.metrics,
          distance: numbering?.distance ?? 360
        });
        if (drawn) furniture.push(drawn);
      }
    }

    // Footnote bodies, drawn at the foot of the page holding their reference.
    // Chrome for the same reason the furniture is: a body lives in `resources`
    // and is *shown* here, so rendering it as content would give it two places
    // in the document at once.
    if (doc && layout) {
      for (const [pageIndex, ids] of layout.footnotesByPage) {
        const drawn = footnoteAreaTemplate({
          doc,
          resources,
          ids,
          numbers: layout.footnoteNumbers,
          pageIndex,
          metrics: layout.metrics
        });
        if (drawn) furniture.push(drawn);
      }
    }

    // One per page, not one per box the paginator filled. With columns a page
    // holds several boxes, and drawing a sheet for each would stack two or three
    // of them down the document for a single sheet of paper.
    const sheetCount = layout
      ? Math.max(1, Math.ceil(layout.pages.length / layout.metrics.columnCount))
      : 0;

    const sheets = Array.from({ length: sheetCount }, (_, index) => {
      const { height, width, gap } = layout!.metrics;
      const page = { index };
      return element('div', {
        className: 'w-sheet',
        // Keyed because the sheets are a list. Reconciliation no longer needs it
        // — an id inherited from the owning node is not treated as identity any
        // more — but saying which sheet is which lets a page inserted in the
        // middle move the ones after it rather than repainting each in place.
        key: `sheet-${page.index}`,
        'data-page': String(page.index + 1),
        style: {
          position: 'absolute',
          left: '0',
          top: `${page.index * (height + gap)}px`,
          width: `${width}px`,
          height: `${height}px`
        }
      });
    });

    return element(
      'section',
      {
        className: 'w-surface',
        'data-kind': String(node.attributes?.kind ?? 'flow'),
        style: {
          position: 'relative',
          // A stacking context, so that the sheets drawn inside it can be put
          // behind the text and stay there. Without one, a negative z-index
          // escapes to the nearest ancestor that has a context and the sheets
          // disappear behind whatever paints there.
          isolation: 'isolate',
          // A flex column so that adjacent paragraph margins do not collapse.
          // Word adds space after one paragraph to space before the next; CSS
          // takes the larger of the two. Left alone, the flow would be shorter
          // than the layout calculated it to be, and every page after the first
          // would start a few pixels above its sheet.
          display: 'flex',
          flexDirection: 'column',
          ...flowCss(format),
          ...(layout ? { minHeight: `${layout.totalHeight}px` } : {})
        }
      },
      [
        // Chrome, not content: the sheets are in the content tree because that
        // is where the geometry they align to lives, but they are not part of
        // the document. `data-bc-chrome` is what keeps them out of a copy; the
        // rest keeps the caret, the pointer and a screen reader out of them.
        element(
          'div',
          {
            className: 'w-sheets',
            // Named, because it is a sibling of the content slot and both carry
            // the surface's sid — a sid is stamped on every element of a
            // template, so among siblings it is not identity. Without a name of
            // its own this box was replaced on every render, and replacing it
            // rebuilt every sheet, header, footer and footnote inside it however
            // carefully those were keyed themselves.
            key: 'sheets',
            'data-bc-chrome': 'true',
            contenteditable: 'false',
            'aria-hidden': 'true',
            style: {
              position: 'absolute',
              inset: '0',
              pointerEvents: 'none',
              userSelect: 'none',
              // Behind the text, which is the whole point of a sheet: it is the
              // paper the document is printed on. Being positioned, it would
              // otherwise paint *above* every static block in the flow no matter
              // how early it appears in the DOM — CSS paints positioned boxes
              // after in-flow ones — and an opaque white rectangle over the
              // document hides all of it. Only a negative z-index comes before
              // in-flow content in the painting order; zero is still after.
              zIndex: '-1'
            }
          },
          [...sheets, ...furniture]
        ),
        slot('content')
      ]
    );
  });

  /**
   * A table of contents, generated from the layout.
   *
   * A contextual component because the entries are not in the node: they come
   * from the headings around it and the pages they landed on. Rendering it as
   * stored content would show a table describing a layout the document no longer
   * has — which is what a table of contents pasted as plain text does.
   *
   * It has height like any other block, so it is measured and paginated
   * normally, and the page numbers it shows come from the round before. The
   * layout loop is what settles that: adding the table moves everything below it
   * down, the next round reports the new pages, and the round after finds
   * nothing left to change.
   */
  define('tableOfContents', (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
    const env = ctx?.env as RenderEnv | undefined;
    const doc = getWordDocument(env);
    const surface = doc ? findSurfaceOf(doc, String(node.sid ?? '')) : undefined;
    const layout = surface?.sid ? getWordLayout(env, surface.sid) : undefined;
    const styles = getWordStyles(env);
    const format = styles && surface ? styles.resolveNode(surface as never, 'page') : {};

    const entries =
      doc && surface
        ? tocEntries({
            doc,
            surface,
            levels: node.attributes?.levels,
            styleFilter: node.attributes?.styleFilter,
            pageOfBlock: layout?.pageOfBlock
          })
        : [];

    const showPages = node.attributes?.showPageNumbers !== false;

    return element(
      'nav',
      {
        className: 'w-toc',
        style: blockStyle(node, env)
      },
      entries.map((entry) =>
        element(
          'div',
          {
            className: 'w-toc-entry',
            key: entry.sid,
            'data-level': String(entry.level),
            style: { paddingLeft: `${(entry.level - 1) * 1.5}em` }
          },
          [
            element('span', { className: 'w-toc-text' }, entry.text),
            ...(showPages
              ? [
                  element(
                    'span',
                    { className: 'w-toc-page' },
                    tocPageNumber(entry, (index) => pageNumberFor(index, format))
                  )
                ]
              : [])
          ]
        )
      )
    );
  });

  /**
   * Fields whose value is a fact about the document rather than text in it.
   *
   * Rendered from a resolver for the same reason list markers are: a caption
   * that stored "Figure 3" would be wrong the moment a figure is inserted above
   * it, and the number is not something the user should be able to put a caret
   * inside.
   */
  define('fieldSeq', (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
    const fields = getWordFields(ctx?.env as RenderEnv | undefined);
    const value = fields?.sequenceNumber(String(node.sid ?? ''));
    return element(
      'span',
      { className: 'w-field w-field-seq', 'data-sequence': String(node.attributes?.sequence ?? '') },
      value ?? ''
    );
  });

  define('fieldRef', (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
    const fields = getWordFields(ctx?.env as RenderEnv | undefined);
    const value = fields?.reference(
      String(node.attributes?.targetId ?? ''),
      String(node.attributes?.format ?? 'text'),
      String(node.sid ?? '')
    );
    // An unresolved reference shows Word's own marker rather than nothing: a
    // reference to something that has been deleted is a fact the author needs.
    return element(
      'span',
      { className: 'w-field w-field-ref', 'data-target': String(node.attributes?.targetId ?? '') },
      value ?? 'Error! Reference source not found.'
    );
  });

  define('fieldStyleRef', (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
    const fields = getWordFields(ctx?.env as RenderEnv | undefined);
    const value = fields?.styleReference(
      String(node.attributes?.styleId ?? ''),
      String(node.sid ?? ''),
      node.attributes?.searchFromBottom === true
    );
    return element('span', { className: 'w-field w-field-style-ref' }, value ?? '');
  });

  registerRevisionMarks();
  registerValuedMarks();

  /**
   * Fields whose value is a fact about the document rather than about the page.
   *
   * The title and the author come from docMeta, not from the flow: a field
   * asking for the title wants what the document is called, not what its first
   * heading happens to say. The date comes from the host, because a renderer
   * that reads the clock cannot be tested and makes every layout pass look like
   * a change.
   */
  define('fieldDocTitle', (_props: Record<string, any>, _node: Record<string, any>, ctx: any) =>
    element(
      'span',
      { className: 'w-field w-field-title' },
      getWordFields(ctx?.env as RenderEnv | undefined)?.documentTitle() ?? ''
    )
  );

  define('fieldAuthor', (_props: Record<string, any>, _node: Record<string, any>, ctx: any) =>
    element(
      'span',
      { className: 'w-field w-field-author' },
      getWordFields(ctx?.env as RenderEnv | undefined)?.documentAuthor() ?? ''
    )
  );

  define('fieldDateTime', (_props: Record<string, any>, node: Record<string, any>, ctx: any) =>
    element(
      'span',
      { className: 'w-field w-field-date' },
      formatDateField(getWordNow(ctx?.env as RenderEnv | undefined), node.attributes?.format)
    )
  );

  /**
   * A bookmark's anchor: a place in the text, with no text of its own.
   *
   * Drawn as an empty inert span. It is what a cross-reference points at and
   * what a link jumps to, so it has to be in the DOM — and it must not be
   * something the caret can sit in or a copy can carry.
   */
  define('bookmarkAnchor', element('span', {
    className: 'w-bookmark',
    'data-bookmark': (d: Record<string, any>) => String(d.attributes?.id ?? ''),
    'data-bc-chrome': 'true',
    contenteditable: 'false',
    'aria-hidden': 'true'
  }));

  // ── Flow ───────────────────────────────────────────────────────────────────
  define(
    'paragraph',
    element(
      'p',
      {
        className: 'w-paragraph',
        'data-style': (d: Record<string, any>) => String(d.attributes?.styleId ?? ''),
        'data-marker': (d: Record<string, any>, env?: RenderEnv) => listMarker(d, env),
        style: (d: Record<string, any>, env?: RenderEnv) => blockStyle(d, env)
      },
      [slot('content')]
    )
  );

  define(
    'heading',
    element(
      (d: Record<string, any>) => {
        const level = Number(d.attributes?.level ?? 1);
        return `h${Math.min(Math.max(level, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      },
      {
        className: 'w-heading',
        'data-style': (d: Record<string, any>) => String(d.attributes?.styleId ?? ''),
        'data-marker': (d: Record<string, any>, env?: RenderEnv) => listMarker(d, env),
        style: (d: Record<string, any>, env?: RenderEnv) => blockStyle(d, env)
      },
      [slot('content')]
    )
  );

  define('list', element('div', { className: 'w-list' }, [slot('content')]));
  define(
    'listItem',
    element(
      'div',
      { className: 'w-list-item', 'data-marker': (d: Record<string, any>, env?: RenderEnv) => listMarker(d, env), style: (d: Record<string, any>, env?: RenderEnv) => blockStyle(d, env) },
      [slot('content')]
    )
  );

  define('blockQuote', element('blockquote', { className: 'w-quote', style: (d: Record<string, any>, env?: RenderEnv) => blockStyle(d, env) }, [slot('content')]));
  define(
    'codeBlock',
    element('pre', { className: 'w-code', 'data-language': (d: Record<string, any>) => String(d.attributes?.language ?? '') }, [
      slot('content')
    ])
  );

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

  define('pageBreak', element('div', { className: 'w-page-break', role: 'separator' }));
  define('columnBreak', element('div', { className: 'w-column-break', role: 'separator' }));
  define('horizontalRule', element('hr', { className: 'w-rule' }));

  define('contentControl', element('div', { className: 'w-content-control', 'data-tag': (d: Record<string, any>) => String(d.attributes?.tag ?? '') }, [slot('content')]));
  define('textBox', element('aside', { className: 'w-text-box' }, [slot('content')]));

  // ── Tables ─────────────────────────────────────────────────────────────────
  /**
   * Present to a screen reader and to nothing else.
   *
   * `display: none` and `visibility: hidden` both take an element out of the
   * accessibility tree along with the page, which for text that exists only to
   * be read out is the whole of it. Clipping to a point leaves it in.
   */
  const OFF_SCREEN = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap'
  } as const;

  // A table takes its spacing from the paragraph scope as well as its own
  // formatting: `spacingBefore`/`spacingAfter` reach it through the document
  // defaults, and dropping them here would put a gap in the rendered document
  // that the layout does not know about.
  /**
   * A table, with the column widths it declares.
   *
   * Word stores them once, on the table, as a list of twips — CSS keeps them
   * nowhere, so they become a `<colgroup>`. `tableCss` is what turns the rest of
   * the table's own formatting into style, including making the layout fixed:
   * left to itself a browser sizes columns from their contents, and a document
   * saying its first column is two inches wide silently gets something else.
   */
  define('bTable', (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
    const env = ctx?.env as RenderEnv | undefined;
    const styles = getWordStyles(env);
    // The whole-table region of its style sits under the table's own formatting:
    // its borders are the table's borders, inside rules and all.
    const layers = styles ? [tableStyleLayer(styles, node as never)] : [];
    const format = styles ? styles.resolveNodeWith(node as never, 'table', layers) : {};
    const widths = gridOf(format);
    const caption = String(node.attributes?.caption ?? '');
    const description = String(node.attributes?.description ?? '');

    return element(
      'table',
      {
        className: 'w-table',
        style: {
          ...blockStyle(node, env),
          ...formatFor(node, 'table', env, layers),
          ...tableCss(format)
        }
      },
      [
        /**
         * What the table is called, for a reader who cannot see it.
         *
         * Word keeps a table's title and description in Table Properties → Alt
         * Text and shows neither in the document, so neither is drawn here: the
         * caption carries them where a screen reader will read them out and
         * takes no room on the page. Hidden with a clip rather than with
         * `display: none`, which would hide it from the reader as well — the one
         * thing it exists for.
         */
        ...(caption || description
          ? [
              element('caption', { className: 'w-table-caption', style: OFF_SCREEN }, [
                text([caption, description].filter(Boolean).join('. '))
              ])
            ]
          : []),
        ...(widths.length > 0
          ? [
              element(
                'colgroup',
                { 'data-bc-chrome': 'true' },
                widths.map((width, index) =>
                  element('col', { key: `col-${index}`, style: { width: twipToCss(width) } })
                )
              )
            ]
          : []),
        slot('content')
      ]
    );
  });
  define('bTableBody', element('tbody', { className: 'w-tbody' }, [slot('content')]));
  define('bTableFooter', element('tfoot', { className: 'w-tfoot' }, [slot('content')]));

  /**
   * A row, as tall as it says it is.
   *
   * Height is the one thing a row has that nothing else does, and CSS gives it
   * as a minimum — which is Word's `atLeast` exactly, and why `exact` is drawn
   * by the cells instead. The rest of a row's formatting is its shading; its
   * `cellSpacing` and `alignment` have no per-row shape in CSS, and neither has
   * ever been what a row is for.
   *
   * A header group is a row when it holds cells directly, and the group its rows
   * are in when it does not — so the same template draws both, and answers with
   * nothing for the group that is not a row.
   */
  const rowNode = (stype: string, tag: 'tr' | 'thead', className: string) =>
    define(stype, (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
      const env = ctx?.env as RenderEnv | undefined;
      const doc = getWordDocument(env);
      const styles = getWordStyles(env);
      const format = doc && styles ? rowFormat(styles, doc, node as never) : {};

      return element(tag, { className, style: tableRowCss(format) }, [slot('content')]);
    });

  rowNode('bTableRow', 'tr', 'w-tr');
  rowNode('bTableHeader', 'thead', 'w-thead');

  // Spans are attributes on the surviving cell; the cells it swallowed are gone
  // from the model, so nothing else has to be emitted here.
  /**
   * A cell, drawn with the rules and the regions that belong to where it sits.
   *
   * `insideH` and `insideV` are borders *between* cells and CSS has no selector
   * for between, so they resolve onto the cells: a side facing another cell
   * takes the inside rule, a side facing out takes the table's outer one. A
   * table style's regions arrive the same way — being in the first row or in a
   * shaded band is a fact about position, not about the cell. Both need to know
   * where the cell is, which is a walk over the table rather than anything the
   * cell carries, so this is a component and the plain templates above could not
   * have done it.
   */
  const cellNode = (stype: string, tag: 'td' | 'th') =>
    define(stype, (_props: Record<string, any>, node: Record<string, any>, ctx: any) => {
      const env = ctx?.env as RenderEnv | undefined;
      const doc = getWordDocument(env);
      const styles = getWordStyles(env);
      const placement = doc ? cellPlacementOf(doc, node as never) : undefined;

      // The table's format, resolved once: the regions are read off it and the
      // borders are drawn from it.
      const tableFormat =
        styles && placement
          ? styles.resolveNodeWith(placement.table, 'table', [
              tableStyleLayer(styles, placement.table)
            ])
          : undefined;
      const regions =
        styles && placement
          ? cellStyleLayers(styles, placement.table, placement.at, tableFormat)
          : undefined;

      // Under the style's regions and under the cell's own: the margins a table
      // states once for all its cells are a default, and every layer above is
      // something said about this cell in particular.
      const cellFormat = styles
        ? styles.resolveNodeWith(node as never, 'table', [
            tableFormat ? cellMargins(tableFormat) : undefined,
            regions?.cell
          ])
        : {};
      const borders =
        tableFormat && placement ? cellBorders(tableFormat, cellFormat, placement.at) : {};

      /**
       * A row of an exact height clips what does not fit, and only a box inside
       * the cell can: a table cell treats any height as a minimum and ignores
       * its own `overflow` — a 20pt row holding three lines was measured at 37pt
       * with both set on the cell itself.
       *
       * The box takes the cell's padding with it and the cell keeps none, or the
       * row comes out as tall as the height *plus* the padding, which is the one
       * thing an exact height is asked for to prevent. Drawn only for this rule,
       * so an ordinary cell is the same element it has always been.
       */
      const cellCss = tableCellCss(cellFormat);
      const clip = doc && styles && placement
        ? rowClipHeight(rowFormat(styles, doc, placement.row))
        : undefined;
      const content = clip
        ? element(
            'div',
            {
              className: 'w-cell-clip',
              style: {
                height: clip,
                boxSizing: 'border-box',
                overflow: 'hidden',
                ...(cellCss.padding !== undefined ? { padding: cellCss.padding } : {})
              }
            },
            [slot('content')]
          )
        : slot('content');

      return element(
        tag,
        {
          className: 'w-cell',
          colspan: Number(node.attributes?.colspan) || 1,
          rowspan: Number(node.attributes?.rowspan) || 1,
          // The region's run formatting is on the cell as well as on the blocks
          // inside it: a cell may hold text directly, with no paragraph to carry
          // it, and a header row is bold either way. A paragraph inside states
          // the same values for itself, so the two cannot disagree.
          style: {
            ...(regions ? characterCss(regions.text) : {}),
            ...cellCss,
            ...(clip ? { padding: '0' } : {}),
            ...borders
          }
        } as never,
        [content]
      );
    });

  cellNode('bTableCell', 'td');
  cellNode('bTableHeaderCell', 'th');

  // ── Inline ─────────────────────────────────────────────────────────────────
  define('inline-text', element('span', { className: 'w-text' }, [data('text', '')]));
  /**
   * A picture, drawn where its wrapping says.
   *
   * The wrapping is on the element rather than on the paragraph because it is a
   * property of the picture: two pictures in one paragraph can wrap differently,
   * and Word lets them.
   */
  define('inline-image', element('img', {
    className: (d: Record<string, any>) => `w-image w-image-${String(d.attributes?.wrap ?? 'inline')}`,
    src: (d: Record<string, any>) => String(d.attributes?.src ?? ''),
    alt: (d: Record<string, any>) => String(d.attributes?.alt ?? ''),
    style: (d: Record<string, any>) => imageCss(d.attributes as never)
  }));
  define('hardBreak', element('br', { className: 'w-break' }));
  /**
   * A tab: an instruction to reach the next stop, drawn as the space it crosses.
   *
   * Its width is measured rather than declared — where the tab sits decides how
   * far it must stretch — so it comes from the environment the layout pass
   * fills, the same way a block's push to its sheet does. Before the first
   * measurement it draws as nothing, which is what a tab did before it had a
   * width at all.
   */
  define(
    'tab',
    element('span', {
      className: 'w-tab',
      style: (d: Record<string, any>, env?: RenderEnv) => {
        const tab = getTab(env, String(d.sid ?? ''));
        if (!tab) return { display: 'inline-block' };
        return {
          display: 'inline-block',
          width: `${tab.width}px`,
          ...leaderStyle(tab.leader)
        };
      }
    })
  );
  define('noBreakHyphen', element('span', { className: 'w-nbhyphen' }, [data('text', '‑')]));
  define('softHyphen', element('span', { className: 'w-shyphen' }));
  define('noteNumber', element('sup', { className: 'w-note-number' }, [slot('content')]));
}


/**
 * The section a block belongs to.
 *
 * A table of contents lists the headings around it, and "around it" means its
 * own section: a document with a preface and a body has two, and listing both
 * from either would be wrong.
 */
function findSurfaceOf(doc: DocumentAccess, sid: string): DocumentNode | undefined {
  const root = doc.getNode(doc.rootId);
  for (const child of childrenOf(doc, root)) {
    if (child.stype !== 'surface') continue;
    if (childrenOf(doc, child).some((block) => block.sid === sid)) return child;
  }
  return undefined;
}
