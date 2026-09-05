import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { dragGesture } from '@barocss/shared';
import type { Editor } from '@barocss/editor-core';
import {
  Button,
  Choice,
  Icon,
  ColorField,
  Field,
  FieldGroup,
  NumberField,
  Waveform,
  axisTicks,
  momentAt,
  timeStep,
  trimWindow,
  placeNear,
  useAudioPeaks
} from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { componentOf } from '@barocss/office-canvas';
/*
 * 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장.
 *
 * 이 파일은 `timeline-pane.tsx` 다: 모델은 `timeline.ts` 이고, 같은 폴더에서 `.ts` 와 `.tsx` 가
 * 이름을 다투면 `./timeline` 이 어느 쪽인지 아무도 말할 수 없다.
 */
import {
  DEFAULT_AMOUNT,
  DEFAULT_DIRECTION,
  EASING_PRESETS,
  MOTION_EFFECTS,
  bezierCss,
  easingPoints,
  effectDefinition,
  resolveEffect
} from './motion-effects';
import {
  axisSpan,
  cardSteps,
  delayForStart,
  namedBoxes,
  pressCount,
  slideTimeline,
  snapPoints,
  snapTo,
  timelineDuration,
  triggerWindow,
  withTiming,
  type TimedStep
} from './timeline';
import { effectsOf, paintsOf } from './paints';
import { TRACK_SLOTS } from './motion-tracks';
import { FACINGS, FACING_LABELS, pathLength } from './motion-path';
import {
  matchingPreset,
  motionValues,
  presetAttrs,
  presetById,
  presetsIn
} from './motion-presets';
import {
  SPRING_PRESETS,
  parseSpring,
  springCss,
  springSamples,
  springSettling
} from './spring';
import { labelOfBox } from './layers';
import { TEXT_UNITS, TEXT_UNIT_LABELS } from './text-units';
import { costLabel, pressCost, stepElements, stepTier } from './motion-cost';
import { THEME_COLOUR_SLOTS, themeFor, themeRef } from './theme';
import { MIN_TRIM_MS, headTrim, tailTrim } from './media-trim';

/**
 * The slide's timeline: what happens, to what, and *when*.
 *
 * The first version of this was a list — rows in order, with numbers for the
 * timing — which is PowerPoint's animation pane and not what anybody means by a
 * timeline. Measured against the tools this product is aimed at, four things
 * were missing, and every one of them is about the same thing: **time has to be
 * a dimension you can see and drag, not a number you type.**
 *
 * - **A track per shape.** Canva stacks an element's animations under the
 *   element; Figma groups them by object; a video editor calls it a layer. A
 *   shape that appears, is emphasised while it is talked about and then leaves is
 *   *one row with three bars*, and a flat list says three unrelated things.
 * - **Bars on an axis.** A bar's left edge is when it starts and its width is
 *   how long it takes. Dragging the bar sets the delay; dragging its right edge
 *   sets the duration. That is the whole gesture, and it replaces two number
 *   fields with the thing the numbers were describing.
 * - **A playhead.** A preview that only plays from the start is a video player
 *   with no scrubber. The point of a timeline is to look at *a moment*.
 * - **A curve.** Every step in the product ran `ease`, because the word was in a
 *   template string in the renderer. Presets and a draggable cubic-bezier, which
 *   is what Figma offers and what the tenth case always needs.
 *
 * ## Time within a press
 *
 * The axis is one press, not the whole slide. A slide's clock stops at every
 * click — the next moment is whenever the presenter gets to it, which may be a
 * second or a minute — so each press is its own segment starting at zero, which
 * is how PowerPoint's advanced timeline draws it too. The tabs above the axis
 * are the presses; the ruler under it is seconds.
 */
/** What a fill is, in the words the paint panel uses for it. */
const PAINT_LABELS: Record<string, string> = {
  solid: '단색',
  linear: '그라디언트',
  radial: '원형 그라디언트',
  angular: '각도 그라디언트',
  image: '그림'
};

/** What the motion pane is told. */
export interface TimelinePaneProps {
  editor: Editor | null;
  slideSid?: string;
  revision: number;
  onPreview?: () => void;
  previewing?: boolean;
  onRewind?: () => void;
  onStepFrame?: (frames: number) => void;
  playhead?: number;
  onPlayhead?: (at: number) => void;
  moment?: React.MutableRefObject<(() => number) | undefined>;
  press?: number;
  onPress?: (press: number) => void;
  /**
   * Open a **card** by its durable id, for the line that says which cards animate themselves.
   *
   * Taken rather than done here for the reason every "where the reader is" decision in this app is
   * the app's: opening a definition changes the surface being edited, and the stage, the filmstrip
   * and the components panel all have to agree about that.
   */
  onOpenCard?: (componentId: string) => void;
  /** Every selected bar, so several can be dragged, retimed or deleted at once. */
  selected?: string[];
  onSelected?: (sids: string[]) => void;
  /** Whether the reader is placing a path's points on the slide. */
  drawing?: boolean;
  onDrawing?: (drawing: boolean) => void;
  height?: number;
  onHeight?: (height: number) => void;
  open?: boolean;
  onOpen?: (open: boolean) => void;
  /**
   * **어느 무대인가** — 재생 중인 필름의 요소를 찾을 범위.
   *
   * 필름의 길이는 모델이 모른다: 파일이 실려야 `duration` 이 나온다. 그래서 이 판은 무대 위의
   * `<video>`/`<audio>` 를 sid 로 찾아 물어본다. 앱에 있을 때는 `document.querySelector('.sl-stage
   * …')` 였고, 그건 형제의 클래스 이름을 이 파일이 아는 것이었다. `Stage` 가 `frame` 으로 내주고
   * 앱이 여기로 건넨다.
   */
  host?: React.RefObject<HTMLElement | null>;
}

