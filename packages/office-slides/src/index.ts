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

/**
 * What a **new** deck is: one title slide with the definitions under it. See
 * `starter-deck.ts` for why an empty document is not an answer.
 */
export { createStarterDeck, deckDefinitions, blankLine } from './starter-deck';
/**
 * The decks a reader can start from. A template **is a document** — the same shape as one
 * opened from disk — which is why the gallery costs so little.
 */
export {
  DECK_TEMPLATES,
  templateSketch,
  type DeckTemplate,
  type SketchedSlide
} from './templates';

export { createSlideCommands, SlidesExtension } from './slide-commands';

export { createBoxCommands, SlidesBoxExtension } from './box-commands';
export { createComponentCommands, SlidesComponentExtension } from './component-commands';
export { createVariableCommands, SlidesVariableExtension, documentVarUses } from './variable-commands';
export { createClipboardCommands, SlidesClipboardExtension } from './clipboard-commands';
export { createConnectorCommands, SlidesConnectorExtension } from './connector-commands';
/**
 * Arranging a frame is canvas behaviour and lives in `office-word`, which owns
 * the canvas. Re-exported so a deck's callers do not have to know that.
 */
export {
  createLayoutCommands,
  layoutChildren,
  childrenToLayOut,
  laysOut,
  reorderIndexAt,
  layoutModeOf,
  /**
   * A connector's geometry, re-exported for the same reason the arrangement is: it is
   * canvas behaviour that lives in the package that owns the canvas, and a deck's
   * callers should not have to know that. See `docs/specs/canvas-model.md` §8.
   */
  connectorBounds,
  connectorBoxOf,
  connectorCapsOf,
  connectorPath,
  connectorPoints,
  connectorSpecOf,
  magnetPoints,
  bendFromDrag,
  canBendByDrag,
  connectorTrack,
  labelAt,
  labelNear,
  endLabelOf,
  labelBox,
  labelOf,
  midHandleOf,
  nearestMagnet,
  nearestOnPath,
  readWaypoints,
  normalOf,
  pointOnPath,
  resolveEnds,
  MAGNET_SNAP,
  type ConnectorBox,
  type ConnectorCap,
  type ConnectorKind,
  type ConnectorSide,
  type ConnectorSpec,
  type LayoutMode,
  type LaidOutChild
} from '@barocss/office-word';
/**
 * Tidying a diagram, which is the canvas's arithmetic and not the deck's — the same
 * reason the connector geometry lives there.
 */
export {
  layoutGraph,
  rankGapFor,
  RANK_GAP,
  NODE_GAP,
  type GraphNode,
  type GraphEdge,
  type GraphDirection,
  type GraphPlacement
} from '@barocss/office-word';
/**
 * Applying a layout to a slide that already has something on it: Canva's *Layouts*, and
 * the rule it follows is the formatting cascade's — matched by role, never by position.
 */
export {
  layoutMoves,
  type Arrangeable,
  type LayoutSlot,
  type LayoutMove
} from './layout-arrange';
/**
 * Components: a definition lives in the document's **library**, declares what a placement can be
 * asked for, and a placement **draws** it (`canvas-model.md` §10b-2a).
 *
 * The model and the resolution live in `office-word`, which owns the canvas, and are re-exported
 * so a deck's callers do not have to know that — the same arrangement the arrangement and the
 * connector geometry have. They are there because the *schema* is shared: the office schema
 * declares `component` and `instance`, so Word's canvas already has cards in its document format,
 * and two products reading them differently would be one of them being wrong
 * (`docs/SHARED-LAYER.md`). What stays here is what cannot be said without naming a deck — the
 * commands, the panels, and importing a card from another file.
 */
export {
  componentsOf,
  componentOf,
  definitionAt,
  partIdOf,
  partSignature,
  componentSignature,
  definitionSignature,
  importComponentPlan,
  componentSourceOf,
  componentBehindSource,
  type ImportPlan,
  type ComponentSource,
  instanceVars,
  instanceValues,
  instanceResizable,
  definitionOf,
  slotNameOf,
  /**
   * What a **placement draws**: the definition's parts, live, with this placement's values in them.
   *
   * Registered as the store's content resolver by `createSlidesEditor`, which is the one place a
   * node's children are read for a reader.
   */
  instanceParts,
  type ComponentDef,
  type ComponentVar,
  type ComponentBind
} from '@barocss/office-word';
/**
 * A deck that is **not a line**: a shape a reader presses, and the page it shows.
 *
 * The click was already there — `present.tsx` collects the shapes whose press runs something and
 * already knows that such a press must not also advance the deck — so this is a new kind of
 * thing to trigger rather than a new mechanism. See `canvas-model.md` §11.
 */
