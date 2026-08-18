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
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  boxOf,
  anchorOf,
  anchorShift,
  clampZoom,
  fitScale,
  stepZoom,
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

export { createBoxCommands, SlidesBoxExtension } from './box-commands';
export { createClipboardCommands, SlidesClipboardExtension } from './clipboard-commands';
/**
 * Arranging a frame is canvas behaviour and lives in `office-word`, which owns
 * the canvas. Re-exported so a deck's callers do not have to know that.
 */
export {
  createLayoutCommands,
  layoutChildren,
  childrenToLayOut,
  laysOut,
  layoutModeOf,
  type LayoutMode,
  type LaidOutChild
} from '@barocss/office-word';
export { SLIDES_ENV_KEY, showsNotes, type SlidesEnv } from './render-context';
export { SLIDES_KEYS, slidesKeyCommands, matchesKey, type SlidesKey } from './keymap';
export {
  resolveDeckFormat,
  inheritedFormat,
  placeholderFor,
  withLayouts,
  createDeckEnv,
  type DeckFormatScope
} from './layout-format';

export { createArrangeCommands, SlidesArrangeExtension } from './arrange-commands';

export {
  RESIZE_HANDLES,
  angleOf,
  contains,
  intersects,
  moveBox,
  resizeBox,
  snapAngle,
  unionOf,
  unrotate,
  alignBoxes,
  distributeBoxes,
  guidesFor,
  intoFrame,
  outOfFrame,
  snapBox,
  snapResize,
  type Align,
  type Guide,
  type Delta,
  type Handle,
  type ResizeOptions
} from './manipulate';

export {
  SCENE_TYPES,
  boxAt,
  isSceneType,
  slideAt,
  toSurface,
  fromSurface,
  type PlacedBox,
  type Positioned,
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
  layoutPlaceholderSids,
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
