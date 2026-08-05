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
  type CssStyle
} from './css';
import { getBlockPush, getWordLayout, getWordNumbering, getWordStyles } from './render-context';
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
  define('resources', element('div', { className: 'w-resources', style: { display: 'none' } }, [slot('content')]));

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

    const sheets = (layout?.pages ?? []).map((page) => {
      const { height, width, gap } = layout!.metrics;
      return element('div', {
        className: 'w-sheet',
        // Keyed, because a node's sid is stamped onto every element of its
        // template: without a key all the sheets share the surface's id, and
        // reconciliation cannot tell the second page from the third.
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
        // Decorative and inert: the caret must never land on a page sheet, and a
        // click meant for the text must not be caught by it.
        element(
          'div',
          {
            className: 'w-sheets',
            contenteditable: 'false',
            'aria-hidden': 'true',
            style: { position: 'absolute', inset: '0', pointerEvents: 'none' }
          },
          sheets
        ),
        slot('content')
      ]
    );
  });

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
  define('tableOfContents', element('nav', { className: 'w-toc' }, [slot('content')]));

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
  define('tab', element('span', { className: 'w-tab' }));
  define('noBreakHyphen', element('span', { className: 'w-nbhyphen' }, [data('text', '‑')]));
  define('softHyphen', element('span', { className: 'w-shyphen' }));
  define('noteNumber', element('sup', { className: 'w-note-number' }, [slot('content')]));
}
