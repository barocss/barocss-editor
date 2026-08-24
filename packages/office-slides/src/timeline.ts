import { childrenOf, DeckAccess, DeckNode } from './deck';
import {
  BUILD_STARTS,
  DEFAULT_TRANSITION_MS,
  trackFor,
  type BuildEffect,
  type BuildStart
} from './motion';
import { KNOWN_EFFECT_IDS, NOT_ADDITIVE, categoryOf, propertiesOf } from './motion-effects';
/** Naming lives with the kinds table — see `layers.ts`. */
import { labelOfBox } from './layers';
import { isSceneType } from './selection';
import { componentOf, instanceParts } from '@barocss/office-word';
import { DEFAULT_STAGGER, TEXT_UNITS, unitCount, unitSpan, type TextUnit } from './text-units';
import { FACINGS, pathPointsOf, type Facing, type PathPoint } from './motion-path';
import { trimOf, trimmedLength, type MediaTrim } from './media-trim';

/**
 * A slide's timeline: everything that happens on it, in the order it happens.
 *
 * Three separate entries in the backlog pointed here, which is how you know it
 * is one piece of work and not three. A shape could be given an effect from a
 * dropdown and nothing else: no order, no timing, no way to run two together,
 * and no way to make a film part of the sequence at all. Each of those is a
 * property of *the slide's list*, not of any one shape — which is exactly why a
 * per-shape control could never grow into them.
 *
 * ## One list, two kinds of step
 *
 * A build animates a shape; a `play` step starts a film or a sound. They are the
 * same kind of thing to a presenter — press, and the next thing happens — so
 * they are one list, and the presenter's key does not have to know which it is
 * about to run. The track already held both shapes of step; nothing here changes
 * the document's vocabulary, it reads what was always expressible.
 *
 * The slide's *transition* is deliberately not in it. A transition is how the
 * slide arrives, which is over before the first press: putting it in the list
 * would give a reader a row they cannot reorder and a press that does not exist.
 *
 * ## Groups are computed, never stored
 *
 * Which press runs a step is the consequence of the `startsWith` values before
 * it, so it is computed on every read. Storing a group number would be a second
 * place to say the same thing, and the two would disagree the first time a step
 * was moved — which is a bug a reader would see as "the numbers are wrong" long
 * after they could remember what they had done.
 */

/** What a step does. `transition` is the slide's own arrival and not in the list. */
/**
 * What a step *is*, which is not the same question as what effect it uses.
 *
 * `build` is a shape animating in place, `play` is a film or a sound starting,
 * and `path` is a shape travelling — a kind rather than an effect because it
 * needs a style written before the animation starts (`offset-path`) and no
 * effect has a prerequisite. See `motion-path.ts`.
 */
export type StepKind = 'build' | 'play' | 'path';

export interface TimelineStep {
  /** The step's own sid, which is what every edit names. */
  sid: string;
  kind: StepKind;
  /** The name the shape carries, which is what the step holds. */
  target: string;
  /** That shape's sid today, when it is on this slide. */
  targetSid?: string;
  /** What the shape is called in a panel: its role, its text, or its kind. */
  label: string;
  /**
   * The path a `path` step travels, in twips relative to where the shape rests.
   *
   * Read here rather than left to whoever plays it, for the same reason the
   * easing is: the overlay draws the path and the stage animates along it, and
   * two readers of one fact is one too many for it to be looked up twice.
   */
  path?: PathPoint[];
  /** Whether the shape turns to face its travel. Only read on a `path`. */
  facing?: Facing;
  /** Whether a path's corners are rounded off. Only read on a `path`. */
  smooth?: boolean;
  /** A build's effect. A `play` step has none — playing is the effect. */
  effect?: BuildEffect;
  duration: number;
  delay: number;
  startsWith: BuildStart;
  /**
   * How it is eased: a preset's name, or a `cubic-bezier(...)` a reader drew.
   *
   * Read here rather than left to whoever plays it, because the panel draws the
   * curve and the stage animates with it — two readers of one fact, which is one
   * reader too many for it to be looked up twice.
   */
  easing: string;
  /** Which way it goes, for the effects that have a way. */
  direction?: string;
  /** How much of whatever the effect measures, from 0 to 1. */
  amount?: number;
  /**
   * Which of the target's fills or shadows this step animates.
   *
   * Only meaningful for an effect that declares a `part` — a sweep turns one
   * fill, a deepen grows one shadow. See `motion-tracks.ts` for why the item has
   * to be named at all.
   */
  partAt?: number;
  /** A colour the effect needs — a glow's, a bloom's — or nothing. */
  color?: string;
  /**
   * The shape whose click runs this step, by the name that shape carries.
   *
   * A *third* kind of start condition, and the one that is not about the sequence
   * at all. `startsWith` says where a step sits in the order of presses — the
   * next press, or with or after the one before it — and every press is anonymous:
   * a click anywhere advances. This says **that shape**, out of order, as many
   * times as a reader presses it, or never.
   *
   * Which is what makes a quiz, a menu, or an explanation revealed on demand
   * possible at all, and why a step carrying one is not in the press sequence:
   * `group` is 0, and every reader of the sequence skips it.
   */
  on?: string;
  /** How many times it runs; `0` is until the slide moves on. */
  repeat: number;
  /**
   * How many trailing copies follow the shape — an afterimage, and `0` for none.
   *
   * A fact about *drawing* rather than about time, so it does not touch the bar's
   * width: the copies are behind the shape, not after it. What makes a fast
   * motion read as fast.
   */
  echo: number;
  /**
   * What the effect is applied to: the box, or the pieces of its text.
   *
   * `box` unless the step says otherwise, which is what makes this one code path
   * rather than two — a box is a text animation with one piece.
   */
  unit: TextUnit;
  /** Milliseconds between one piece and the next. Only read past `box`. */
  stagger: number;
  /**
   * How many pieces the target's text has, for this unit.
   *
   * Read from the document here rather than left to whoever plays it, because
   * the *bar* needs it: a step animating twenty letters is over one stagger-span
   * later than its duration says, and whatever follows it waits for the last
   * letter rather than the first. The count is a fact about the document, so it
   * is read where the document is.
   */
  units: number;
  /**
   * Which part of the film plays. Only on a `play` step.
   *
   * Read from the *target* rather than from the step, because a trim is a fact
   * about the film — see `media-trim.ts` — and read here for the same reason the
   * unit count is: the **bar** needs it. A film trimmed to fifteen seconds is a
   * fifteen-second bar, which is the whole of "a timeline says which part plays".
   */
  trim?: MediaTrim;
  /** Which press runs it, counting from 1. Computed, never stored. */
  group: number;
}

