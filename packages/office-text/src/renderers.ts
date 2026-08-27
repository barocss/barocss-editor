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
import { characterCss, rowClipHeight, tableCellCss, tableRowCss, twipToCss } from './css';
import {
  getWordDocument,
  getWordFields,
  getWordNow,
  getWordStyles,
  getTab
} from './text-context';
import { formatDateField } from './date-field';
import { leaderStyle } from './tabs';
import { imageCss } from './image-layout';
import { blockLanguage, blockStyle, formatFor, listMarker } from './renderers/block-style';
import { cellBorders, cellMargins, gridOf, tableElementCss } from './table-format';
import { cellPlacementOf, cellStyleLayers, rowFormat, tableStyleLayer } from './table-style';
import { registerRevisionMarks, registerValuedMarks } from './renderers/marks';
import { registerMathRenderers } from './math-renderers';

/**
 * Register every Word renderer in the global DSL registry.
 *
 * Idempotent, so a hot reload or a second editor on the page does not double
 * register.
 */
export function registerTextRenderers(): void {
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

  /**
   * The document's title and author are read, never drawn.
   *
   * They are a definition, like a style or a numbering scheme: `{ TITLE }` puts
   * the title where the document says it should appear, and that is the only
   * place it belongs on the page. Drawing a second copy above the first sheet
   * made it look like a stray heading in the document, and — since it sat
   * inside the editing surface — a click put the caret in it and typing changed
   * the title while looking like body text.
   *
   * Editing it is a thing a reader does *to the document*, not *in* it, so it
   * belongs in the application's chrome. `apps/word` puts it above the ribbon,
   * where a word processor usually keeps the file's name.
   */
  define('docMeta', element('div', { className: 'w-def w-def-docMeta', style: { display: 'none' } }));
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
        /**
         * The language the block is in.
         *
         * On the block as well as on its runs, because hyphenation is a block
         * property and a browser hyphenates by dictionary: `hyphens: auto` with
         * no language does nothing at all. A block takes the language its first
         * run names, which is the whole of it for any paragraph not written in
         * two languages at once.
         */
        'lang': (d: Record<string, any>, env?: RenderEnv) => blockLanguage(d, env),
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
        /**
         * The language the block is in.
         *
         * On the block as well as on its runs, because hyphenation is a block
         * property and a browser hyphenates by dictionary: `hyphens: auto` with
         * no language does nothing at all. A block takes the language its first
         * run names, which is the whole of it for any paragraph not written in
         * two languages at once.
         */
        'lang': (d: Record<string, any>, env?: RenderEnv) => blockLanguage(d, env),
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
  /**
   * Code, kept as it was typed.
   *
   * `pre` is doing the work: the whitespace is literal because that is what the element means, which
   * is also why the schema does not declare a second answer to the same question. `spellcheck` is
   * off because a spell checker underlines every identifier in a program.
   *
   * **Not tokenized.** A document has no language to tokenize by and no panel to say one in, so this
   * draws the characters and nothing else. A *page* publishes code for people to read and overrides
   * this with a Prism-drawn one — which is where the dependency stays, rather than in a kit two
   * products would carry it for nothing.
   */
  define(
    'codeBlock',
    element(
      'pre',
      {
        className: 'w-code',
        spellcheck: 'false',
        'data-language': (d: Record<string, any>) => String(d.attributes?.language ?? '')
      },
      [slot('content')]
    )
  );


  /**
   * A hard break the author put in, and the reason it has to read its push.
   *
   * Every other block gets its position from `blockStyle`, which asks the layout
   * how far down the page it should be pushed. These two were drawn as bare
   * `<div>`s and asked nothing — and a break is *exactly* the block that needs
   * to: the paginator ends the page before it and makes the break the first
   * fragment of the next one, so the push that moves the flow onto that page is
   * set on the break's own sid. Nothing applied it, so nothing moved.
   *
   * Measured before the fix: a paragraph at y=427, the break it was split by at
   * 469, and the second half at 482 — all three on the first sheet, with the
   * document one page taller and no break anywhere on it.
   */
  define(
    'pageBreak',
    element('div', {
      className: 'w-page-break',
      role: 'separator',
      style: (d: Record<string, any>, env?: RenderEnv) => blockStyle(d, env)
    })
  );
  define(
    'columnBreak',
    element('div', {
      className: 'w-column-break',
      role: 'separator',
      style: (d: Record<string, any>, env?: RenderEnv) => blockStyle(d, env)
    })
  );
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
   * nowhere, so they become a `<colgroup>`. `tableElementCss` is what turns the rest of
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
          ...tableElementCss(format)
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
      const style = tableRowCss(format);

      /**
       * A header group holds its cells directly and is one row, so it draws one.
       *
       * The schema says a `bTableHeader` contains `bTableHeaderCell+` with no row
       * between — "a header IS a row", as `collectRows` puts it — and this drew
       * that shape literally: `<thead>` with `<th>` children. Browsers render it,
       * which is why it went unnoticed, and it is not HTML: a `<thead>` may
       * contain only rows. Anything reading the table as a table — a screen
       * reader, `querySelectorAll('tr')`, a copy to another application — sees a
       * header of no rows.
       *
       * The `<tr>` is drawn here rather than added to the model, because it is
       * not in the document: the row is the header, and inventing a node for it
       * would be the renderer changing what the document says.
       */
      if (tag === 'thead') {
        return element('thead', { className, style }, [
          element('tr', { className: 'w-tr' }, [slot('content')])
        ]);
      }

      return element(tag, { className, style }, [slot('content')]);
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
  /**
   * A run, and the two things it says that are not CSS.
   *
   * `lang` is the language the text is in — read by the two things that need a
   * dictionary and cannot guess: hyphenation, which is why `hyphenationAuto`
   * alone does nothing, and the browser's spell checker. Word keeps a separate
   * tag for East Asian text; one element takes one language, so the Latin one
   * is the tag.
   *
   * `noProof` is Word's "do not check spelling or grammar" — a code sample, a
   * product name, a phrase in another language. Both are written only when the
   * run asks, so an ordinary run inherits whatever is above it.
   */
  define(
    'inline-text',
    element(
      'span',
      {
        className: 'w-text',
        // Quoted: real HTML attributes, and not ones the template's typed
        // attribute list knows about.
        'lang': (d: Record<string, any>) =>
          typeof d.attributes?.lang === 'string' && d.attributes.lang.length > 0
            ? d.attributes.lang
            : undefined,
        'spellcheck': (d: Record<string, any>) =>
          d.attributes?.noProof === true ? 'false' : undefined
      } as never,
      [data('text', '')]
    )
  );

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


