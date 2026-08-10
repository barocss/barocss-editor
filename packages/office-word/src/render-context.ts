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
import { createFieldResolver, type FieldResolver } from './field-resolver';
import type { SurfaceLayout } from './layout';

/** The key Word's environment lives under, so that products cannot collide. */
export const WORD_ENV_KEY = 'word';

export interface WordEnv {
  doc: DocumentAccess;
  styles: StyleResolver;
  numbering: NumberingResolver;
  fields: FieldResolver;
  /** Layout per surface id. Empty until the document has been measured. */
  layouts: Map<string, SurfaceLayout>;
  /** Extra top margin per block, flattened from every surface's layout. */
  pushes: Map<string, number>;
  /** Absolute position per block, for sections whose text runs in columns. */
  positions: Map<string, { top: number; left: number; width: number }>;

  /**
   * The header or footer currently being edited, by its id.
   *
   * While one is being edited the copies drawn on the pages are suppressed and
   * the real node is shown in place of the first of them: several copies of one
   * node are the wrong thing to type into.
   */
  editing?: string;
  /**
   * The instant a date field shows.
   *
   * Supplied by the host rather than read from the clock: a renderer that reads
   * the clock produces different output on two runs, which no test can pin down
   * and which makes the layout look changed on every pass.
   */
  now?: Date;
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
  layouts: Map<string, SurfaceLayout> = new Map(),
  editing?: string,
  now?: Date
): WordEnv {
  const pushes = new Map<string, number>();
  const positions = new Map<string, { top: number; left: number; width: number }>();
  for (const layout of layouts.values()) {
    for (const [sid, push] of layout.pushBySid) pushes.set(sid, push);
    for (const [sid, position] of layout.positionBySid) positions.set(sid, position);
  }

  return {
    doc,
    styles: createStyleResolver(doc),
    numbering: createNumberingResolver(doc),
    fields: createFieldResolver(doc),
    layouts,
    pushes,
    positions,
    editing,
    now
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

export function getWordFields(env: RenderEnv | undefined): FieldResolver | undefined {
  return wordEnv(env)?.fields;
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

/** The instant a date field should show, if the host supplied one. */
export function getWordNow(env: RenderEnv | undefined): Date | undefined {
  return wordEnv(env)?.now;
}

/** The header or footer being edited, if any. */
export function getEditingFurniture(env: RenderEnv | undefined): string | undefined {
  return wordEnv(env)?.editing;
}

/**
 * Where the real node should appear while it is being edited: the place the
 * first page's drawn copy would have occupied.
 */
export function getFurniturePlacement(
  env: RenderEnv | undefined,
  id: string,
  placement: 'header' | 'footer'
): { left: number; top: number; width: number } | undefined {
  const word = wordEnv(env);
  if (!word || !id || word.editing !== id) return undefined;

  // The first page's copy is the one replaced: editing the header of page 4 and
  // of page 1 are the same edit, so there is no reason to prefer a later one.
  const layout = [...word.layouts.values()][0];
  if (!layout) return undefined;

  // In the container's coordinates, not the section's: this is rendered from
  // `resources`, which is the section's sibling rather than its parent.
  const { metrics } = layout;
  return {
    left: layout.originLeft + metrics.marginLeft,
    top:
      layout.originTop +
      (placement === 'header' ? metrics.marginTop / 2 : metrics.height - metrics.marginBottom),
    width: metrics.width - metrics.marginLeft - metrics.marginRight
  };
}

/** Where a block sits when its section runs in columns. */
export function getBlockPosition(
  env: RenderEnv | undefined,
  sid: string
): { top: number; left: number; width: number } | undefined {
  return wordEnv(env)?.positions.get(sid);
}

/** How far the block opening a page must be pushed to reach its sheet. */
export function getBlockPush(env: RenderEnv | undefined, sid: string): number | undefined {
  return wordEnv(env)?.pushes.get(sid);
}
