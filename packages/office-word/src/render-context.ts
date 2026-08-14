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
import type { TabLeader } from './tabs';
import { createStyleResolver, type StyleResolver } from './style-resolver';
import { createNumberingResolver, type NumberingResolver } from './numbering-resolver';
import { createFieldResolver, type FieldResolver } from './field-resolver';
import type { SurfaceLayout } from './layout';
import { pageNumberFor } from './page-furniture';

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
  /**
   * Where a block was split, and how far its remainder has to fall.
   *
   * A paragraph's split is drawn by the host as a widget at a text offset, but a
   * table has no text offset to hang one on — its breaks fall between rows, and
   * only the table's own template knows where its rows are. So the splits travel
   * with the environment and the renderer that owns them reads them.
   */
  splits: Map<string, { line: number; height: number }[]>;
  /**
   * The page number each block starts on — the number the page *shows*, not its
   * index.
   *
   * Wanted by the one piece of formatting that depends on which side of a bound
   * document a paragraph lands: `mirrorIndents` swaps a paragraph's indents on
   * a left-hand page, because they are really an inside and an outside indent
   * and the inside is the edge the binding is on. The shown number rather than
   * the index for the same reason headers use it — a section that restarts its
   * numbering restarts which side it is on.
   */
  pageNumbers: Map<string, number>;
  /** Absolute position per block, for sections whose text runs in columns. */
  positions: Map<string, { top: number; left: number; width: number }>;
  /**
   * How wide each tab has to be, and what fills it.
   *
   * A tab is an instruction to reach the next stop, so its width depends on
   * where it sits — which is only known once the line has been measured. Empty
   * until it has been, and a tab with no entry draws as nothing, which is what
   * a tab looked like before any of this existed.
   */
  tabs: Map<string, { width: number; leader: TabLeader }>;

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
  now?: Date,
  tabs: Map<string, { width: number; leader: TabLeader }> = new Map()
): WordEnv {
  const pushes = new Map<string, number>();
  const positions = new Map<string, { top: number; left: number; width: number }>();
  const splits = new Map<string, { line: number; height: number }[]>();
  const pageNumbers = new Map<string, number>();
  const styles = createStyleResolver(doc);

  for (const [surfaceSid, layout] of layouts) {
    for (const [sid, push] of layout.pushBySid) pushes.set(sid, push);
    for (const [sid, position] of layout.positionBySid) positions.set(sid, position);
    for (const [sid, blockSplits] of layout.splitBySid) splits.set(sid, blockSplits);

    // A section owns the numbering, so the shown number is its question to
    // answer — and each section answers it for the blocks it holds.
    const surface = doc.getNode(surfaceSid);
    const format = surface ? styles.resolveNode(surface as never, 'paragraph') : {};
    for (const [sid, index] of layout.pageOfBlock) {
      pageNumbers.set(sid, pageNumberFor(index, format as never));
    }
  }

  return {
    doc,
    styles,
    numbering: createNumberingResolver(doc),
    fields: createFieldResolver(doc),
    layouts,
    pushes,
    positions,
    splits,
    pageNumbers,
    tabs,
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

/**
 * Where this block was split by the pagination, if it was.
 *
 * `line` counts the block's own lines — for a table, its rows — and is the index
 * of the first line on the *next* page.
 */
export function getWordSplits(
  env: RenderEnv | undefined,
  sid: string
): { line: number; height: number }[] {
  return wordEnv(env)?.splits.get(sid) ?? [];
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

/**
 * The page number the block starts on, as the page shows it.
 *
 * Undefined before the first layout, which is when nothing has been placed yet
 * and every question about a page has no answer.
 */
export function getBlockPageNumber(env: RenderEnv | undefined, sid: string): number | undefined {
  return wordEnv(env)?.pageNumbers?.get(sid);
}

/** How wide a tab has to be, once the line it is on has been measured. */
export function getTab(
  env: RenderEnv | undefined,
  sid: string
): { width: number; leader: TabLeader } | undefined {
  return wordEnv(env)?.tabs?.get(sid);
}

/** How far the block opening a page must be pushed to reach its sheet. */
export function getBlockPush(env: RenderEnv | undefined, sid: string): number | undefined {
  return wordEnv(env)?.pushes.get(sid);
}
