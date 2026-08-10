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
import { data, define, element, slot } from '@barocss/dsl';
import {
  characterCss,
  flowCss,
  paragraphCss,
  tableCellCss,
  tableCss,
  twipToCss,
  type CssStyle
} from './css';
import { INDENT_STEP as LIST_INDENT_STEP } from './list-commands';
import { leaderStyle } from './tabs';
import {
  getBlockPosition,
  getBlockPush,
  getEditingFurniture,
  getFurniturePlacement,
  getWordDocument,
  getWordFields,
  getWordNow,
  getWordLayout,
  getWordNumbering,
  getWordStyles,
  getTab
} from './render-context';
import { childrenOf, indexResources, type DocumentAccess, type DocumentNode } from './document-access';
import { tocEntries, tocPageNumber } from './toc';
import { authorColor, revisionTitle } from './revisions';
import { formatDateField } from './date-field';
import { markAttributes, markCss, VALUED_MARKS } from './mark-format';
import { footnoteAreaTemplate, furnitureFor, furnitureTemplate, pageNumberFor } from './page-furniture';
import type { RenderEnv } from '@barocss/dsl';

/** Resolved formatting for a node, or nothing when no document is set. */
function formatFor(
  node: Record<string, any>,
  scope: 'paragraph' | 'character' | 'table',
  env: RenderEnv | undefined
): CssStyle {
  const styles = getWordStyles(env);
  if (!styles) return {};
  const format = styles.resolveNode(node as never, scope);
  switch (scope) {
    case 'character':
      return characterCss(format);
    case 'table':
      return tableCss(format);
    default:
      return paragraphCss(format);
  }
}

/**
 * A block's style is its paragraph formatting plus the character formatting that
 * applies to the whole block. Word keeps them separate (a paragraph mark carries
 * run properties); CSS does not, and inheritance does the rest.
 */
function blockStyle(node: Record<string, any>, env: RenderEnv | undefined): CssStyle {
  const style: CssStyle = {
    ...formatFor(node, 'paragraph', env),
    ...formatFor(node, 'character', env)
  };

  // The block that opens a page is pushed down to meet its sheet. It replaces
  // the block's own space before rather than adding to it, which is the same
  // rule the paginator applied when it decided the break: space before is
  // suppressed at the top of a page.
  // A section running in columns positions every block, because moving to the
  // next column is a move to the right and *up*, which no margin can express.
  const position = getBlockPosition(env, String(node.sid ?? ''));
  if (position) {
    style.position = 'absolute';
    style.top = `${position.top}px`;
    style.left = `${position.left}px`;
    style.width = `${position.width}px`;
    style.marginTop = '0';
    return style;
  }

  // A list item sits in from the margin, one step per level. In Word the indent
  // comes from the numbering definition rather than from the paragraph, which is
  // why it is applied here and not written into the document: a list that was
  // indented by direct formatting would keep its old indent when moved to
  // another level. A paragraph that states its own indent keeps it — direct
  // formatting outranks the definition, as everywhere else.
  const numbered = getWordNumbering(env)?.numberFor(String(node.sid ?? ''));
  if (numbered && style.marginLeft === undefined) {
    style.marginLeft = twipToCss((numbered.level + 1) * LIST_INDENT_STEP);
  }

  const push = getBlockPush(env, String(node.sid ?? ''));
  if (push !== undefined) style.marginTop = `${push}px`;

  return style;
}

/** The list marker for a numbered block, if it has one. */
function listMarker(node: Record<string, any>, env: RenderEnv | undefined): string {
  const numbering = getWordNumbering(env);
  const sid = node.sid as string | undefined;
  if (!numbering || !sid) return '';
  const item = numbering.numberFor(sid);
  if (!item) return '';
  const separator = item.suffix === 'space' ? ' ' : item.suffix === 'nothing' ? '' : ' ';
  return `${item.text}${separator}`;
}

/**
 * Register every Word renderer in the global DSL registry.
 *
 * Idempotent, so a hot reload or a second editor on the page does not double
 * register.
 */
