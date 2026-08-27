/**
 * How a block **arrives as a visitor scrolls to it**.
 *
 * ## Why this is CSS and not a script
 *
 * Every site builder does scroll reveals with an `IntersectionObserver` that adds a class, and this
 * one does not, for the reason `states.ts` already spent a paragraph on: the export **carries no
 * script**, and that is a property rather than an omission. A published page that has to run our
 * function to look right is a page that breaks behind a strict content policy, in a reader who has
 * scripts off, and in every crawler that renders without them.
 *
 * `animation-timeline: view()` is the browser's own answer to the same question, and it was measured
 * before this file was written rather than assumed: a keyframe animation whose clock is *how far
 * this element has entered the viewport*. No observer, no class, no hydration.
 *
 * ## Which means it scrubs, and that is the honest trade
 *
 * A scroll-driven animation is **tied to scroll position**, so scrolling back up plays it backwards.
 * That is not what everybody means by "등장" — most builders fire once and stay — and it cannot be
 * had in pure CSS today: fire-once needs a trigger, which needs a script or `animation-trigger`,
 * which is too new to publish against.
 *
 * It is worth saying which one this is rather than pretending the difference away. Scrubbed is what
 * the Apple-style scroll pages do, it never jumps, and it costs nothing to run. Fire-once is in the
 * backlog with what it would take.
 *
 * ## Two rules that are not optional
 *
 * - **`@supports`**, because the hidden half of every one of these is `opacity: 0`. A browser that
 *   does not know `view()` would apply the start state and never advance it — a page whose content
 *   is invisible forever. Guarded, an old browser simply gets the page.
 * - **`prefers-reduced-motion`**, because a page that moves for somebody who asked it not to is not
 *   a design decision. The whole block is dropped, which leaves the content visible.
 */

/** A way of arriving, and the two halves of the keyframe it is. */
export interface RevealKind {
  id: string;
  /** The deck's own word for it — see the schema for why the vocabulary is shared. */
  label: string;
  /** What the block looks like before it has arrived. The end is always "itself". */
  from: string;
}

/**
 * The five, by the names the deck already uses.
 *
 * `translate` and `opacity` and `filter` only — never a `width`, a `height` or a `margin`. The rule
 * is the same one the hover transition follows and it is arithmetic rather than taste: a property
 * that changes layout makes the browser lay the page out again on every scroll frame, and a page
 * that reflows while a visitor scrolls is a page that stutters. These three are the compositor's.
 */
export const REVEALS: readonly RevealKind[] = [
  { id: 'rise', label: '부드럽게 올라오기', from: 'opacity: 0; translate: 0 24px;' },
  { id: 'slideIn', label: '옆에서 밀려오기', from: 'opacity: 0; translate: -32px 0;' },
  { id: 'pop', label: '톡 튀어나오기', from: 'opacity: 0; scale: 0.92;' },
  { id: 'focusIn', label: '흐린 데서 나타내기', from: 'opacity: 0; filter: blur(8px);' },
  { id: 'appearSlowly', label: '천천히 나타나기', from: 'opacity: 0;' }
];

export const REVEAL_IDS: readonly string[] = REVEALS.map((one) => one.id);

/** What a reader chose, or nothing when the block says nothing this file knows. */
export function revealOf(attrs: Record<string, unknown> | undefined): RevealKind | undefined {
  const said = attrs?.reveal;
  return typeof said === 'string' ? REVEALS.find((one) => one.id === said) : undefined;
}

/**
 * The keyframes, once for the whole page.
 *
 * One `@keyframes` per kind rather than one per block: five rules whatever a page holds, and a
 * hundred sections choosing 부드럽게 올라오기 share the one definition. What differs per block is
 * only which animation it names, which is a single declaration.
 */
export const REVEAL_KEYFRAMES = REVEALS.map(
  (one) => `@keyframes st-${one.id} { from { ${one.from} } }`
).join('\n');

/**
 * **Where the arrival happens**, as a scroll range.
 *
 * `entry 0%` is the moment the block's top edge crosses the bottom of the scrollport; `entry 100%`
 * is the moment its bottom edge does — the block fully in view. Between those two the animation
 * plays, driven by the scroll and by nothing else, and 70% is where it finishes so that a reader has
 * watched it arrive rather than watching it still arriving.
 *
 * ## Why it ends inside `entry` and not in `cover`
 *
 * Measured, and it is the kind of thing only a browser says: the first version ended at `cover 30%`
 * — a third of the way through the block covering the window — and **the last block on a page never
 * finished arriving**. There is no scroll left underneath it, so that point is unreachable, and the
 * block sat at 14% opacity forever. A page's footer is the one thing on it that is always last.
 *
 * Everything in the `entry` phase is reachable for every block including the last, because a
 * scroller's end still brings its final element fully into view. That is the property worth having,
 * and it is not obvious from reading the specification.
 *
 * Chosen rather than offered, which is this round's scope: it is the knob a designer would want
 * second, and one range that reads well at every page length is the honest first version.
 */
const RANGE = 'entry 0% entry 70%';

/** The one declaration a block carrying a reveal gets. */
export function revealDeclaration(kind: RevealKind): string {
  return `animation: st-${kind.id} linear both; animation-timeline: view(); animation-range: ${RANGE};`;
}

/**
 * A block's reveal as CSS, guarded both ways — or nothing at all when it has none.
 *
 * Both guards wrap **every** rule rather than the stylesheet, because the rules are written per
 * block and a page holds a mix: a section that arrives and a header that does not.
 */
export function revealRule(selector: string, kind: RevealKind, important = false): string {
  const said = important
    ? revealDeclaration(kind).replace(/;/g, ' !important;')
    : revealDeclaration(kind);
  return [
    '@supports (animation-timeline: view()) {',
    '  @media (prefers-reduced-motion: no-preference) {',
    `    ${selector} { ${said} }`,
    '  }',
    '}'
  ].join('\n');
}