const attrString = (node: DeckNode | undefined, key: string): string | undefined => {
  const value = node?.attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const attrNumber = (node: DeckNode | undefined, key: string, fallback: number): number => {
  const value = node?.attributes?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
};


/**
 * Every **box** on a slide, by the name it carries — the map a step is read through.
 *
 * ## Only a box, and that was measured
 *
 * It read `name` off every node it walked, and on the sample deck's cards slide that offered a
 * reader four things to animate that are not boxes at all: `title`, `value`, `showBadge` and
 * `accent` — a placement's **answers** (`componentValue` nodes, whose `name` says which variable
 * they answer) — and the **slide itself**, because the walk starts at the surface and a slide has a
 * name too.
 *
 * A step naming one of those animates nothing, silently. Which is the fault this repository keeps
 * finding in one shape: a walk that reads an attribute off whatever it happens to be standing on.
 * `isSceneType` is the one list of what a canvas places, and asking it is the fix.
 *
 * ## What a card's parts cannot do, and why the list stops there
 *
 * A placement is offered — it is a box, and animating a card as a whole is an ordinary thing to
 * want. Its **parts** are not: they are the definition's and are resolved at draw time (§10b-2a), so
 * naming one from a slide's track would name a thing the document does not have. Two placements of
 * one card would draw two parts with the same name, and the ambiguity is systemic rather than
 * accidental.
 *
 * What a card's own motion would be — a track on the definition, played inside every placement — is
 * in `docs/BACKLOG.md` with the two questions it needs answered first. The reader's own things in a
 * card's **slot** are offered, because those are their nodes with their own sids.
 */
export function namedBoxes(doc: DeckAccess, surfaceSid: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (sid: string, depth: number): void => {
    if (depth > 32) return;
    const node = doc.getNode(sid);
    if (!node) return;

    const name = attrString(node, 'name');
    // The surface is where the walk starts, not something on it: a slide named "One card, three
    // places" was being offered as a shape to animate.
    if (name && sid !== surfaceSid && isSceneType(node.stype) && !found.has(name)) {
      found.set(name, sid);
    }

    for (const child of childrenOf(node)) walk(child, depth + 1);
  };
  walk(surfaceSid, 0);
  return found;
}


/**
 * The slide's steps, in order, with everything a panel needs to draw a row.
 *
 * A step naming a shape that is no longer on the slide is *kept*, with no
 * `targetSid` and a label that says so. Dropping it would hide the fault: a
 * reader who deleted a shape and left its animation behind should be able to see
 * the leftover and remove it, rather than wonder why their presses are one out.
 */
export function slideTimeline(doc: DeckAccess, surfaceSid: string): TimelineStep[] {
  const track = trackFor(doc, surfaceSid);
  if (!track) return [];

  const boxes = namedBoxes(doc, surfaceSid);
  const steps: TimelineStep[] = [];
  let group = 0;

  for (const sid of childrenOf(doc.getNode(track))) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'motionStep') continue;

    const kind = attrString(node, 'kind');
    if (kind !== 'build' && kind !== 'play' && kind !== 'path') continue;

    const target = attrString(node, 'target');
    if (!target) continue;

    const effect = attrString(node, 'effect');
    /**
     * Every name a document may hold, which includes the ones this product used
     * to write. A deck saved before the direction moved out of the effect's name
     * still says `flyInLeft`, and it still means what it meant.
     */
    if (kind === 'build' && !KNOWN_EFFECT_IDS.includes(effect ?? '')) continue;

    /**
     * A `path` step with no path is not a step.
     *
     * The same rule as an effect this product does not have: a bar that animates
     * nothing is worse than no bar, because a reader counts it in their presses.
     */
    const path = kind === 'path' ? pathPointsOf(node.attributes?.path) : undefined;
    if (kind === 'path' && !path) continue;

    const startsWith = (BUILD_STARTS as readonly string[]).includes(
      attrString(node, 'startsWith') ?? ''
    )
      ? (attrString(node, 'startsWith') as BuildStart)
      : 'onClick';

    /**
     * A step waiting for *a shape* is not in the sequence at all.
     *
     * `group: 0` rather than a press of its own, because a press is something the
     * presenter's forward key consumes and this is not: a trigger that is never
     * clicked never runs, and one clicked three times runs three times. Every
     * reader of the sequence — the press count, what a press runs, what is hidden
     * until it has played — filters by group and therefore skips it for free.
     */
    const on = attrString(node, 'on');

    // The first step starts a press whatever it says: a `withPrevious` at the
    // front has nothing to be with, and losing it would be worse than running it
    // one press early.
    if (!on && (startsWith === 'onClick' || group === 0)) group += 1;

    const targetSid = boxes.get(target);
    /**
     * A unit this product does not have is `box`.
     *
     * The same rule the effect names follow: a deck from somewhere else that says
     * `unit: 'line'` animates as a whole box rather than not at all, which is a
     * motion a reader can see and change.
     */
    const named = attrString(node, 'unit');
    const unit = (TEXT_UNITS as readonly string[]).includes(named ?? '')
      ? (named as TextUnit)
      : 'box';

    /** The film's in and out points, which live on the film — see `trimOf`. */
    const trim = kind === 'play' ? trimOf(targetSid ? doc.getNode(targetSid) : undefined) : undefined;

    steps.push({
      sid,
      kind,
      target,
      targetSid,
      label: targetSid ? labelOfBox(doc, targetSid) : '없는 상자',
      effect: kind === 'build' ? (effect as BuildEffect) : undefined,
      /**
       * How long the bar is.
       *
       * A trimmed film is as long as its trim, which is the one case where the
       * length of a step is not the step's own attribute: the step's `duration`
       * was only ever a placeholder for a film, because a file's length is not in
       * the document. An untrimmed one keeps the placeholder — see
       * `trimmedLength`, which returns nothing rather than guessing.
       */
      duration:
        (trim ? trimmedLength(trim) : undefined) ??
        attrNumber(node, 'duration', DEFAULT_TRANSITION_MS),
      delay: attrNumber(node, 'delay', 0),
      startsWith,
      easing: attrString(node, 'easing') ?? 'ease',
      direction: attrString(node, 'direction'),
      repeat: attrNumber(node, 'repeat', 1),
      echo: Math.min(6, attrNumber(node, 'echo', 0)),
      amount:
        typeof node.attributes?.amount === 'number' && Number.isFinite(node.attributes.amount)
          ? (node.attributes.amount as number)
          : undefined,
      color: attrString(node, 'color'),
      partAt: attrNumber(node, 'partAt', 0),
      ...(on ? { on } : {}),
      unit,
      stagger: attrNumber(node, 'stagger', DEFAULT_STAGGER),
      units: kind === 'build' ? unitCount(doc, targetSid, unit) : 1,
      ...(trim ? { trim } : {}),
      ...(path ? { path } : {}),
      ...(kind === 'path'
        ? {
            facing: (FACINGS as readonly string[]).includes(attrString(node, 'facing') ?? '')
              ? (attrString(node, 'facing') as Facing)
              : 'fixed',
            smooth: node.attributes?.smooth !== false
          }
        : {}),
      group: on ? 0 : group
    });
  }

  return steps;
}

