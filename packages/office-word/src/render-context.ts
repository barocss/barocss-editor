/**
 * The document a Word renderer is currently drawing.
 *
 * DSL templates receive the node being rendered, not the document around it —
 * but a paragraph's appearance depends on things that are not in the node: the
 * style it points at, the document defaults behind that style, and the list
 * counter that precedes it. Resolving those needs the whole document.
 *
 * So the product parks the current document here and the templates read it. It
 * is module state, which is worth being uncomfortable about: it means one
 * document is being rendered at a time per module instance. That holds for an
 * editor (one document per page) and it is what lets the templates stay
 * declarative, but it is a seam to revisit if the DSL ever grows a context
 * channel of its own.
 *
 * Resolvers are rebuilt on `setWordDocument` rather than per node: numbering in
 * particular is a single ordered walk, and doing it per paragraph would make
 * rendering quadratic.
 */
import type { DocumentAccess } from './document-access';
import { createStyleResolver, type StyleResolver } from './style-resolver';
import { createNumberingResolver, type NumberingResolver } from './numbering-resolver';
import type { SurfaceLayout } from './layout';

interface WordRenderContext {
  doc: DocumentAccess | null;
  styles: StyleResolver | null;
  numbering: NumberingResolver | null;
  /** Layout per surface id. Empty until the document has been measured. */
  layouts: Map<string, SurfaceLayout>;
  /** Extra top margin per block, flattened from every surface's layout. */
  pushes: Map<string, number>;
}

const context: WordRenderContext = {
  doc: null,
  styles: null,
  numbering: null,
  layouts: new Map(),
  pushes: new Map()
};

/**
 * Point the renderers at a document and rebuild the resolvers.
 *
 * Call this whenever the document changes; the resolvers cache, so rendering
 * against a stale one silently shows old styles and old list numbers.
 */
export function setWordDocument(doc: DocumentAccess | null): void {
  context.doc = doc;
  context.styles = doc ? createStyleResolver(doc) : null;
  context.numbering = doc ? createNumberingResolver(doc) : null;
}

export function getWordStyles(): StyleResolver | null {
  return context.styles;
}

export function getWordNumbering(): NumberingResolver | null {
  return context.numbering;
}

export function getWordDocument(): DocumentAccess | null {
  return context.doc;
}

/**
 * Publish the measured layout so the templates can draw pages.
 *
 * Rendering is what produces the measurements this is computed from, so the
 * first render necessarily happens without it: the templates fall back to a
 * single continuous flow, which is also what a document renders as before it is
 * ever measured, and on a server where it cannot be.
 */
export function setWordLayout(layouts: Map<string, SurfaceLayout>): void {
  context.layouts = layouts;
  context.pushes = new Map();
  for (const layout of layouts.values()) {
    for (const [sid, push] of layout.pushBySid) context.pushes.set(sid, push);
  }
}

export function getWordLayout(surfaceSid: string): SurfaceLayout | undefined {
  return context.layouts.get(surfaceSid);
}

/** How far the block opening a page must be pushed to reach its sheet. */
export function getBlockPush(sid: string): number | undefined {
  return context.pushes.get(sid);
}
