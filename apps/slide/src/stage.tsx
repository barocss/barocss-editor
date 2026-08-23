import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { axisTicks, rulerStep, useWheelZoom, type LengthUnit } from '@barocss/office-ui';
import {
  SLIDE_16_9,
  ZOOM_MAX,
  ZOOM_MIN,
  echoGap,
  facingCss,
  fitScale,
  pathCss,
  pxToTwip,
  splitAdditive,
  splitText,
  twipToPx,
  type Facing,
  type PathPoint,
  type TextUnit,
  type TransitionFrom
} from '@barocss/office-slides';

/**
 * Splitting a box's text into the pieces a step animates, and putting it back.
 *
 * ## Why the *view* does this
 *
 * The document holds `inline-text` runs, and a run is one node however many
 * characters it holds. A model with a node per letter would make every text
 * operation — typing, marks, selection offsets — walk a tree of graphemes, which
 * is the cost the run model exists to avoid. So the split is a rendered thing no
 * node describes, like the caret filler, and it is undone when the animation is.
 *
 * ## Three things that had to be got right
 *
 * **A transform does not apply to an inline element.** `translate` and `scale`
 * on a `display: inline` span are ignored outright, so a letter that flies in has
 * to be `inline-block`. That is the whole reason these spans carry a `display`
 * at all.
 *
 * **`inline-block` letters break lines differently.** A line may break between
 * any two inline-blocks, so a title split into letters could wrap *inside a
 * word* where it never would before — text that reflows the moment it animates.
 * So the words are wrapped first, in `inline-block; white-space: pre` spans, and
 * the letters go inside those: the break opportunities stay exactly where they
 * were, at the spaces.
 *
 * **The caret's block is the one region the observer speaks for.** The editor's
 * MutationObserver is scoped to the block the caret is in — everything else is
 * "our own writing, by definition" — so splitting text inside the block being
 * typed in would be read back as an edit. A box with the caret in it is animated
 * whole instead, which is a motion the reader can see rather than a document
 * they have to undo.
 */
const UNIT_ATTR = 'data-motion-unit';

/** Whether the caret is inside this element, which makes it unsafe to split. */
const holdsCaret = (element: HTMLElement): boolean => {
  const selection = element.ownerDocument.getSelection();
  const focus = selection?.focusNode ?? selection?.anchorNode ?? null;
  return !!focus && element.contains(focus);
};

const pieceSpan = (element: HTMLElement, text: string, word: boolean): HTMLElement => {
  const span = element.ownerDocument.createElement('span');
  span.setAttribute(UNIT_ATTR, word ? 'word' : 'letter');
  // `inline-block` because a transform is ignored on an inline box; `pre` on the
  // word so its spaces survive and its letters cannot be broken apart.
  span.style.display = 'inline-block';
  if (word) span.style.whiteSpace = 'pre';
  span.textContent = text;
  return span;
};

/**
 * The elements a step's pieces are, and how to put the DOM back.
 *
 * `paragraph` needs no split at all — the paragraphs are already elements, and
 * already blocks, so nothing is inserted and nothing has to be undone. That is
 * the safest of the three, and it falls out of the model rather than being a
 * special case.
 */
function splitInto(
  element: HTMLElement,
  unit: TextUnit
): { pieces: HTMLElement[]; restore: () => void } {
  const whole = { pieces: [element], restore: () => undefined };

  if (unit === 'paragraph') {
    const paragraphs = [...element.querySelectorAll<HTMLElement>('.w-paragraph')];
    return paragraphs.length > 0 ? { pieces: paragraphs, restore: () => undefined } : whole;
  }

  if (holdsCaret(element)) return whole;

  const owner = element.ownerDocument;
  const walker = owner.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);

  const pieces: HTMLElement[] = [];
  const undo: Array<() => void> = [];

  for (const node of texts) {
    const value = node.nodeValue ?? '';
    // Nothing to animate, and one thing not to touch: the caret filler, which is
    // a zero-width character the renderer owns.
    if (value.trim().length === 0 || value.includes('\uFEFF')) continue;

    const parent = node.parentNode;
    if (!parent) continue;

    const fragment = owner.createDocumentFragment();
    for (const word of splitText(value, 'word')) {
      const holder = pieceSpan(element, unit === 'word' ? word : '', true);
      if (unit === 'word') {
        // A piece of pure whitespace is drawn and never animated — the same rule
        // `animatedPieces` counts by, so the bar's width and the number of
        // animations cannot disagree.
        if (word.trim().length > 0) pieces.push(holder);
      } else {
        for (const letter of splitText(word, 'letter')) {
          const span = pieceSpan(element, letter, false);
          holder.appendChild(span);
          // A space is drawn and never animated — see `animatedPieces`, which is
          // the same rule counted in the model so the bar and the animation
          // agree about how many pieces there are.
          if (letter.trim().length > 0) pieces.push(span);
        }
      }
      fragment.appendChild(holder);
    }

    const made = [...fragment.childNodes];
    parent.replaceChild(fragment, node);
    undo.push(() => {
      const first = made[0];
      if (!first?.parentNode) return;
      first.parentNode.insertBefore(node, first);
      for (const child of made) child.parentNode?.removeChild(child);
    });
  }

  if (pieces.length === 0) return whole;
  return {
    pieces,
    restore: () => {
      for (const step of undo) step();
    }
  };
}

/**
 * A trail: the shape's afterimage, made of copies of the rendered element.
 *
 * ## Why copies, and why they look right
 *
 * The measurement that decided it (`docs/specs/motion-model.md` §7a): a
 * `cloneNode(true)` appended to the shape's **own parent** has the same box, the
 * same `box-shadow` and the same font as the original, because every inherited
 * style comes from the same ancestors. A clone in a layer of its own would have
 * to be given all of that by hand.
 *
 * Three copies eighty milliseconds apart at falling opacity is what makes a fast
 * motion read as fast — CapCut's afterimage, and the reason a shape that merely
 * moves looks slower than the same shape with a trail.
 *
 * ## The wrapper, and why the opacity is on it
 *
 * A copy has to be *dimmer*, and the animation may itself be animating `opacity`
 * — a fade's frames run 0 → 1, and an animation of a property replaces the
 * element's own value for it rather than multiplying. So the fading is on a
 * wrapper: a positioned, inert box the copy sits in, whose `opacity` multiplies
 * with whatever the animation does inside it.
 *
 * `inset: 0` makes the wrapper the same box as the slide surface, so the copy's
 * own `left`/`top` — written by the renderer, relative to that surface — land
 * exactly where the original's do.
 */
/**
 * One step's frames on one element, as the animations they have to be.
 *
 * Almost always one. The exception is the whole reason this exists: `filter` and
 * `backdrop-filter` hold a **list**, and an animation of a list *replaces* it —
 * measured, and it was live: a shape with a 흐림 effect carries
 * `filter: blur(3px)`, and one glow step over it computed to the glow alone. The
 * blur was gone for the length of the motion.
 *
 * `composite: 'add'` fixes exactly that (`blur(3px) drop-shadow(…)`), and is
 * wrong for everything else — an additive `opacity` starts at the shape's own 1,
 * so a fade would not fade. `composite` belongs to an animation rather than to a
 * property, so a step that touches both is two animations on one timing.
 *
 * Nothing to do when the step is already additive: an overlapping step adds
 * everything, which is `withTiming`'s answer and older than this.
 */
