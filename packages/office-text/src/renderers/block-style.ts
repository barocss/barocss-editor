/**
 * Turning a node into the CSS it is drawn with.
 *
 * Shared by every renderer that draws a block, which is why it is here rather
 * than inside any one of them: a paragraph, a heading, a list item and a quote
 * all resolve their formatting the same way, and a table adds to it.
 */
import type { RenderEnv } from '@barocss/dsl';
import { authorColor, revisionTitle } from '../revisions';
import {
  betweenBorderCss,
  characterCss,
  hyphenationCss,
  mirroredIndents,
  paragraphCss,
  tableCss,
  twipToCss,
  type CssStyle
} from '../css';
import {
  getBlockPageNumber,
  getBlockPosition,
  getBlockPush,
  getWordDocument,
  getWordNumbering,
  getWordStyles
} from '../text-context';
import { blockStyleLayers } from '../table-style';
import { sharedBorders, suppressedSpacing } from '../spacing';
import { childrenOf, documentSettings, type DocumentNode } from '../document-access';
import { INDENT_STEP as LIST_INDENT_STEP } from '../formatting';


/**
 * Resolved formatting for a node, or nothing when no document is set.
 *
 * `layers` are formats that apply to the node without being on it or on its
 * style — a table style's conditional formatting, which reaches a paragraph
 * through the cell it sits in. They apply under the node's direct formatting,
 * which is what keeps a table style from overruling something the user typed.
 */
export function formatFor(
  node: Record<string, any>,
  scope: 'paragraph' | 'character' | 'table',
  env: RenderEnv | undefined,
  layers: Array<Record<string, unknown> | undefined> = []
): CssStyle {
  const styles = getWordStyles(env);
  if (!styles) return {};
  const format = styles.resolveNodeWith(node as never, scope, layers);
  switch (scope) {
    case 'character':
      return characterCss(format);
    case 'table':
      return tableCss(format);
    default: {
      /**
       * The one piece of paragraph formatting that depends on where the
       * paragraph lands.
       *
       * `mirrorIndents` makes the left and right indents an inside and an
       * outside one, and the inside is the edge the binding is on — which
       * changes side every page. Nothing else here asks a question about the
       * page, which is why the swap happens at the last moment rather than in
       * the cascade.
       *
       * The paginator needs no part of it: the sum is unchanged, so the text is
       * exactly as wide and no line breaks anywhere else.
       */
      const page = getBlockPageNumber(env, String(node.sid ?? ''));

      /**
       * And whether a word may be broken at the end of a line.
       *
       * The switch is the *document's* and the exception is the paragraph's, so
       * neither is answerable from the cascade alone — `suppressAutoHyphens` is
       * a paragraph saying no to something only the document can have said yes
       * to.
       */
      const doc = getWordDocument(env);
      const auto = doc ? documentSettings(doc)?.attributes?.hyphenationAuto === true : false;

      return {
        ...paragraphCss(mirroredIndents(format, page !== undefined && page % 2 === 0)),
        ...hyphenationCss(auto, format)
      };
    }
  }
}

/**
 * A block's style is its paragraph formatting plus the character formatting that
 * applies to the whole block. Word keeps them separate (a paragraph mark carries
 * run properties); CSS does not, and inheritance does the rest.
 */