/** Every shape whose click runs something, and what it runs. */
export function triggersOn(steps: TimelineStep[]): Map<string, TimelineStep[]> {
  const byShape = new Map<string, TimelineStep[]>();
  for (const step of steps) {
    if (!step.on) continue;
    const list = byShape.get(step.on) ?? [];
    list.push(step);
    byShape.set(step.on, list);
  }
  return byShape;
}

/**
 * The order the steps would be in after one is moved.
 *
 * Returned as a list of sids rather than applied, because moving a step is a
 * document edit and this is arithmetic — the same division every other
 * calculation in this package makes, and what lets the awkward cases be tested
 * in milliseconds.
 *
 * A step that cannot move — the first going up, the last going down — comes back
 * as the order that was already there, so the command has one thing to check.
 */
export function reorderSteps(sids: string[], sid: string, by: number): string[] {
  const from = sids.indexOf(sid);
  if (from < 0) return sids;

  const to = from + by;
  if (to < 0 || to >= sids.length) return sids;

  const next = [...sids];
  next.splice(from, 1);
  next.splice(to, 0, sid);
  return next;
}

/**
 * How long a slide takes to play itself, in milliseconds.
 *
 * The presses are the reader's, so this is the time *the deck* spends animating:
 * within a press, the longest of the steps that start together, plus what runs
 * after them. A number a reader can sanity-check against how long they mean to
 * talk for.
 */
