/**
 * The document a **text** renderer is currently drawing.
 *
 * DSL templates receive the node being rendered, not the document around it — but a paragraph's
 * appearance depends on things that are not in the node: the style it points at, the document
 * defaults behind that style, and the list counter that precedes it. Resolving those needs the whole
 * document, so the document travels with the render, put in when the view is built and read back out
 * of the context handed to every template. Its scope is the view, which is what it always should have
 * been: it used to be module state, which quietly meant one document per module instance, and two
 * editors on a page read each other's styles.
 *
 * ## Why this is a file of its own
 *
 * Measured, when `renderers.ts` was split into a text half and a page half: the text half still
 * reached pagination, layout, page furniture and the contents page, **all of it through the env
 * channel** — `createWordEnv` computes page numbers, so importing the environment imported the
 * pages.
 *
 * And most of it did not need to. Measured again, by counting what the text half actually reads:
 * `styles`, `numbering`, `fields`, `doc` and `getTab` — and, in `blockStyle` and nowhere else,
 * three page answers (see `getBlockPush` below). It never touches `layouts` or `splits`, which are
 * the paginator's own working.
 *
 * So the environment is two things wearing one name. This is the half that names no page;
 * `render-context.ts` adds the rest and keeps the key, so a `WordEnv` is still a `TextEnv` and every
 * caller of both is unchanged.
 */
import type { RenderEnv } from '@barocss/dsl';
import type { DocumentAccess } from './document-access';
import type { TabLeader } from './tabs';
import { createStyleResolver, type StyleResolver } from './style-resolver';
import { createNumberingResolver, type NumberingResolver } from './numbering-resolver';
import { createFieldResolver, type FieldResolver } from './field-resolver';

/**
 * The key the environment lives under, so that products cannot collide.
 *
 * Still `'word'`, and still named `WORD_ENV_KEY`, because it is what a deck, a page and every test
 * already say — renaming it would be forty edits to make a string literal read better, and the
 * literal is what two products have agreed on rather than a claim about either.
 */
export const WORD_ENV_KEY = 'word';

/** What drawing **text** needs beyond the node: the document, and the resolvers built from it. */
export interface TextEnv {
  doc: DocumentAccess;
  styles: StyleResolver;
  numbering: NumberingResolver;
  fields: FieldResolver;
  /**
   * How wide each tab has to be, and what fills it.
   *
   * A tab is an instruction to reach the next stop, so its width depends on where it sits — which is
   * only known once the line has been measured. Empty until it has been, and a tab with no entry
   * draws as nothing, which is what a tab looked like before any of this existed.
   */
  tabs: Map<string, { width: number; leader: TabLeader }>;
  /**
   * The instant a date field shows.
   *
   * Supplied by the host rather than read from the clock: a renderer that reads the clock produces
   * different output on two runs, which no test can pin down and which makes the layout look changed
   * on every pass.
   */
  now?: Date;
}

/**
 * The resolvers for a document, built once.
 *
 * Numbering in particular is a single ordered walk, and doing it per paragraph would make rendering
 * quadratic.
 */
export function createTextEnv(
  doc: DocumentAccess,
  now?: Date,
  tabs: Map<string, { width: number; leader: TabLeader }> = new Map()
): TextEnv {
  return {
    doc,
    styles: createStyleResolver(doc),
    numbering: createNumberingResolver(doc),
    fields: createFieldResolver(doc),
    tabs,
    now
  };
}

/** The environment, whatever else a product has added to it. */
export function textEnv(env: RenderEnv | undefined): TextEnv | undefined {
  return (env as Record<string, unknown> | undefined)?.[WORD_ENV_KEY] as TextEnv | undefined;
}

export function getWordStyles(env: RenderEnv | undefined): StyleResolver | undefined {
  return textEnv(env)?.styles;
}

export function getWordNumbering(env: RenderEnv | undefined): NumberingResolver | undefined {
  return textEnv(env)?.numbering;
}

export function getWordFields(env: RenderEnv | undefined): FieldResolver | undefined {
  return textEnv(env)?.fields;
}

export function getWordDocument(env: RenderEnv | undefined): DocumentAccess | undefined {
  return textEnv(env)?.doc;
}

export function getWordNow(env: RenderEnv | undefined): Date | undefined {
  return textEnv(env)?.now;
}

/**
 * The three questions a block's style asks that **only a page can answer**.
 *
 * Measured, and it corrected an earlier count that had said the text half never reads page state:
 * `blockStyle` does, in three places — `mirrorIndents` needs to know which side of a bound document
 * the paragraph landed on, a section running in columns positions every block absolutely, and the
 * block that opens a page is pushed down to meet its sheet.
 *
 * They live here rather than with the pages because the *asking* is text behaviour: a product with
 * no pages hands over an environment with none of these in it, gets `undefined`, and draws a
 * paragraph that sits where it falls. Read defensively for exactly that reason — a `TextEnv` has no
 * `pushes` map at all, and `?.pushes.get()` would have thrown rather than answered nothing.
 */
export function getBlockPush(env: RenderEnv | undefined, sid: string): number | undefined {
  return (textEnv(env) as { pushes?: Map<string, number> } | undefined)?.pushes?.get(sid);
}

export function getBlockPosition(
  env: RenderEnv | undefined,
  sid: string
): { top: number; left: number; width: number } | undefined {
  return (
    textEnv(env) as { positions?: Map<string, { top: number; left: number; width: number }> } | undefined
  )?.positions?.get(sid);
}

export function getBlockPageNumber(env: RenderEnv | undefined, sid: string): number | undefined {
  return (textEnv(env) as { pageNumbers?: Map<string, number> } | undefined)?.pageNumbers?.get(sid);
}

export function getTab(
  env: RenderEnv | undefined,
  sid: string
): { width: number; leader: TabLeader } | undefined {
  return textEnv(env)?.tabs?.get(sid);
}
