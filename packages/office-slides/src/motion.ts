import { childrenOf, DeckAccess, DeckNode } from './deck';
import { EFFECT_IDS } from './motion-effects';

/**
 * Time, which lives beside the document.
 *
 * The decision was made and written down long before anything needed it
 * (`docs/specs/canvas-model.md` §4), precisely so that it would not be made by
 * accident: a node could carry its own keyframes — and then every node type
 * grows a time field and every operation has to maintain one, the way `locked`
 * reached every command that edits a box — or a **track** beside the document
 * can hold the timing and name what it animates, so a node that knows nothing
 * about animation can still be animated and a deck with no motion pays nothing.
 *
 * This is the first reader, so this is where it is declared. Nothing was
 * declared in advance, because a node type declared before something reads it is
 * how this schema came to have fifteen of them with no renderer.
 *
 * ## What a track is
 *
 * A `motionTrack` is a resource, bound to a slide by id exactly as the
 * presenter's note is: the slide names the track, because a sid is handed out at
 * load and a document written before its sids exist cannot name one. The track's
 * children are `motionStep`s in the order they happen — which is what PowerPoint
 * shows as the animation list, and what every editor with a timeline holds.
 *
 * ## What a step is, and what it is not yet
 *
 * A transition — how this slide replaces the one before it — is a step of kind
 * `transition`. It names nothing: it is the whole slide arriving, so there is no
 * shape to reference and the hardest question a track raises does not have to be
 * answered to ship one.
 *
 * That question is how a step names a *shape*. A sid cannot be written into a
 * saved document, so a build will need shapes to carry a stable name of their
 * own — the same problem the note had, with the same answer — and it is not
 * settled here because nothing reads it yet. `target` is declared and unused for
 * exactly one reason: it is what a build will fill in, and leaving it out would
 * mean a schema change in the middle of writing one. It is written down in the
 * backlog as undeclared work rather than pretended to be finished.
 */

/** How one slide replaces another. The names are the effects a reader picks. */
export const TRANSITIONS = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'wipe', 'zoom'] as const;

export type TransitionEffect = (typeof TRANSITIONS)[number];

/** Milliseconds. Time is the one thing in this model that is not in twips. */
export const DEFAULT_TRANSITION_MS = 400;

export interface SlideTransition {
  effect: TransitionEffect;
  /** Milliseconds. */
  duration: number;
}

const NONE: SlideTransition = { effect: 'none', duration: DEFAULT_TRANSITION_MS };

const attrString = (node: DeckNode | undefined, key: string): string | undefined => {
  const value = node?.attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};


/** Every resource in the deck, whatever kind — the one walk both readers need. */
function* resourcesOf(doc: DeckAccess): Generator<{ sid: string; node: DeckNode }> {
  const root = doc.getNode(doc.rootId);
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'resources') continue;
    for (const child of childrenOf(node)) {
      const resource = doc.getNode(child);
      if (resource) yield { sid: child, node: resource };
    }
  }
}

/**
 * The track a slide names, if it has one.
 *
 * The same shape as `noteFor`, and the same reason for the indirection: the
 * slide carries an id it was written with, and the resource carries the matching
 * one, so neither has to know a sid.
 */
/**
 * What a box's motion **hangs from**: the nearest surface, or the nearest **card**.
 *
 * `slideAt` walks up to the nearest `surface`, which is right for everything about a slide and wrong
 * for one thing: a card's part has a `component` above it and no surface at all, so every motion
 * command answered "not on a slide" and refused. Measured — a reader standing in a definition could
 * pick a part, press 모션 추가, and watch the command report nothing.
 *
 * A card is the other thing a reader opens and puts shapes in, and now the other thing that can hold
 * a track (§10l). So this is the walk those commands need, and it is *narrower* than widening
 * `slideAt` itself: the clipboard's destination, the arrangement and the layout cascade all mean the
 * surface when they say slide, and one of them quietly meaning "or a card" is how a shared helper
 * becomes a bug.
 */