export function timelineDuration(steps: TimelineStep[]): number {
  let total = 0;
  let inGroup = 0;
  let group = 0;

  for (const step of steps) {
    if (step.group !== group) {
      total += inGroup;
      inGroup = 0;
      group = step.group;
    }
    /**
     * One pass of a repeating step, and one pass of an endless one.
     *
     * A step that runs until the slide moves on has no length to add — the
     * length is however long the presenter talks — and a total of `Infinity`
     * would be a number no reader can use. Counting one pass says the useful
     * thing: how long the slide takes to *get through* its animation.
     */
    const passes = step.repeat > 1 ? step.repeat : 1;
    // A pass counts its stagger span: a title animating twenty-four letters takes
    // 1.4s, not the 0.35s one letter takes. The pane's total is the number a
    // reader checks against how long they mean to talk for, so understating it
    // by a factor of four is the whole value of the number gone.
    const takes = step.delay + unitSpan(step.duration, step.stagger, step.units) * passes;
    // `afterPrevious` runs after the group so far rather than beside it, which is
    // the whole difference between the two words.
    inGroup = step.startsWith === 'afterPrevious' ? inGroup + takes : Math.max(inGroup, takes);
  }

  return total + inGroup;
}

/**
 * How many presses a slide takes, which is the number the presenter's key needs.
 *
 * The last group, because groups are numbered from one and every step is in one.
 */
export function pressCount(steps: TimelineStep[]): number {
  /**
   * The highest press, not the last step's.
   *
   * They were the same thing until a step could sit outside the sequence: a
   * trigger's `group` is 0, so a slide whose last step waits for a click used to
   * report *no presses at all* and the presenter's forward key left immediately.
   */
  return steps.reduce((highest, step) => Math.max(highest, step.group), 0);
}

/**
 * The steps a given press runs, counting presses from one.
 *
 * A triggered step is never one of them, and the reason is a collision worth
 * naming: its group is 0 — it is outside the sequence — and 0 is also the state a
 * slide is in *before* the first press. So asking "what does press 0 run" used to
 * answer "every trigger on the slide", and a shape waiting to be clicked animated
 * the moment the slide arrived. Measured, in the show.
 *
 * The pane asks for press 0 deliberately, to *draw* the triggers, so it uses
 * `stepsWaitingFor` instead — a different question, honestly named.
 */
export function stepsAtPress<T extends TimelineStep>(steps: T[], press: number): T[] {
  return steps.filter((step) => !step.on && step.group === press);
}

/** The steps a click on a given shape runs — the trigger's own little sequence. */
export function stepsWaitingFor<T extends TimelineStep>(steps: T[], shape: string): T[] {
  return steps.filter((step) => step.on === shape);
}

/**
 * Which shapes are not on the slide, after a number of presses.
 *
 * By name, because that is what a step holds — and it is "not on the slide"
 * rather than "not yet", which is the correction this function needed: a shape
 * can be off the slide because its entrance has not run **or** because its exit
 * already has.
 *
 * ## What the last played step leaves behind
 *
 * A shape's own steps in order are a little story — appear, be emphasised, leave
 * — so what is on the slide after N presses is decided by the **last step of that
 * shape's that has played**:
 *
 * - it was an *exit* → the shape is gone;
 * - it was anything else → the shape is there;
 * - nothing of its has played → it is there unless its first step is an
 *   *entrance*, because a shape that only ever leaves has to be on the slide to
 *   leave from.
 *
 * Two live faults in the show came from not saying this. Measured, presenting:
 * a shape given 날아가기 flew out on its press and **came back on the next one**,
 * because the exit was only holding its end state through its own animation, and
 * the next press does not run it. And a shape whose only motion was 날아가기 was
 * invisible from the moment the slide arrived, because every build's target was
 * hidden until it played and only `fadeOut` was excused — a special case for one
 * of the four exits this product has.
 *
 * The category comes from the effect table (`categoryOf`), which is the only place
 * that knows what an effect *is*. A name-check here would be the fifth exit's
 * bug waiting to happen.
 */
export function hiddenUntilPlayed(steps: TimelineStep[], played: number): Set<string> {
  const hidden = new Set<string>();

  /**
   * A step waiting for a shape to be clicked is not in the story at all.
   *
   * Its group is 0 — outside the sequence — so it can never be "the last one that
   * played", and a reveal on demand stays hidden however many presses go by. That
   * is the whole point of it, and `group: 0` alone would read as "already played".
   */
  const sequence = steps.filter((step) => step.kind === 'build' && !step.on);
  const triggered = steps.filter((step) => step.kind === 'build' && !!step.on);

  const targets = new Set([...sequence, ...triggered].map((step) => step.target));
  for (const target of targets) {
    const mine = sequence.filter((step) => step.target === target);
    const done = mine.filter((step) => step.group <= played);

    if (done.length > 0) {
      const last = done[done.length - 1];
      /**
       * The story so far ends where it ends: gone if it left, on the slide if not.
       *
       * **Except in the arrival group**, which never hides anything. A card's own motion lands
       * there (§10l) and `group: 0` is "outside the sequence", so `0 <= played` is true from the
       * first moment — and an *exit* read that way hid the shape before its exit had run. Measured:
       * a card part given 날아가기 was simply absent the moment the slide arrived, the animation
       * playing on something already invisible, and in a scrolling show — where the arrival group is
       * never run — it stayed absent for good.
       *
       * Nothing is needed after it runs either: the stage animates with `fill: 'both'`, so an exit
       * that has played holds its own end state. This is the same fault this function was written to
       * fix once already, arriving through a door that did not exist then.
       */
      if (last.group > 0 && categoryOf(last.effect) === 'exit') hidden.add(target);
      continue;
    }

    /**
     * Nothing of this shape's has played, so what matters is what it is *waiting*
     * to do — including a step waiting for a click, which is how a reveal on
     * demand stays hidden. A shape whose first motion is an exit or an emphasis is
     * on the slide already.
     */
    const first = mine[0] ?? triggered.find((step) => step.target === target);
    if (first && categoryOf(first.effect) === 'entrance') hidden.add(target);
  }

  return hidden;
}

