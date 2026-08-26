/**
 * The marks Word draws over text.
 *
 * Separated from the node renderers because a mark is a different kind of
 * thing: it covers a range rather than being one, and what it contributes is
 * decided by the character formatting it maps onto rather than by a template.
 */
import { data, define, element } from '@barocss/dsl';
import type { RenderEnv } from '@barocss/dsl';
import { getWordStyles } from '../text-context';
import { authorColor, revisionTitle } from '../revisions';
import { markAttributes, markCss, VALUED_MARKS } from '../mark-format';

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
export function registerRevisionMarks(): void {
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
/**
 * A link, as a link.
 *
 * ## What was there instead
 *
 * The `link` mark has been in the standard schema since it was written — `href` required, `title`
 * optional — and `toggleLink` has been a registered command for as long. It drew **nothing**: marks
 * become `<span class="mark-…">` with whatever `mark-format.ts` maps, and `link` is in none of its
 * three tables. So a reader could select text, run the command, and get a span.
 *
 * Measured on the site builder's own sample, which is where it showed: five pages with addresses, a
 * navigation row reading 제품 · 가격 · 소개 · 블로그, and **zero `<a>` elements on the page**. The
 * blue words in the hero are a `fontColor` mark — they look like a link and are not one.
 *
 * ## Why the harness did not catch it
 *
 * Every check it has asks about **node** types and their attributes. A mark is neither, so a mark
 * that draws nothing is invisible to all eight — the same shape of blind spot as an attribute the
 * probe could not invent a value for, one vocabulary along. `every-mark-is-drawn` is the sibling
 * check, and this is what it found first.
 *
 * ## An `<a>`, and what it must not do
 *
 * A real anchor, because half of what a link *is* lives in the element: a keyboard reaches it, a
 * screen reader announces it, a middle click opens it elsewhere, and the status bar says where it
 * goes. A styled span has none of that and cannot be given it.
 *
 * But this is an **editor**: the anchor must not navigate while a reader is editing the words inside
 * it. `draggable="false"` stops the browser turning a text drag into a link drag, and the app's own
 * handler decides what a click means — which is why the href is on the element (a published page is
 * the same drawing) and the behaviour is not.
 */
function registerLinkMark(): void {
  define('mark:link', (props: Record<string, any>) => {
    const attrs = (props?.attributes ?? {}) as Record<string, unknown>;
    const href = typeof attrs.href === 'string' ? attrs.href : '';
    const title = typeof attrs.title === 'string' && attrs.title ? attrs.title : undefined;

    return element(
      'a',
      {
        className: 'mark-link',
        href,
        title,
        /*
         * A text drag inside a link is a *selection*, not a drag of the link. The browser's default
         * is the other one, and it makes a paragraph with a link in it the one paragraph a reader
         * cannot select across.
         */
        draggable: 'false'
      },
      [data('text')]
    );
  });
}

export function registerValuedMarks(): void {
  registerLinkMark();

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