const runFrames = (
  target: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions
): Animation[] => {
  if (options.composite === 'add') return [target.animate(frames, options)];

  const { additive, plain } = splitAdditive(frames as never);
  const made: Animation[] = [];
  if (plain.length > 0) made.push(target.animate(plain as never, options));
  if (additive.length > 0) {
    made.push(target.animate(additive as never, { ...options, composite: 'add' }));
  }
  return made;
};

/**
 * Every style property playback writes on a shape.
 *
 * Written down as one list because it is the list the cleanup has to give back —
 * and because the two used to be written in two places, which is how `filter`
 * came to be cleared to nothing when the renderer was the one that had put it
 * there.
 *
 * The individual transform properties rather than the shorthand: a shape's own
 * rotation *is* its `transform`, written by the renderer, and clearing that took
 * the rotation away with it — measured, a rotated rectangle came out of a build
 * at `transform: none`, turned in the document and straight on the screen. The
 * animations compose through `translate`/`rotate`/`scale`, so those are what
 * there is to put back.
 */
const STAGE_WRITES = [
  'visibility',
  'transition',
  'translate',
  'rotate',
  'scale',
  'opacity',
  'clip-path',
  'filter',
  'backdrop-filter',
  // The path is a style this writes, so it is a style this takes back: a shape
  // left with an `offset-path` sits wherever the last frame put it, in the
  // editor, with nothing on screen to say why.
  'offset-path',
  'offset-rotate',
  'offset-distance'
] as const;

const ECHO_ATTR = 'data-motion-echo';

function makeEchoes(
  element: HTMLElement,
  count: number
): { copies: HTMLElement[]; restore: () => void } {
  const parent = element.parentElement;
  if (!parent || count < 1) return { copies: [], restore: () => undefined };

  const wrappers: HTMLElement[] = [];
  const copies: HTMLElement[] = [];

  for (let index = 0; index < count; index += 1) {
    const wrapper = element.ownerDocument.createElement('div');
    wrapper.setAttribute(ECHO_ATTR, String(index));
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.position = 'absolute';
    wrapper.style.inset = '0';
    wrapper.style.pointerEvents = 'none';
    // Dimmer the further behind it is, and never quite invisible at the front of
    // the trail — a first copy at 0.1 is a trail nobody sees.
    wrapper.style.opacity = String(Math.max(0.08, 0.4 - index * 0.12));

    const copy = element.cloneNode(true) as HTMLElement;
    // The copy is not the shape: nothing may find it by the shape's sid, or a
    // second pass would animate the copy instead of the original.
    copy.removeAttribute('data-bc-sid');
    copy.querySelectorAll('[data-bc-sid]').forEach((node) => node.removeAttribute('data-bc-sid'));

    wrapper.appendChild(copy);
    // Behind the original, so the shape itself is the one in front.
    parent.insertBefore(wrapper, element);
    wrappers.push(wrapper);
    copies.push(copy);
  }

  return {
    copies,
    restore: () => {
      for (const wrapper of wrappers) wrapper.remove();
    }
  };
}

/**
 * An SVG filter for one step, and the primitive its animation runs on.
 *
 * ## Why the filter is made here and per step
 *
 * Measured: `filter: url(#f) blur(0px)` → `blur(10px)` is **discrete** — a
 * `url()` anywhere in the list stops the whole list interpolating. So an SVG
 * filter cannot be a static look with an animated CSS filter on top of it; the
 * animation has to run *inside* the filter.
 *
 * Which means each step needs its own copy of the filter: two shapes blooming in
 * different colours at the same moment are two definitions, and a definition
 * shared between them would animate both from whichever step ran last.
 *
 * ## Why `flood-opacity` and not SMIL
 *
 * `flood-color` and `flood-opacity` are presentation attributes, so they are CSS
 * properties, so the Web Animations API interpolates them — measured, 0.1 → 0.9
 * gives 0.5 at the midpoint on the `<feFlood>` element itself. Everything else a
 * filter can do (turbulence, displacement, morphology) needs SMIL, which is
 * measured to work and is the next step rather than this one.
 *
 * Made, pointed at, and taken away — the same shape as the echo copies and the
 * per-letter spans.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function makeFilter(
  element: HTMLElement,
  sid: string,
  markup: string
): { host: SVGSVGElement | undefined; primitive: HTMLElement | undefined; restore: () => void } {
  const parent = element.parentElement;
  if (!parent) return { host: undefined, primitive: undefined, restore: () => undefined };

  const id = `motion-${sid.replace(/[^\w-]/g, '-')}`;
  const host = element.ownerDocument.createElementNS(SVG_NS, 'svg');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-motion-filter', id);
  host.style.position = 'absolute';
  host.style.pointerEvents = 'none';

  /**
   * `filterUnits="userSpaceOnUse"` is deliberately *not* set: the default is a
   * fraction of the shape's own box, which is what a bloom wants — a spill
   * proportional to the shape rather than to the slide.
   */
  host.innerHTML = `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">${markup.replace(
    '%TARGET%',
    'data-motion-primitive'
  )}</filter>`;

  parent.appendChild(host);
  const before = element.style.filter;
  element.style.filter = `url(#${id})`;

  return {
    host,
    primitive: host.querySelector<HTMLElement>('[data-motion-primitive]') ?? undefined,
    restore: () => {
      host.remove();
      element.style.filter = before;
    }
  };
}

/**
 * How thick a ruler is, in CSS pixels.
 *
 * The same 18 the stylesheet gives `.sl-ruler`, and stated here because the *fit*
 * has to know: the rulers sit in the same grid as the slide, so the room the slide
 * has is the pane less this. Two places holding one number is a cost; the
 * alternative is measuring an element that does not exist until after the fit that
 * needs it.
 */
const RULER_THICKNESS = 18;

/**
 * One edge's worth of ruler.
 *
 * The ticks are `axisTicks`' answer and the placement is a multiplication: the
 * model says where each one goes in twips, so this only scales. Which is the
 * division that makes a ruler trustworthy — a ruler that computed its own
 * positions would be a second opinion about where the slide is.
 *
 * The pointer's own line is drawn on it, because the question a ruler is asked
 * most is "where is this" and the answer is easier to see than to read.
 */