export function TimelinePane({
  editor,
  slideSid,
  revision,
  onPreview,
  previewing,
  /** Back to the start of the press, and a frame at a time — see `stepMoment`. */
  onRewind,
  onStepFrame,
  /** Where the playhead is, in milliseconds into the press being looked at. */
  playhead,
  onPlayhead,
  /**
   * The running clock: what moment the stage's animations are at, asked rather
   * than pushed. See the effect that draws it.
   */
  moment,
  press,
  onPress,
  onOpenCard,
  /**
   * Which step is selected, held by the app.
   *
   * Because the *overlay* draws a path step's path on the shape, so the reader
   * can drag its points — a gesture that spans this pane and the canvas has to be
   * one piece of state, or the two halves disagree about what is being edited.
   * The same reason the paint editor's index lives up there.
   */
  selected: selectedFromApp,
  onSelected,
  drawing,
  onDrawing,
  /** How tall the pane is, and whether it is open at all — the app's state. */
  height,
  onHeight,
  open = true,
  onOpen,
  host
}: TimelinePaneProps) {
  /**
   * Which events those are is the suite's answer, not this file's — see
   * `useEditorRevision`, where the three of them and the reason for each are
   * written down once. It was hand-rolled here, and the copy in Word's ribbon
   * was missing one of the three for months.
   */
  const tick = useEditorRevision(editor);

  const steps = useMemo<TimedStep[]>(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !slideSid) return [];
    return withTiming(
      slideTimeline({ rootId, getNode: (sid: string) => store.getNode(sid) }, slideSid)
    );
  }, [editor, slideSid, revision, tick]);

  /**
   * The **cards** on this slide that animate themselves, and what they are called.
   *
   * Not rows in this pane, and that is the same decision the layer list makes about a card's parts
   * (§10b-13): the motion belongs to the card, so it is arranged inside the card — once, for every
   * placement. Rows here would offer a reader the chance to edit one placement's copy of a decision
   * that has no copies.
   *
   * But a reader standing on the slide has to be *told*, or the cards move on arrival and nothing on
   * screen says why. So: one line, naming the cards, and a press opens the one it names — the same
   * courtesy the layer list gives, which is a way in rather than a badge.
   */
  const animatingCards = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !slideSid) return [];

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    const named = new Map<string, { id: string; name: string }>();
    for (const step of cardSteps(doc as never, slideSid)) {
      const placement = String(step.target).split('~')[0];
      const definition = componentOf(doc as never, store.getNode(placement));
      if (!definition || named.has(definition.id)) continue;
      named.set(definition.id, { id: definition.id, name: definition.name || definition.id });
    }
    return [...named.values()];
  }, [editor, slideSid, revision, tick]);

  const presses = pressCount(steps);
  /**
   * Whether this slide has anything waiting for a *shape* rather than a press.
   *
   * A triggered step's group is 0 — it is not in the sequence — so without a tab
   * for it the pane would draw no bar at all for a step a reader had just made.
   * Press 0 is where it goes, labelled 클릭 rather than a number, because it is
   * not the zeroth press: it is not a press.
   */
  const hasTriggers = steps.some((step) => !!step.on);
  const at = Math.min(Math.max(press ?? 1, hasTriggers ? 0 : 1), Math.max(presses, 1));
  const shown = steps.filter((step) => step.group === at);

  /**
   * The axis's length: the press, with a little room after it.
   *
   * A second of headroom rather than exactly the last bar's end, so a reader can
   * always drag something *later* than everything else — an axis that stops at
   * the last bar has nowhere to put the next one.
   */
  /**
   * How magnified the axis is: 1 fits the press, and above it the pane scrolls.
   *
   * The pane's, not the app's: it is a fact about how closely one reader is
   * looking at one press, which is not something the deck or the other panes have
   * any use for — unlike the pane's *height*, which takes room from everything.
   */
  const [magnify, setMagnify] = useState(1);
  /**
   * The time the axis covers — the same at every magnification.
   *
   * Magnifying spreads that time over more pixels (the lane's width below), which
   * is what a video editor's zoom does. Dividing the *span* instead — the first
   * version — left a long bar running off the end of the ruler into a region with
   * no ticks.
   */
  const span = axisSpan(steps, at);

  /**
   * The playhead, while the preview runs.
   *
   * A clock rather than a control: the moment is read from the stage's own
   * animations every frame — the same reading a pause takes, so pressing pause
   * leaves the playhead exactly where it was drawn — and *written to the DOM*
   * rather than to state. Sixty renders a second of a pane this size would be
   * bad enough; the real reason is that the app's state is what builds the
   * animations, so a playhead that went through React would restart the motion
   * it was timing, once per frame.
   *
   * Put back on the way out, because React does not know these two elements were
   * touched and would leave a stopped playhead wherever the last frame left it.
   */
  const pane = useRef<HTMLElement>(null);
  /**
   * Where React thinks the playhead is, read *at cleanup time*.
   *
   * The closure's own `playhead` is the value from the render that started the
   * loop, and the interesting moment is the one after: pausing sets the playhead
   * to where it stopped, React writes that to the element, and *then* the old
   * effect's cleanup runs. Restoring the closure's value there put the playhead
   * back to zero right after the pause had placed it — measured, the paused
   * playhead went backwards.
   */
  const restore = useRef(playhead ?? 0);
  restore.current = playhead ?? 0;
  useEffect(() => {
    if (!previewing || !moment) return;
    const head = pane.current?.querySelector<HTMLElement>('[data-timeline-playhead]');
    const readout = pane.current?.querySelector<HTMLElement>('[data-timeline-moment]');
    if (!head) return;

    const show = (ms: number) => {
      head.style.left = `${(Math.min(ms, span) / span) * 100}%`;
      head.dataset.at = String(Math.round(ms));
      if (readout) readout.textContent = `${(ms / 1000).toFixed(2)}s`;
    };

    let frame = requestAnimationFrame(function draw() {
      frame = requestAnimationFrame(draw);
      const now = moment.current?.();
      if (typeof now === 'number') show(now);
    });
    return () => {
      cancelAnimationFrame(frame);
      show(restore.current);
    };
  }, [previewing, moment, span]);

  /** The shapes this press animates, each with its bars — the track per shape. */
  const tracks = useMemo(() => {
    const byTarget = new Map<string, TimedStep[]>();
    for (const step of shown) {
      const list = byTarget.get(step.target) ?? [];
      list.push(step);
      byTarget.set(step.target, list);
    }
    return [...byTarget.entries()].map(([target, list]) => ({ target, steps: list }));
  }, [shown]);

  const run = (command: string, payload: Record<string, unknown>) =>
    void editor?.executeCommand?.(command, payload);

  /**
   * The bars a reader has selected, and the one the editor row is about.
   *
   * Several, because lining six motions up is otherwise six drags — and the row
   * still edits *all* of them: what it shows is the first, what it writes goes to
   * every one. A set of one behaves exactly as it did.
   */
  const selected = useMemo(
    () => (selectedFromApp ?? []).filter((sid) => shown.some((entry) => entry.sid === sid)),
    [selectedFromApp, shown]
  );
  const setSelected = (sid: string, add = false) => {
    if (!add) return onSelected?.([sid]);
    onSelected?.(
      selected.includes(sid) ? selected.filter((entry) => entry !== sid) : [...selected, sid]
    );
  };
  const step = shown.find((entry) => entry.sid === selected[0]) ?? shown[0];
  /** What an edit in the row applies to: the selection, or the row's own step. */
  const editing = selected.length > 0 ? selected : step ? [step.sid] : [];

  /**
   * A motion on the clipboard, which is the pane's and not the document's.
   *
   * Copying a motion is not an edit — nothing in the deck changes until it is
   * pasted — so it is state, like the magnification. What it holds is
   * `motionValues`: the effect, the length, the curve and the options, and *not*
   * which shape it named or when it started, because those are facts about a
   * step's place rather than about the motion.
   */
  const [copied, setCopied] = useState<Record<string, unknown> | undefined>();

  /**
   * The theme's slots, for the one motion value that is a colour.
   *
   * Read here for the same reason the properties panel reads them: a glow that
   * *follows* the deck's accent is a decision, and a glow that happens to be the
   * same blue is a coincidence. A control that could only produce a hex string
   * would make the second one the only one available.
   */
  /**
   * The shapes a step could watch: everything on this slide that has a name.
   *
   * A trigger names a shape the way a step names its target — by a name the shape
   * carries — so the list is the same one, and a shape with no name yet is not
   * offered because there is nothing to write.
   */
  const watchable = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !slideSid) return [];

    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };
    return [...namedBoxes(doc as never, slideSid)].map(([name, sid]) => ({
      name,
      label: labelOfBox(doc as never, sid)
    }));
  }, [editor, slideSid, revision, tick]);

  /**
   * The selected step's target's fills and shadows, as a reader sees them.
   *
   * Because a shape's fills are a **list** and so are its effects: a sweep turns
   * *one* gradient and a deepen grows *one* shadow, so the panel has to be able
   * to say which. Read from the document here rather than in the inspector,
   * which has no editor — the same division the theme's swatches follow.
   *
   * Numbered from the model, which is the order the paint panel draws: the top
   * fill is 1. Capped at `TRACK_SLOTS`, because past that there is no variable to
   * animate and offering the row would be offering a motion that does nothing.
   */
  const parts = useMemo(() => {
    const store = editor?.dataStore;
    const step = shown.find((entry) => entry.sid === (selectedFromApp ?? [])[0]);
    const part = effectDefinition(step?.effect)?.part;
    if (!store || !step?.targetSid || !part) return [];

    const attrs = store.getNode(step.targetSid)?.attributes;
    const items =
      part === 'fill'
        ? paintsOf(attrs).map((paint, index) => ({ index, label: `${index + 1}. ${PAINT_LABELS[paint.kind]}` }))
        : effectsOf(attrs)
            .filter((effect) => effect.kind !== 'blur')
            .map((effect, index) => ({
              index,
              label: `${index + 1}. ${effect.kind === 'inner' ? '내부 그림자' : '그림자'}`
            }));
    return items.slice(0, TRACK_SLOTS);
  }, [editor, shown, selectedFromApp, revision, tick]);

  const themeSwatches = useMemo(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId) return [];

    const theme = themeFor({ rootId, getNode: (sid: string) => store.getNode(sid) } as never, undefined);
    if (!theme) return [];

    const swatches: Array<{ value: string; colour: string; label: string }> = [];
    for (const slot of THEME_COLOUR_SLOTS) {
      const colour = theme.attributes?.[slot];
      if (typeof colour === 'string' && colour) {
        swatches.push({ value: themeRef(slot), colour, label: String(slot) });
      }
    }
    return swatches;
  }, [editor, revision, tick]);

  /**
   * A rubber band across the tracks, which is how a video editor picks a run of
   * clips.
   *
   * Shift-clicking six bars is six clicks; dragging a box over them is one. The
   * arithmetic is *screen rectangles* rather than model time, deliberately: what a
   * reader means is "the bars under this box", and the bars' own rectangles are
   * the only place that question is already answered — for every track at once,
   * at whatever magnification, including the lanes a shape has stacked.
   */
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number }>();
  const tracksHost = useRef<HTMLDivElement>(null);

  const startBand = (event: React.PointerEvent) => {
    // Only from the *background*: a pointerdown on a bar is that bar's drag.
    if ((event.target as HTMLElement).closest('.sl-timeline-bar, button, input, select')) return;
    const host = tracksHost.current;
    if (!host) return;

    event.preventDefault();
    const from = { x: event.clientX, y: event.clientY };
    let moved = false;

    const move = (pointer: PointerEvent) => {
      const box = {
        x: Math.min(from.x, pointer.clientX),
        y: Math.min(from.y, pointer.clientY),
        w: Math.abs(pointer.clientX - from.x),
        h: Math.abs(pointer.clientY - from.y)
      };
      // A press that never travelled is a click on the background, which clears
      // the selection rather than making an empty band.
      moved = box.w > 3 || box.h > 3;
      setBand(moved ? box : undefined);
      if (!moved) return;

      const caught = [...host.querySelectorAll<HTMLElement>('.sl-timeline-bar')]
        .filter((bar) => {
          const rect = bar.getBoundingClientRect();
          return (
            rect.left < box.x + box.w &&
            box.x < rect.right &&
            rect.top < box.y + box.h &&
            box.y < rect.bottom
          );
        })
        .map((bar) => bar.dataset.step)
        .filter((sid): sid is string => !!sid);

      // Reported while dragging, so the outlines follow the band rather than
      // appearing when it is let go — which is what makes it feel like selecting
      // rather than like guessing.
      onSelected?.(caught);
    };

    const land = () => {
      setBand(undefined);
      if (!moved) onSelected?.([]);
    };
    /*
     * 미리 보기는 앱의 것이고 쓰기는 놓을 때 한 번. `dragGesture` 로 옮기면서 둘이 생긴다 —
     * `pointercancel` 로 끝나도 리스너가 창에 안 남고, Escape 로 물러설 수 있다.
     */
    dragGesture(
      event as unknown as PointerEvent,
      {
        start: () => ({}),
        move: (_held, at) => move({ clientX: at.x, clientY: at.y } as PointerEvent),
        done: () => land(),
        /*
         * 물러서기와 놓기가 같은 일을 한다 — 이 드래그는 미리 보기를 화면에만 그리고 놓을 때 쓸
         * 것이 없으므로, 걷는 것이 곧 끝이다.
         */
        abort: () => land()
      },
      { threshold: 0 }
    );
  };

  /**
   * What this press costs to draw, and whether that is worth saying.
   *
   * §7b of the motion spec sorts every animatable property into tiers and this
   * pane said nothing about them, so a reader could put a `filter` emphasis on
   * twenty shapes and find out what that costs in front of an audience. Said here
   * rather than in a release note, and only when there is something to say.
   */
  const cost = pressCost(steps, at);
  const costSays = costLabel(cost);

  const total = timelineDuration(steps);

  /**
   * The pane's own height, dragged from its top edge.
   *
   * A timeline is looked at *while* the slide is — a reader arranging when
   * things happen keeps glancing up — so how much of the window each gets is a
   * decision only the reader can make, and one that changes with the slide. It
   * was a fixed 40%, which is too much for one bar and not enough for eight
   * shapes.
   *
   * The app holds it, because it is a fact about a reader rather than about the
   * deck; this only reports the drag.
   */
  const resize = (event: React.PointerEvent) => {
    if (!onHeight) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    const from = event.clientY;
    const start = height ?? 240;

    const move = (pointer: PointerEvent) => {
      // Upwards is taller: the pane grows from its top edge, so the delta is
      // negated — the sign that is wrong in half the resizable panels ever
      // written.
      onHeight(Math.min(window.innerHeight * 0.7, Math.max(120, start - (pointer.clientY - from))));
    };
    const land = () => {
    };
    /*
     * 미리 보기는 앱의 것이고 쓰기는 놓을 때 한 번. `dragGesture` 로 옮기면서 둘이 생긴다 —
     * `pointercancel` 로 끝나도 리스너가 창에 안 남고, Escape 로 물러설 수 있다.
     */
    dragGesture(
      event as unknown as PointerEvent,
      {
        start: () => ({}),
        move: (_held, at) => move({ clientX: at.x, clientY: at.y } as PointerEvent),
        done: () => land(),
        /*
         * 물러서기와 놓기가 같은 일을 한다 — 이 드래그는 미리 보기를 화면에만 그리고 놓을 때 쓸
         * 것이 없으므로, 걷는 것이 곧 끝이다.
         */
        abort: () => land()
      },
      { threshold: 0 }
    );
  };

  return (
    <aside
      ref={pane}
      className="sl-timeline"
      data-timeline
      data-open={open ? 'true' : 'false'}
      style={open ? { height: height ?? 240 } : undefined}
    >
      {open && (
        <span
          className="sl-timeline-resize"
          data-timeline-resize
          aria-label="타임라인 높이"
          onPointerDown={resize}
        />
      )}
      {/*
        * The rubber band, drawn *outside* the scrolling column.
        *
        * It was a child of the tracks at first, and being in that flex column
        * moved the tracks by 73 pixels the moment it appeared — so every bar was
        * measured against a band that was no longer over it, and a sweep caught
        * nothing at all. Measured: the tracks' top went from 725 to 652 between
        * the pointerdown and the first move.
        *
        * An overlay belongs at the top of the pane rather than inside something
        * that scrolls, which is the same rule the selection overlay follows one
        * component up.
        */}
      {band && (
        <span
          className="sl-timeline-band"
          data-timeline-band
          aria-hidden
          style={{
            position: 'fixed',
            left: band.x,
            top: band.y,
            width: band.w,
            height: band.h
          }}
        />
      )}

      <header className="sl-timeline-head">
        <button
          type="button"
          className="sl-timeline-fold"
          data-timeline-fold
          aria-expanded={open}
          aria-label={open ? '타임라인 접기' : '타임라인 펼치기'}
          onClick={() => onOpen?.(!open)}
        >
          {open ? '▾' : '▸'}
        </button>
        <h2>타임라인</h2>
        <span className="sl-timeline-total" data-timeline-total>
          {steps.length > 0 ? `${(total / 1000).toFixed(1)}초` : '—'}
        </span>

        {/* The presses, which are the slide's segments of time. */}
        {(presses > 1 || hasTriggers) && (
          <span className="sl-timeline-presses" role="tablist" aria-label="클릭 순서">
            {hasTriggers && (
              <button
                type="button"
                role="tab"
                aria-selected={at === 0}
                data-press={0}
                title="도형을 클릭할 때 실행되는 모션"
                onClick={() => onPress?.(0)}
              >
                클릭
              </button>
            )}
            {Array.from({ length: presses }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                role="tab"
                aria-selected={number === at}
                data-press={number}
                onClick={() => onPress?.(number)}
              >
                {number}
              </button>
            ))}
          </span>
        )}

        {/*
          * Magnifying the axis, which is what makes a timeline a timeline rather
          * than a chart of a slide. At 4× a 300ms step is 120 pixels of bar
          * instead of 30, and a two-frame delay is something a reader can see and
          * drag. Everything in the pane is a percentage of the span, so this is
          * one number — see `axisSpan`.
          */}
        <span className="sl-timeline-magnify">
          <button
            type="button"
            data-timeline-magnify="out"
            aria-label="시간축 축소"
            disabled={magnify <= 1}
            onClick={() => setMagnify((now) => Math.max(1, now / 2))}
          >
            −
          </button>
          <span data-timeline-magnified>{magnify === 1 ? '맞춤' : `${magnify}×`}</span>
          <button
            type="button"
            data-timeline-magnify="in"
            aria-label="시간축 확대"
            disabled={magnify >= 16}
            onClick={() => setMagnify((now) => Math.min(16, now * 2))}
          >
            ＋
          </button>
        </span>

        {/*
          * The transport, which is what makes a timeline something a reader can
          * *look* at rather than only start.
          *
          * Play is also pause, because they are one control on every instrument
          * that has ever had them; the frame steps move the playhead, which is
          * already how a moment is shown; and the playhead's own position is
          * where play resumes from. So a paused deck is a *scrubbed* deck, and
          * there is one state rather than two.
          */}
        {costSays && (
          <span
            className="sl-timeline-cost"
            data-timeline-cost={cost.verdict}
            title="필터·그림자·배경 같은 속성은 프레임마다 도형을 다시 그립니다"
          >
            {costSays}
          </span>
        )}

        <span className="sl-timeline-transport">
          <button
            type="button"
            data-timeline-rewind
            aria-label="처음으로"
            disabled={steps.length === 0}
            onClick={() => onRewind?.()}
          >
            ⏮
          </button>
          <button
            type="button"
            data-timeline-step="-1"
            aria-label="한 프레임 뒤로"
            disabled={steps.length === 0}
            onClick={() => onStepFrame?.(-1)}
          >
            ◀
          </button>
          <button
            type="button"
            data-timeline-preview
            data-playing={previewing ? 'true' : undefined}
            aria-label={previewing ? '일시정지' : '미리 보기'}
            disabled={steps.length === 0}
            onClick={() => onPreview?.()}
          >
            {/* 이어서, when the playhead is not at the beginning: play resumes
                from where it is, and a button that said 미리 보기 would be
                promising to start over. */}
            {previewing ? '⏸ 일시정지' : (playhead ?? 0) > 0 ? '▶ 이어서' : '▶ 미리 보기'}
          </button>
          <button
            type="button"
            data-timeline-step="1"
            aria-label="한 프레임 앞으로"
            disabled={steps.length === 0}
            onClick={() => onStepFrame?.(1)}
          >
            ▶
          </button>
          {/* Where the playhead is, in the units a reader reads it in. A paused
              deck is a scrubbed deck, so this is also "where play will resume". */}
          <span className="sl-timeline-moment" data-timeline-moment>
            {`${((playhead ?? 0) / 1000).toFixed(2)}s`}
          </span>
        </span>
      </header>

      {/*
        * What the **cards** on this slide do, said once and out of the way.
        *
        * Above the axis rather than in it: these cost no presses (§10l), so a lane for them would be
        * a lane with no place on the clock — and drawn even when the slide has no motion of its own,
        * because that is exactly the deck where a reader is most puzzled by things moving.
        */}
      {open && animatingCards.length > 0 && (
        <p className="sl-timeline-cards" data-timeline-cards={animatingCards.length}>
          {animatingCards.map((card) => card.name).join(', ')} 이(가) 도착할 때 스스로 움직입니다.
          {onOpenCard && (
            /*
              * The suite's own control, not a bare `<button>`: the chrome check counts those and it
              * counted this one — which is what it is for. One border, one focus ring, one hover, in
              * the one place they are decided.
              */
            <Button
              title="이 카드를 열어 모션을 고칩니다"
              data={{ 'timeline-card-open': animatingCards[0].id }}
              onClick={() => onOpenCard(animatingCards[0].id)}
            >
              카드 열기
            </Button>
          )}
        </p>
      )}

      {!open ? null : steps.length === 0 && animatingCards.length === 0 ? (
        <p className="sl-timeline-empty">
          이 슬라이드에는 애니메이션이 없습니다. 상자를 선택하고 속성에서 효과를 고르세요.
        </p>
      ) : steps.length === 0 ? null : (
        /*
          * The axis and the selected step's detail, side by side.
          *
          * The detail was a row *under* the axis, which is where it fits when a
          * step has four attributes; a step has sixteen now and the row ran off
          * the screen. Every tool that got here first — Premiere, CapCut, After
          * Effects — puts the clip's detail in a column beside the strip, and the
          * reason is arithmetic rather than taste: an attribute added to a column
          * costs a row, and one added to a row costs the last control its place
          * on screen.
          */
        <div className="sl-timeline-body">
          {/*
            * One scroll container for the ruler and every track, so a magnified
            * axis scrolls as one thing. Two containers would drift: a reader
            * scrolling the bars while the ruler stayed put is a timeline whose
            * clock lies.
            *
            * The shape labels are pinned inside it (`position: sticky`), which is
            * what every editor with a magnified timeline does — the names are how
            * you know which lane you are looking at, and they are the first thing
            * to scroll away otherwise.
            */}
          <div
            className="sl-timeline-scroll"
            data-timeline-scroll
            style={{ ['--sl-axis' as never]: `${Math.max(100, magnify * 100)}%` }}
          >
          <Ruler span={span} magnify={magnify} playhead={playhead ?? 0} onPlayhead={onPlayhead} />

          <div
            ref={tracksHost}
            className="sl-timeline-tracks"
            data-timeline-tracks
            onPointerDown={startBand}
          >

            {tracks.map((track) => (
              <Track
                key={track.target}
                track={track}
                span={span}
                /** What a dragged bar sticks to: zero, the playhead, other bars. */
                snap={[...snapPoints(shown, at, undefined), ...(playhead ? [playhead] : [])]}
                selected={selected}
                onSelect={setSelected}
                onSelectBox={(sid) => run('setNode', { nodeIds: [sid] })}
                /**
                 * One bar dragged moves one; a bar *in a selection* moves the lot,
                 * each keeping its offset from the others — which is the whole
                 * reason a reader selected several.
                 */
                onMove={(sid, startAt) => {
                  const dragged = shown.find((entry) => entry.sid === sid);
                  if (selected.length > 1 && selected.includes(sid) && dragged) {
                    // How far the bar under the pointer travelled; every other
                    // selected bar travels the same, which `shiftMotionSteps`
                    // works out against the whole list.
                    const by = Math.round(startAt - dragged.startAt);
                    if (by !== 0) run('shiftMotionSteps', { stepIds: selected, by });
                    return;
                  }
                  run('setMotionStep', { stepId: sid, delay: delayForStart(shown, sid, startAt) });
                }}
                onResize={(sid, duration) =>
                  run('setMotionStep', {
                    stepIds: selected.length > 1 && selected.includes(sid) ? selected : [sid],
                    duration
                  })
                }
                /**
                 * A film's bar dragged by an end: the trim goes to the *film*, and
                 * a head takes the step's delay with it — one command, so one undo.
                 * See `media-trim.ts`.
                 */
                onTrim={(step, patch) =>
                  step.targetSid &&
                  run('setMediaTrim', {
                    nodeId: step.targetSid,
                    stepId: step.sid,
                    ...patch
                  })
                }
                onRemove={() => run('removeMotionStep', { stepIds: editing })}
                /* A whole motion, like the gallery's tiles: a lane's ＋ means
                   "this shape does something else too", and the something is an
                   emphasis — the shape has already arrived by the time there is
                   a lane to press ＋ in. */
                onAdd={(targetSid) =>
                  run('addBoxBuild', {
                    nodeId: targetSid,
                    ...presetAttrs(presetById('heartbeat')!)
                  })
                }
              />
            ))}
          </div>
          </div>

          {step && (
            <StepEditor
              step={step}
              /** How many bars an edit here will reach, when it is more than one. */
              count={editing.length}
              drawing={drawing}
              onDrawing={onDrawing}
              themeSwatches={themeSwatches}
              watchable={watchable}
              /**
               * When the shape it waits for can be clicked, which the pane knows
               * and used to keep to itself. See `triggerWindow`.
               */
              /* Every step on the slide, not this press's: when a shape arrives
                 is a fact about the whole sequence. */
              triggerAt={step.on ? triggerWindow(steps, step.on) : undefined}
              /** The target's fills or shadows, for the effects that animate one. */
              parts={parts}
              copied={copied}
              onCopy={() => setCopied(motionValues(step as never))}
              /**
               * Pasted onto whatever is selected: the bars, if any, or nothing.
               *
               * Onto *steps* rather than onto shapes, because that is what the
               * pane has — giving a shape with no motion the copied one is the
               * panel's gesture (its gallery), and this is "make these look like
               * that one".
               */
              onPaste={() => copied && run('setMotionStep', { stepIds: editing, ...copied })}
              onChange={(patch) => run('setMotionStep', { stepIds: editing, ...patch })}
              /**
               * The trim goes to the *film*, not to the step.
               *
               * Which is why it is its own callback rather than another key in the
               * patch above: a trim is a fact about the media node — see
               * `media-trim.ts` — so it is a different command naming a different
               * node, and never applies to a selection of bars.
               */
              onTrim={(patch) =>
                step.targetSid && run('setMediaTrim', { nodeId: step.targetSid, ...patch })
              }
              onRemove={() => run('removeMotionStep', { stepIds: editing })}
              /* Reordering is one step's place in the track: a set has no single
                 place to move to, so it stays about the row's own step. */
              onOrder={(by) => run('moveMotionStep', { stepId: step.sid, by })}
              /** 필름의 길이를 물어볼 요소를 찾을 범위 — 조회가 아니라 건네받는다. */
              host={host}
            />
          )}
        </div>
      )}
    </aside>
  );
}

