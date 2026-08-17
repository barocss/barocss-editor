/**
 * Slides — the presentation product over the Barocss engine.
 *
 * The second product, and the one that tests whether there is an engine here at
 * all. Word had every assumption to itself; a deck is the first thing to
 * disagree with it.
 *
 * What it turned out to cost, so far: the schema needed no new node type (see
 * `slides-schema.ts` — the office schema had already described a slide and
 * nothing had ever read that half of it), and drawing one needed a coordinate
 * conversion where Word needs a pagination loop (see `geometry.ts`). The text
 * inside a slide is Word's, unmodified, which is the claim `renderers.ts` is
 * the first code to depend on.
 */
export {
  SLIDE_16_9,
  SLIDE_4_3,
  boxOf,
  fitScale,
  isVisible,
  placementCss,
  pxToTwip,
  slideSize,
  twipToPx,
  type Box,
  type CssStyle,
  type Placement
} from './geometry';

export { registerSlidesRenderers } from './renderers';

export { createSlidesEditor, createSlidesExtensions, type SlidesEditorOptions } from './slides-kit';

export { createSampleDeck } from './sample-deck';

export { createSlideCommands, SlidesExtension } from './slide-commands';

export {
  SCENE_TYPES,
  boxAt,
  isSceneType,
  slideAt,
  type PlacedBox,
  type SceneType
} from './selection';

export {
  SLIDES_TOOLBAR,
  slidesToolbarCommands,
  slidesToolbarMarkTypes,
  type SlidesToolbarControl,
  type SlidesToolbarGroup
} from './toolbar-model';

export {
  copyOf,
  deckSlides,
  layoutPlaceholders,
  noteFor,
  type DeckAccess,
  type DeckNode,
  type Slide
} from './deck';

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
