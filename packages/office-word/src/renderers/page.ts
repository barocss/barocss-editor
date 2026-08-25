/**
 * A **page**, and everything that only exists because a document has pages.
 *
 * ## Why this is its own file
 *
 * `docs/SHARED-LAYER.md` asked for it, and the reason is a dependency rather than a taste: the text
 * renderers and `surface` lived in one file, so importing the first dragged in the second — and with
 * it pagination, layout, table pagination, page furniture, line numbers and the contents page. About
 * 1,400 lines of page machinery that a deck has no use for and, being renderers, cannot tree-shake
 * away.
 *
 * So the boundary was never a refactor of a package. It was a split of one file, and this is that
 * half: the section drawn as the sheets its text reached, the header and footer while they are being
 * edited, the back matter, and the contents page — the four things that read the layout.
 *
 * The other half draws text and shapes and knows nothing about pages, which is what makes it
 * shareable at all.
 */
import { define, element, slot } from '@barocss/dsl';
import type { RenderEnv } from '@barocss/dsl';
import { flowCss } from '../css';
import {
  getEditingFurniture,
  getFurniturePlacement,
  getWordDocument,
  getWordLayout,
  getWordNumbering,
  getWordStyles
} from '../render-context';
import {
  documentSettings,
  indexResources,
  type DocumentAccess,
  type DocumentNode
} from '../document-access';
import { tocEntries, tocPageNumber } from '../toc';
import {
  footnoteAreaTemplate,
  furnitureFor,
  furnitureTemplate,
  lineNumberTemplate,
  pageNumberFor
} from '../page-furniture';
import { lineNumberingOf } from '../line-numbers';
import { blockStyle } from './block-style';

import { childrenOf } from '../document-access';

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
 * The page renderers, registered by `registerWordRenderers`.
 *
 * A function rather than a module side effect, like every other group here: registering is
 * something a product decides to do, and a file that did it on import would decide for everyone who
 * touched it.
 */
export function registerPageRenderers(): void {

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

    /**
     * The chapter headings this section numbers its pages by, if it does.
     *
     * Word's `1-1`: the page number with its chapter's number in front, which is
     * how a manual is numbered so a chapter can be reprinted without renumbering
     * the book. Found once for the section rather than once per page per header —
     * it is a walk over every block, and a header is drawn twice a page.
     *
     * Built only when the section asks. `pageNumberChapterStyle` names the
     * heading style whose headings start chapters, and a document that names
     * none pays nothing.
     */
    const chapterStyle =
      typeof format.pageNumberChapterStyle === 'string' ? format.pageNumberChapterStyle : '';
    const chapters =
      chapterStyle && doc
        ? tocEntries({
            doc,
            // This renderer's node *is* the section, so there is nothing to find.
            surface: node as never,
            // Every level: which heading *starts* a chapter is decided by the
            // style it carries, not by how deep it is.
            levels: '1-9',
            styleFilter: chapterStyle,
            pageOfBlock: layout?.pageOfBlock
          })
        : [];

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
            placement,
            chapters,
            numbering: getWordNumbering(env)
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
            /**
             * Which heading this line stands for.
             *
             * The entry is a *drawing* of that heading — every character of it
             * is computed — so a click on it is a request to go there rather
             * than a request to edit here. The host wires that; what the
             * renderer owes is the answer to "there".
             */
            'data-toc-target': entry.sid,
            style: {
              paddingLeft: `${(entry.level - 1) * 1.5}em`,
              /**
               * No caret in computed text.
               *
               * A caret here is a caret nowhere: the entry belongs to no node
               * the user can edit, so a click landed on the table of contents
               * itself with an offset into text it does not hold, and the
               * caret was then drawn against a different entry. Typing did
               * nothing and looked like a bug in typing.
               */
              userSelect: 'none'
            }
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
}