/**
 * The seconds, and the playhead that runs along them.
 *
 * Dragged anywhere on the ruler rather than only on the head itself: every video
 * editor lets a reader click the ruler to jump there, and a 9-pixel target is
 * the difference between scrubbing and aiming.
 */
function Ruler({
  span,
  magnify,
  playhead,
  onPlayhead
}: {
  span: number;
  /**
   * How much wider than the pane the axis is drawn.
   *
   * Here because the step is a budget of **labels per pixel**, not per press:
   * magnifying keeps the span and spreads it over more room, so at 4× there is
   * room for four times as many numbers. Without this, magnifying an axis moved
   * the same six labels further apart — which is the opposite of what a reader
   * magnifies for.
   */
  magnify: number;
  playhead: number;
  onPlayhead?: (at: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  const seek = (event: React.PointerEvent) => {
    const box = host.current?.getBoundingClientRect();
    if (!box || !onPlayhead) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    onPlayhead(Math.round(ratio * span));
  };

  /**
   * The step comes from the span and the room, which it did not.
   *
   * It was `ceil(span / 500)` with a label on every other tick: right for a
   * two-second press and absurd for anything long — a sixty-second sequence drew
   * 120 ticks and 60 labels, which is a grey band rather than a scale.
   *
   * Divided by the magnification because the budget is labels *per pixel*: the
   * span is the same at 4× and the room is four times as much, so a quarter of
   * the step fits. `timeStep` then rounds that to a length of time a reader
   * counts in.
   */
  const ticks = useMemo(() => axisTicks(span, timeStep(span / magnify)), [span, magnify]);

  return (
    <div
      ref={host}
      className="sl-timeline-ruler"
      data-timeline-ruler
      onPointerDown={(event) => {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        seek(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return;
        seek(event);
      }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.at}
          className="sl-timeline-tick"
          data-major={tick.value === undefined ? undefined : 'true'}
          style={{ left: `${(tick.at / span) * 100}%` }}
        >
          {/*
            Seconds, to as many places as the step needs — a half-second step
            wants `1.5s` and a ten-second step wants `20s`, and `toFixed(1)` on
            the second is a decimal point that means nothing.
          */}
          {tick.value === undefined ? '' : `${Number((tick.value / 1000).toFixed(2))}s`}
        </span>
      ))}
      <span
        className="sl-timeline-playhead"
        data-timeline-playhead
        data-at={playhead}
        style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }}
      />
    </div>
  );
}

