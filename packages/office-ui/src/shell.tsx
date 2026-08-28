import { TipProvider } from './tip';
import type React from 'react';
import { cn } from './cn';

/**
 * The window's frame: chrome across the top, a row of panes below it, and
 * something along the bottom.
 *
 * ## What is actually shared
 *
 * Both products in this suite have the same regions and had two copies of
 * the arithmetic that makes them work. Measured — the declarations were identical:
 *
 * ```css
 * .w-shell  / .sl-shell  { display: flex; flex-direction: column; height: 100%; min-height: 0 }
 * .w-shell-body / .sl-body { display: flex; flex: 1; min-height: 0 }
 * ```
 *
 * It is a small amount of CSS and every line of it is a line people get wrong.
 * `min-height: 0` on a flex child is the whole difference between a pane that
 * scrolls and a pane that pushes the window taller than the screen — the default
 * `min-height: auto` refuses to shrink below its content — and `min-width: 0` on
 * the middle region is the same fault sideways, which is what stops a wide table
 * from shoving the right-hand pane off the screen. Neither is discoverable from
 * the symptom, and both were written twice.
 *
 * The regions are also the thing a third product copies. Word uses four of the
 * five; a deck uses all five, with the timeline along the bottom.
 *
 * ## Layout only, and the product keeps its own names
 *
 * No colours, no padding, no borders — those are what make Word look like Word
 * and a deck look like a deck, and a frame that carried them would be a frame
 * with a house style. What is here is `display`, `flex` and the two
 * `min-*: 0`s.
 *
 * And every one of these takes a `className` that lands on the same element, so a
 * product keeps `.w-shell-document` and `.sl-main` exactly where they were. That
 * is not only politeness about churn: those class names are what Word's ruler and
 * its zoom find the scrolling pane by, and what a dozen browser tests select. A
 * shared frame that renamed them would be a shared frame that broke three files
 * to save eight CSS declarations.
 *
 * ## Composed rather than slotted
 *
 * Five props holding five subtrees reads as a configuration object; these read as
 * the window:
 *
 * ```tsx
 * <AppShell className="w-shell">
 *   <AppChrome className="w-chrome">…</AppChrome>
 *   <AppBody className="w-shell-body">
 *     <OutlinePane />
 *     <AppMain className="w-shell-document">…</AppMain>
 *     <CommentsPane />
 *   </AppBody>
 * </AppShell>
 * ```
 *
 * It also means a product can put a pane in a region without this file growing a
 * prop for it, and that the order of the panes in a row is where it looks.
 */

interface Region {
  className?: string;
  children?: React.ReactNode;
  /** For a region a product needs to find or label. */
  id?: string;
  /**
   * Which element this region is, when a `div` is the wrong answer.
   *
   * A window's chrome is a `<header>` and the thing being worked on is a
   * `<main>`, and those are not decoration: they are how a screen reader's
   * landmark navigation offers "skip to the main content". A frame that rendered
   * five anonymous `div`s would have quietly taken that away from both products —
   * a deck's shell already used `<header>` and `<main>` before this existed.
   */
  as?: 'div' | 'header' | 'main' | 'footer' | 'aside' | 'section' | 'nav';
  /** What a screen reader calls this region, where the element does not say. */
  label?: string;
  /** Product state a stylesheet keys off — a deck dims its chrome while presenting. */
  data?: Record<string, string>;
}

/** The common half of all five: an element, the frame's classes, and the caller's. */
function region(
  { as = 'div', className, children, id, label, data }: Region,
  frame: string
) {
  const Element = as;
  return (
    <Element
      id={id}
      aria-label={label}
      className={cn(frame, className)}
      {...Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]))}
    >
      {children}
    </Element>
  );
}

/**
 * The window: a column that is exactly as tall as its container and no taller.
 *
 * `height: 100%` with `min-height: 0`, which is the pair that makes everything
 * inside able to scroll rather than grow.
 */
export function AppShell(props: Region) {
  /*
   * And the **tooltip provider**, once for the window.
   *
   * It is what makes the second tooltip open instantly after the first — the behaviour that
   * separates a tooltip a reader tolerates from one they use — and it has to be an ancestor of every
   * control that shows one. A ribbon had its own; the eye in a layer row, the × on a pane and every
   * other `IconButton` in three products had the browser's `title` instead. Here a product gets it
   * without knowing, and nested providers are legal so `Toolbar` keeps its own.
   */
  return <TipProvider>{region(props, 'flex h-full min-h-0 flex-col')}</TipProvider>;
}

/**
 * The chrome across the top — a title, a ribbon, a ruler.
 *
 * As tall as it needs and never any taller: `flex: 0 0 auto`, so a ribbon that
 * reflows onto a second row takes the room from the document rather than from
 * itself.
 */
export function AppChrome(props: Region) {
  return region(props, 'flex-none');
}

/**
 * The row of panes under the chrome, sharing the rest of the window.
 *
 * `align-items: stretch` is the default and is stated anyway, because a pane that
 * is shorter than its neighbours reads as a bug in the pane rather than in the
 * row.
 */
export function AppBody(props: Region) {
  return region(props, 'flex min-h-0 flex-1 items-stretch');
}

/**
 * The middle of that row: the document, the canvas, the thing being worked on.
 *
 * `min-width: 0` is the load-bearing declaration. Without it a wide document — a
 * table, a canvas magnified past the pane — refuses to shrink below its content
 * and pushes the pane on its right off the screen, with no scrollbar anywhere and
 * nothing in the styles to suggest why.
 *
 * Whether it scrolls is the product's: Word's centre is the one thing that
 * scrolls, and a deck's is a column holding a stage above its notes.
 */
export function AppMain(props: Region) {
  return region(props, 'min-w-0 flex-1');
}

/*
 * There is no `AppFooter`, deliberately.
 *
 * A deck has a fifth region — the timeline along the bottom — and it does not want
 * a wrapper: `.sl-timeline` already carries `flex: none`, and its height is
 * `max-height: 70%` *of the window*, which a `flex-none` box between them would
 * turn into 70% of a box sized by its own content. So the product's own pane is
 * the region, which is the honest arrangement and one component fewer that nothing
 * has drawn.
 *
 * The place it goes is still worth stating: **after** the row, not inside it. A
 * timeline inside the centre column is the document's timeline in the layout as
 * well as in the model and gets half the width it needs; below the row, the side
 * panes stop at its top edge and dragging it taller takes room from everything.
 */