function SlideRuler({
  axis,
  length,
  scale,
  unit,
  pointer,
  onDraft,
  onPlace
}: {
  axis: 'x' | 'y';
  /** The slide's own length along this axis, in twips. */
  length: number;
  scale: number;
  unit: LengthUnit;
  /** Where the pointer is along this axis, in twips, if it is over the slide. */
  pointer?: number;
  /** Where a guide is being pulled to, while it is being pulled. */
  onDraft?: (at: number | undefined) => void;
  /** And where it was let go, if that is on the slide. */
  onPlace?: (at: number) => void;
}) {
  const ticks = useMemo(() => axisTicks(length, rulerStep(unit)), [length, unit]);
  const across = twipToPx(length) * scale;
  const host = useRef<HTMLDivElement>(null);

  /**
   * Dragging a guide out of the ruler.
   *
   * Where every tool with guides puts this, and the reason is that a ruler is
   * already the thing that says *where*: pulling a line off it is the gesture
   * that means "here, from now on".
   *
   * The position is measured from the ruler's own box, because the ruler is laid
   * out along the slide's edge and starts where the slide starts — so its origin
   * *is* the slide's origin along this axis, and no second opinion about where
   * the slide is has to be formed.
   *
   * Nothing is written until the pointer is let go. A guide the document learned
   * about on every pointer event would be forty entries of history for one
   * gesture, and the preview a reader watches is the app's for exactly that
   * reason — see `draftGuide`.
   */
  const pull = (event: React.PointerEvent) => {
    if (!onPlace) return;
    event.preventDefault();

    const box = host.current?.getBoundingClientRect();
    if (!box) return;

    const along = (pointer: { clientX: number; clientY: number }) =>
      Math.round(
        pxToTwip(
          (axis === 'x' ? pointer.clientX - box.left : pointer.clientY - box.top) / scale
        )
      );

    onDraft?.(along(event));

    const move = (moved: PointerEvent) => onDraft?.(along(moved));
    const up = (ended: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDraft?.(undefined);
      onPlace(along(ended));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={host}
      className="sl-ruler"
      data-ruler={axis}
      style={axis === 'x' ? { width: across } : { height: across }}
      onPointerDown={pull}
      /**
       * Not `aria-hidden` any more, now that it does something.
       *
       * A strip of tick marks is decoration and was hidden as such. A strip a
       * reader can pull a guide out of is a control, and a control a screen
       * reader cannot find is a control that does not exist for the reader who
       * most needs to be told it is there. What it cannot yet offer is a
       * *keyboard* way to place one — noted in the backlog rather than pretended
       * about here.
       */
      role="separator"
      aria-label={axis === 'x' ? '가로 눈금자 — 안내선을 끌어낼 수 있습니다' : '세로 눈금자 — 안내선을 끌어낼 수 있습니다'}
    >
      {ticks.map((tick) => {
        const at = twipToPx(tick.at) * scale;
        return (
          <span
            key={tick.at}
            className="sl-ruler-tick"
            data-major={tick.value === undefined ? undefined : 'true'}
            style={axis === 'x' ? { left: at } : { top: at }}
          >
            {/*
              A whole number of the reader's unit. The axis answers with the
              value and not with a string, because how a tick is written differs
              per axis — a length wants `3` and a clock wants `1.5s`.
            */}
            {tick.value !== undefined && <i>{Math.round(tick.value)}</i>}
          </span>
        );
      })}

      {typeof pointer === 'number' && (
        <span
          className="sl-ruler-pointer"
          data-ruler-pointer
          style={
            axis === 'x'
              ? { left: twipToPx(pointer) * scale }
              : { top: twipToPx(pointer) * scale }
          }
        />
      )}
    </div>
  );
}

/**
 * Where the deck is drawn.
 *
 * Two things happen here and neither touches the document.
 *
 * **Fitting.** A slide is 1280x720 CSS pixels and a window is not, so the whole
 * deck is scaled with `transform`. Visual and exact, never CSS `zoom`, for the
 * reason Word's zoom states at length: `zoom` re-lays-out, so every box rounds
 * again and measured positions drift from computed ones. A transform leaves the
 * layout alone, which is what lets a slide be authored at one size and shown at
 * another without moving anything on it.
 *
 * A transformed element still takes up its *unscaled* room, so the outer frame
 * is sized to what the scaled deck actually occupies — measured from the
 * untransformed box, which is the one thing a transform leaves alone.
 *
 * **Focus.** A deck app shows one slide, and the others are still in the
 * document and still rendered. Which one shows is a *stylesheet* rather than a
 * DOM write: the view owns every element inside the host and rewrites their
 * attributes on each render, so anything this set directly would last until the
 * next keystroke. A rule keyed on the sid the renderer already emits survives,
 * because it is not in the tree at all.
 */
export function Stage({
  host,
  focus,
  /** How the focused slide arrives, when the deck says it arrives with something. */
  arrival,
  /** What is not on the slide yet, and what this press has just brought on. */
  builds,
  /**
   * Asked to freeze what is running, and to say where it stopped.
   *
   * The transport's whole model: pausing *becomes* a scrub, so the only thing the
   * stage has to contribute is the moment — which it is the only thing that knows,
   * because it owns the animations.
   */
  pausing,
  onPaused,
  /**
   * The clock, handed out: a function that says what moment the press is at.
   *
   * The stage is the only thing that knows — it owns the animations — and the
   * pane is the only thing that draws it. A ref rather than a callback, because
   * the answer changes sixty times a second and a *state* update per frame would
   * rebuild the very animations being timed: `builds` is recomputed from the
   * app's state, and a new `builds` restarts every animation in it. So the pane
   * asks, once per frame, and nothing re-renders.
   */
  clock,
  /**
   * What a click on a shape has started — beside the press, not part of it.
   *
   * Separate from `builds` because this effect rebuilds everything in `builds`
   * whenever it changes, and a trigger must not restart what the press has already
   * run. Each firing carries an id, and the ones already started are left alone.
   */
  triggered,
  /** That this is the show: films start themselves here and nowhere else. */
  playing,
  zoom,
  onZoom,
  onScale,
  onGuideDraft,
  onGuidePlace,
  /**
   * Which unit the rulers are marked in — the reader's, held by the app.
   *
   * Absent means no rulers at all, which is what the presenter's screen and the
   * thumbnails want: a ruler is for placing things.
   */
  unit,
  fill,
  fit
}: {
  host: React.RefObject<HTMLDivElement | null>;
  /** The slide to show alone, or nothing to show the deck as a strip. */
  focus?: string;
  arrival?: TransitionFrom;
  builds?: {
    hidden: string[];
    /** Each step as the Web Animations API takes it: frames, and their timing. */
    playing: Array<{
      sid: string;
      frames: Array<Record<string, unknown>>;
      /** A path to travel, in twips relative to where the shape rests. */
      path?: PathPoint[];
      /** Whether the shape turns to face its travel along that path. */
      facing?: Facing;
      /** Whether the path's corners are rounded off. */
      smooth?: boolean;
      /** How many trailing copies follow the shape — an afterimage. */
      echo?: number;
      /**
       * An SVG filter this step *is*: its markup, and — for the kind the Web
       * Animations API can drive — the frames for one primitive inside it. A
       * filter with no frames animates itself, with SMIL.
       */
      svg?: { markup: string; frames?: Array<Record<string, unknown>> };
      /** What the effect applies to: the box, or the pieces of its text. */
      unit?: TextUnit;
      /** Milliseconds between one piece and the next. */
      stagger?: number;
      timing: {
        duration: number;
        delay: number;
        easing: string;
        fill: 'both';
        iterations: number;
        /** `add` for a motion that runs *with* another on the same shape. */
        composite?: 'replace' | 'add';
      };
      /** A moment to hold at, when a playhead is being dragged. */
      seekTo?: number;
      /** A moment to *start* at, when a paused preview is resumed. */
      playFrom?: number;
    }>;
    /**
     * The films this press starts, and the part of each that plays.
     *
     * `from`/`to` in milliseconds, `to: 0` for the file's own end — see
     * `media-trim.ts`.
     */
    plays?: Array<{ sid: string; from: number; to: number }>;
  };
  pausing?: boolean;
  onPaused?: (moment: number) => void;
  clock?: React.MutableRefObject<(() => number) | undefined>;
  triggered?: Array<Record<string, unknown>>;
  playing?: boolean;
  /** `undefined` fits the pane; a number is what the reader asked for. */
  zoom?: number;
  /** Told when the reader zooms with the wheel, so the control agrees. */
  onZoom?: (zoom: number) => void;
  /**
   * The scale this actually drew at, reported.
   *
   * Because the number in the topbar is *this* number, and the alternative — the
   * chrome measuring the slide's box — cannot work: a slide is scaled with a
   * `transform`, and a transform is exactly what a `ResizeObserver` does **not**
   * report. Measured: folding the timeline pane re-fitted the slide from 732 to
   * 888 pixels and the box went on saying 57% until some unrelated render came
   * along.
   */
  onScale?: (scale: number) => void;
  unit?: LengthUnit;
  /**
   * A guide being pulled out of a ruler, and where it was let go.
   *
   * Reported rather than written, because the *preview* while it is being pulled
   * has to be drawn over the slide — and the layer that draws over the slide is
   * the overlay, not this one. So the app holds the guide in flight and hands it
   * to whichever child needs it, which is what an app is for. See `draftGuide`
   * there.
   */
  onGuideDraft?: (guide: { axis: 'x' | 'y'; at: number } | undefined) => void;
  onGuidePlace?: (guide: { axis: 'x' | 'y'; at: number }) => void;
  /**
   * Fill the space, however large.
   *
   * Presenting is the one case where a slide is drawn above its natural size: a
   * projector is exactly what the editor's cap exists to avoid, and refusing to
   * grow would leave a 1280px slide adrift in the middle of a 4K display.
   */
  fill?: boolean;
  /**
   * The box to fit and to measure, in twips — the **surface being shown**.
   *
   * `stageFit` in the model answers it, and the app passes it because the app is what knows
   * which surface the reader is on. This used to be the constant `SLIDE_16_9`, and it was
   * wrong wherever a deck is not 16:9: a 4:3 deck drew at the scale for a wider one and its
   * ruler ran 662px across a 497px slide, and a definition opened for editing drew at that
   * same scale whatever its own size — a 5040×3960 card 128px wide in a 486px pane.
   */
  fit?: { width: number; height: number };
}) {
  const inner = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  /** The box to fit, with 16:9 as the answer for a caller that has not said. */
  const fitTo = fit ?? SLIDE_16_9;
  const [scale, setScale] = useState(1);
  /**
   * Where the pointer is on the slide, in the model's own unit.
   *
   * Only to draw it on the rulers, which is the question a ruler is asked most —
   * "where is this" — and easier to see than to read. Kept here rather than in the
   * overlay because the rulers are here, and because the overlay is inert while a
   * box is being typed in while the rulers are not.
   */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  /**
   * Whether to draw the rulers at all.
   *
   * A unit means the host wants them; `focus` means one slide is being looked at,
   * and in 전체 보기 a ruler would be measuring from the top of a strip of slides —
   * a number that means nothing about any of them. `fill` is the show.
   */
  const ruler = !!unit && !!focus && !fill;

  /**
   * Where the pointer is, watched on the **window**.
   *
   * Not on this pane, and the reason is the same one the wheel handler gives a
   * few hundred lines down: the selection overlay is a fixed layer drawn over the
   * slide and is not inside this element, so a pointer over the slide never
   * reaches a listener here — measured, zero events. Asking "where is the pointer"
   * of the window and answering with the slide's own box is the form that survives
   * anything being drawn on top, which on a canvas is a certainty.
   */
  useEffect(() => {
    if (!ruler) return;

    const onMove = (event: PointerEvent) => {
      const box = inner.current?.getBoundingClientRect();
      const pane = frame.current?.getBoundingClientRect();
      if (!box || !pane) return;

      // Off the pane entirely: the marks come off with it, rather than freezing
      // wherever the pointer left.
      const inside =
        event.clientX >= pane.left &&
        event.clientX <= pane.right &&
        event.clientY >= pane.top &&
        event.clientY <= pane.bottom;
      if (!inside) return setPointer(null);

      /**
       * Divided by the scale, because the slide's own origin is the scaled
       * layer's top left — a transform's origin is where it says it is.
       */
      setPointer({
        x: pxToTwip((event.clientX - box.left) / scale),
        y: pxToTwip((event.clientY - box.top) / scale)
      });
    };

    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [ruler, scale]);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const box = frame.current;
    const content = inner.current;
    if (!box || !content) return;

    const measure = () => {
      const style = getComputedStyle(box);
      /**
       * The room, less the rulers.
       *
       * They are in the same grid as the slide — a column and a row of their own —
       * so the room the *slide* has is the pane less their thickness. It did not
       * subtract them, and the arithmetic came out exactly 18px over: the slide
       * was fitted to the whole pane, the ruler column was added beside it, and
       * the grid overflowed by one ruler.
       *
       * Which showed up nowhere until the ruler became something to click.
       * `justify-content: center` centres tracks that overflow, so the whole grid
       * sat 9px to the left — putting the right half of the vertical ruler *under
       * the slide's overlay*, where a pointer could not reach it. Measured: the
       * ruler at 240–258 and the slide starting at 249.
       */
      const gutter = ruler ? RULER_THICKNESS : 0;
      const room = {
        width:
          box.clientWidth -
          (parseFloat(style.paddingLeft) || 0) -
          (parseFloat(style.paddingRight) || 0) -
          gutter,
        height:
          box.clientHeight -
          (parseFloat(style.paddingTop) || 0) -
          (parseFloat(style.paddingBottom) || 0) -
          gutter
      };

      /**
       * Fit to both when one slide is shown, and to the width when the whole
       * deck is: a strip is scrolled, so its height is not a constraint, and
       * fitting to it would draw every slide too small to read.
       */
      const drawn =
        zoom ??
        fitScale(
          fitTo,
          focus ? room : { width: room.width, height: Number.MAX_SAFE_INTEGER },
          fill ? { max: Infinity } : {}
        );
      setScale(drawn);
      // The chrome's number is this one, not a second measurement of it.
      onScale?.(drawn);

      // `offsetWidth`/`offsetHeight` are the untransformed box; the drawn one
      // already has the scale in it and would compound on every measure.
      if (content.offsetWidth > 0) {
        setSize({ width: content.offsetWidth, height: content.offsetHeight });
      }
    };
    measure();

    // The deck grows as slides are added and the window changes under it.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
    // `fitTo` as well: opening a definition changes the box to fit, and nothing else about the
    // stage changes size — so without it the card kept the slide's scale.
  }, [focus, zoom, fill, onScale, fitTo.width, fitTo.height]);

  /**
   * Zooming with the wheel, anchored to the pointer.
   *
   * The gesture is the suite's now — `useWheelZoom` — because Word had it too and
   * had it worse: it scoped the listener with `closest()`, which a canvas defeats
   * (the overlay is a fixed layer over the pane, so the count of events seen was
   * zero), and it never anchored, so zooming on a corner walked the corner off
   * the screen. The three corrections that were measured here are in that file,
   * and Word gets them by asking for the same hook.
   *
   * What stays this product's: which rectangle to anchor on. `drawnSlide` is the
   * slide as drawn, not the scaled container that holds the whole deck.
   */
  useWheelZoom({
    pane: frame,
    content: () => drawnSlide(),
    zoom: scale,
    onZoom: (next) => onZoom?.(next),
    min: ZOOM_MIN,
    max: ZOOM_MAX
  });

  /**
   * Panning, the way every canvas tool does it: hold space and drag.
   *
   * Only useful when the slide is larger than the pane, which is exactly when a
   * reader has zoomed in — and it is the one way to move around that does not
   * require finding a scrollbar.
   */
  /**
   * The slide as it is drawn, which is what the reader is anchored to.
   *
   * Not the scaled container: it holds the whole deck — the hidden definitions,
   * the gaps between slides — so its rectangle is larger than the slide's and by
   * an amount that changes with the zoom. Anchoring on it left a constant 0.8%
   * of the slide's width of drift per zoom, which is small enough to look like
   * rounding and large enough to accumulate.
   */
  const drawnSlide = useCallback((): DOMRect | undefined => {
    const found = inner.current?.querySelector<HTMLElement>('.sl-slide');
    const rect = found?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect : undefined;
  }, []);


  /**
   * The slide arriving, when the deck says it arrives with something.
   *
   * Written onto the element rather than expressed as a React style, because the
   * element is the *editor's* — this component creates `.sl-host` and stops, and
   * the slide inside it is drawn by the renderers. The same arrangement the
   * overlay uses to nudge a shape during a drag, and for the same reason.
   *
   * The transform is the slide's own and nothing else's: the zoom is a transform
   * on `.sl-stage-scaled` above it, so animating this one cannot fight it.
   *
   * Everything is put back at the end. A slide left mid-transition — because the
   * presenter moved on faster than the duration — would keep an inline transform
   * for the rest of the session, and the next reader to select a box on it would
   * find the handles somewhere else entirely.
   */
  useLayoutEffect(() => {
    if (!arrival || !focus) return;

    const slide = inner.current?.querySelector<HTMLElement>(
      `.sl-slide[data-bc-sid="${CSS.escape(focus)}"]`
    );
    if (!slide) return;

    const settle = () => {
      slide.style.transition = '';
      slide.style.transform = '';
      slide.style.opacity = '';
      slide.style.clipPath = '';
    };

    settle();
    slide.style.transition = 'none';
    if (arrival.transform) slide.style.transform = arrival.transform;
    if (arrival.opacity) slide.style.opacity = arrival.opacity;
    if (arrival.clipPath) slide.style.clipPath = arrival.clipPath;

    // Two frames: one for the browser to take the starting state, one to
    // release it. Releasing in the same frame is no animation at all — the
    // browser never draws the state it was told to start from.
    let released = 0;
    const release = requestAnimationFrame(() => {
      released = requestAnimationFrame(() => {
        const ms = arrival.duration;
        slide.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease, clip-path ${ms}ms ease`;
        slide.style.transform = '';
        slide.style.opacity = '';
        slide.style.clipPath = '';
      });
    });

    const done = window.setTimeout(settle, arrival.duration + 80);
    return () => {
      cancelAnimationFrame(release);
      cancelAnimationFrame(released);
      window.clearTimeout(done);
      settle();
    };
  }, [focus, arrival]);

  /**
   * What is on the slide yet, and what this press has just started.
   *
   * Written onto the editor's own elements, like the transition above and for
   * the same reason: this component creates `.sl-host` and stops.
   *
   * The animations are the Web Animations API's. It was a starting style written
   * onto the element and released two frames later — a CSS transition driven by
   * hand — and three things fell out of replacing it: an emphasis can *return*
   * (a transition has two ends and a pulse needs three), a step can carry its own
   * easing curve (the word `ease` was in a template string), and a delay is real
   * rather than approximated by when the release happened to run.
   *
   * `visibility` for what has not arrived: a hidden box keeps its place in the
   * layout, so a frame that arranges its children does not close the gap and
   * re-open it on every press.
   */
  /**
   * Whether the reader has asked for less motion.
   *
   * A duty rather than a feature: `prefers-reduced-motion` is set by people who
   * are made ill by movement, and a presentation tool that ignores it is one they
   * cannot sit through. What it does *not* mean is "show nothing" — a build's
   * whole job is to bring a shape on, so the shape still arrives; it arrives at
   * the end of its animation immediately instead of travelling there.
   *
   * Read as a live query rather than once, because a reader can change it while
   * the app is open and the next press should honour it.
   */
  const [calmly, setCalmly] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const read = () => setCalmly(query.matches);
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  /**
   * What is running, so the transport can stop it where it is.
   *
   * A ref rather than state: putting the animations in state would re-render on
   * every press, and re-running the effect that *made* them would start them
   * over — which is what a pause must not do.
   */
  const running = useRef<Animation[]>([]);
  /** The SMIL timelines running with them — see `smilClocks`. */
  const clocks = useRef<SVGSVGElement[]>([]);

  /**
   * The moment this press is at, read from both kinds of clock.
   *
   * `currentTime` counts from the animation's own start *including* its delay, so
   * it is the press-relative moment, which is exactly what the playhead measures.
   * The largest of them, because a press with one step that starts late would
   * otherwise report a moment before it began.
   *
   * A step whose animation is SMIL — a melt, a chromatic split — has *no* Web
   * Animation at all, so a moment read only from those is zero, the playhead goes
   * to zero, and the paused frame is the beginning of the press. Measured: pausing
   * a melt made its filter disappear. An `<svg>`'s clock counts from when it was
   * inserted, which is when the press started, so it measures the same thing.
   *
   * One function, because the pause and the running playhead are the same
   * question asked at different times, and two readings of a clock that disagreed
   * would be a playhead that jumped when a reader pressed pause.
   */
  const momentNow = useCallback(() => {
    const times = [
      ...running.current.map((animation) => Number(animation.currentTime ?? 0)),
      ...clocks.current.map((clock) => clock.getCurrentTime() * 1000)
    ].filter((time) => Number.isFinite(time));
    return times.length > 0 ? Math.max(...times) : 0;
  }, []);

  /** Handed to whoever draws the clock — see `clock`. */
  useEffect(() => {
    if (!clock) return;
    clock.current = momentNow;
    return () => {
      clock.current = undefined;
    };
  }, [clock, momentNow]);

  /** Freezing what is running, and reporting where it stopped. */
  useEffect(() => {
    if (!pausing) return;
    const moment = momentNow();
    for (const animation of running.current) animation.pause();
    // And the filters' own clocks, which are not animations and would otherwise
    // go on melting while the shape stood still.
    for (const svg of clocks.current) svg.pauseAnimations();
    onPaused?.(moment);
  }, [pausing, onPaused, momentNow]);

  /**
   * The firings this stage has already started.
   *
   * Ids rather than a count, so a *second* click on the same trigger is a new
   * firing and a re-render for any other reason is not. Cleared when the slide
   * changes, which is the one moment every animation on it stops meaning anything.
   */
  const startedFirings = useRef(new Set<string>());
  const firedAnimations = useRef<Animation[]>([]);
  const firedRestores = useRef<Array<() => void>>([]);

  useEffect(() => {
    return () => {
      for (const animation of firedAnimations.current) animation.cancel();
      for (const restore of firedRestores.current) restore();
      firedAnimations.current = [];
      firedRestores.current = [];
      startedFirings.current.clear();
    };
  }, [focus]);

  /**
   * Running what a click started.
   *
   * Only the firings not started yet: an animation already running is left where
   * it is, which is what makes clicking one trigger not disturb another.
   */
  useLayoutEffect(() => {
    const root = inner.current;
    if (!root || !triggered || triggered.length === 0) return;

    for (const entry of triggered) {
      const id = String(entry.id);
      if (startedFirings.current.has(id)) continue;
      startedFirings.current.add(id);

      const element = root.querySelector<HTMLElement>(
        `[data-bc-sid="${CSS.escape(String(entry.sid))}"]`
      );
      if (!element || typeof element.animate !== 'function') continue;

      // A triggered entrance is the reason its shape was hidden; showing it is
      // the first half of running it.
      element.style.visibility = '';

      const timing = entry.timing as Record<string, unknown>;
      const frames = (entry.frames ?? []) as Keyframe[];
      const svg = entry.svg as { markup: string; frames?: Keyframe[] } | undefined;

      if (svg) {
        const made = makeFilter(element, `${id}`, svg.markup);
        firedRestores.current.push(made.restore);
        if (svg.frames && made.primitive) {
          firedAnimations.current.push(
            made.primitive.animate(svg.frames, timing as KeyframeAnimationOptions)
          );
        }
        continue;
      }

      if (frames.length === 0) continue;
      firedAnimations.current.push(
        ...runFrames(element, frames, timing as KeyframeAnimationOptions)
      );
    }
  }, [triggered]);

  useLayoutEffect(() => {
    const root = inner.current;
    if (!root || !builds) return;

    /**
     * Every element this press writes a style on, with the style it had.
     *
     * A Map so an element touched twice — a shape that is hidden and then
     * animated — is remembered once, at the value it had *before* any of it.
     * See the cleanup for what this is for and what it cost to find out.
     */
    const snapshot = new Map<HTMLElement, Record<string, string>>();
    const touched = {
      push: (element: HTMLElement) => {
        if (snapshot.has(element)) return;
        const own: Record<string, string> = {};
        for (const property of STAGE_WRITES) own[property] = element.style.getPropertyValue(property);
        snapshot.set(element, own);
      }
    };
    const animations: Animation[] = [];
    /** The out-point listeners this press attached — see the films, below. */
    const stopWatching: Array<() => void> = [];
    /**
     * Held in a ref as well as locally, so *pausing* can reach them.
     *
     * Pausing must not re-run this effect: re-running it would build the
     * animations again and they would start from the beginning, which is the
     * opposite of a pause. So the transport's effect reaches the same list
     * through here.
     */
    running.current = animations;
    /** How to put a split box's text back — see `splitInto`. */
    const restores: Array<() => void> = [];
    /**
     * The SMIL clocks this press started, so the transport can stop them too.
     *
     * A `<svg>` is its own timeline and the Web Animations API knows nothing
     * about it: pausing the animations without pausing these would freeze the
     * shapes and leave the filters running.
     */
    const smilClocks: SVGSVGElement[] = [];
    clocks.current = smilClocks;
    const at = (sid: string) =>
      root.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid)}"]`) ?? undefined;

    for (const sid of builds.hidden) {
      const element = at(sid);
      if (!element) continue;
      // Remembered *before* it is written, or what is put back afterwards is what
      // this loop wrote: measured, a shape hidden for a press came back hidden.
      touched.push(element);
      element.style.visibility = 'hidden';
    }

    for (const {
      sid,
      frames,
      timing,
      seekTo,
      playFrom,
      unit,
      stagger,
      path,
      facing,
      smooth,
      echo,
      svg
    } of builds.playing) {
      const element = at(sid);
      /**
       * No frames is nothing to run — *unless* the step is an SVG filter, whose
       * frames belong to a primitive inside the filter rather than to the shape.
       *
       * The guard said `frames.length === 0` and nothing else, so every SVG
       * effect was skipped before it was reached: measured, no filter was made
       * and the shape animated not at all.
       */
      if (!element || (frames.length === 0 && !svg)) continue;

      touched.push(element);
      element.style.visibility = '';

      /**
       * A path is a *style* written before the animation, not a frame.
       *
       * `offset-path` says where to travel and `offset-rotate` whether to turn
       * with it; the animation is one property, `offset-distance`. Written from
       * the element's own size because the element's *centre* is what lands on
       * the path — measured — so the path is shifted by half the shape to make a
       * point of `(0, 0)` mean "where it already is".
       *
       * Cleared with everything else in the cleanup below, like the visibility.
       */
      if (path && path.length > 1) {
        element.style.offsetPath = pathCss(
          path,
          {
            width: pxToTwip(element.offsetWidth),
            height: pxToTwip(element.offsetHeight)
          },
          smooth !== false
        );
        element.style.offsetRotate = facingCss(facing);
      }

      /**
       * A browser without the API draws the end state and nothing moves.
       *
       * Which is the right failure: a slide that appears is a slide, and a slide
       * that never appears because its animation could not run is a blank
       * screen in front of an audience.
       */
      if (typeof element.animate !== 'function') continue;

      /**
       * An SVG filter, whose animation runs on a primitive rather than on the
       * shape — see `makeFilter`. The shape gets the `filter` and nothing else.
       */
      if (svg) {
        const made = makeFilter(element, sid, svg.markup);
        restores.push(made.restore);

        if (svg.frames && made.primitive) {
          // The kind the Web Animations API can drive: `flood-*` is a CSS
          // property, so this is an ordinary animation on an unusual element.
          const animation = made.primitive.animate(svg.frames as Keyframe[], {
            ...timing,
            ...(calmly ? { duration: 0, delay: 0, iterations: 1 } : {})
          });
          animations.push(animation);
          if (typeof seekTo === 'number') {
            animation.pause();
            animation.currentTime = seekTo;
          } else if (typeof playFrom === 'number' && playFrom > 0) {
            animation.currentTime = playFrom;
          }
        } else if (made.host) {
          /**
           * A filter that animates *itself*, with SMIL — the only thing that can
           * touch `feDisplacementMap`'s scale or `feOffset`'s dx, because neither
           * is a CSS property.
           *
           * Its clock starts when the `<svg>` is inserted, which is now, so the
           * step's delay is already expressed by the `<animate>`'s `begin`.
           * Scrubbing is `pauseAnimations()` and `setCurrentTime` — measured to be
           * exact and repeatable — and a reader who asked for less motion gets the
           * end of it, frozen.
           */
          smilClocks.push(made.host);
          if (calmly) {
            made.host.pauseAnimations();
            made.host.setCurrentTime((timing.delay + timing.duration) / 1000);
          } else if (typeof seekTo === 'number') {
            made.host.pauseAnimations();
            made.host.setCurrentTime(seekTo / 1000);
          } else if (typeof playFrom === 'number' && playFrom > 0) {
            made.host.setCurrentTime(playFrom / 1000);
          }
        }
        continue;
      }

      /**
       * One animation per piece, each a beat later than the one before.
       *
       * The whole of what a text animation *is*: the same effect, the same
       * curve, the same duration, applied to the letters of a title with sixty
       * milliseconds between them. A box is the one-piece case, so there is no
       * second code path — `splitInto` answers `[element]` and the loop below
       * runs once.
       */
      const split = unit && unit !== 'box' ? splitInto(element, unit) : undefined;
      if (split) restores.push(split.restore);
      const pieces = split?.pieces ?? [element];
      const beat = Math.max(0, stagger ?? 0);

      /**
       * The trail, which runs the *same* frames a little later on each copy.
       *
       * Behind the shape rather than after it: a trail is a fact about drawing,
       * not about time, so it does not touch the bar's width or what follows the
       * step. Only for a whole box — a per-letter trail is twenty-four copies of
       * a title, which is a smear.
       */
      const trail =
        calmly || (unit && unit !== 'box')
          ? undefined
          : makeEchoes(element, Math.min(6, echo ?? 0));
      if (trail) restores.push(trail.restore);
      const gap = echoGap(timing.duration);

      trail?.copies.forEach((copy, index) => {
        if (path && path.length > 1) {
          // A copy travels the same route: the style is a prerequisite, so each
          // one needs its own.
          copy.style.offsetPath = element.style.offsetPath;
          copy.style.offsetRotate = element.style.offsetRotate;
        }
        animations.push(
          ...runFrames(copy, frames as Keyframe[], {
            ...timing,
            delay: timing.delay + gap * (index + 1)
          })
        );
      });

      pieces.forEach((piece, index) => {
        touched.push(piece);
        const made = runFrames(piece, frames as Keyframe[], {
          ...timing,
          /**
           * A reader who asked for less motion gets the *end* of the motion.
           *
           * Not nothing: the shape still arrives, because arriving is what a
           * build is for. A duration of zero and no delay means it is simply
           * already there — and the trail, the stagger and the path all collapse
           * with it, because they are all made of these numbers.
           */
          ...(calmly ? { duration: 0, delay: 0, iterations: 1 } : {}),
          delay: calmly ? 0 : timing.delay + beat * index
        });
        animations.push(...made);

        /**
         * A playhead, which is a moment rather than a playback.
         *
         * Paused and sought: the reader dragging it wants to *see* that instant,
         * so the animation holds there. This is the thing a CSS transition could
         * not do at all — it has no moment you can ask for — and the reason the
         * whole playback moved to the Web Animations API.
         *
         * The same moment for every piece, which is what makes a scrubbed text
         * animation readable: at 300ms into a title, the first letters are in
         * and the last are still on their way. And for every *animation* of a
         * piece: a step split into an additive half and a plain one is two
         * clocks that have to say the same time.
         */
        for (const animation of made) {
          if (typeof seekTo === 'number') {
            animation.pause();
            animation.currentTime = seekTo;
          } else if (typeof playFrom === 'number' && playFrom > 0) {
            // A resumed preview: the same moment, running rather than held.
            animation.currentTime = playFrom;
          }
        }
      });
    }

    /**
     * The films this press starts.
     *
     * A `play` step is a press like any other to a presenter — press, and the
     * next thing happens — so it arrives here beside the builds rather than
     * through a second path. What it does is start the element instead of
     * animating it, which is the whole of the difference.
     */
    for (const { sid, from, to } of builds.plays ?? []) {
      const element = at(sid) as HTMLMediaElement | undefined;
      if (!element || typeof element.play !== 'function') continue;
      touched.push(element as unknown as HTMLElement);

      /**
       * The in-point, which is a seek before the play.
       *
       * Set even when it is zero: a film played once already is sitting at its
       * out-point, and the second press would start it at the end of the piece
       * rather than the beginning of it.
       */
      element.currentTime = from / 1000;

      /**
       * The out-point, which the element itself has to enforce.
       *
       * `timeupdate` rather than a timer: a timer measures *wall* time and a film
       * is not obliged to keep up with it — a buffering stall, a slow decode or a
       * reader pausing with the browser's own controls all make the two disagree,
       * and the disagreement is a clip that stops in the wrong place. The event
       * fires roughly four times a second, so this overshoots by up to a quarter
       * of a second; the honest fix for that is `requestVideoFrameCallback`, and
       * it is in the backlog rather than pretended about here.
       */
      if (to > from) {
        const stopAt = to / 1000;
        const watch = () => {
          if (element.currentTime < stopAt) return;
          element.pause();
          element.removeEventListener('timeupdate', watch);
        };
        element.addEventListener('timeupdate', watch);
        /* Removed with everything else this press touched: a listener left on a
           film outlives the press that trimmed it, and the next play would stop
           at the old out-point. */
        stopWatching.push(() => element.removeEventListener('timeupdate', watch));
      }

      void element.play().catch(() => undefined);
    }

    return () => {
      /**
       * Cancelled, not left to finish.
       *
       * An animation with `fill: both` holds its last frame forever, so an exit
       * that was still running when the show ended would leave a shape invisible
       * in the editor — present in the document and impossible to find, which is
       * the worst bug this arrangement can produce.
       */
      for (const animation of animations) animation.cancel();
      // The films' out-points: a listener left behind would stop the *next*
      // playing of that film at the trim this press was drawn with.
      for (const stop of stopWatching) stop();
      /**
       * The text goes back before the styles are cleared.
       *
       * In this order because the spans are what the styles were on: putting the
       * run back first means the loop below is clearing the box, which is all
       * there is left to clear. The other order leaves the spans in the document
       * for as long as the loop takes, which is nothing to a reader and is
       * exactly the kind of window a mutation observer notices.
       */
      for (const restore of restores) restore();
      /**
       * Put back what was there, which is not the same as clearing.
       *
       * This loop cleared each property to `''`, and for the ones only this
       * writes that is the same thing. For `filter` it is not: `effectsCss` gives
       * a shape with a 흐림 effect `filter: blur(3px)`, and clearing it took the
       * blur away **for good** — React writes a style prop only when it changes,
       * so nothing put it back until something else about the shape did.
       *
       * Measured on 2026-08-20: a blurred shape with one glow step came out of
       * the press with no blur at all. The additive composite that lets the two
       * coexist *while* the motion runs (see `runFrames`) could not have helped
       * — by then the base value was gone.
       *
       * So the values are taken before they are written and given back
       * afterwards. `snapshot` holds the element's own inline text for each
       * property, `''` included, which is exactly what "put it back" means.
       */
      for (const [element, own] of snapshot) {
        for (const [property, value] of Object.entries(own)) {
          element.style.setProperty(property, value);
          // A property whose own value was empty is *removed* rather than set to
          // an empty string, so the style attribute comes out as it went in.
          if (value === '') element.style.removeProperty(property);
        }
      }
    };
  }, [builds, calmly]);

  /**
   * Playing what is on the slide, which only happens in the show.
   *
   * A film's `autoplay` is drawn as `data-autoplay` for the reason in the
   * renderer: a real one starts the film in the editor, where three films would
   * begin playing the moment a deck opened. What the document means is "start
   * when this slide comes up", and this is the only place that knows when that
   * is.
   *
   * Everything is stopped and rewound on the way out — leaving a slide, ending
   * the show, or switching to another deck. A film left playing on a slide
   * nobody is looking at is a voice from an empty room, and one left half-way
   * through is a slide that starts in the middle the next time it is shown.
   */
  useLayoutEffect(() => {
    const root = inner.current;
    if (!root || !focus) return;

    const slide = root.querySelector<HTMLElement>(
      `.sl-slide[data-bc-sid="${CSS.escape(focus)}"]`
    );
    const media = slide
      ? [...slide.querySelectorAll<HTMLMediaElement>('video, audio')]
      : [];

    if (playing) {
      for (const element of media) {
        if (element.dataset.autoplay !== 'true') continue;
        // A promise, because a browser may refuse — an unmuted film with no
        // gesture behind it — and an unhandled rejection in a presentation is
        // a console error nobody will ever see.
        void element.play().catch(() => undefined);
      }
    }

    return () => {
      for (const element of media) {
        element.pause();
        element.currentTime = 0;
      }
    };
  }, [focus, playing]);

  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [spacebar, setSpacebar] = useState(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      // Space is a character in the text and a button press on a button.
      if (target?.closest?.('input, textarea, [contenteditable="true"], button')) return;
      event.preventDefault();
      setSpacebar(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacebar(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPanDown = useCallback(
    (event: React.PointerEvent) => {
      // Space-drag, or the middle button, which is the other thing readers try.
      if (!spacebar && event.button !== 1) return;
      const pane = frame.current;
      if (!pane) return;

      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      panning.current = {
        x: event.clientX,
        y: event.clientY,
        left: pane.scrollLeft,
        top: pane.scrollTop
      };
    },
    [spacebar]
  );

  const onPanMove = useCallback((event: React.PointerEvent) => {
    const held = panning.current;
    const pane = frame.current;
    if (!held || !pane) return;
    pane.scrollLeft = held.left - (event.clientX - held.x);
    pane.scrollTop = held.top - (event.clientY - held.y);
  }, []);

  const onPanUp = useCallback((event: React.PointerEvent) => {
    if (!panning.current) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    panning.current = null;
  }, []);

  return (
    <div
      className="sl-stage"
      ref={frame}
      data-focus={focus ?? ''}
      data-panning={spacebar ? 'true' : undefined}
      onPointerDownCapture={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerCancel={onPanUp}
    >
      {/*
       * The rule that shows one slide. Generated rather than written in the
       * stylesheet because it names a sid, and a sid is a fact about this
       * document rather than about the product.
       */}
      {focus && (
        <style>{
          /*
           * One page, or one **definition**.
           *
           * A component's definition is drawn hidden, like every other definition in
           * `resources` — so focusing it means showing that one and hiding the slides, which
           * is the same sentence the other way round. Two rules rather than a class on the
           * stage, because both name a sid.
           */
          `.sl-stage[data-focus="${focus}"] .sl-slide:not([data-bc-sid="${focus}"]) { display: none; }` +
          /*
           * `!important`, and this is the one place it is the honest answer.
           *
           * A definition's own renderer writes `display: none` **inline**, so that it stays
           * hidden wherever it is drawn without an app's stylesheet — a thumbnail, an export,
           * a test. An inline style beats any rule, so showing the one a reader has opened
           * has to say so louder. Measured: without it the definition stayed hidden with the
           * stage focused on it, which looks like the whole feature not working.
           *
           * And the **library** too, as `display: contents` — which is the third answer to this
           * and the first one the ruler agrees with. Measured, twice:
           *
           * - Un-hiding the container as a **block** puts a box in the stage's flow, and the
           *   ruler came out six pixels off the slide it measures. (That was `resources`, which
           *   is also why the definitions moved out of it: showing one meant reaching past a
           *   `display: none` written to hide layouts, with `:has()`.)
           * - Leaving the library visible *always* — its children carry their own
           *   `display: none`, so it looked free — is the same six pixels on every slide,
           *   which is how the ruler test found it a second time.
           *
           * `display: contents` makes the container contribute no box at all: the definition
           * becomes a child of the stage, exactly like the slide it replaces.
           */
          `.sl-stage[data-focus="${focus}"] .sl-library { display: contents !important; }` +
          /*
           * And `resources`, for a **layout** or a **master** — which live there with the theme
           * and the notes, and are the two things a deck inherits from that nothing could ever
           * change. Same `display: contents`, same reason: no box, so the ruler stays where it
           * was.
           */
          `.sl-stage[data-focus="${focus}"] .w-resources { display: contents !important; }` +
          /*
           * Any definition, by sid — not the component's class.
           *
           * A layout and a master are drawn by the same rule as a component's definition now,
           * and naming one class was how this file would have grown a third copy of it. What is
           * shared is "a definition the reader has opened"; what differs is nothing.
           */
          `.sl-stage[data-focus="${focus}"] .sl-def[data-bc-sid="${focus}"] { display: block !important;` +
          /*
           * With the size the app measured, because a layout has none of its own.
           *
           * A slide and a component carry a width and a height; a layout and a master are the
           * *shape of the slides that follow them* (`stageFit`), and their renderer cannot know
           * that without reading the document. So the size arrives here, where it is already
           * known — and the alternative, a renderer resolving the deck's size through the
           * environment, would put a foreign read in the one place this design keeps plain.
           */
          ` width: ${twipToPx(fitTo.width)}px; height: ${twipToPx(fitTo.height)}px; }`
        }</style>
      )}

      {/*
        * The rulers, along the top and the left of the deck.
        *
        * Drawn as siblings of the frame in a two-by-two grid rather than
        * positioned by measurement, so they line up with the slide **by
        * construction**: the same column is the same width, and there is nothing
        * to keep in step when the scale changes.
        *
        * Only for one slide at a time. In 전체 보기 the pane holds a strip of every
        * slide, and a ruler over that would be measuring from the top of the deck
        * — a number that means nothing about any of them. And never while
        * presenting, where an audience is looking.
        */}
      {ruler && (
        <>
          <div className="sl-ruler-corner" aria-hidden />
          <SlideRuler
            axis="x"
            length={fitTo.width}
            scale={scale}
            unit={unit!}
            pointer={pointer?.x}
            onDraft={(at) => onGuideDraft?.(at === undefined ? undefined : { axis: 'x', at })}
            onPlace={(at) => onGuidePlace?.({ axis: 'x', at })}
          />
          <SlideRuler
            axis="y"
            length={fitTo.height}
            scale={scale}
            unit={unit!}
            pointer={pointer?.y}
            onDraft={(at) => onGuideDraft?.(at === undefined ? undefined : { axis: 'y', at })}
            onPlace={(at) => onGuidePlace?.({ axis: 'y', at })}
          />
        </>
      )}

      <div
        className="sl-stage-frame"
        style={
          size
            ? { width: size.width * scale, height: size.height * scale }
            : { width: twipToPx(SLIDE_16_9.width) * scale }
        }
      >
        <div
          ref={inner}
          className="sl-stage-scaled"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {/* The editor owns this element's subtree; React creates it and stops. */}
          <div ref={host} className="sl-host" />
        </div>
      </div>
    </div>
  );
}
