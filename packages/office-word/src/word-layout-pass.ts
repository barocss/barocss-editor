/**
 * Word's layout pass: measure the rendered document, decide where the pages
 * break, and hand the result back as the environment for the next render.
 *
 * This is the whole measure → break → place loop in one place. It used to live
 * in the application, which meant every product that needs geometry — a slide
 * fitting text to a shape, a board routing a connector between two boxes — would
 * hand-wire the same thing again, and each would get the termination argument
 * slightly wrong.
 *
 * It terminates because applying the result cannot change what it measured: the
 * layout moves blocks with a top margin, and a top margin cannot change where a
 * line breaks. Only the width can, and pagination never touches it.
 */
import type { RenderEnv } from '@barocss/dsl';
import type { DocumentAccess } from './document-access';
import { footnoteRefsIn } from './footnotes';
import { layoutSurface, sheetMetrics, type SurfaceLayout } from './layout';
import { measureBlocks, type MeasureOptions } from './measurement';
import { FOOTNOTE_SEPARATOR } from './page-furniture';
import { childrenOf } from './document-access';
import { createStyleResolver } from './style-resolver';
import { createWordEnv, WORD_ENV_KEY } from './render-context';

/** The DOM attribute the renderer stamps each node's id onto. */
const SID_ATTR = 'data-bc-sid';

/**
 * Sections are found by class rather than by node type.
 *
 * renderer-dom does not stamp the node type onto the element, and a product
 * knows its own renderers — this is the class its own surface template emits.
 */
const SURFACE_SELECTOR = '.w-surface';

export interface WordLayoutPassOptions extends MeasureOptions {
  /** The element the document is rendered into. */
  container: HTMLElement;
  doc: DocumentAccess;
  /** Called with the computed layouts, for hosts that want to inspect them. */
  onLayout?: (layouts: Map<string, SurfaceLayout>) => void;
}

export function createWordLayoutPass(options: WordLayoutPassOptions): () => RenderEnv | void {
  const { container, doc, onLayout, ...measureOptions } = options;

  // What the last round produced. The view keeps running passes until they stop
  // reporting changes, and a layout that matches the one already on screen is
  // the signal to stop: without it, a pass that rebuilds its result every time
  // would look like a change forever.
  let previous: string | null = null;

  return () => {
    // Rebuilt per pass rather than cached: the resolvers memoise, so one held
    // across an edit would resolve against the document as it used to be.
    const styles = createStyleResolver(doc);
    const layouts = new Map<string, SurfaceLayout>();

    // Read back the notes drawn by the previous pass. Their height depends on
    // the width they were drawn at, which pagination never changes — so this is
    // measured once and does not chase itself: the first pass reserves nothing
    // because nothing has been drawn, the second reserves what it measured, and
    // the third would measure the same thing again.
    const footnoteHeights = measureFootnotes(container);

    for (const el of Array.from(container.querySelectorAll(SURFACE_SELECTOR))) {
      const sid = el.getAttribute(SID_ATTR);
      if (!sid || !doc.getNode(sid)) continue;

      const node = doc.getNode(sid)!;
      const metrics = sheetMetrics(styles.resolveNode(node, 'page'));
      const blocks = measureBlocks(el as HTMLElement, doc, styles, {
        ...measureOptions,
        footnoteHeights,
        footnoteSeparator: FOOTNOTE_SEPARATOR
      });

      const footnoteRefs = new Map<string, string[]>();
      for (const child of childrenOf(doc, node)) {
        if (!child.sid) continue;
        const refs = footnoteRefsIn(doc, child);
        if (refs.length > 0) footnoteRefs.set(child.sid, refs);
      }

      layouts.set(sid, layoutSurface(blocks, metrics, { footnoteRefs }));
    }

    const signature = signatureOf(layouts);
    if (signature === previous) return;
    previous = signature;

    onLayout?.(layouts);
    return { [WORD_ENV_KEY]: createWordEnv(doc, layouts) };
  };
}

/**
 * What has to be the same for a layout to count as unchanged.
 *
 * Where the breaks fall and which notes sit on which page — the things a render
 * would look different for. Heights are deliberately excluded: they are measured
 * from the DOM and carry sub-pixel noise that would never compare equal, so
 * including them would keep the loop running until it hit its limit every time.
 */
function signatureOf(layouts: Map<string, SurfaceLayout>): string {
  const parts: string[] = [];
  for (const [sid, layout] of layouts) {
    const breaks = layout.pages
      .map((page) => page.fragments.map((f) => `${f.sid}:${f.fromLine}-${f.toLine}`).join(','))
      .join('|');
    const notes = [...layout.footnotesByPage]
      .map(([page, ids]) => `${page}=${ids.join('+')}`)
      .join(',');
    parts.push(`${sid}{${breaks}}[${notes}]`);
  }
  return parts.join(';');
}

/** Attribute a drawn footnote body carries so its height can be read back. */
const FOOTNOTE_ID_ATTR = 'data-footnote';

/**
 * Heights of the footnote bodies the previous pass drew.
 *
 * Empty on the first pass, when nothing has been drawn yet — which is correct
 * rather than a gap: reserving a guessed height would move the breaks somewhere
 * the next pass has to move them back from.
 */
function measureFootnotes(container: HTMLElement): Map<string, number> {
  const heights = new Map<string, number>();
  for (const el of Array.from(container.querySelectorAll(`[${FOOTNOTE_ID_ATTR}]`))) {
    const id = el.getAttribute(FOOTNOTE_ID_ATTR);
    if (!id || heights.has(id)) continue;
    heights.set(id, el.getBoundingClientRect().height);
  }
  return heights;
}
