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
import { layoutSurface, sheetMetrics, type SurfaceLayout } from './layout';
import { measureBlocks, type MeasureOptions } from './measurement';
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

export function createWordLayoutPass(options: WordLayoutPassOptions): () => RenderEnv {
  const { container, doc, onLayout, ...measureOptions } = options;

  return () => {
    // Rebuilt per pass rather than cached: the resolvers memoise, so one held
    // across an edit would resolve against the document as it used to be.
    const styles = createStyleResolver(doc);
    const layouts = new Map<string, SurfaceLayout>();

    for (const el of Array.from(container.querySelectorAll(SURFACE_SELECTOR))) {
      const sid = el.getAttribute(SID_ATTR);
      if (!sid || !doc.getNode(sid)) continue;

      const node = doc.getNode(sid)!;
      const metrics = sheetMetrics(styles.resolveNode(node, 'page'));
      const blocks = measureBlocks(el as HTMLElement, doc, styles, measureOptions);
      layouts.set(sid, layoutSurface(blocks, metrics));
    }

    onLayout?.(layouts);
    return { [WORD_ENV_KEY]: createWordEnv(doc, layouts) };
  };
}
