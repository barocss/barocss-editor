/**
 * The **page** half of the environment a Word renderer draws with.
 *
 * The text half is `text-context.ts`, and the split is measured rather than aesthetic: when
 * `renderers.ts` became a text half and a page half, the text half still reached pagination, layout,
 * page furniture and the contents page — through this file, because `createWordEnv` computes page
 * numbers. Counting what the text renderers actually read gave `styles`, `numbering`, `fields`, `doc`
 * and `getTab`, and nothing else; `layouts`, `pushes`, `splits`, `pageNumbers` and `positions` are
 * all a page's answers.
 *
 * So `WordEnv` **extends** `TextEnv` and lives under the same key. Word builds one and hands it over
 * as it always did; anything that only draws text can build the smaller one and never mention a page.
 */
import type { RenderEnv } from '@barocss/dsl';
import type { DocumentAccess } from '@barocss/office-text';
import type { TabLeader } from '@barocss/office-text';
import type { SurfaceLayout } from './layout';
import { pageNumberFor } from './page-furniture';
import { WORD_ENV_KEY, createTextEnv, type TextEnv } from '@barocss/office-text';

/**
 * The text half, re-exported.
 *
 * Everything that reads a style, a list number or a field goes on importing it from here, which is
 * where it has always been — the split is about what a *package* may take, not about making forty
 * call sites say a different file name.
 */
export {
  WORD_ENV_KEY,
  createTextEnv,
  textEnv,
  getWordStyles,
  getWordNumbering,
  getWordFields,
  getWordDocument,
  getWordNow,
  getTab,
  /**
   * The three a block's style asks and only a page answers — a bound document's mirrored indents,
   * a column's absolute position, and the push that takes the block opening a page down to its
   * sheet. They are read from the text side because the *asking* is text behaviour; a product with
   * no pages answers nothing, which is what a paragraph that sits where it falls looks like.
   */
  getBlockPush,
  getBlockPosition,
  getBlockPageNumber,
  type TextEnv
} from '@barocss/office-text';

/** What a **page** adds to the environment: everything the layout worked out. */
export interface WordEnv extends TextEnv {
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
   * The header or footer currently being edited, by its id.
   *
   * While one is being edited the copies drawn on the pages are suppressed and
   * the real node is shown in place of the first of them: several copies of one
   * node are the wrong thing to type into.
   */
  editing?: string;
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
  /*
   * The text half first, then what the pages worked out on top of it — which is the shape of the
   * whole environment now: a `WordEnv` *is* a `TextEnv` with the layout's answers added.
   */
  const text = createTextEnv(doc, now, tabs);
  const styles = text.styles;

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

  return { ...text, layouts, pushes, positions, splits, pageNumbers, editing };
}

/** Word's environment, if this render has one. */
export function wordEnv(env: RenderEnv | undefined): WordEnv | undefined {
  return env?.[WORD_ENV_KEY] as WordEnv | undefined;
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