export {
  deckAdvance,
  slideById,
  jumpOf,
  jumpsOn,
  deckJumps,
  jumpTarget,
  jumpFaults,
  type Jump,
  type JumpFault
} from './jump';
/**
 * The deck as a **graph**: which page leads where, laid out and routed.
 *
 * A view of the buttons rather than a second place to keep them — see `canvas-model.md` §11b.
 */
export { deckMap, type DeckMap, type MapPage, type MapLink } from './deck-map';
/**
 * A reader's own decks, **by name** — the naming half, which is the only half that is a question
 * about documents. Where they are kept is the app's: a browser has IndexedDB, another host would
 * have a directory. See `canvas-model.md` §11i.
 */
/**
 * A deck read straight out of a file, answered like a loaded one — which is how anything can be
 * asked about *another* deck without replacing the one on screen.
 */
export { accessOfTree } from './tree-access';
export {
  libraryName,
  libraryEntry,
  isLibraryName,
  type LibraryEntry
} from './deck-library';
export { SLIDES_ENV_KEY, showsNotes, type SlidesEnv } from './render-context';
/**
 * Where every connector goes, worked out once per render.
 *
 * A layout pass rather than a reaction that writes the document, because a route is
 * derived from nodes that are not the connector's own — see the file for the measurement
 * that settled it.
 */
export { createConnectorPass, routeFromEnv, jumpsFromEnv } from './connector-pass';
/**
 * The ruler's ticks used to be here, as `slideTicks`.
 *
 * They were an axis — a span, a step, and where the marks go — and this
 * repository drew three of them with three different answers, one of which was
 * `ceil(span / 500)` inline in a component. They are `axisTicks` in
 * `@barocss/office-ui` now: pure arithmetic with no editor in it, reachable by
 * every axis rather than by the one product that happened to write it. Nothing
 * inside this package ever called it — only the app did — so the move cost this
 * package's boundary nothing.
 */

/**
 * Where a reader is in a slide's builds, and what that means for the stage.
 *
 * One question with one answer, where the app had three variables meaning "which
 * press" and a mode test repeated in four places — see the file.
 */
export {
  scrollStretches,
  scrollHeight,
  scrollAt,
  scrollTopOf,
  scrollStops,
  scrollToStop,
  PER_PRESS,
  type ScrollStretch
} from './scroll-show';
export { advanceShow, showing, type Showing, type Hold, type Where } from './playback';

/**
 * The slide's contents as a list, front first — and what to call each of them.
 *
 * Naming lives here with the kinds table, so the timeline, the layer list and the
 * conformance check that asks whether the schema has grown a node type this
 * product cannot name all get one answer.
 */
/**
 * Finding text across a deck.
 *
 * Word's `findMatches` answers "where in this tree"; a deck also needs "which
 * slide", because the next match is a different slide rather than a scroll. See the
 * file for what is searched and the one limit that is written down rather than
 * worked around.
 */
/**
 * A look over the deck before it is given to anybody.
 *
 * The model only — no DOM — which is what lets it sweep every slide at once and
 * what keeps an answer from depending on the zoom or a font that has not loaded.
 * Two levels and no more; see the file for why three is worse than two.
 */
export {
  auditCount,
  auditDeck,
  auditOf,
  contrastOf,
  type AuditHit,
  type AuditKind
} from './audit';

export { boxOfMatch, deckMatches, matchesOn, matchesPerSlide, type DeckMatch } from './find';

export {
  kindOfBox,
  labelOfBox,
  layerRows,
  namedKinds,
  positionFromRow,
  type LayerRow
} from './layers';

/**
 * The guides a reader places, as opposed to the ones a drag finds.
 *
 * Nothing about the snapping needed to change for them: a `Guide` is
 * `{ axis, at }` and `snapBox` takes a list, so a placed guide is one more item
 * in it. See the file for the four rules that make a list of them behave.
 */
export {
  readGuides,
  withGuide,
  guidePlace,
  movedGuide,
  withoutGuide,
  guideIsDropped,
  withReaderGuides
} from './guides';

export {
  slideMenu,
  type SlideMenuItem,
  type SlideMenuSection,
  type MenuTarget
} from './context-menu';

export {
  SLIDES_KEYS,
  slidesKeyCommands,
  matchesKey,
  shortcutOf,
  keyLabel,
  type SlidesKey
} from './keymap';
export {
  resolveDeckFormat,
  inheritedFormat,
  backgroundOf,
  masterOf,
  deckDesigns,
  placeholderChainFor,
  placeholderFor,
  type DeckDesign,
  withLayouts,
  createDeckEnv,
  type DeckFormatScope
} from './layout-format';

export { createArrangeCommands, SlidesArrangeExtension } from './arrange-commands';