/**
 * When a trigger's shape can actually be clicked.
 *
 * A trigger is a step waiting for a *shape* rather than for a press — the reveal
 * on demand — and a shape that is not on the slide yet cannot be clicked: it is
 * hidden, so it is not hit-testable. That is correct and it is **invisible**: a
 * reader who puts a trigger on a box that arrives on press 2 has built something
 * that does nothing for the first two clicks and has no way to know.
 *
 * Both halves are already here, which is why this is arithmetic and not a
 * feature: `hiddenUntilPlayed` says what is on the slide after N presses, and the
 * press count says how many there are. What comes out is a *range*, because a
 * shape can leave again — a trigger on a box that exits on press 4 is clickable
 * from press 2 until press 4 and never after.
 *
 * - `from: 0` — clickable the moment the slide arrives, which is the common case
 *   and the one worth saying nothing about.
 * - `from: undefined` — never, from any press: the watched shape is itself
 *   waiting for a trigger, or it has no entrance the sequence ever runs.
 */
export function triggerWindow(
  steps: TimelineStep[],
  watched: string
): { from?: number; until?: number } {
  const presses = pressCount(steps);
  const shownAt = (played: number) => !hiddenUntilPlayed(steps, played).has(watched);

  let from: number | undefined;
  for (let played = 0; played <= presses; played += 1) {
    if (shownAt(played)) {
      from = played;
      break;
    }
  }
  if (from === undefined) return {};

  for (let played = from + 1; played <= presses; played += 1) {
    // The first press after it arrives that takes it away again. Its *own* press
    // is not one: a shape that leaves on press 4 is still there to be clicked
    // until 4 has run.
    if (!shownAt(played)) return { from, until: played };
  }
  return { from };
}

/**
 * Where each step sits in time, which is what a bar on an axis needs.
 *
 * The list said *order*; a timeline says *when*, and the two are not the same
 * fact. Every tool this is measured against draws a bar whose left edge is a
 * moment and whose width is a length — and until this existed there was no
 * moment to draw, only a position in a list.
 *
 * ## Time within a press, not since the slide arrived
 *
 * A slide's clock is not the wall's. It runs while something is animating and
 * *stops* at every press, because the next moment is whenever the presenter gets
 * to it — which may be a second or a minute. So each press is its own segment
 * starting at zero, exactly as PowerPoint's advanced timeline draws it, and a
 * global "3.4 seconds in" would be a number the deck cannot promise.
 *
 * ## The three words, as arithmetic
 *
 * - `onClick` starts a segment: it begins at its own delay.
 * - `withPrevious` begins when the previous step *began*, plus its delay.
 * - `afterPrevious` begins when the previous step *ended*, plus its delay.
 *
 * Which is PowerPoint's meaning of the same three words, and Canva's of its two.
 * Writing it down as arithmetic is what lets a bar be dragged: a reader moving a
 * bar is setting a delay, and only this says which number that is.
 */
export interface TimedStep extends TimelineStep {
  /** Milliseconds from the start of this step's press. */
  startAt: number;
  /** When it is over, which is what the next `afterPrevious` waits for. */
  endAt: number;
  /**
   * Whether this step's animation adds to what is already on the shape.
   *
   * Two animations of one property are `replace` by default — newest wins — so
   * a fly and a nudge on one shape at one moment produced *only the nudge*.
   * Measured: with `composite: 'add'` they add, percentages and pixels alike, and
   * two scales multiply, which is the meaning anybody wants.
   *
   * The first step on a shape in a press replaces (it is the one that says where
   * the shape comes from) and every later one that *overlaps it in time* adds.
   * A step that overlaps nothing stays `replace`, because addition over a static
   * value is the same thing and `replace` is the cheaper claim.
   */
  composite: 'replace' | 'add';
  /**
   * The properties this step shares with an overlapping one and cannot add.
   *
   * `rotate`, in practice, and it is a browser fault rather than a rule — two
   * additive `rotate` animations in Chromium end at zero (see `NOT_ADDITIVE`).
   * Reported rather than silently worked around: two bars that quietly cancel
   * each other are the worst version of this, and a panel that says "회전은
   * 동시에 하나만" is the least bad.
   */
  clashes?: string[];
  /**
   * Which lane inside its shape's track the bar is drawn in.
   *
   * A shape with two motions at once is two bars at the same moment, and a
   * single lane draws them on top of each other. Counted from 0, and computed
   * here rather than in the pane because it is a fact about *time* — which bars
   * overlap — and time is this file's subject.
   */
  lane: number;
}

/** Whether two steps are on screen at the same moment. */
const overlaps = (a: TimedStep, b: { startAt: number; endAt: number }): boolean =>
  a.startAt < b.endAt && b.startAt < a.endAt;

