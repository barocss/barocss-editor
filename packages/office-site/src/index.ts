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
export { createSiteEditor, createSiteExtensions, createSiteOwnExtensions, type SiteEditorOptions } from './site-kit';
export { createStackCommands, SiteStackExtension, type InsertStackOptions } from './stack-commands';
export { createSampleSite } from './sample-site';