export function blockStyle(node: Record<string, any>, env: RenderEnv | undefined): CssStyle {
  // A block inside a table cell is formatted by the table's style as well as by
  // its own: that is where a header row's bold comes from.
  const layers = blockStyleLayers(getWordDocument(env), getWordStyles(env), node as never);

  const style: CssStyle = {
    ...formatFor(node, 'paragraph', env, layers),
    ...formatFor(node, 'character', env, layers)
  };

  // A block of the same style as its neighbour gives up the space between them,
  // which is what keeps a list from being a column of separated paragraphs. The
  // paginator asks the same question of the same rule, or the pages it computes
  // are taller than the ones the browser draws.
  const suppressed = suppressedSpacing(getWordDocument(env), getWordStyles(env), node as never);
  if (suppressed.before) style.marginTop = '0';
  if (suppressed.after) style.marginBottom = '0';

  /**
   * And the **fifth border**: one line where two bordered blocks meet, not two.
   *
   * A run of consecutive paragraphs asking for the same borders is one bordered box in Word. Drawing
   * each block's own top and bottom puts two lines between every pair, at twice the weight, with the
   * space between them showing through — which is what this did, because `borderBetween` was in the
   * schema and nothing read it. Twelve of Word's unread attributes were this one border.
   *
   * `sharedBorders` answers it, beside `suppressedSpacing` and for the same reason: it is a question
   * about the block's neighbours, and the paginator has to answer it the same way.
   */
  const shared = sharedBorders(getWordDocument(env), getWordStyles(env), node as never);
  if (shared.before || shared.after) {
    /*
     * The **format**, not the CSS. `formatFor` above returns what to draw with; the between border
     * has to be read off the resolved values, through the same layers, or it comes back undefined
     * and the shared edge is drawn as `none` — measured in a browser as `none 0px` where a dotted
     * rule belonged.
     */
    const between = betweenBorderCss(
      getWordStyles(env)?.resolveNodeWith(node as never, 'paragraph', layers) ?? {}
    );
    // The shared edge becomes the between border — or nothing, where the block asks for none, which
    // is Word's answer too: a bordered box with no `between` is one box with no rules inside it.
    if (shared.before) style.borderTop = between ?? 'none';
    if (shared.after) style.borderBottom = between ?? 'none';
  }

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
/**
 * What a block's own tracked revision is, for the renderer to draw — or nothing.
 *
 * ## The half of tracked changes nobody drew
 *
 * An insertion and a deletion of *text* are marks, and `registerRevisionMarks` has drawn them in the
 * author's colour since the feature was written. A revision of a **block** is not a mark, because
 * what it proposes is not about a range of characters: `revisionType: 'deletion'` on a paragraph is
 * Word's deleted paragraph mark — the boundary goes and this block joins the one after it.
 *
 * `recordParagraphMerge` writes exactly that, and **nothing anywhere read it.** So with 변경 내용
 * 추적 on, pressing Backspace at the start of a paragraph proposed the merge, recorded the author and
 * the date, and the screen showed nothing at all: the paragraphs stayed apart with no mark on them,
 * and a reviewer had no way to see there was anything to accept or reject.
 *
 * Found by `every-attribute-is-read` — 36 of its 185 findings were these four attributes on nine node
 * types, the single largest thing this product declares and does not look at.
 *
 * ## Why a data attribute and a colour rather than a decoration
 *
 * A block's revision is drawn in the **margin**, as a change bar, because the block's own text may
 * be untouched: a paragraph whose mark is deleted reads exactly as it did. `text.css` draws the bar
 * from `data-revision`, and the colour comes from `authorColor` — the same function the marks use,
 * so one reviewer is one colour whether they changed a word or a boundary.
 */
export function blockRevision(
  node: Record<string, any>
): { type: string; color: string; title: string } | undefined {
  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  if (typeof attrs.revisionId !== 'string' || attrs.revisionId.length === 0) return undefined;

  const type = typeof attrs.revisionType === 'string' ? attrs.revisionType : 'change';
  const author = typeof attrs.revisionAuthor === 'string' ? attrs.revisionAuthor : undefined;
  return {
    type,
    color: authorColor(author),
    title: revisionTitle(type, { author, date: attrs.revisionDate })
  };
}

/**
 * The two attributes and the colour variable a renderer needs to draw a block's revision.
 *
 * One helper rather than three lines repeated at every node that can carry one, because *nine* node
 * types can and the repetition is how six of them would be forgotten — which is exactly what
 * happened to all nine before this existed.
 */
export function revisionDrawing(node: Record<string, any>): {
  'data-revision': string;
  title: string;
  style: Record<string, string>;
} {
  const revision = blockRevision(node);
  return {
    'data-revision': revision?.type ?? '',
    title: revision?.title ?? '',
    style: revision ? { '--w-revision': revision.color } : {}
  };
}

/**
 * Which kind of list this is — the fallback marker, for a product with no numbering definitions.
 *
 * Beside `listMarker` because they are the two halves of one question and they answer it in a fixed
 * order: a definition in `resources` resolves to a marker's *text*, and where there is none this says
 * what the list is so CSS can draw a plain bullet or a counter. Word takes the first path and
 * everything else takes the second, and until this existed the second drew nothing at all.
 *
 * A list with nothing said about it is a bullet list, which is what `wrapInList`'s own default
 * writes and what every editor of this kind means by an unqualified list.
 */
export function listTypeOf(node: Record<string, any>): string {
  const type = (node?.attributes ?? {}).type;
  return typeof type === 'string' && type.length > 0 ? type : 'bullet';
}

export function listMarker(node: Record<string, any>, env: RenderEnv | undefined): string {
  const numbering = getWordNumbering(env);
  const sid = node.sid as string | undefined;
  if (!numbering || !sid) return '';
  const item = numbering.numberFor(sid);
  if (!item) return '';
  const separator = item.suffix === 'space' ? ' ' : item.suffix === 'nothing' ? '' : ' ';
  return `${item.text}${separator}`;
}

/**
 * The language a block is in, and whether its spelling is checked.
 *
 * Both are *run* properties in Word — `lang` and `noProof` sit on the character
 * formatting — and both are needed above the text in a browser. Hyphenation is
 * a block property and hyphenates by dictionary, so `hyphens: auto` without a
 * language does nothing at all; and the spell checker reads the nearest `lang`
 * and `spellcheck` it can find.
 *
 * A block takes what its first run says, which is the whole of it for any
 * paragraph not written in two languages at once. Putting them on the runs was
 * tried and the renderer drew the source of the function as the attribute's
 * value — see the note on `inline-text`.
 */
function firstRunFormat(
  node: Record<string, any>,
  env: RenderEnv | undefined
): Record<string, unknown> | undefined {
  const doc = getWordDocument(env);
  const styles = getWordStyles(env);
  if (!doc || !styles) return undefined;

  const find = (current: DocumentNode | undefined, depth: number): DocumentNode | undefined => {
    if (!current || depth > 32) return undefined;
    if (typeof (current as { text?: unknown }).text === 'string') return current;
    for (const child of childrenOf(doc, current)) {
      const found = find(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };

  const run = find(node as never, 0);
  return run ? (styles.resolveNode(run, 'character') as Record<string, unknown>) : undefined;
}

export function blockLanguage(
  node: Record<string, any>,
  env: RenderEnv | undefined
): string | undefined {
  const lang = firstRunFormat(node, env)?.lang;
  return typeof lang === 'string' && lang.length > 0 ? lang : undefined;
}