/**
 * One shape's row: its name, and every bar it has in this press.
 *
 * The hierarchy the flat list could not express — a shape with an entrance, an
 * emphasis and an exit is one row of three bars, which reads as *that shape's
 * animation* rather than as three unrelated events.
 */
function Track({
  track,
  span,
  snap,
  selected,
  onSelect,
  onSelectBox,
  onMove,
  onResize,
  onTrim,
  onRemove,
  onAdd
}: {
  track: { target: string; steps: TimedStep[] };
  span: number;
  /** The moments a dragged bar sticks to — see `snapPoints`. */
  snap: number[];
  /** Every selected bar; a click replaces the set and Shift adds to it. */
  selected: string[];
  onSelect: (sid: string, add?: boolean) => void;
  onSelectBox: (sid: string) => void;
  onMove: (sid: string, startAt: number) => void;
  onResize: (sid: string, duration: number) => void;
  /**
   * A **film's** bar dragged by an end, which is a trim rather than a length.
   *
   * Its own callback because it writes somewhere else: a build's bar is the step's
   * own delay and duration, and a film's is *which part of the file plays* — an
   * attribute of the film. See `media-trim.ts` for why the head moves the delay
   * with it.
   */
  onTrim: (
    step: TimedStep,
    patch: { trimStart?: number; trimEnd?: number; delay?: number }
  ) => void;
  /** Delete on a focused bar, which is what every timeline binds. */
  onRemove: () => void;
  onAdd: (targetSid: string) => void;
}) {
  const first = track.steps[0];
  const host = useRef<HTMLDivElement>(null);
  /** How tall this shape's row has to be: one lane per overlapping motion. */
  const lanes = Math.max(1, ...track.steps.map((step) => step.lane + 1));

  /**
   * A drag, in the axis's own units.
   *
   * The pointer moves in pixels and the document holds milliseconds, so every
   * gesture here converts once, at the end — moving the *bar* while dragging and
   * writing the document on release, which is the same rule the stage's overlay
   * follows for a shape.
   */
  /**
   * A film's bar has two ends a reader can pull, and neither writes a duration.
   *
   * Which part of a file plays is the *film's* answer, not the step's — see
   * `media-trim.ts` — and it is the one case where the bar's edges mean something
   * other than "when" and "how long". A build has no head to trim.
   */
  const trimming = (step: TimedStep) => step.kind === 'play';

  const drag = (
    event: React.PointerEvent,
    step: TimedStep,
    what: 'move' | 'resize' | 'head'
  ) => {
    const box = host.current?.getBoundingClientRect();
    if (!box) return;

    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const perPixel = span / box.width;
    const from = event.clientX;
    /**
     * Eight pixels of stickiness, converted to milliseconds *here*.
     *
     * So snapping is as sticky at 4× as it is at fit, which is the whole point of
     * magnifying: a tolerance fixed in milliseconds would grab from a centimetre
     * away when zoomed in and be unusable when zoomed out.
     */
    const tolerance = perPixel * 8;

    /**
     * Where the drag would put the edge being dragged, with snapping applied.
     *
     * Always the edge *under the pointer*, which is why the two resizes answer in
     * different units: `move` and `head` return a moment, `resize` returns a
     * length. Snapping a length would make a bar stick to a duration rather than
     * to a moment, and a duration is not a thing on the axis.
     */
    const snappedAt = (delta: number): { at: number; snapped: boolean } =>
      what === 'move'
        ? snapTo(snap, Math.max(0, step.startAt + delta), tolerance)
        : what === 'head'
          ? snapTo(
              snap,
              // Never past its own tail, and never before the press: the same
              // clamps `headTrim` applies to the document, applied to the drawing.
              Math.min(Math.max(0, step.startAt + delta), step.endAt - MIN_TRIM_MS),
              tolerance
            )
          : (() => {
              const end = snapTo(snap, Math.max(step.startAt + 80, step.endAt + delta), tolerance);
              return { at: end.at - step.startAt, snapped: end.snapped };
            })();

    const onMoveEvent = (move: PointerEvent) => {
      const delta = (move.clientX - from) * perPixel;
      const bar = target.closest<HTMLElement>('.sl-timeline-bar') ?? target;
      const next = snappedAt(delta);

      if (what === 'move') {
        bar.style.left = `${((next.at / span) * 100).toFixed(3)}%`;
      } else if (what === 'head') {
        // The tail stays where it is, which is the whole gesture: the bar's left
        // edge follows the pointer and its width gives way.
        bar.style.left = `${((next.at / span) * 100).toFixed(3)}%`;
        bar.style.width = `${(((step.endAt - next.at) / span) * 100).toFixed(3)}%`;
      } else {
        bar.style.width = `${((Math.max(80, next.at) / span) * 100).toFixed(3)}%`;
      }
      // The guide is drawn where it snapped, so a reader can see *what* it caught
      // on rather than only feel the bar stop.
      const lane = host.current;
      if (lane) {
        lane.dataset.snapped = next.snapped ? 'true' : '';
        lane.style.setProperty(
          '--sl-snap',
          `${(((what === 'resize' ? step.startAt + next.at : next.at) / span) * 100).toFixed(3)}%`
        );
      }
    };

    const land = (up: PointerEvent) => {
      if (host.current) host.current.dataset.snapped = '';

      const delta = (up.clientX - from) * perPixel;
      // A press that never travelled is a selection, not an edit: writing an
      // unchanged value would put an entry in the history that undoes to the
      // same document.
      if (Math.abs(delta) < perPixel * 3) return;

      const next = snappedAt(delta);
      if (what === 'move') return onMove(step.sid, Math.max(0, Math.round(next.at)));

      if (what === 'head') {
        /**
         * A head dragged is a trim *and* a delay — one gesture, one transaction.
         * The arithmetic and all three of its clamps are `headTrim`'s.
         */
        const moved = headTrim(
          step.trim ?? { start: 0, end: 0 },
          step.delay,
          Math.round(next.at - step.startAt)
        );
        return onTrim(step, { trimStart: moved.trim.start, delay: moved.delay });
      }

      const length = Math.max(80, Math.round(next.at));
      // A film's tail is its out-point; a build's is how long it takes.
      if (trimming(step)) {
        return onTrim(step, {
          trimEnd: tailTrim(step.trim ?? { start: 0, end: 0 }, length).end
        });
      }
      onResize(step.sid, length);
    };

    /*
     * 미리 보기는 앱의 것이고 쓰기는 놓을 때 한 번. `dragGesture` 로 옮기면서 둘이 생긴다 —
     * `pointercancel` 로 끝나도 리스너가 창에 안 남고, Escape 로 물러설 수 있다.
     */
    dragGesture(
      event as unknown as PointerEvent,
      {
        start: () => ({}),
        move: (_held, at) => onMoveEvent({ clientX: at.x, clientY: at.y } as PointerEvent),
        done: (_held, at) => land({ clientX: at.x, clientY: at.y } as PointerEvent),
        /**
         * **물러서면 시작 자리로 놓는다.**
         *
         * `land` 는 움직인 거리가 문턱(`perPixel * 3`)보다 작으면 아무것도 쓰지 않는다 —
         * *누르기만 한 것은 선택이지 편집이 아니다* 라는 그 판단이 이미 거기 있다. 그러니 시작
         * 자리를 주면 **쓰지 않고 걷기** 가 되고, 되돌리기를 따로 부를 필요가 없다.
         */
        abort: () => land(event as unknown as PointerEvent)
      },
      { threshold: 0 }
    );
  };

  return (
    <div className="sl-timeline-track" data-track={track.target}>
      <button
        type="button"
        className="sl-timeline-target"
        data-step-target={first.targetSid ?? ''}
        disabled={!first.targetSid}
        title={first.targetSid ? '이 상자 선택' : '이 상자는 삭제되었습니다'}
        onClick={() => first.targetSid && onSelectBox(first.targetSid)}
      >
        {first.label}
      </button>

      {/*
        * One lane per *overlap*, which is what a video editor's track is.
        *
        * A shape with two motions at the same moment is two bars at the same
        * moment, and one lane draws them on top of each other — so the reader
        * cannot see, select or drag the one underneath. Which bars overlap is the
        * timeline's answer (`lane`, computed with the timing), because it is a
        * fact about time rather than about drawing.
        */}
      <div
        ref={host}
        className="sl-timeline-lane"
        data-lanes={lanes}
        style={{ height: `${lanes * 22 + (lanes - 1) * 2}px` }}
      >
        {/* Where a dragged bar caught, drawn while it is caught. Feeling a bar
            stop is not the same as knowing what it lined up with. */}
        <span className="sl-timeline-snapline" aria-hidden />
        {track.steps.map((step) => (
          <div
            key={step.sid}
            className="sl-timeline-bar"
            data-step={step.sid}
            data-kind={step.kind}
            data-effect={step.effect ?? 'play'}
            data-selected={selected.includes(step.sid) ? 'true' : undefined}
            data-start={step.startAt}
            data-duration={step.duration}
            data-repeat={step.repeat === 1 ? undefined : step.repeat}
            data-lane={step.lane}
            /** `add` reads as "and also", which is what the stripe means. */
            data-composite={step.composite === 'add' ? 'add' : undefined}
            /**
             * Which bars are the expensive ones — a repaint of the shape every
             * frame, and one *per element*, so a filter on twenty letters is
             * twenty. Marked rather than refused: one is exactly what it is for.
             */
            data-cost={stepTier(step) === 2 ? stepElements(step) : undefined}
            data-clash={step.clashes?.join(' ') || undefined}
            title={
              step.clashes?.includes('rotate')
                ? '회전 모션은 한 번에 하나만 적용됩니다 (브라우저 제약)'
                : undefined
            }
            aria-label={`${step.label} ${effectDefinition(step.effect)?.label ?? '재생'}`}
            style={{
              left: `${((step.startAt / span) * 100).toFixed(3)}%`,
              width: `${((step.duration / span) * 100).toFixed(3)}%`,
              top: `${step.lane * 24}px`
            }}
            tabIndex={0}
            onPointerDown={(event) => {
              /**
               * Focused by hand, because the drag prevents the default that would
               * have done it.
               *
               * `preventDefault()` on a pointerdown is what stops the browser
               * selecting text and starting its own drag — and it also stops the
               * element being focused, so the arrow keys below did nothing at all
               * after a click. Measured: `document.activeElement` was the body.
               */
              (event.currentTarget as HTMLElement).focus();
              // Shift or Meta adds to the selection, which is what every editor
              // with a timeline binds — and a plain click replaces it.
              onSelect(step.sid, event.shiftKey || event.metaKey);
              drag(event, step, 'move');
            }}
            /**
             * The arrows nudge, which is the other half of a draggable bar.
             *
             * A drag is for "about here" and a keystroke is for "exactly there" —
             * every editor with a timeline has both, and a reader lining a motion
             * up to a tenth of a second cannot do it with a pointer at all. 10ms a
             * press, 100ms with Shift; Alt resizes instead of moving.
             */
            onKeyDown={(event) => {
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                return onRemove();
              }
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const by = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10);
              if (event.altKey) return onResize(step.sid, Math.max(80, step.duration + by));
              // Through `onMove`, which is where "one bar or the whole selection"
              // is decided — the arrows and the drag are the same gesture at two
              // resolutions.
              onMove(step.sid, Math.max(0, step.startAt + by));
            }}
          >
            <span className="sl-timeline-bar-label">
              {/*
                * A bar that adds says so, because two bars at one moment is the
                * one arrangement where a reader has to know *how* they combine:
                * 함께 is a motion on top of another, and it is the difference
                * between a shape that grows while it turns and one that only
                * turns.
                */}
              {step.composite === 'add' && <span className="sl-timeline-bar-with">＋</span>}
              {step.kind === 'path'
                ? `경로 (${step.path?.length ?? 0}점)`
                : (effectDefinition(step.effect)?.label ?? '재생')}
              {step.repeat !== 1 && (
                <span className="sl-timeline-bar-repeat">
                  {step.repeat === 0 ? ' ∞' : ` ×${step.repeat}`}
                </span>
              )}
            </span>
            {/*
              * A head grip, for a film only — there is nothing at the front of a
              * build to skip. Drawn *before* the label so the two grips are the
              * two ends of the bar in the order a reader would name them.
              */}
            {trimming(step) && (
              <span
                className="sl-timeline-grip"
                data-edge="head"
                data-grip-head={step.sid}
                aria-label={`${step.label} 시작 지점`}
                onPointerDown={(event) => drag(event, step, 'head')}
              />
            )}
            <span
              className="sl-timeline-grip"
              data-edge="tail"
              data-grip={step.sid}
              aria-label={trimming(step) ? `${step.label} 끝 지점` : `${step.label} 길이 조절`}
              onPointerDown={(event) => drag(event, step, 'resize')}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="sl-timeline-add"
        aria-label={`${first.label} 모션 추가`}
        disabled={!first.targetSid}
        onClick={() => first.targetSid && onAdd(first.targetSid)}
      >
        ＋
      </button>
    </div>
  );
}

/**
 * The selected bar, in words: what it does, when it starts, and its curve.
 *
 * Beside the axis rather than inside a bar, because a bar is 40 pixels wide when
 * a step is short and there is no version of "put the controls in it" that
 * works. Every tool does this — the strip is the *shape* of the animation and
 * the panel is its detail.
 */
function StepEditor({
  step,
  count = 1,
  drawing,
  onDrawing,
  themeSwatches,
  watchable,
  triggerAt,
  parts,
  copied,
  onCopy,
  onPaste,
  onChange,
  onTrim,
  onRemove,
  onOrder,
  host
}: {
  step: TimedStep;
  /** How many bars this row is editing — one, or a selection. */
  count?: number;
  /** Whether the reader is placing this path's points on the slide. */
  drawing?: boolean;
  onDrawing?: (drawing: boolean) => void;
  /** The theme's slots, so a motion's colour can follow the deck. */
  themeSwatches?: Array<{ value: string; colour: string; label: string }>;
  /** The shapes this step could wait for a click on. */
  watchable?: Array<{ name: string; label: string }>;
  /**
   * When the shape this step waits for can be clicked — see `triggerWindow`.
   *
   * Computed where the document is, like the swatches and the parts: the
   * inspector has no editor. Absent when this step waits for nothing.
   */
  triggerAt?: { from?: number; until?: number };
  /**
   * The target's fills or shadows, when the effect animates one of them.
   *
   * Empty for every other effect, which is what makes the row appear only where
   * it means something — the same rule `takes` follows for the direction.
   */
  parts?: Array<{ index: number; label: string }>;
  /** What is on the pane's motion clipboard, if anything. */
  copied?: Record<string, unknown>;
  onCopy: () => void;
  onPaste: () => void;
  onChange: (patch: Record<string, unknown>) => void;
  /** The film's in and out points, which are written to the *film* — see below. */
  onTrim?: (patch: { trimStart?: number; trimEnd?: number }) => void;
  onRemove: () => void;
  onOrder: (by: number) => void;
  /** 무대 — 필름의 길이를 그 요소에게 묻는다. 위의 `TimelinePaneProps.host` 를 보라. */
  host?: React.RefObject<HTMLElement | null>;
}) {
  /**
   * What this step's effect takes, and what its *name* already said.
   *
   * A deck written before the direction moved out of the name says `flyInLeft`,
   * and the control has to open showing 왼쪽 rather than the default — so the
   * name's options are the fallback and the step's own value wins over them.
   */
  const resolved = resolveEffect(step.effect);
  const takes = resolved?.definition.takes ?? {};
  const fromName = resolved?.options;

  const byCategory = useMemo(() => {
    const groups: Record<string, typeof MOTION_EFFECTS> = {};
    for (const effect of MOTION_EFFECTS) {
      (groups[effect.category] ??= []).push(effect);
    }
    return groups;
  }, []);

  /**
   * Which preset this step *is*, and a way to make it another one.
   *
   * The five controls to the right of this are the motion in full, and a reader
   * who wants "튀어오르기" would set four of them. So the preset comes first in
   * the row — one click that writes all five — and it says 직접 설정 for a step
   * whose values are nobody's preset, which is the honest answer: a step that has
   * been nudged is not a preset any more, and a name that stayed put would be
   * telling the reader it was.
   */
  const preset = step.kind === 'build' ? matchingPreset(step) : undefined;

  /** Whether this film has an out-point, which is what takes its length over. */
  const cut = step.kind === 'play' && (step.trim?.end ?? 0) > (step.trim?.start ?? 0);

  /**
   * How long the film actually is — read off the element, never stored.
   *
   * A file's length is not a fact about the document, and writing a measurement
   * into one is the mistake `fitText` is deliberately not making. But a reader
   * typing an out-point needs to know what the end *is*, so it is read from the
   * stage's own element and shown beside the field. `loadedmetadata` because a
   * film that has not loaded yet reports `NaN`, and the answer arrives later.
   */
  const [film, setFilm] = useState<number>();
  /**
   * And what it is playing, for the strip below.
   *
   * `currentSrc` rather than the model's `src`: it is resolved — a relative path, a
   * blob, whatever the element actually fetched — and the strip has to fetch the same
   * bytes the film did or it would draw a different sound.
   */
  const [source, setSource] = useState<string>();
  useEffect(() => {
    setFilm(undefined);
    setSource(undefined);
    if (step.kind !== 'play' || !step.targetSid) return;
    const element = host?.current?.querySelector<HTMLMediaElement>(
      `[data-bc-sid="${CSS.escape(step.targetSid)}"]`
    );
    if (!element) return;
    const read = () => {
      if (Number.isFinite(element.duration)) setFilm(element.duration * 1000);
      if (element.currentSrc) setSource(element.currentSrc);
    };
    read();
    element.addEventListener('loadedmetadata', read);
    return () => element.removeEventListener('loadedmetadata', read);
  }, [host, step.kind, step.targetSid]);

  /**
   * The sound's shape, decoded once per file and cached in the chrome.
   *
   * `null` until it arrives, and `null` for good on a file the browser will not decode
   * — a codec it refuses, a cross-origin URL with no CORS headers. The two number
   * fields are unaffected either way, which is the point: the strip is the *eye* for
   * the trim, not the way to set it.
   */
  const peaks = useAudioPeaks(source);

  return (
    /*
      * A dense surface, said once.
      *
      * The shared controls are 28px in a properties panel and 22px here, and the
      * difference is a token rather than a second set of components — see
      * `office-ui/tokens.css`. Which is the whole reason this column could stop
      * hand-rolling its own select, field and button: they now match the panel's
      * *and* fit an instrument.
      */
    <aside className="sl-step-inspector" data-density="dense" data-step-editor={step.sid}>
      {/*
        * Whose inspector this is: one shape, or how many bars an edit will reach.
        *
        * Pinned to the top of the column, because every control below writes to
        * *all* of them — a length typed with six bars selected changes six, and a
        * heading that had scrolled out of the column would be a surprise.
        */}
      <header className="sl-step-head">
        <span className="sl-step-name" data-editing-count={count > 1 ? count : undefined}>
          {count > 1 ? `${count}개 선택` : step.label}
        </span>
      </header>

      {/* 무엇을 — the motion itself, which is the one thing every step has. */}
      <FieldGroup testClass="sl-step-group" label="모션">
        {step.kind === 'build' && (
          <Field testClass="sl-step-row" label="프리셋">
            <Choice
              ariaLabel="프리셋"
              data={{ 'step-preset': preset?.id ?? 'custom' }}
              value={preset?.id ?? ''}
              onChange={(picked) => {
                const found = presetById(picked);
                if (found) onChange(presetAttrs(found));
              }}
            >
              {/* Only reachable *from* a nudged step, and only as a description of
                  one: choosing it would mean nothing, so it writes nothing. */}
              <option value="">직접 설정</option>
              {CATEGORY_LABELS.map(({ id, label }) => (
                <optgroup key={id} label={label}>
                  {presetsIn(id).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Choice>
          </Field>
        )}

        {step.kind === 'path' ? (
          <>
            {/*
              * A path has no effect to choose — what it *is*, is its path, and the
              * path is edited on the shape where it is drawn. What belongs here is
              * the one thing about it that is not a shape on screen: which way the
              * travelling shape faces.
              */}
            <Field testClass="sl-step-row" label="종류">
              <span className="sl-step-kind">경로</span>
            </Field>
            <Field testClass="sl-step-row" label="방향 유지">
              <Choice
                ariaLabel="방향 유지"
                value={step.facing ?? 'fixed'}
                onChange={(value) => onChange({ facing: value })}
              >
                {FACINGS.map((facing) => (
                  <option key={facing} value={facing}>
                    {FACING_LABELS[facing]}
                  </option>
                ))}
              </Choice>
            </Field>
            {/*
              * Whether the corners are rounded off. The one thing about a path that
              * is a *decision* rather than a shape on screen — a zigzag with its
              * corners smoothed is a wave, which is a different route rather than a
              * different drawing of the same one.
              */}
            <Field testClass="sl-step-row" label="모서리">
              <Choice
                ariaLabel="모서리"
                value={step.smooth === false ? 'sharp' : 'smooth'}
                onChange={(value) => onChange({ smooth: value === 'smooth' })}
              >
                <option value="smooth">부드러운 곡선</option>
                <option value="sharp">꺾인 선</option>
              </Choice>
            </Field>

            {/*
              * Placing points by clicking the slide, which is the half of authoring
              * a path that dragging cannot do: six presets and a drag cover
              * "something like this", and a reader who wants a *particular* route
              * has to be able to put it there.
              */}
            <Field testClass="sl-step-row" label="점">
              <Button
                testClass="sl-timeline-draw"
                data={{ 'path-draw': '' }}
                pressed={!!drawing}
                onClick={() => onDrawing?.(!drawing)}
              >
                {drawing ? '그리기 끝내기' : '점 그리기'}
              </Button>
            </Field>

            <p className="sl-step-note">
              {drawing
                ? '슬라이드를 눌러 점을 추가하세요 · Esc로 끝내기'
                : `${(pathLength(step.path ?? []) / 567).toFixed(1)}cm · 상자 위에서 점을 끌어 편집`}
            </p>
          </>
        ) : step.kind === 'build' ? (
          <Field testClass="sl-step-row" label="효과">
            <Choice
              ariaLabel="효과"
              value={step.effect ?? 'fadeIn'}
              onChange={(value) => onChange({ effect: value })}
            >
              {CATEGORY_LABELS.map(({ id, label }) => (
                <optgroup key={id} label={label}>
                  {byCategory[id]?.map((effect) => (
                    <option key={effect.id} value={effect.id}>
                      {effect.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Choice>
          </Field>
        ) : (
          <Field testClass="sl-step-row" label="종류">
            <span className="sl-step-kind">재생</span>
          </Field>
        )}

        {/*
          * **Which one** — for the effects that animate an item of a list.
          *
          * A shape's fills are a list and so are its effects, so 그라디언트 돌기 on
          * a shape with two gradients has to say which one it turns. Measured
          * before this row existed: one shared variable turned *both*.
          *
          * Offered only where the effect declares a `part`, which is the same rule
          * the direction and the amount follow — and only for the items that have
          * a track, so a row a reader can choose is a row that does something.
          */}
        {(parts ?? []).length > 0 && (
          <Field testClass="sl-step-row" label="대상">
            <Choice
              ariaLabel="모션 대상"
              value={String(Math.min(step.partAt ?? 0, (parts ?? []).length - 1))}
              onChange={(value) => onChange({ partAt: Number(value) })}
            >
              {(parts ?? []).map((part) => (
                <option key={part.index} value={String(part.index)}>
                  {part.label}
                </option>
              ))}
            </Choice>
          </Field>
        )}
      </FieldGroup>

      {/*
        * 언제 — PowerPoint calls this group 타이밍 and puts exactly these controls
        * in it, which is the naming a reader arrives already knowing.
        */}
      <FieldGroup testClass="sl-step-group" label="타이밍">
        {/*
          * What starts this step: a press, or a *shape*.
          *
          * First in the group, because it changes what the rest of it means — a
          * step waiting for a click is not in the press sequence at all, so its
          * 시작 (with or after the previous one) is about the other steps on the
          * same trigger rather than about the slide's order.
          */}
        {step.kind !== 'play' && (watchable ?? []).length > 0 && (
          <Field testClass="sl-step-row" label="실행 조건">
            <Choice
              ariaLabel="실행 조건"
              value={step.on ?? ''}
              onChange={(value) => onChange({ on: value || null })}
            >
              <option value="">순서대로</option>
              {(watchable ?? []).map((shape) => (
                <option key={shape.name} value={shape.name}>
                  {`${shape.label} 클릭 시`}
                </option>
              ))}
            </Choice>
          </Field>
        )}

        {/*
          * When the shape being waited for can actually be clicked.
          *
          * A hidden box is not hit-testable, so a trigger on a shape that arrives
          * on the second press does nothing for the first two clicks — correct,
          * and until this line, invisible. Said only when there is something to
          * say: a shape that is there from the start gets no note, because every
          * note a reader learns to ignore costs the next one its meaning.
          */}
        {step.on && triggerAt && (triggerAt.from === undefined || triggerAt.from > 0 || triggerAt.until !== undefined) && (
          <p className="sl-step-note" data-trigger-note>
            {triggerAt.from === undefined
              ? '이 상자는 프레스로는 나타나지 않습니다 · 트리거가 서로를 기다리는지 확인하세요'
              : triggerAt.until !== undefined
                ? `${triggerAt.from}번째 프레스 뒤부터 ${triggerAt.until}번째 프레스까지 누를 수 있습니다`
                : `${triggerAt.from}번째 프레스 뒤부터 누를 수 있습니다`}
          </p>
        )}

        <Field testClass="sl-step-row" label="시작">
          <Choice
            ariaLabel="시작"
            value={step.startsWith}
            onChange={(value) => onChange({ startsWith: value })}
          >
            <option value="onClick">클릭할 때</option>
            <option value="withPrevious">이전과 함께</option>
            <option value="afterPrevious">이전 다음에</option>
          </Choice>
        </Field>

        {/*
          * The delay, typed.
          *
          * It has always been in the document and only ever been *dragged* — the
          * bar's own position is a delay — which is exact to the pixel the reader
          * can hit and no finer. A column has room for the number the drag was
          * approximating, and 0.2초 after the previous one is a thing a reader
          * means precisely.
          */}
        <Field testClass="sl-step-row" label="지연" unit="초">
          <NumberField
            ariaLabel="지연"
            min={0}
            step={0.1}
            value={Math.round(step.delay / 100) / 10}
            onCommit={(seconds) => onChange({ delay: Math.max(0, Math.round(seconds * 1000)) })}
          />
        </Field>

        {/*
          * The length, which a trimmed film does not get to choose.
          *
          * A build's length is its own attribute. A film's is the film's, and the
          * step's `duration` was only ever a placeholder for it — so once there is
          * an out-point, the length *is* the trim and a field a reader could type
          * into would be a field the document ignores. Said as a number instead,
          * which is the honest version of a disabled input.
          */}
        {cut ? (
          <Field testClass="sl-step-row" label="길이" unit="초 · 트림">
            <span className="sl-step-kind" data-step-length>
              {(step.duration / 1000).toFixed(1)}
            </span>
          </Field>
        ) : (
          <Field testClass="sl-step-row" label="길이" unit="초">
            <NumberField
              ariaLabel="재생 시간"
              min={0.1}
              step={0.1}
              value={Math.round(step.duration / 100) / 10}
              onCommit={(seconds) => onChange({ duration: Math.max(80, Math.round(seconds * 1000)) })}
            />
          </Field>
        )}

        {/*
          * How many times, where "무한" is a slide pointing at something for as
          * long as it is talked about — the one case a count cannot express, and
          * why `0` is the document's word for it.
          *
          * In 타이밍 rather than beside the trail: a repeat is *more time*, which
          * is what every other control in this group is about, and the timeline's
          * bar grows when it changes.
          */}
        {step.kind === 'build' && (
          <Field testClass="sl-step-row" label="반복">
            <Choice
              ariaLabel="반복"
              value={String(step.repeat)}
              onChange={(value) => onChange({ repeat: Number(value) })}
            >
              <option value="1">1번</option>
              <option value="2">2번</option>
              <option value="3">3번</option>
              <option value="5">5번</option>
              <option value="0">무한</option>
            </Choice>
          </Field>
        )}
      </FieldGroup>

      {/*
        * 어디부터 어디까지 — which part of the film plays.
        *
        * The half of a timeline this pane did not have: the list said *when* a
        * film starts, which is what an animation list says, and nothing said which
        * part of it plays. Two points on the film itself — see `media-trim.ts` for
        * why they live there and why an out-point of zero is "to the end".
        *
        * The film's own length is *not* in the document, so it is read off the
        * element on the stage and shown beside the out-point: a reader typing an
        * end has to know what the end is.
        */}
      {step.kind === 'play' && (
        <FieldGroup testClass="sl-step-group" label="필름">
          {/*
            * The sound, and the part of it that plays.
            *
            * The two fields below were the whole of trimming, and a reader typed them
            * **blind**: nobody knows where eight seconds of dead air end without
            * playing the clip and watching a clock. Drawn only once there is something
            * to draw — a strip with no sound in it is furniture that says nothing.
            *
            * `0` for an out-point is the document's "to the end", so a handle dragged
            * to the right edge writes zero rather than the film's length: a length
            * written into the document would be a measurement, and it would be wrong
            * the moment the file changed. See `media-trim.ts`.
            */}
          {peaks && peaks.length > 0 && (
            <Waveform
              peaks={peaks}
              height={30}
              label="필름의 소리"
              data={{ 'step-wave': step.sid }}
              window={trimWindow(
                { start: step.trim?.start ?? 0, end: step.trim?.end ?? 0 },
                film ?? 0
              )}
              onChange={({ from, to }) => {
                if (!film) return;
                onTrim?.({
                  trimStart: momentAt(from, film),
                  trimEnd: to >= 0.999 ? 0 : momentAt(to, film)
                });
              }}
            />
          )}
          <Field testClass="sl-step-row" label="시작점" unit="초">
            <NumberField
              ariaLabel="시작점"
              min={0}
              step={0.1}
              value={Math.round((step.trim?.start ?? 0) / 100) / 10}
              onCommit={(seconds) => onTrim?.({ trimStart: Math.max(0, Math.round(seconds * 1000)) })}
            />
          </Field>
          <Field
            testClass="sl-step-row"
            label="끝점"
            unit={film ? `초 · 전체 ${(film / 1000).toFixed(1)}` : '초 · 0은 끝까지'}
          >
            <NumberField
              ariaLabel="끝점"
              min={0}
              step={0.1}
              value={Math.round((step.trim?.end ?? 0) / 100) / 10}
              onCommit={(seconds) => onTrim?.({ trimEnd: Math.max(0, Math.round(seconds * 1000)) })}
            />
          </Field>
        </FieldGroup>
      )}

      {/* 어떻게 — the motion's own look: which way, how far, what colour, and
          the curve it moves through. */}
      <FieldGroup testClass="sl-step-group" label="모양">
        {/*
          * Which way and how much — the effect's *options*, offered only by the
          * effects that declare them.
          *
          * A direction on a flash is a control that changes nothing, so the effect
          * table says which effects turn and this draws exactly those: the same
          * rule the properties panel follows for a shape's attributes, one layer
          * down.
          */}
        {takes.direction && (
          <Field testClass="sl-step-row" label="방향">
            <Choice
              ariaLabel="방향"
              value={step.direction ?? fromName?.direction ?? DEFAULT_DIRECTION}
              onChange={(value) => onChange({ direction: value })}
            >
              {DIRECTION_LABELS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Choice>
          </Field>
        )}

        {takes.amount && (
          <Field testClass="sl-step-row" label="정도" unit={`${Math.round((step.amount ?? DEFAULT_AMOUNT) * 100)}%`}>
            <input
              aria-label="정도"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round((step.amount ?? DEFAULT_AMOUNT) * 100)}
              onChange={(event) => onChange({ amount: Number(event.target.value) / 100 })}
            />
          </Field>
        )}

        {/*
          * A colour, for the effects that are *about* one.
          *
          * Offered by the same rule as the direction and the amount: the effect
          * table declares which effects take one, and an option nobody declared is
          * not drawn. `없음` clears it, which is how a reader goes back to the
          * effect's own default — a glow in the shape's own colour.
          */}
        {takes.color && (
          <Field testClass="sl-step-row" label="색">
            <ColorField
              ariaLabel="모션 색"
              themeSwatches={themeSwatches}
              value={step.color ?? null}
              onChange={(value) => onChange({ color: value })}
              onClear={() => onChange({ color: null })}
            />
          </Field>
        )}

        <Field testClass="sl-step-row" label="가속">
          <CurveEditor
            value={step.easing}
            onChange={(easing) => onChange({ easing })}
            onDuration={(duration) => onChange({ duration })}
          />
        </Field>
      </FieldGroup>

      {/*
        * 무엇에 — the two controls that decide how many *elements* this one step
        * animates, which is the number `stepElements` multiplies and the pane
        * warns about. They were at opposite ends of the old row; a reader who has
        * put a filter on a title's letters and then added a trail has made
        * seventy-two repainting elements out of one step, and the two controls
        * that did it now sit in the same group.
        */}
      {step.kind !== 'play' && (
        <FieldGroup testClass="sl-step-group" label="대상">
          {/*
            * What the effect applies to, and how far apart the pieces are.
            *
            * Offered for every build, because every effect works on a piece of
            * text exactly as it works on a box — which is why this is a control
            * here rather than a kind of step. The 간격 row appears only past
            * 상자 전체: a box has one piece and nothing to space out.
            */}
          {step.kind === 'build' && (
            <Field testClass="sl-step-row" label="단위">
              <Choice
                ariaLabel="단위"
                value={step.unit}
                onChange={(value) => onChange({ unit: value })}
              >
                {TEXT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {TEXT_UNIT_LABELS[unit]}
                  </option>
                ))}
              </Choice>
            </Field>
          )}

          {/*
            * The count is in the row, because a stagger is meaningless without
            * it: 60ms between pieces is a quarter of a second for a word and two
            * seconds for a headline.
            */}
          {step.kind === 'build' && step.unit !== 'box' && (
            <Field testClass="sl-step-row" label="간격" unit={`ms · ${step.units}개`}>
              <NumberField
                ariaLabel="간격"
                min={10}
                max={500}
                step={10}
                value={step.stagger}
                onCommit={(ms) => onChange({ stagger: ms })}
              />
            </Field>
          )}

          {/*
            * The trail: how many copies follow the shape. Only for a whole box —
            * a per-letter trail is twenty-four copies of a title, which is a
            * smear.
            */}
          {step.unit === 'box' && (
            <Field testClass="sl-step-row" label="잔상">
              <Choice
                ariaLabel="잔상"
                value={String(step.echo ?? 0)}
                onChange={(value) => onChange({ echo: Number(value) })}
              >
                <option value="0">잔상 없음</option>
                <option value="1">잔상 1</option>
                <option value="2">잔상 2</option>
                <option value="3">잔상 3</option>
                <option value="5">잔상 5</option>
              </Choice>
            </Field>
          )}
        </FieldGroup>
      )}

      {/*
        * The actions, pinned to the bottom of the column.
        *
        * Measured on 2026-08-20, when these were the last five controls of a row
        * 1340px wide in a 1100px box: at a 1280 window 삭제 sat 76px past the
        * edge of the screen, reachable only by scrolling the whole page
        * sideways. What a reader does *to* a step does not belong at the end of
        * what a step *is*.
        */}
      <footer className="sl-step-actions">
        {/*
          * Copying a motion, which is how a deck gets a house style.
          *
          * Buttons rather than Ctrl+C/V: those keys belong to the *deck* — a
          * shape copied and pasted — and one pair of keys cannot mean two things
          * depending on where the focus happens to be. The paste is disabled
          * until there is something to paste, which is also how a reader learns
          * that the copy took.
          */}
        <Button square ariaLabel="모션 복사" data={{ 'motion-copy': '' }} onClick={onCopy}>
          <Icon name="duplicate" size={13} />
        </Button>
        <Button
          square
          ariaLabel="모션 붙여넣기"
          data={{ 'motion-paste': '' }}
          disabled={!copied}
          onClick={onPaste}
        >
          ⤵
        </Button>
        <Button square ariaLabel="앞으로" onClick={() => onOrder(-1)}>
          ↑
        </Button>
        <Button square ariaLabel="뒤로" onClick={() => onOrder(1)}>
          ↓
        </Button>
        <Button square ariaLabel="삭제" onClick={onRemove}>
          <Icon name="delete" size={13} />
        </Button>
      </footer>
    </aside>
  );
}

/**
 * The easing: a preset, or a curve dragged by its two handles.
 *
 * Both, because a preset list is the answer nine times out of ten and never the
 * tenth. The curve is drawn as an SVG the size of a stamp with two draggable
 * control points — which is what Figma, After Effects and every animation tool
 * put in the same corner of the same panel, because there is no better way to
 * say "slow, then fast, then settle" than to draw it.
 */
/**
 * The viewBox, sized for the curves that are *legal* rather than for the unit
 * square.
 *
 * An overshoot's control point sits above the box — `backOut` puts one at
 * y = 1.56 — and the first version drew a viewBox that stopped at 1.4. The
 * handle was outside it: not clipped in a way anybody would notice, but
 * unreachable, so choosing that preset and then trying to adjust it grabbed
 * nothing at all. The box now covers every y the editor will accept, which is
 * what makes "presets *and* a curve" one control instead of two.
 */
const CURVE_RANGE = { min: -0.5, max: 1.6 };
const VIEW = { x: -20, y: -70, width: 140, height: 240 };
/** A spring's own box: the bed, and the room its overshoot actually needs. */
const SPRING_VIEW = { x: -4, y: -40, width: 108, height: 148 };

function CurveEditor({
  value,
  onChange,
  onDuration
}: {
  value?: string;
  onChange: (easing: string) => void;
  /** Offering the spring's own length — see `springSettling`, and §below. */
  onDuration?: (ms: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const points = easingPoints(value);
  const host = useRef<SVGSVGElement>(null);

  /**
   * A spring is not a cubic, so this control has two halves.
   *
   * The four control points cannot say what a spring says — a bezier overshoots
   * once and a spring rings — so when the step holds one, the panel draws the
   * *sampled* curve and offers the two numbers that made it instead of two
   * handles to drag. Same control, because it answers the same question: how
   * does this motion move through its time.
   */
  const spring = parseSpring(value);

  /**
   * Where the panel goes: the window, not this control.
   *
   * It was `absolute; bottom: 26px`, which opened upward out of a pane that
   * deliberately does not scroll — and the inspector it now sits in *does*, so an
   * absolutely-placed panel is clipped by an ancestor whichever way it opens.
   * Fixed coordinates, measured from the button, above it when there is room and
   * below when there is not. Still a DOM child of the control, so the pane's own
   * queries and the tests' `[data-curve-open]` neighbourhood are unchanged.
   */
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ top: number; left: number }>();
  const place = useCallback(() => {
    const from = anchor.current?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    if (!from || !box) return;

    /*
     * **위를 먼저, 오른쪽 끝에 맞춰** — this control lives at the bottom of the window, which is where
     * the upward panel came from in the first place.
     *
     * The flip and the clamp are `office-ui` 's `placeNear`. They were written out here, and again in
     * `color-field`, and again in `floating`, with three slightly different answers to *what happens
     * when it does not fit* — the part that is easy to get subtly wrong and hard to notice, because
     * it only shows up near an edge of the window.
     */
    setAt(placeNear(from, box, { prefer: 'above', align: 'end' }));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setAt(undefined);
      return;
    }

    /**
     * The control first, then the panel.
     *
     * The column this sits in scrolls, so the control that opened the panel can
     * be *out of sight* when the panel opens — measured, and the panel then went
     * where the invisible control was: above an anchor 114px below the window,
     * which is a panel 110px below the window. A popover has to be next to the
     * thing it belongs to, so the thing is brought into view first. Only on the
     * way in: scrolling to it on every re-measure would fight the reader.
     */
    anchor.current?.scrollIntoView({ block: 'nearest' });
    place();

    /**
     * And it follows, because the column it is anchored in scrolls under it.
     *
     * Measured: the panel stayed where it was drawn while the inspector scrolled,
     * and the button that opens it slid *underneath* — so the click that should
     * have closed the panel landed on the panel. A fixed popover has to be told
     * that its anchor moves; `capture` because the scroll happens on an ancestor
     * and scroll events do not bubble.
     */
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, !!spring, place]);

  /**
   * The viewBox, in one place.
   *
   * The bed is the unit square at 0–100 and the box around it is the room an
   * overshoot needs; both the drawing and the drag read these, because two
   * copies of a coordinate system is a drag that lands somewhere the curve is
   * not.
   */
  /** The SVG is 100×100 with y flipped: a curve is drawn upwards. */
  const toSvg = (x: number, y: number) => ({ x: x * 100, y: 100 - y * 100 });
  const first = toSvg(points[0], points[1]);
  const second = toSvg(points[2], points[3]);

  const dragHandle = (index: 0 | 1) => (event: React.PointerEvent) => {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);

    const move = (pointer: PointerEvent) => {
      const box = host.current?.getBoundingClientRect();
      if (!box) return;

      /**
       * Screen pixels → the curve's own 0–1, through the viewBox.
       *
       * The SVG is drawn with room around the bed — an overshoot goes *outside*
       * the unit square and has to be visible — so the element's rectangle is
       * not the curve's. Reading the pointer against the element directly gave a
       * point that was wrong by the margin, and wrong the same way every time,
       * which looked like the drag doing nothing: the x it computed left the
       * legal range, the value would not resolve, and the command declined it.
       */
      const viewX = VIEW.x + ((pointer.clientX - box.left) / box.width) * VIEW.width;
      const viewY = VIEW.y + ((pointer.clientY - box.top) / box.height) * VIEW.height;

      // x is bounded because time cannot run backwards; y is not, because an
      // overshoot *is* a y outside the box and is the reason to have this.
      const x = Math.min(1, Math.max(0, viewX / 100));
      const y = Math.min(CURVE_RANGE.max, Math.max(CURVE_RANGE.min, 1 - viewY / 100));

      const next: [number, number, number, number] = [...points];
      next[index * 2] = x;
      next[index * 2 + 1] = y;
      onChange(bezierCss(next));
    };

    const land = () => {
    };
    /*
     * 미리 보기는 앱의 것이고 쓰기는 놓을 때 한 번. `dragGesture` 로 옮기면서 둘이 생긴다 —
     * `pointercancel` 로 끝나도 리스너가 창에 안 남고, Escape 로 물러설 수 있다.
     */
    dragGesture(
      event as unknown as PointerEvent,
      {
        start: () => ({}),
        move: (_held, at) => move({ clientX: at.x, clientY: at.y } as PointerEvent),
        done: () => land(),
        /*
         * 물러서기와 놓기가 같은 일을 한다 — 이 드래그는 미리 보기를 화면에만 그리고 놓을 때 쓸
         * 것이 없으므로, 걷는 것이 곧 끝이다.
         */
        abort: () => land()
      },
      { threshold: 0 }
    );
  };

  return (
    <span ref={anchor} className="sl-timeline-curve">
      <Choice
        ariaLabel="가속"
        value={
          EASING_PRESETS.some((preset) => preset.id === value)
            ? (value as string)
            : (SPRING_PRESETS.find((preset) => preset.easing === value)?.id ?? 'custom')
        }
        onChange={(picked) => {
          if (picked === 'custom') {
            setOpen(true);
            onChange(bezierCss(points));
            return;
          }
          /**
           * A spring preset writes the *spring*, not its name.
           *
           * The same rule as a motion preset: what a document holds is
           * `spring(180, 9)`, which is readable, adjustable and cannot come to
           * mean something else later. The name is the panel's.
           */
          const springPreset = SPRING_PRESETS.find((preset) => preset.id === picked);
          onChange(springPreset ? springPreset.easing : picked);
          if (springPreset) setOpen(true);
        }}
      >
        {EASING_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        {/* The timing a curve cannot express, in its own group so it reads as a
            different kind of answer rather than a seventh curve. */}
        <optgroup label="스프링">
          {SPRING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </optgroup>
        <option value="custom">직접 그리기</option>
      </Choice>

      <button
        type="button"
        aria-label="가속 곡선"
        data-curve-open
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        ∿
      </button>

      {open && spring && (
        <span
          ref={panel}
          className="sl-timeline-curve-panel"
          data-curve-panel
          data-curve-spring
          /* Hidden for the frame it is measured in, so the flip is never seen. */
          style={{ top: at?.top, left: at?.left, visibility: at ? undefined : 'hidden' }}
        >
          {/*
            * The spring, drawn as what it is: samples.
            *
            * A polyline through `springSamples` rather than a formula the SVG
            * cannot hold — which is also exactly what the browser is given, so
            * the picture and the motion are the same list of numbers. A reader
            * who sees three bounces in the panel gets three bounces on the
            * slide.
            */}
          {/*
            * Its own viewBox, and smaller than the bezier's.
            *
            * The shared one reserves 70 units above the bed for a *handle* that
            * can sit at y = 1.56, and a spring has no handles — its curve stays
            * inside the box and a little over the top. The first version reused
            * the bezier's box, and the panel it made was tall enough to be
            * clipped by the top of the pane: the curve was drawn off screen and
            * the control looked like sliders with no picture.
            */}
          <svg
            viewBox={`${SPRING_VIEW.x} ${SPRING_VIEW.y} ${SPRING_VIEW.width} ${SPRING_VIEW.height}`}
            width="130"
            height="80"
          >
            <rect x="0" y="0" width="100" height="100" className="sl-curve-bed" />
            <polyline
              className="sl-curve-line"
              data-spring-curve
              points={springSamples(spring)
                .map((progress, index, all) => `${(index / (all.length - 1)) * 100},${100 - progress * 100}`)
                .join(' ')}
            />
          </svg>

          <label className="sl-curve-slider">
            탄성
            <input
              aria-label="탄성"
              type="range"
              min={40}
              max={800}
              step={10}
              value={spring.stiffness}
              onChange={(event) =>
                onChange(springCss({ ...spring, stiffness: Number(event.target.value) }))
              }
            />
          </label>
          <label className="sl-curve-slider">
            감쇠
            <input
              aria-label="감쇠"
              type="range"
              min={4}
              max={60}
              step={1}
              value={spring.damping}
              onChange={(event) =>
                onChange(springCss({ ...spring, damping: Number(event.target.value) }))
              }
            />
          </label>

          {/*
            * The spring's own length, offered rather than imposed.
            *
            * Stiffness and damping *do* say how long the motion takes, and letting
            * them set the duration would take the bar's width away from the
            * reader — the timeline's whole gesture. So the panel says what this
            * spring settles in and lets them ask for it.
            */}
          <button
            type="button"
            className="sl-curve-fit"
            data-spring-settling={springSettling(spring)}
            onClick={() => onDuration?.(springSettling(spring))}
          >
            {`자연 길이 ${(springSettling(spring) / 1000).toFixed(2)}초로`}
          </button>
          <code data-curve-value>{springCss(spring)}</code>
        </span>
      )}

      {open && !spring && (
        <span
          ref={panel}
          className="sl-timeline-curve-panel"
          data-curve-panel
          style={{ top: at?.top, left: at?.left, visibility: at ? undefined : 'hidden' }}
        >
          <svg
            ref={host}
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
            width="120"
            height="170"
          >
            <rect x="0" y="0" width="100" height="100" className="sl-curve-bed" />
            <line x1="0" y1="100" x2={first.x} y2={first.y} className="sl-curve-arm" />
            <line x1="100" y1="0" x2={second.x} y2={second.y} className="sl-curve-arm" />
            <path
              className="sl-curve-line"
              d={`M 0 100 C ${first.x} ${first.y}, ${second.x} ${second.y}, 100 0`}
            />
            <circle
              className="sl-curve-handle"
              data-handle="1"
              cx={first.x}
              cy={first.y}
              r="7"
              onPointerDown={dragHandle(0)}
            />
            <circle
              className="sl-curve-handle"
              data-handle="2"
              cx={second.x}
              cy={second.y}
              r="7"
              onPointerDown={dragHandle(1)}
            />
          </svg>
          <code data-curve-value>{bezierCss(points)}</code>
        </span>
      )}
    </span>
  );
}

/** The three kinds of motion, in the order a shape's life runs. */
const CATEGORY_LABELS = [
  { id: 'entrance', label: '나타내기' },
  { id: 'emphasis', label: '강조' },
  { id: 'exit', label: '사라지기' }
] as const;

/**
 * The compass, in a reader's words.
 *
 * "왼쪽에서" for an entrance and "왼쪽으로" for an exit is one option meaning two
 * opposite journeys, so the labels are the bare direction and the effect's own
 * name — 날아오기 or 날아가기 — carries the rest of the sentence.
 */
const DIRECTION_LABELS = [
  { id: 'left', label: '왼쪽' },
  { id: 'right', label: '오른쪽' },
  { id: 'up', label: '위' },
  { id: 'down', label: '아래' },
  { id: 'topLeft', label: '왼쪽 위' },
  { id: 'topRight', label: '오른쪽 위' },
  { id: 'bottomLeft', label: '왼쪽 아래' },
  { id: 'bottomRight', label: '오른쪽 아래' }
] as const;
