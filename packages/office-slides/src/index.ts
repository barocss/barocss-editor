/**
 * Slides — the presentation product over the Barocss engine.
 *
 * The second product, and the one that tests whether there is an engine here at
 * all. Word had every assumption to itself; a deck is the first thing to
 * disagree with it.
 *
 * What it turned out to cost, so far: the schema needed no new node type. See
 * `slides-schema.ts` for why — the office schema had already described a slide
 * and nothing had ever read that half of it.
 */
export {
  SLIDE_KIND,
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  SLIDE_WIDTH_4_3,
  SLIDE_HEIGHT_4_3,
  PLACEHOLDER_ROLES,
  getSlidesSchemaDefinition,
  type PlaceholderRole
} from './slides-schema';
