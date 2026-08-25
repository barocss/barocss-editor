/**
 * A **site**: pages of stacked sections, drawn by the browser and exported as HTML.
 *
 * The third product, and the one this month's work was for. What it is made of is written in
 * `docs/specs/site-builder.md`; what it *adds* is small enough to list here — an address on a page,
 * an intent on a stack's child, a renderer for a page that scrolls rather than paginates, and three
 * insert commands. Everything else is `@barocss/office-text` and `@barocss/office-canvas`.
 */
export { getSiteSchemaDefinition, SIZING, SITE_SURFACE_KIND, type Sizing } from './site-schema';
export { registerSiteRenderers } from './renderers';
export { sizingCss, type Sized } from './sizing';
export {
  BASE_BREAKPOINT,
  OVERRIDABLE,
  attrsAt,
  overriddenAt,
  overrideFaults,
  overridesOf,
  withOverride,
  type OverrideMap
} from './responsive';
export { createSiteEditor, createSiteExtensions, createSiteOwnExtensions, type SiteEditorOptions } from './site-kit';
export { createStackCommands, SiteStackExtension, type InsertStackOptions } from './stack-commands';
export { createSampleSite } from './sample-site';
/**
 * A list that comes from data — the product grid, the blog index, the team page.
 *
 * One dataset, one placement, and `field:` where a value goes. The binding is the deck's, unchanged.
 */
export {
  FIELD_PREFIX,
  cellValue,
  collectionFaults,
  datasetNamed,
  datasetsOf,
  fieldNameOf,
  isFieldRef,
  rowsOf,
  valuesForRow,
  type Dataset,
  type RowQuery
} from './data';
export { collectionRows, installSiteResolution, templateOf } from './collection-resolution';
/**
 * What a click means on a page: the outermost block, one level in, or the caret.
 *
 * The product's own answer to the one question a builder has and a document does not — and kept out
 * of the app, where it could not be tested without a browser.
 */
export {
  SELECTABLE,
  TEXTUAL,
  blocksIn,
  documentSidOf,
  childOfScope,
  enclosing,
  firstRunIn,
  innermostOf,
  isTextual,
  labelOfBlock,
  outermostOf,
  pagesOf,
  pathFromPage,
  sidAtElement
} from './selection';
/**
 * Several widths at once, which is what a site builder is.
 *
 * One document, one editor, one history — and a view per width, each told through the env which one
 * it is. The deck's notes pane is the same mechanism; this is that, three times.
 */
export {
  BREAKPOINTS,
  SITE_ENV_KEY,
  breakpointOf,
  createSiteEnv,
  scopesFor,
  type BreakpointId,
  type SiteEnv
} from './breakpoints';
