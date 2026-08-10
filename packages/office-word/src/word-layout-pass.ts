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
import type { LineAnchor } from './line-offsets';
import { createStyleResolver } from './style-resolver';
import { createWordEnv, WORD_ENV_KEY } from './render-context';
import { measureTabs, tabSignature } from './tab-layout';

/** A page break that falls inside a paragraph, as something to draw. */
export interface PageBreakWidget {
  sid: string;
  /** The model node and offset the break sits at. */
  target: LineAnchor;
  /** How far the text after it has to fall to reach the next page. */
  height: number;
}

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
  /** The instant date fields show; see createWordEnv. */
  now?: Date;
  /** The element the document is rendered into. */
  container: HTMLElement;
  doc: DocumentAccess;
  /** The header or footer being edited, if any, read afresh on every pass. */
  editing?: () => string | undefined;
  /**
   * A token that changes when the document does.
   *
   * The pass rebuilds the render environment, and the environment holds the
   * style, numbering and field resolvers — which cache, because resolving a
   * style walks a chain and numbering counts the whole document. So they have to
   * be rebuilt when the document changes, and the pass has no way of knowing
   * that: the only thing it compares is the layout, and a change can leave the
   * layout identical. Making a paragraph a bulleted list adds no height and
   * moves no page, so without this the list is in the document and invisible on
   * the page.
   *
   * The host supplies it because the host is what learns about content changes.
   */
  revision?: () => string | number;
  /** Called with the computed layouts, for hosts that want to inspect them. */
  onLayout?: (layouts: Map<string, SurfaceLayout>) => void;
  /**
   * Called with the page breaks that fall inside a paragraph, as widgets to
   * place. Empty unless `splitBlocks` is on.
   */
  onPageBreaks?: (breaks: PageBreakWidget[]) => void;
}

export function createWordLayoutPass(options: WordLayoutPassOptions): () => RenderEnv | void {
  const { container, doc, onLayout, onPageBreaks, editing, revision, now, ...measureOptions } = options;

  // What the last round produced. The view keeps running passes until they stop
  // reporting changes, and a layout that matches the one already on screen is
  // the signal to stop: without it, a pass that rebuilds its result every time
  // would look like a change forever.
  let previous: string | null = null;

  return () => {
    // Nothing is recomputed while the page is being printed.
    //
    // Pagination works by measuring what is on screen, and printing changes what
    // is on screen: the sheets are hidden, the section loses its padding to the
    // page box, and blocks placed by coordinate go back into the flow. Measured
    // then, the pass computes a *different* set of pages and rewrites the
    // document to match — so what came out of the printer depended on whether
    // the pass had run in print media yet, and the same document printed as
    // seven pages or ten.
    //
    // The pages were already decided. Printing is that decision honoured, and a
    // pass that re-decides during it is the one thing that can stop it being.
    if (container.ownerDocument?.defaultView?.matchMedia?.('print')?.matches) return;

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
    const pageBreaks: PageBreakWidget[] = [];

    for (const el of Array.from(container.querySelectorAll(SURFACE_SELECTOR))) {
      const sid = el.getAttribute(SID_ATTR);
      if (!sid || !doc.getNode(sid)) continue;

      const node = doc.getNode(sid)!;
      const metrics = sheetMetrics(styles.resolveNode(node, 'page'));
      const lineAnchors = new Map<string, LineAnchor[]>();
      const blocks = measureBlocks(el as HTMLElement, doc, styles, {
        ...measureOptions,
        footnoteHeights,
        footnoteSeparator: FOOTNOTE_SEPARATOR,
        onLineOffsets: (blockSid, anchors) => lineAnchors.set(blockSid, anchors)
      });

      const footnoteRefs = new Map<string, string[]>();
      for (const child of childrenOf(doc, node)) {
        if (!child.sid) continue;
        const refs = footnoteRefsIn(doc, child);
        if (refs.length > 0) footnoteRefs.set(child.sid, refs);
      }

      // Where this section sits in the container, which only a header being
      // edited needs — it is drawn from a sibling of the section.
      const sectionBox = (el as HTMLElement).getBoundingClientRect();
      const containerBox = container.getBoundingClientRect();
      const originTop = sectionBox.top - containerBox.top + container.scrollTop;
      const originLeft = sectionBox.left - containerBox.left + container.scrollLeft;

      const layout = layoutSurface(blocks, metrics, { footnoteRefs, originTop, originLeft });
      layouts.set(sid, layout);

      // A break inside a paragraph is a widget at a text offset, and the offset
      // is only known from the measurement: the layout says "after line three",
      // and which characters that is depends on where the lines fell.
      for (const [blockSid, splits] of layout.splitBySid) {
        const anchors = lineAnchors.get(blockSid);
        if (!anchors) continue;
        for (const [index, split] of splits.entries()) {
          const anchor = anchors[split.line - 1];
          if (!anchor) continue;
          // Identified by which break of this block it is, not by the line it
          // fell on. A line number changes with every character typed above it,
          // and an identity that changes means the widget is torn down and
          // rebuilt — which re-renders the paragraph and makes the observer read
          // the render as input.
          pageBreaks.push({
            sid: `page-break-${blockSid}-${index}`,
            target: anchor,
            height: split.height
          });
        }
      }
    }

    // Which furniture is being edited is part of what a render looks like, so a
    // change of mode has to count as a change even when the breaks did not move.
    onPageBreaks?.(pageBreaks);

    // Tabs are measured from the same render the pages were: a tab's width
    // depends on where its line put it, and that is only true of the page as it
    // currently stands.
    const tabs = measureTabs(container, doc, styles);

    const editingId = editing?.();
    const breakSignature = pageBreaks
      .map((item) => `${item.sid}@${item.target.sid}:${item.target.offset}+${Math.round(item.height)}`)
      .join(',');
    const signature = `${revision?.() ?? ''}|${editingId ?? ''}|${breakSignature}|${signatureOf(layouts)}|${tabSignature(tabs)}`;
    if (signature === previous) return;
    previous = signature;

    onLayout?.(layouts);
    return { [WORD_ENV_KEY]: createWordEnv(doc, layouts, editingId, now, tabs) };
  };
}

/**
 * What has to be the same for a layout to count as unchanged.
 *
 * Everything a render would look different for: where the breaks fall, how much
 * each page holds back for its notes, and which notes those are. The reservation
 * has to be in here — a round that changes only the reservation still moves the
 * blocks, and leaving it out made such a round report "nothing changed" and
 * throw its own result away, so footnotes reserved nothing whenever they did not
 * also happen to move a break.
 *
 * Rounded to whole pixels, because these come from the DOM: compared exactly,
 * sub-pixel noise would never match and the loop would run to its limit every
 * time.
 */
function signatureOf(layouts: Map<string, SurfaceLayout>): string {
  const parts: string[] = [];
  for (const [sid, layout] of layouts) {
    const breaks = layout.pages
      .map(
        (page) =>
          `${Math.round(page.reserved)}#` +
          page.fragments.map((f) => `${f.sid}:${f.fromLine}-${f.toLine}`).join(',')
      )
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
