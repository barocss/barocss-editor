/**
 * **The shape a picture keeps**, whatever width it is given.
 *
 * ## Why a height does not answer this
 *
 * `minHeight` arrived for a divider, a spacer and a hit area — blocks whose height *is* a number. A
 * picture in a page's column is a different question: it is 1200 wide on a laptop and 350 on a phone,
 * and what a designer means by "this is a banner" is a **ratio**. Stating a height instead is how a
 * hero ends up letterboxed at one width and cropped at the other, which is the fault that looks like
 * a design decision.
 *
 * ## Why the list is short
 *
 * Six, and every one of them is a shape somebody names out loud: a wide banner, a video's frame, a
 * photograph, a square, a portrait, a tall card. A free `w/h` field would be a second place to type a
 * number that has to agree with the design, and every builder that offers one ends up with a page of
 * `1.7778`.
 *
 * `''` is the file's own shape, which is what the element's `width` and `height` already reserve —
 * so silence costs nothing and this changed no existing page.
 */

/** The shapes a picture can be asked to keep. `''` is the file's own. */
export const ASPECTS = ['', '21/9', '16/9', '3/2', '1/1', '3/4', '9/16'] as const;

/** What a panel calls each of them — a shape is named by what it is *for*, not by its arithmetic. */
export const ASPECT_LABELS: { id: string; label: string }[] = [
  { id: '', label: '그림 그대로' },
  { id: '21/9', label: '가로 띠 (21:9)' },
  { id: '16/9', label: '와이드 (16:9)' },
  { id: '3/2', label: '사진 (3:2)' },
  { id: '1/1', label: '정사각 (1:1)' },
  { id: '3/4', label: '세로 (3:4)' },
  { id: '9/16', label: '세로 긴 (9:16)' }
];

/**
 * The CSS a stated shape becomes — nothing at all when none is stated.
 *
 * `aspect-ratio` and a `height: auto`, which is the pair that actually works: an `<img>` carrying
 * `width` and `height` attributes has those as its *presentational* size, and a ratio without the
 * height released is a box the browser sizes from the attribute instead. Measured everywhere this
 * has ever been written and forgotten by most of them.
 */
export function aspectCss(attrs: { aspect?: unknown } | undefined): Record<string, string> {
  const said = attrs?.aspect;
  if (typeof said !== 'string' || !ASPECTS.includes(said as never) || !said) return {};
  return { aspectRatio: said, height: 'auto' };
}