export function trackHostAt(doc: DeckAccess, sid: string | undefined): string | undefined {
  let at = sid;
  for (let depth = 0; at && depth < 64; depth += 1) {
    const node = doc.getNode(at);
    if (!node) return undefined;
    if (node.stype === 'surface' || node.stype === 'component') return at;
    at = (node as { parentId?: string }).parentId;
  }
  return undefined;
}

export function trackFor(doc: DeckAccess, surfaceSid: string): string | undefined {
  const trackId = attrString(doc.getNode(surfaceSid), 'trackId');
  if (!trackId) return undefined;

  for (const { sid, node } of resourcesOf(doc)) {
    if (node.stype === 'motionTrack' && attrString(node, 'id') === trackId) return sid;
  }
  return undefined;
}

/** The step that says how this slide arrives, if the track holds one. */
export function transitionStepOf(doc: DeckAccess, surfaceSid: string): string | undefined {
  const track = trackFor(doc, surfaceSid);
  if (!track) return undefined;

  for (const sid of childrenOf(doc.getNode(track))) {
    const step = doc.getNode(sid);
    if (step?.stype === 'motionStep' && attrString(step, 'kind') === 'transition') return sid;
  }
  return undefined;
}

/**
 * How a slide arrives, resolved — `none` when it has no track, no step, or an
 * effect this product does not know.
 *
 * An unknown effect draws as no transition rather than as a guess: a deck from
 * another tool may name a `honeycomb`, and showing a fade because the name was
 * unrecognised would be this product inventing a document's meaning.
 */
export function transitionOf(doc: DeckAccess, surfaceSid: string): SlideTransition {
  const stepSid = transitionStepOf(doc, surfaceSid);
  if (!stepSid) return NONE;

  const step = doc.getNode(stepSid);
  const effect = attrString(step, 'effect');
  const duration = step?.attributes?.duration;

  return {
    effect: (TRANSITIONS as readonly string[]).includes(effect ?? '')
      ? (effect as TransitionEffect)
      : 'none',
    duration:
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? duration
        : DEFAULT_TRANSITION_MS
  };
}

/**
 * What the browser is told to draw, for a slide arriving.
 *
 * A transform and an opacity, which are the two things a browser animates
 * without laying anything out again — a slide is a fixed surface with absolutely
 * placed boxes on it, and animating anything else would re-layout every one of
 * them sixty times a second.
 *
 * Returned as the *starting* state and a duration; the element is drawn in this
 * state and then released to its natural one, which is what makes every effect
 * here one declaration instead of a keyframe list.
 */
export interface TransitionFrom {
  transform?: string;
  opacity?: string;
  clipPath?: string;
  /** Milliseconds, for the transition property that carries it back. */
  duration: number;
}

export function transitionFrom(transition: SlideTransition): TransitionFrom | undefined {
  const duration = transition.duration;

  switch (transition.effect) {
    case 'fade':
      return { opacity: '0', duration };
    // The slide comes *from* the side it is named for, which is the direction a
    // reader means by "slide left": the new slide enters from the right and
    // moves left. Getting this backwards is the classic transition bug.
    case 'slideLeft':
      return { transform: 'translateX(100%)', duration };
    case 'slideRight':
      return { transform: 'translateX(-100%)', duration };
    case 'slideUp':
      return { transform: 'translateY(100%)', duration };
    case 'wipe':
      return { clipPath: 'inset(0 100% 0 0)', duration };
    case 'zoom':
      return { transform: 'scale(0.85)', opacity: '0', duration };
    default:
      return undefined;
  }
}

