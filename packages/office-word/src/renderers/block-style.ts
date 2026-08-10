/**
 * Turning a node into the CSS it is drawn with.
 *
 * Shared by every renderer that draws a block, which is why it is here rather
 * than inside any one of them: a paragraph, a heading, a list item and a quote
 * all resolve their formatting the same way, and a table adds to it.
 */
import type { RenderEnv } from '@barocss/dsl';
import { characterCss, paragraphCss, tableCss, twipToCss, type CssStyle } from '../css';
import { getBlockPosition, getBlockPush, getWordNumbering, getWordStyles } from '../render-context';
import { INDENT_STEP as LIST_INDENT_STEP } from '../list-commands';


/** Resolved formatting for a node, or nothing when no document is set. */
export function formatFor(
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
export function blockStyle(node: Record<string, any>, env: RenderEnv | undefined): CssStyle {
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
export function listMarker(node: Record<string, any>, env: RenderEnv | undefined): string {
  const numbering = getWordNumbering(env);
  const sid = node.sid as string | undefined;
  if (!numbering || !sid) return '';
  const item = numbering.numberFor(sid);
  if (!item) return '';
  const separator = item.suffix === 'space' ? ' ' : item.suffix === 'nothing' ? '' : ' ';
  return `${item.text}${separator}`;
}