export function registerWordRenderers(): void {
  // ── Structure ──────────────────────────────────────────────────────────────
  define('document', element('div', { className: 'w-document' }, [slot('content')]));

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
  for (const stype of ['styleDef', 'numberingDef', 'docDefaults', 'docSettings', 'personDef']) {
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
          const id = furnitureFor(binding(role), context);
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

  define('pageBreak', element('div', { className: 'w-page-break', role: 'separator' }));
  define('columnBreak', element('div', { className: 'w-column-break', role: 'separator' }));
  define('horizontalRule', element('hr', { className: 'w-rule' }));

  define('contentControl', element('div', { className: 'w-content-control', 'data-tag': (d: Record<string, any>) => String(d.attributes?.tag ?? '') }, [slot('content')]));
  define('textBox', element('aside', { className: 'w-text-box' }, [slot('content')]));

  // ── Tables ─────────────────────────────────────────────────────────────────
  // A table takes its spacing from the paragraph scope as well as its own
  // formatting: `spacingBefore`/`spacingAfter` reach it through the document
  // defaults, and dropping them here would put a gap in the rendered document
  // that the layout does not know about.
  define(
    'bTable',
    element(
      'table',
      {
        className: 'w-table',
        style: (d: Record<string, any>, env?: RenderEnv) => ({ ...blockStyle(d, env), ...formatFor(d, 'table', env) })
      },
      [slot('content')]
    )
  );
  define('bTableHeader', element('thead', { className: 'w-thead' }, [slot('content')]));
  define('bTableBody', element('tbody', { className: 'w-tbody' }, [slot('content')]));
  define('bTableFooter', element('tfoot', { className: 'w-tfoot' }, [slot('content')]));
  define('bTableRow', element('tr', { className: 'w-tr' }, [slot('content')]));

  // Spans are attributes on the surviving cell; the cells it swallowed are gone
  // from the model, so nothing else has to be emitted here.
  const cellAttrs = {
    className: 'w-cell',
    colspan: (d: Record<string, any>) => d.attributes?.colspan ?? 1,
    rowspan: (d: Record<string, any>) => d.attributes?.rowspan ?? 1,
    style: (d: Record<string, any>, env?: RenderEnv) => {
      const styles = getWordStyles(env);
      return styles ? tableCellCss(styles.resolveNode(d as never, 'table')) : {};
    }
  };
  define('bTableCell', element('td', { ...cellAttrs }, [slot('content')]));
  define('bTableHeaderCell', element('th', { ...cellAttrs }, [slot('content')]));

  // ── Inline ─────────────────────────────────────────────────────────────────
  define('inline-text', element('span', { className: 'w-text' }, [data('text', '')]));
  define('inline-image', element('img', {
    className: 'w-image',
    src: (d: Record<string, any>) => String(d.attributes?.src ?? ''),
    alt: (d: Record<string, any>) => String(d.attributes?.alt ?? '')
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


/**
 * How a tracked change is drawn.
 *
 * Word's conventions: an insertion is underlined, a deletion struck through, a
 * moved passage double-struck where it left and double-underlined where it
 * arrived, and a formatting change marked without touching the text. All of them
 * in the author's colour, because a document revised by three people is only
 * readable if each one looks different.
 *
 * A deletion is drawn rather than removed. That is the whole point of tracking:
 * the reader has to see what was taken out in order to accept or reject it.
 */
function registerRevisionMarks(): void {
  const revision = (
    kind: string,
    className: string,
    style: (color: string) => Record<string, string>
  ) => {
    // Registered through define rather than defineMark: a mark that depends on a
    // value — here the author — has to be a function, and defineMark's helper
    // expects a static template to inject its class into. The registry key is
    // the same one defineMark would have used.
    define(
      `mark:${kind}`,
      (props: Record<string, any>) => {
        // The mark's own attributes, which the renderer hands over as
        // `attributes` — the author is on the mark, not on the text run.
        const attrs = (props?.attributes ?? {}) as Record<string, unknown>;
        const color = authorColor(typeof attrs?.author === 'string' ? attrs.author : undefined);
        return element(
          'span',
          {
            className,
            title: revisionTitle(className.replace('w-', ''), attrs),
            'data-author': String(attrs?.author ?? ''),
            style: { color, ...style(color) }
          },
          [data('text')]
        );
      }
    );
  };

  revision('insertion', 'w-insertion', () => ({ textDecoration: 'underline' }));
  revision('deletion', 'w-deletion', () => ({ textDecoration: 'line-through' }));
  revision('moveFrom', 'w-move-from', () => ({ textDecoration: 'line-through double' }));
  revision('moveTo', 'w-move-to', () => ({ textDecoration: 'underline double' }));
  revision('formatChange', 'w-format-change', (color) => ({
    // The text itself is untouched: what changed is how it looks, so the marker
    // has to sit beside it rather than on it.
    borderBottom: `1px dotted ${color}`
  }));
}


/**
 * Marks that carry a value, drawn with it.
 *
 * A mark whose meaning is fixed renders fine as the class the engine already
 * gives it. One that carries a value does not: `mark-fontSize` cannot say eleven
 * points. These read the value and put it in the style, going through the same
 * character-formatting mapping the style cascade uses so that a mark and a style
 * cannot disagree about what eleven points means.
 */
function registerValuedMarks(): void {
  for (const type of VALUED_MARKS) {
    define(`mark:${type}`, (props: Record<string, any>, _model: any, ctx: any) => {
      const attrs = (props?.attributes ?? {}) as Record<string, unknown>;
      const styles = getWordStyles(ctx?.env as RenderEnv | undefined);

      return element(
        'span',
        {
          className: `mark-${type}`,
          ...markAttributes(type, attrs),
          style: markCss(type, attrs, styles)
        },
        [data('text')]
      );
    });
  }
}