/**
 * Builds: what happens *on* a slide, in the order a presenter clicks through.
 *
 * The same track, one step per build, and the question a transition let us
 * postpone has to be answered here: **how a step names a shape.**
 *
 * ## A shape carries a name, because a sid cannot be written down
 *
 * A sid is `session:counter`, handed out at load in document order, so a step
 * that stored one would point at a different shape the moment a slide above it
 * gained a box — and at nothing at all in a deck opened in another session. The
 * presenter's note hit this exactly: it was written the other way round first,
 * with the note naming the surface, and could not work.
 *
 * So a shape being animated is given a `name` it keeps: assigned when something
 * first needs to name it, unique in the deck, and written into the file. Shapes
 * nobody animates carry nothing, which is the same rule the track itself
 * follows — a deck with no motion pays nothing.
 */

/** What a build does to the shape it names. */
/**
 * Every effect the product has, read from the one table that defines them.
 *
 * It was a list of seven written here, and the table in `motion-effects.ts` now
 * says what each one *is* — its category and its frames. Two lists would be two
 * places to add an effect and one place to forget it, which is the fault this
 * repository keeps finding; so this is derived, and an effect exists exactly
 * when something can draw it.
 */
export const BUILD_EFFECTS = EFFECT_IDS as readonly string[];

export type BuildEffect = string;

/** How a build starts, which is PowerPoint's three and everyone else's. */
export const BUILD_STARTS = ['onClick', 'withPrevious', 'afterPrevious'] as const;

export type BuildStart = (typeof BUILD_STARTS)[number];

export interface Build {
  /** The step's sid, so a panel can change or remove exactly this one. */
  sid: string;
  /** The name the shape carries — not its sid. */
  target: string;
  effect: BuildEffect;
  duration: number;
  delay: number;
  startsWith: BuildStart;
}

/**
 * Every build on a slide, in the order the track holds them.
 *
 * Order is the track's child order and nothing else. A separate `index`
 * attribute would be a second place to say the same thing, and the two would
 * disagree the first time a step was removed.
 */
export function buildsOf(doc: DeckAccess, surfaceSid: string): Build[] {
  const track = trackFor(doc, surfaceSid);
  if (!track) return [];

  const builds: Build[] = [];
  for (const sid of childrenOf(doc.getNode(track))) {
    const step = doc.getNode(sid);
    if (step?.stype !== 'motionStep') continue;
    if (attrString(step, 'kind') !== 'build') continue;

    const target = attrString(step, 'target');
    const effect = attrString(step, 'effect');
    // A build naming nothing, or an effect this product does not have, is
    // skipped rather than guessed at — the same rule the transition follows.
    if (!target || !(BUILD_EFFECTS as readonly string[]).includes(effect ?? '')) continue;

    const duration = step?.attributes?.duration;
    const delay = step?.attributes?.delay;
    const startsWith = attrString(step, 'startsWith');

    builds.push({
      sid,
      target,
      effect: effect as BuildEffect,
      duration:
        typeof duration === 'number' && Number.isFinite(duration) && duration > 0
          ? duration
          : DEFAULT_TRANSITION_MS,
      delay: typeof delay === 'number' && Number.isFinite(delay) && delay > 0 ? delay : 0,
      startsWith: (BUILD_STARTS as readonly string[]).includes(startsWith ?? '')
        ? (startsWith as BuildStart)
        : 'onClick'
    });
  }

  return builds;
}

/**
 * The builds gathered into the clicks that play them, and everything that used
 * to follow — `buildGroups`, `hiddenUntilBuilt`, `buildMotion` — are gone.
 *
 * They were the CSS-transition shape of this: a starting style, released after
 * two frames. `timeline.ts` answers the same questions over the slide's whole
 * list, including the steps that are not builds, and `motion-effects.ts` says
 * what an effect animates through in the Web Animations API's own vocabulary —
 * which is what an emphasis, an easing curve and a scrubbable playhead all
 * needed.
 *
 * Deleted rather than left beside the new ones. Two ways to ask what a slide
 * animates is two answers to keep in agreement, and the second one only has to
 * be wrong once.
 */
