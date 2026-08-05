/**
 * The document a Word renderer is currently drawing.
 *
 * DSL templates receive the node being rendered, not the document around it —
 * but a paragraph's appearance depends on things that are not in the node: the
 * style it points at, the document defaults behind that style, the list counter
 * that precedes it, and the page its text reached. Resolving those needs the
 * whole document.
 *
 * That environment now travels with the render. It is put in when the view is
 * built and read back out of the context the renderer hands every template, so
 * its scope is the view — which is what it always should have been. It used to
 * be module state, which quietly meant one document per module instance: two
 * editors on a page read each other's styles.
 *
 * Resolvers are built once per document rather than per node: numbering in
 * particular is a single ordered walk, and doing it per paragraph would make
 * rendering quadratic.
 */
import type { RenderEnv } from '@barocss/dsl';
import type { DocumentAccess } from './document-access';
import { createStyleResolver, type StyleResolver } from './style-resolver';
import { createNumberingResolver, type NumberingResolver } from './numbering-resolver';
import type { SurfaceLayout } from './layout';

/** The key Word's environment lives under, so that products cannot collide. */
export const WORD_ENV_KEY = 'word';

export interface WordEnv {
  doc: DocumentAccess;
  styles: StyleResolver;
  numbering: NumberingResolver;
  /** Layout per surface id. Empty until the document has been measured. */
  layouts: Map<string, SurfaceLayout>;
  /** Extra top margin per block, flattened from every surface's layout. */
  pushes: Map<string, number>;
}

/**
 * Build the environment for a document.
 *
 * Pass the result to the view as `env: { word: createWordEnv(doc) }`, and again
 * through `view.setEnv` whenever the document or its layout changes — the
 * resolvers cache, so rendering against a stale one silently shows old styles
 * and old list numbers.
 */
export function createWordEnv(
  doc: DocumentAccess,
  layouts: Map<string, SurfaceLayout> = new Map()
): WordEnv {
  const pushes = new Map<string, number>();
  for (const layout of layouts.values()) {
    for (const [sid, push] of layout.pushBySid) pushes.set(sid, push);
  }

  return {
    doc,
    styles: createStyleResolver(doc),
    numbering: createNumberingResolver(doc),
    layouts,
    pushes
  };
}

/** Word's environment, if this render has one. */
export function wordEnv(env: RenderEnv | undefined): WordEnv | undefined {
  return env?.[WORD_ENV_KEY] as WordEnv | undefined;
}

export function getWordStyles(env: RenderEnv | undefined): StyleResolver | undefined {
  return wordEnv(env)?.styles;
}

export function getWordNumbering(env: RenderEnv | undefined): NumberingResolver | undefined {
  return wordEnv(env)?.numbering;
}

export function getWordDocument(env: RenderEnv | undefined): DocumentAccess | undefined {
  return wordEnv(env)?.doc;
}

export function getWordLayout(
  env: RenderEnv | undefined,
  surfaceSid: string
): SurfaceLayout | undefined {
  return wordEnv(env)?.layouts.get(surfaceSid);
}

/** How far the block opening a page must be pushed to reach its sheet. */
export function getBlockPush(env: RenderEnv | undefined, sid: string): number | undefined {
  return wordEnv(env)?.pushes.get(sid);
}
