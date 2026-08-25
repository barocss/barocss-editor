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
export { createBlockCommands, SiteBlockExtension } from './block-commands';
export { createDataCommands, SiteDataExtension } from './data-commands';
export { createElementCommands, SiteElementExtension } from './element-commands';
/** The definitions a site holds, and what a builder needs to know about one. */
export { definitionAt, definitionOf, definitionsOf, usesOf, type Definition } from './components';
/**
 * What a reader can reach — the keys and the toolbar, as **data in the package**.
 *
 * Kept here rather than in the app because `every-command-can-be-reached` reads them: a binding the
 * check cannot look at is a binding nothing holds to anything, which is how two commands came to be
 * registered, working and unreachable.
 */
export {
  SITE_KEYS,
  matchesSiteKey,
  siteKeyCommands,
  siteKeyFor,
  type SiteKey
} from './keymap';
export {
  SITE_TOOLBAR,
  siteControlsIn,
  siteToolbarCommands,
  siteToolbarIcons,
  type SiteControl
} from './toolbar-model';
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
 * The page a visitor gets.
 *
 * A **render**, not a second implementation — the same renderers into a detached element — which is
 * what makes comparing the export with the editor's drawing a real check rather than a tautology.
 */
export { cssFor, drawnHtml, exportPage, exportSite, mediaRules, type ExportedPage } from './export-html';
/** Where a carried block would land — which stack, which place, and the line a reader steers by. */
export { landingFor, type Box, type Landing } from './landing';
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
  CONTAINERS,
  childOfScope,
  contentIndexFor,
  dropTarget,
  isInside,
  enclosing,
  firstRunIn,
  innermostOf,
  isTextual,
  kindOfBlock,
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