/**
 * Which part of a picture shows, and how a crop handle changes it.
 *
 * Exported because the crop is a *gesture*: the overlay drags the handle, and
 * the arithmetic that turns a drag into four fractions and a smaller box belongs
 * with the model rather than in the app — see `crop.ts`, and every other pure
 * calculation this overlay makes.
 */
/**
 * Time, which lives beside the document — see `motion.ts` and
 * `docs/specs/canvas-model.md` §4.
 */
/**
 * A slide's timeline: everything that happens on it, in the order it happens —
 * see `timeline.ts`.
 */
export {
  axisSpan,
  echoGap,
  FRAME_MS,
  stepMoment,
  hiddenUntilPlayed,
  triggerWindow,
  namedBoxes,
  delayForStart,
  pressCount,
  pressDuration,
  stepsAtPress,
  stepsWaitingFor,
  withTiming,
  reorderSteps,
  slideTimeline,
  shiftedDelays,
  snapPoints,
  snapTo,
  triggersOn,
  timelineDuration,
  type StepKind,
  type TimedStep,
  type TimelineStep
} from './timeline';

/**
 * What an effect *is* — a category and its frames — and how a step is eased.
 * See `motion-effects.ts` for why keyframes rather than CSS transitions.
 */
export {
  DEFAULT_AMOUNT,
  DEFAULT_DIRECTION,
  DIRECTIONS,
  EASING_PRESETS,
  EFFECT_IDS,
  KNOWN_EFFECT_IDS,
  MOTION_EFFECTS,
  MUST_ADD,
  NOT_ADDITIVE,
  framesFor,
  splitAdditive,
  propertiesOf,
  resolveEffect,
  bezierCss,
  bezierPoints,
  categoryOf,
  easingCss,
  easingPoints,
  effectDefinition,
  smilTiming,
  type Direction,
  type FilterTiming,
  type SvgFilter,
  type EasingPreset,
  type EffectCategory,
  type EffectDefinition,
  type EffectOptions
} from './motion-effects';

/**
 * What a motion costs to draw, and how much of it runs at once — see
 * `motion-cost.ts`, and `docs/specs/motion-model.md` §7b for the tiers.
 */
export {
  PROPERTY_TIER,
  costLabel,
  pressCost,
  stepElements,
  stepTier,
  type MotionCost
} from './motion-cost';

/**
 * A path a shape travels — see `motion-path.ts` for why it is a kind of step and
 * why the document holds points rather than a `path()` string.
 */
export {
  FACINGS,
  FACING_LABELS,
  PATH_PRESETS,
  addPoint,
  facingCss,
  movePoint,
  pathCss,
  pathData,
  pathLength,
  pathPointsOf,
  pathPreset,
  removePoint,
  type Facing,
  type PathPoint,
  type PathPresetId
} from './motion-path';

/**
 * A deck as a file — see `deck-file.ts` for why the sids are left out, and what
 * that depends on.
 */
export {
  DECK_FORMAT,
  DECK_FILE_VERSION,
  deckFile,
  deckFileName,
  deckFileText,
  deckTitle,
  forFile,
  readDeckFile,
  type DeckFile,
  type DeckFileRead
} from './deck-file';

/**
 * Animating text by the piece — see `text-units.ts` for why it is an option on a
 * build rather than a kind of step, and why the split belongs to the view.
 */
export {
  DEFAULT_STAGGER,
  TEXT_UNITS,
  TEXT_UNIT_LABELS,
  animatedPieces,
  graphemes,
  joinsUp,
  splitText,
  unitCount,
  unitSpan,
  words,
  type TextUnit
} from './text-units';

/**
 * A spring, which is the one timing a cubic-bezier cannot say — see `spring.ts`
 * for why it is a `linear()` of samples rather than resampled keyframes.
 */
export {
  SPRING_PRESETS,
  parseSpring,
  springCss,
  springLinearCss,
  springProgress,
  springSampleCount,
  springSamples,
  springSettling,
  type Spring
} from './spring';

/**
 * The named bundles a reader chooses from — see `motion-presets.ts` for why a
 * preset writes values and is not one.
 */
export {
  MOTION_COMBOS,
  MOTION_PRESETS,
  MOTION_VALUES,
  PRESET_IDS,
  comboAttrs,
  comboById,
  matchingPreset,
  motionValues,
  presetAttrs,
  presetById,
  presetCategory,
  presetsIn,
  type MotionCombo,
  type MotionPreset
} from './motion-presets';

export {
  BUILD_EFFECTS,
  BUILD_STARTS,
  DEFAULT_TRANSITION_MS,
  TRANSITIONS,
  type Build,
  type BuildEffect,
  type BuildStart,
  trackFor,
  transitionFrom,
  transitionOf,
  transitionStepOf,
  type SlideTransition,
  type TransitionEffect,
  type TransitionFrom
} from './motion';