export function withTiming(steps: TimelineStep[]): TimedStep[] {
  const timed: TimedStep[] = [];
  let previous: TimedStep | undefined;

  for (const step of steps) {
    const isFirstOfPress = !previous || previous.group !== step.group;

    const base = isFirstOfPress
      ? 0
      : step.startsWith === 'afterPrevious'
        ? previous!.endAt
        : step.startsWith === 'withPrevious'
          ? previous!.startAt
          : 0;

    const startAt = base + step.delay;
    /**
     * A repeating step ends after its passes, not after one.
     *
     * Which matters to whatever follows it: `afterPrevious` waits for the *end*,
     * and a pulse that beats three times would otherwise be interrupted by the
     * next step two beats in. Caught by a test rather than by the screen, which
     * is the point of the timing being arithmetic.
     *
     * An endless one counts as a single pass here — it never ends, and a step
     * that waits for it would never run, which is a slide that stops.
     */
    const passes = step.repeat > 1 ? step.repeat : 1;
    /**
     * One pass of a step is its duration *plus* its stagger span.
     *
     * A title animating twenty letters at 60ms is over 1.14s after it starts,
     * not 0.4s: the last letter begins 1.14s in. Whatever follows it has to wait
     * for the last letter, which is the same fault the repeat count had and the
     * same kind of test caught it.
     */
    const pass = unitSpan(step.duration, step.stagger, step.units);
    const endAt = startAt + pass * passes;

    /**
     * What else is happening to this shape at this moment.
     *
     * Only within the press: two presses never overlap, because the second one
     * is however long the presenter takes to press again.
     */
    const together = timed.filter(
      (earlier) =>
        earlier.group === step.group &&
        earlier.target === step.target &&
        overlaps(earlier, { startAt, endAt })
    );

    /**
     * What a step writes: its effect's properties, or — for a path — the one
     * property a path animates.
     *
     * `offsetDistance` is nobody else's, which is the measured reason a path can
     * run *with* any other motion: it writes a slot of its own and the transform
     * it produces composes with `translate` rather than replacing it.
     */
    const writes = (entry: {
      kind: StepKind;
      effect?: string;
      direction?: string;
      amount?: number;
      color?: string;
      partAt?: number;
    }) =>
      entry.kind === 'path'
        ? ['offsetDistance']
        : propertiesOf(entry.effect, {
            direction: entry.direction as never,
            amount: entry.amount,
            color: (entry as { color?: string }).color,
            /**
             * The item, because it is part of the property's name.
             *
             * `--sl-f0-angle` and `--sl-f1-angle` are two different properties, so
             * two sweeps on two fills of one shape do *not* clash and both may
             * run — which is the whole point of naming the item, one layer along.
             */
            partAt: entry.partAt
          });

    const mine = writes(step);
    const shared = new Set<string>();
    for (const earlier of together) {
      for (const property of writes(earlier)) {
        if (mine.includes(property)) shared.add(property);
      }
    }

    const clashes = [...shared].filter((property) =>
      (NOT_ADDITIVE as readonly string[]).includes(property)
    );

    const entry: TimedStep = {
      ...step,
      startAt,
      endAt,
      /**
       * Added when it shares a property with something already running, and only
       * then. A step that overlaps nothing, or overlaps something that animates
       * other properties entirely, has nothing to add to.
       */
      composite: shared.size > clashes.length ? 'add' : 'replace',
      ...(clashes.length > 0 ? { clashes } : {}),
      /** The first free lane: one below whatever it overlaps. */
      lane: together.length === 0 ? 0 : Math.max(...together.map((entry) => entry.lane)) + 1
    };
    timed.push(entry);
    previous = entry;
  }

  return timed;
}

/**
 * How much *time* the axis covers: the press, with a second of headroom.
 *
 * A second rather than exactly the last bar's end, so a reader can always drag
 * something later than everything else — an axis that stops at the last bar has
 * nowhere to put the next one.
 *
 * **Magnification is not in here, and the first version had it wrong.** It
 * divided this number, so at 4× the axis covered 500ms while a 1200ms bar was
 * still 240% of it: the bar ran off the end of the ruler into a region with no
 * ticks, and the pane scrolled further than the clock went. Magnifying is a fact
 * about *drawing* — the same time, spread over four times the pixels — so it
 * belongs in the lane's width and nowhere near the arithmetic. Everything on the
 * axis is a percentage of this, so widening the lane widens the bars with it.
 */
export function axisSpan(steps: TimedStep[], press: number): number {
  return Math.max(2000, pressDuration(steps, press) + 1000);
}

/**
 * The moments a dragged bar should stick to.
 *
 * Every professional timeline snaps, and to the same three things: zero, the
 * playhead, and the *edges of the other bars* — because what a reader is almost
 * always doing is lining one motion up with another's start or end. Without it,
 * "at the same time" is a number typed into a field and checked by eye.
 *
 * The dragged step's own edges are excluded, or a bar would snap to where it
 * already is and never move.
 */
