// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { listTypeOf } from '../src/renderers/block-style';

/**
 * What a list says about itself, so something can draw a marker for it.
 *
 * ## The two ways a list gets its marker, and the gap between them
 *
 * Word numbers a list from a **definition in `resources`**: `listItem` draws `data-marker` from
 * `numberFor(sid)`, the resolver reads the definition, and the text of the marker is computed. That
 * is the right model for a word processor, where two lists can share a numbering and a third can
 * restart it.
 *
 * Every other product uses the shared `toggleBulletList` / `toggleOrderedList`, and `wrapInList`
 * writes `type` on the list and **no `numId` on anything**. So the resolver had nothing to resolve,
 * the marker was the empty string, and a list on a page drew **no bullet and no number at all**.
 *
 * The deck hit exactly this and fixed it in `slides.css`, from a `data-list-type` its own renderer
 * writes. The lesson stayed in one product for months while the shared renderer went on drawing a
 * plain `div` — so a page inherited the fault, and so would the next product.
 *
 * This is the shared half: the renderer says which kind of list it is, and `text.css` draws a marker
 * from that **only where `data-marker` is empty**, so a resolved number always wins.
 */
describe('a list says which kind it is', () => {
  it('draws the type the schema declares and `wrapInList` writes', () => {
    expect(listTypeOf({ attributes: { type: 'ordered' } })).toBe('ordered');
    expect(listTypeOf({ attributes: { type: 'bullet' } })).toBe('bullet');
  });

  /*
   * A list with nothing said about it is a bullet list, which is what every editor of this kind
   * means by an unqualified list — and what `wrapInList`'s own default writes.
   */
  it('falls back to a bullet when nothing says otherwise', () => {
    expect(listTypeOf({ attributes: {} })).toBe('bullet');
    expect(listTypeOf({})).toBe('bullet');
    expect(listTypeOf({ attributes: { type: 42 } })).toBe('bullet');
    expect(listTypeOf({ attributes: { type: '' } })).toBe('bullet');
  });
});
