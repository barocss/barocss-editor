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
export { iconForBlock, siteLayerIcons } from './layer-icons';
export { PAGE_CSS } from './page-css';
/**
 * A code block, tokenized by Prism and drawn as elements — the same markup in the editor and on the
 * published page, with no script to run.
 */
export { CODE_CSS, codeComponent, grammarFor } from './code-render';
export { REVEALS, REVEAL_IDS, REVEAL_KEYFRAMES, revealOf, revealRule, type RevealKind,
  revealRangeFor
} from './reveal';
export { createLinkCommands, SiteLinkExtension } from './link-commands';
export { createPageCommands, SitePageExtension } from './page-commands';
/**
 * **The widths a site is designed at**, as a list the document holds.
 *
 * It was a `const` with three entries, so a fourth board — or two, or a phone that is 360 — was
 * unsayable. A width is a **node** because it is referred to by name: every `overrides` key is one.
 */
export { createWidthCommands, SiteWidthExtension } from './width-commands';
export { DEVICES, deviceNamed, deviceMatches, iconForWidth, type Device } from './devices';
export {
  PAGE_PREFIX,
  addressFor,
  addressLinkOf,
  hrefFor,
  linkOf,
  isPageRef,
  linkFaults,
  linksTo,
  pageIdOf,
  pageLinkOf,
  pageRef,
  pagesIn
} from './page-link';
export {
  SITE_PANEL,
  sitePanelAttrs,
  sitePanelCommands,
  sitePanelIcons,
  sitePanelGroups,
  sitePanelRows,
  type SitePanelControl,
  type SitePanelRow,
  type SitePanelTab
} from './panel-model';
export { createElementCommands, SiteElementExtension } from './element-commands';
/** The definitions a site holds, and what a builder needs to know about one. */
export {
  boundVarOf,
  definitionAt,
  definitionOf,
  definitionsOf,
  freshPartId,
  partIdsIn,
  scopeOf,
  usesOf,
  type Definition
} from './components';
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
  siteSlashItems,
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
export {
  collectionRows,
  installSiteResolution,
  previewForRow,
  rowCountOf,
  rowLabelsOf,
  rowPreviewOf,
  setRowPreview,
  templateOf,
  type RowPreview
} from './collection-resolution';
/**
 * The page a visitor gets.
 *
 * A **render**, not a second implementation — the same renderers into a detached element — which is
 * what makes comparing the export with the editor's drawing a real check rather than a tautology.
 */
export {
  cssFor,
  drawnHtml,
  editorStateCss,
  exportPage,
  exportSite,
  mediaRules,
  revealRules,
  stateChanges,
  stateRules,
  type ExportedPage,
  type StateChange
} from './export-html';
export {
  SITE_MENUS,
  /* The same bar, with one entry per width the **document** declares — see `siteMenusFor`. */
  siteMenusFor,
  siteMenuCommands,
  siteMenuEntry,
  siteMenuId,
  type SiteMenu,
  SITE_CONTEXT,
  type SiteMenuBlock,
  type SiteMenuEntry
} from './menu-model';
export { createPublishCommands, type Published } from './publish-commands';
export { SiteClipboardExtension } from './clipboard-commands';
export {
  CARRIED_HOMES,
  anyCarried,
  boxOf,
  carriedFor,
  missingFrom,
  namesIn,
  whereUsed,
  type Carried,
  type CarrySource
} from './carried';
export { documentFaults, FAULT_KINDS, holderOf, type Declares, type Fault } from './faults';
/** Where a block is, when it is not simply the next thing in the column. */
/** One spelling for a name a document stores — the same word can have two byte sequences. */
/** The shape a picture keeps, whatever width it is given. */
export { ASPECTS, ASPECT_LABELS, aspectCss } from './aspect';
/** What a site is set in — its faces, its body size, and the rhythm of its headings. */
export { FACES, SCALES, baseSizeOf, typeCss, typeRule, type TypeSetting } from './type-scale';
export { nfc, sameName } from './names';
/** An address that is actually an address — see the table of what a free string was doing instead. */
export { holdsABlock } from './selection';
export { isCleanPath, pathFaults, pathFor, slugFor } from './slug';
export { liveScript, markLive, type LiveQuery } from './live';
export { POSITIONS, positionCss, type Placed } from './position';
/** A site as one file, because a folder is the only shape a published site has. */
export { zipOf, type ZipEntry } from './zip';
/** The files a site is made of, kept in the document and written out once when it is published. */
export {
  ASSET_BUDGET,
  ASSET_PREFIX,
  assetFaults,
  assetFileName,
  assetNameOf,
  assetNamed,
  assetSrc,
  assetsOf,
  RENDITIONS,
  renditionFileName,
  srcsetFor,
  byteLength,
  isAssetRef,
  type Asset
} from './assets';
/**
 * How a value reads, which is not the same question as what it is.
 *
 * Re-exported from `office-canvas` rather than re-declared: a deck's card and a page's card are the
 * same node type asking the same question, and two lists of formats would be two answers to it.
 */
export { VALUE_FORMATS, readValue } from '@barocss/office-canvas';
/** What a visitor sends, and where it goes. */
export {
  FIELDS,
  answerNameOf,
  formFaults,
  serviceNamed,
  servicesOf,
  type Service,
  inputTypeOf,
  needsUpload,
  isParagraphField,
  isSubmitField,
  type FieldKind
} from './form';
export {
  OPENABLE,
  STATEABLE,
  STATES,
  STATE_IDS,
  attrsInState,
  hasStates,
  opensAtRest,
  opensOf,
  opensOneOf,
  selectorFor,
  selectorIn,
  stateFaults,
  stateableIn,
  statedIn,
  statesOf,
  withState,
  type StateId,
  type StateKind,
  type StateMap
} from './states';
/**
 * **와이어프레임 보기** — the same page with the finish taken off, as a stylesheet the boards obey.
 *
 * A view rather than a second document: keeping two documents in step is the work that makes a plan
 * and a design drift apart. See the file for the whole argument, and for the three things a browser
 * had to settle about what a replaced element will and will not paint.
 */
export { wireframeCss, wireframeRules, wireframeName, WIREFRAME_CSS, WIREFRAME_NAMES } from './wireframe';
/** Where a carried block would land — which stack, which place, and the line a reader steers by. */
export { landingFor, type Box, type Landing } from './landing';
/**
 * **The widths a site is designed at**, and the devices a width can be a window onto.
 *
 * `widthsOf` reads the document's list and falls back to the three every site starts with, which is
 * what makes every document written before there was a list open unchanged.
 */
export {
  widthsOf,
  baseOf,
  overridableIn,
  type SiteWidth
} from './breakpoints';
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
  pageOf,
  firstRunIn,
  innermostOf,
  selectableAt,
  isCode,
  isTextual,
  kindOfBlock,
  labelOfBlock,
  outermostOf,
  pagesOf,
  pathFromPage,
  drawnSidAtElement,
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
  viewportOf,
  scopesFor,
  type BreakpointId,
  type SiteEnv
} from './breakpoints';