export function snapPoints(steps: TimedStep[], press: number, exclude?: string): number[] {
  const points = new Set<number>([0]);
  for (const step of steps) {
    if (step.group !== press || step.sid === exclude) continue;
    points.add(step.startAt);
    points.add(step.endAt);
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * The nearest of those moments, when one is near enough.
 *
 * The tolerance is in *milliseconds* and the caller converts from pixels, so
 * snapping is as sticky at 4× as it is at fit — which is the whole point of
 * magnifying. A tolerance in milliseconds fixed here would grab from a centimetre
 * away when zoomed in.
 *
 * Answers the value unchanged when nothing is close, so a caller can tell "no
 * snap" from "snapped to 0" — which a caller that only looked at the number could
 * not.
 */
export function snapTo(
  points: number[],
  value: number,
  tolerance: number
): { at: number; snapped: boolean } {
  let best: number | undefined;
  let distance = tolerance;

  for (const point of points) {
    const away = Math.abs(point - value);
    if (away <= distance) {
      best = point;
      distance = away;
    }
  }
  return best === undefined ? { at: value, snapped: false } : { at: best, snapped: true };
}

/**
 * One frame, in milliseconds.
 *
 * Sixty a second, which is what a browser animates at and therefore the smallest
 * step that can *look* different. A deck has no frame rate of its own — nothing
 * is being rendered to a file — so the reader's screen is the only honest answer.
 */
export const FRAME_MS = 1000 / 60;

/**
 * The playhead, moved by a number of frames and kept on the axis.
 *
 * Rounded to a whole millisecond because that is what a step's delay is measured
 * in: a playhead at 16.67ms and a delay of 17 would be a bar that starts a
 * fraction after the moment a reader lined it up with, which is the kind of
 * difference that is invisible and wrong.
 */
export function stepMoment(at: number, frames: number, span: number): number {
  return Math.max(0, Math.min(span, Math.round(at + frames * FRAME_MS)));
}

/**
 * How far behind the shape each trailing copy runs.
 *
 * Derived from the duration rather than stored, because a trail's spacing is
 * about the *speed*: eighty milliseconds behind a 200ms dash is a separate shape
 * altogether, and behind a two-second drift it is invisible. An eighth of the
 * duration, bounded to the range where a copy still reads as a copy.
 *
 * Here rather than in the stage because it is arithmetic about time, and because
 * a number chosen in a component is a number nobody can check.
 */
export function echoGap(duration: number): number {
  return Math.min(120, Math.max(30, Math.round(duration / 8)));
}

/** How long one press runs for, which is the width of its segment. */
export function pressDuration(steps: TimedStep[], press: number): number {
  return steps
    .filter((step) => step.group === press)
    .reduce((longest, step) => Math.max(longest, step.endAt), 0);
}

/**
 * The delays that put a set of bars `by` milliseconds later on the axis.
 *
 * Not "add `by` to each delay", which is the version that was written first and
 * is wrong for exactly the arrangement multi-select exists for: `withPrevious`
 * measures from the *previous step's start*, so adding 100ms to two chained
 * steps' delays moves the first by 100 and the second by **200**. Caught by the
 * browser test that read the bars.
 *
 * So the delta is applied to what a reader sees — the start — and turned back
 * into a delay through the same rule `withTiming` reads it by. A step that is not
 * selected keeps its delay and *is* carried along by whatever it follows, which
 * is what a reader means by "these two, later": the two bars move and everything
 * hanging off them comes too.
 *
 * Answers only the steps whose delay actually changes, so a caller has nothing to
 * filter and a command that would write nothing can refuse.
 */
export function shiftedDelays(
  steps: TimedStep[],
  sids: string[],
  by: number
): Array<{ sid: string; delay: number }> {
  const chosen = new Set(sids);
  const out: Array<{ sid: string; delay: number }> = [];

  let previous: { startAt: number; endAt: number; group: number } | undefined;
  for (const step of steps) {
    const isFirstOfPress = !previous || previous.group !== step.group;
    const base = isFirstOfPress
      ? 0
      : step.startsWith === 'afterPrevious'
        ? previous!.endAt
        : step.startsWith === 'withPrevious'
          ? previous!.startAt
          : 0;

    const delay = chosen.has(step.sid)
      ? Math.max(0, Math.round(step.startAt + by - base))
      : step.delay;

    if (chosen.has(step.sid) && delay !== step.delay) out.push({ sid: step.sid, delay });

    // The rest of the list is timed against where this one *now* is.
    const startAt = base + delay;
    const passes = step.repeat > 1 ? step.repeat : 1;
    previous = {
      startAt,
      endAt: startAt + unitSpan(step.duration, step.stagger, step.units) * passes,
      group: step.group
    };
  }

  return out;
}

/**
 * Where a step would start if its bar were dragged to a given moment.
 *
 * Returned as a *delay*, because that is what the document holds: the moment is
 * the reader's, and the delay is the same moment expressed relative to whatever
 * the step is waiting for. Never negative — a bar dragged before the thing it
 * follows means "as soon as it can", not "before it".
 */
export function delayForStart(steps: TimedStep[], sid: string, startAt: number): number {
  const index = steps.findIndex((step) => step.sid === sid);
  if (index < 0) return 0;

  const step = steps[index];
  const previous = index > 0 && steps[index - 1].group === step.group ? steps[index - 1] : undefined;

  const base = !previous
    ? 0
    : step.startsWith === 'afterPrevious'
      ? previous.endAt
      : step.startsWith === 'withPrevious'
        ? previous.startAt
        : 0;

  return Math.max(0, Math.round(startAt - base));
}

/**
 * What the **cards on a slide** animate, as steps the slide's own player can run.
 *
 * ## Why a card's motion is not the slide's presses
 *
 * A card's track belongs to the card, so it plays in *every* placement of it — and a slide with
 * three of one card would otherwise cost three times the presses for one decision. So these steps
 * arrive in **group 0**, the arrival: they run when the slide comes up, they add no presses
 * (`pressCount` takes the highest group), and each placement animates on its own targets at the
 * same moment.
 *
 * That is also what makes it a *card* animating rather than a slide animating something: the reader
 * arranged it inside the definition, once, and every placement plays it.
 *
 * ## What is remapped, and why it has to be
 *
 * A step names its target by the `name` its shape carries, and `slideTimeline` has already resolved
 * that to a sid **inside the definition** — a node the slide does not have. What the slide has is the
 * drawn part, whose sid is `<placement>~<part>` (§10b-2a), so both the sid and the name are prefixed
 * with the placement. The name as well, because `hiddenUntilPlayed` works in names: shared names
 * would hide two placements' parts as one.
 *
 * ## A step **waiting for a click** works too, and it needed the drawn part's name
 *
 * It was left out at first, on the belief that a click inside a placement resolves to the placement
 * and so could never name a part. Measured, and that is only half true: the show's click walk asks
 * the **innermost** `[data-bc-sid]` first and works outwards, so the element a reader actually
 * pressed *is* the drawn part — what was missing was a name for it. So a card's trigger carries the
 * placement in its `on` as well, and `drawnNames` is the map from that name to the element.
 *
 * Which keeps each placement its own: pressing the badge on the second card runs the second card's
 * step, and the first one stays where it is.
 */
export function cardSteps(doc: DeckAccess, surfaceSid: string): TimelineStep[] {
  const found: TimelineStep[] = [];

  const walk = (sid: string, depth: number) => {
    if (depth > 16) return;
    const node = doc.getNode(sid);
    if (!node) return;

    if (node.stype === 'instance') {
      const definition = componentOf(doc as never, node as never);
      // A placement of a card with no track of its own: nothing to add, and nothing to walk into —
      // what is inside it is the definition's, resolved at draw time.
      if (definition) found.push(...stepsFor(doc, sid, definition.sid));
      return;
    }

    for (const child of childrenOf(node)) walk(child, depth + 1);
  };

  for (const child of childrenOf(doc.getNode(surfaceSid))) walk(child, 0);
  return found;
}

/** One placement's copy of its card's steps. */
function stepsFor(doc: DeckAccess, placement: string, definition: string): TimelineStep[] {
  const own = slideTimeline(doc, definition);

  return own.map((step, at) => ({
    ...step,
    /**
     * The arrival, not a press. And the **first** step of each placement's block starts at zero
     * rather than after whatever the last placement did: `withTiming` chains within a group in list
     * order, so a second card's `afterPrevious` would otherwise wait for the first card to finish —
     * three cards would fade in one after another instead of together.
     *
     * A trigger is outside the sequence either way — `stepsAtPress` skips anything with an `on` —
     * so the group says nothing about it and its own delay is its timing.
     */
    group: 0,
    startsWith: at === 0 ? 'onClick' : step.startsWith,
    target: `${placement}~${step.target}`,
    targetSid: step.targetSid ? `${placement}~${step.targetSid}` : undefined,
    // The shape it waits for is *this placement's*, or pressing one card would fire another's.
    ...(step.on ? { on: `${placement}~${step.on}` } : {})
  }));
}

/**
 * Every **drawn part** on a slide, by the name a card's step watches: `<placement>~<name>`.
 *
 * The other half of a card's trigger. A step holds a name and a click lands on an element, so
 * something has to translate — `namedBoxes` does it for the slide's own shapes, and this does it for
 * the parts a placement draws.
 *
 * Deliberately **not** part of `namedBoxes`: that map is what the timeline panel offers as things to
 * animate and to wait for on a *slide's* track, and a card's part is not one of those (§10k) — two
 * placements would offer the same name twice and neither would mean anything on the slide. This map
 * exists for the show's click walk, which asks about an element it already has.
 */
export function drawnNames(doc: DeckAccess, surfaceSid: string): Map<string, string> {
  const found = new Map<string, string>();

  const walk = (sid: string, depth: number) => {
    if (depth > 16) return;
    const node = doc.getNode(sid);
    if (!node) return;

    if (node.stype === 'instance') {
      for (const part of instanceParts(doc as never, node as never) as never as DeckNode[]) {
        named(doc, part, sid, found, 0);
      }
      return;
    }

    for (const child of childrenOf(node)) walk(child, depth + 1);
  };

  for (const child of childrenOf(doc.getNode(surfaceSid))) walk(child, 0);
  return found;
}

/** One drawn part and everything under it, by name. */
function named(
  doc: DeckAccess,
  part: DeckNode,
  placement: string,
  into: Map<string, string>,
  depth: number
) {
  if (depth > 16 || !part || typeof part !== 'object') return;

  const name = attrString(part, 'name');
  // A real node inside a card's slot is the reader's own and is already in `namedBoxes`.
  const drawn = typeof part.sid === 'string' && part.sid.includes('~') ? part.sid : undefined;
  if (name && drawn && isSceneType(part.stype) && !into.has(`${placement}~${name}`)) {
    into.set(`${placement}~${name}`, drawn);
  }

  for (const child of ((part as { content?: unknown }).content ?? []) as DeckNode[]) {
    named(doc, child, placement, into, depth + 1);
  }
}
