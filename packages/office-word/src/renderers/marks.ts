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
export function registerValuedMarks(): void {
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