/**
 * A theme: the colours and faces a deck is designed in, named rather than
 * repeated — see `theme.ts`.
 */
export {
  CUSTOM_THEME,
  DECK_THEMES,
  THEME_ATTRS,
  THEME_COLOUR_SLOTS,
  THEME_FONT_SLOTS,
  isThemeRef,
  resolveThemeValue,
  slotOf,
  themeFor,
  /**
   * The theme's current values with the gaps filled, and which preset it *is*.
   *
   * The second is what stops a theme row saying "Office" about a deck whose accent
   * has been changed — see the file.
   */
  themeMatching,
  themeNow,
  themePayload,
  themeRef,
  type DeckTheme,
  type ThemeColourSlot,
  type ThemeFontSlot
} from './theme';

/**
 * A value that **names** something, resolved: a theme slot (`theme:accent1`) or one of the
 * document's own variables (`var:강조`).
 *
 * One walk for both, because both hide in the same three places — an attribute, a paint in a list
 * of paints, a stop in a gradient — and two walks would be two chances for one of them to miss the
 * stop. Which is not hypothetical: the theme's own walk read the top level only at first, so
 * picking a theme colour for a fill made the shape lose its colour.
 */
export {
  resolveDeckAttrs,
  resolveDeckValue,
  resolveThemeAttrs,
  resolveNamedAttrs,
  isNamedRef,
  type Named
} from './named-values';
/**
 * The document's own variables, from the canvas layer — one place says what a value is, and
 * everything that uses it says its name. Re-exported for the reason the component model is.
 */
export {
  documentVars,
  documentVar,
  resolveVarValue,
  isVarRef,
  varNameOf,
  varRef,
  varUses,
  type DocumentVar
} from '@barocss/office-word';

/**
 * What a shape is painted with, as a list — see `paints.ts` for why a stack
 * rather than one fill and one shadow.
 */
/**
 * A gradient's axis on the shape itself — the handles a reader aims with, and
 * the arithmetic that makes them land where CSS puts the colour.
 */
export {
  addStop,
  angleBetween,
  angleTowards,
  axisRange,
  gradientPoint,
  radialCss,
  radialShape,
  gradientPoints,
  remapStops,
  axisLength,
  gradientAxis,
  offsetAlong,
  removeStop,
  type GradientAxis
} from './gradient-axis';

export {
  BLEND_MODES,
  backgroundCss,
  imageLayout,
  effectsCss,
  effectsOf,
  newEffect,
  newPaint,
  paintCss,
  paintsOf,
  type BlendMode,
  type Paint,
  type PaintFit,
  type PaintKind,
  type PaintStop,
  type ShapeEffect,
  type EffectKind
} from './paints';

export { fillBoxCss, fillLayers, layered, type FillLayer } from './fill-layers';

export {
  CROP_ATTRS,
  NO_CROP,
  cropByHandle,
  cropCss,
  isCropped,
  type Crop,
  type CropCss,
  type CropDrag
} from './crop';

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
  agreed,
  agreedAttr,
  boxesInside,
  isSceneType,
  isContainerType,
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
  slidesToolbarIcons,
  slidesToolbarMarkTypes,
  type SlidesToolbarControl,
  type SlidesToolbarGroup
} from './toolbar-model';

export {
  copyOf,
  deckSlides,
  stageFit,
  isSlideSurface,
  editableSurface,
  layoutPlaceholders,
  layoutPlaceholderSids,
  noteFor,
  connectorRouteOf,
  connectorTrackOf,
  connectorFreezeSteps,
  copyForPaste,
  pastable,
  spaceOriginOf,
  noteTextOf,
  obstaclesFor,
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

export {
  MEDIA_TRIM_ATTRS,
  MIN_TRIM_MS,
  headTrim,
  tailTrim,
  trimOf,
  isTrimmed,
  trimmedLength,
  trimChanges,
  type MediaTrim
} from './media-trim';

/**
 * The registered custom properties a motion animates *through* — see
 * `motion-tracks.ts` for the one property that needs one and the one that was
 * measured and did not.
 */
export {
  MOTION_TRACKS,
  TRACK_SLOTS,
  trackName,
  trackOf,
  trackPropertyCss,
  trackVar,
  tracksFor,
  type MotionTrack,
  type TrackPart
} from './motion-tracks';

/**
 * A box mirrored — see `flip.ts` for why it is two attributes rather than a
 * negative width, and why the gesture is a toggle.
 */
export { FLIP_ATTRS, flipCss, flipChange, flipped, type FlipAxis } from './flip';
