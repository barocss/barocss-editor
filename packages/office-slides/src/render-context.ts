/**
 * What a deck's renderers need to know that the node does not say.
 *
 * A node carries what it *is*; a view carries where it is being drawn. The two
 * are different questions and the second one belongs here, scoped to the view —
 * module-level state would mean one answer per module, so two editors on a page
 * would read each other's.
 *
 * Word has the same seam for the same reason (`WORD_ENV_KEY`), and a deck's
 * renderers already travel on it: a slide's text is Word's text and resolves
 * its formatting through Word's environment.
 */
export const SLIDES_ENV_KEY = 'slides';

export interface SlidesEnv {
  /**
   * That this view is the notes region.
   *
   * A `surfaceNote` lives in `resources` and is rendered by the whole-document
   * pass like every other resource, so it needs to know whether the pass it is
   * in is the one meant to show it. Without this the note is drawn under the
   * slide, by the stage, which renders everything the document holds.
   *
   * The same shape as a header being edited in Word: one node, drawn hidden
   * where it does not belong and visibly where it does, rather than two nodes
   * that can disagree.
   */
  showsNotes?: boolean;
  /**
   * Where every connector goes, worked out by the layout pass.
   *
   * On the environment rather than in the document because a route is **derived**: it
   * depends on the shapes a line joins, the shapes in the way and any line an end holds
   * — none of which are the connector's own node, which is why the view had no reason to
   * redraw it when they changed. See `connector-pass.ts`.
   *
   * Absent for a render with no pass — a thumbnail built before the deck is loaded, a
   * test rendering one node — and the renderer works the route out itself there.
   */
  routes?: Map<string, { x: number; y: number }[]>;
}

/** Whether the view being rendered is the one that shows notes. */
export function showsNotes(env: Record<string, unknown> | undefined): boolean {
  return (env?.[SLIDES_ENV_KEY] as SlidesEnv | undefined)?.showsNotes === true;
}
