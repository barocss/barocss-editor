import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import type { BuildEffect } from '../src/motion';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import {
  axisSpan,
  delayForStart,
  echoGap,
  FRAME_MS,
  stepMoment,
  hiddenUntilPlayed,
  triggerWindow,
  pressDuration,
  withTiming,
  pressCount,
  reorderSteps,
  cardSteps,
  namedBoxes,
  slideTimeline,
  snapPoints,
  snapTo,
  stepsAtPress,
  stepsWaitingFor,
  timelineDuration,
  triggersOn,
  type TimelineStep
} from '../src/timeline';
import type { DeckAccess } from '../src/deck';
import {
  MOTION_EFFECTS,
  MUST_ADD,
  effectDefinition,
  framesFor,
  propertiesOf,
  resolveEffect,
  splitAdditive
} from '../src/motion-effects';
import { matchingPreset, presetAttrs, presetById } from '../src/motion-presets';
import { backgroundCss, effectsCss } from '../src/paints';
import { fillBoxCss, fillLayers } from '../src/fill-layers';
import { PROPERTY_TIER, costLabel, pressCost, stepElements, stepTier } from '../src/motion-cost';
import {
  MIN_TRIM_MS,
  headTrim,
  isTrimmed,
  tailTrim,
  trimChanges,
  trimOf,
  trimmedLength
} from '../src/media-trim';
import {
  MOTION_TRACKS,
  type MotionTrack,
  TRACK_SLOTS,
  trackName,
  trackOf,
  trackPropertyCss,
  trackVar,
  tracksFor
} from '../src/motion-tracks';

/**
 * A slide's timeline.
 *
 * Three separate entries in the backlog pointed at this, which is how you know it
 * is one piece of work: order, timing, and a film as part of the sequence are all
 * properties of *the slide's list* rather than of any one shape — which is why a
 * per-shape dropdown could never have grown into them.
 */
describe('reordering a list of steps', () => {
  const order = ['a', 'b', 'c'];

  it('moves one later and one earlier', () => {
    expect(reorderSteps(order, 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(reorderSteps(order, 'c', -1)).toEqual(['a', 'c', 'b']);
  });

  /**
   * Off either end comes back as the list that was there — the same array, so a
   * command has one cheap thing to check before writing an edit that changes
   * nothing.
   */
  it('gives back the very same list when there is nowhere to go', () => {
    expect(reorderSteps(order, 'a', -1)).toBe(order);
    expect(reorderSteps(order, 'c', 1)).toBe(order);
    expect(reorderSteps(order, 'nothing', 1)).toBe(order);
  });
});

/**
 * What a step may **name**.
 *
 * A step names its target by the `name` the shape carries, and `namedBoxes` is the map it is read
 * through — so what is in that map is what a reader is offered to animate, to wait for a click on,
 * and to trigger from. Measured on the sample deck, it offered four things that are not boxes and
 * one that is a page.
 */
describe('the shapes a step can name', () => {
  const access = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
    ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

  const carded = () =>
    access({
      root: { sid: 'root', stype: 'document', content: ['s'] },
      // A slide has a name too, and the walk starts here.
      s: {
        sid: 's',
        stype: 'surface',
        attributes: { kind: 'slide', name: '카드 세 장' },
        content: ['shape', 'card']
      },
      shape: { sid: 'shape', stype: 'rectangle', attributes: { name: 'shape-1' } },
      card: {
        sid: 'card',
        stype: 'instance',
        attributes: { componentId: 'metric', name: 'shape-2' },
        content: ['said', 'own']
      },
      /*
       * A placement's **answer**: its `name` says which variable it answers, and it draws nothing at
       * all. Offered to a reader, a step naming it animates nothing, silently.
       */
      said: { sid: 'said', stype: 'componentValue', attributes: { name: 'title', value: '매출' } },
      // The reader's own thing in the card's slot: a real box with a real sid, so it stays.
      own: { sid: 'own', stype: 'textFrame', attributes: { name: 'shape-3' } }
    });

  it('offers boxes, and not a placement’s answers or the slide itself', () => {
    /*
     * Measured on the sample deck before this check existed: the cards slide offered `title`,
     * `value`, `showBadge`, `accent` — four `componentValue` nodes — and `One card, three places`,
     * which is the slide. `isSceneType` is the one list of what a canvas places, and asking it is
     * the whole fix.
     */
    expect([...namedBoxes(carded(), 's').keys()]).toEqual(['shape-1', 'shape-2', 'shape-3']);
  });

  it('offers the placement itself, because a card animates as a whole', () => {
    // Its parts are the definition's and are resolved at draw time, so naming one from a slide's
    // track would name something the document does not have — and two placements of one card would
    // draw two parts with the same name. What a card's *own* motion would be is in the backlog.
    expect(namedBoxes(carded(), 's').get('shape-2')).toBe('card');
  });
});

describe('a slide’s timeline', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let title: string;
  let film: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const can = (command: string, payload?: unknown) =>
    (editor as any).canExecuteCommand?.(command, payload);
  const doc = (): DeckAccess => ({
    rootId: (editor as any).getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });
  const timeline = () => slideTimeline(doc(), slide);

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 100, height: 100 },
                content: [
                  { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'T' }] }
                ]
              },
              {
                stype: 'rectangle',
                attributes: { x: 0, y: 200, width: 100, height: 100 }
              },
              {
                stype: 'mediaVideo',
                attributes: { src: 'film.mp4', x: 0, y: 400, width: 100, height: 100 }
              }
            ]
          },
          { stype: 'resources', attributes: {}, content: [] }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
    const boxes = (store.getNode(slide) as any).content as string[];
    title = boxes[0];
    film = boxes[2];
  });

  it('is empty for a slide nobody has animated', () => {
    expect(timeline()).toEqual([]);
  });

  it('lists a build with what a panel needs to draw it', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });

    expect(timeline()).toMatchObject([
      {
        kind: 'build',
        effect: 'fadeIn',
        // Its role, which says more to a reader than "textFrame" does.
        label: '제목',
        targetSid: title,
        startsWith: 'onClick',
        group: 1
      }
    ]);
  });

  /**
   * The other half of what a timeline is for: a film that plays *on a press*
   * rather than when the slide arrives, in the same list as the builds — so the
   * presenter's key does not have to know which kind it is about to run.
   */
  it('puts a film in the same list as the builds', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    await run('setBoxPlayback', { nodeId: film, startsWith: 'afterPrevious' });

    const steps = timeline();
    expect(steps.map((step) => step.kind)).toEqual(['build', 'play']);
    // `afterPrevious`, so both happen on the first press.
    expect(steps.map((step) => step.group)).toEqual([1, 1]);
    expect(steps[1].label).toBe('동영상');
  });

  it('counts a press per step that waits for one', async () => {
    const boxes = (store.getNode(slide) as any).content as string[];
    await run('setBoxBuild', { nodeId: boxes[0], effect: 'fadeIn' });
    await run('setBoxBuild', { nodeId: boxes[1], effect: 'growIn' });

    expect(timeline().map((step) => step.group)).toEqual([1, 2]);

    await run('setMotionStep', {
      stepId: timeline()[1].sid,
      startsWith: 'withPrevious'
    });

    // Now both run on the first press, which no per-shape control could say.
    expect(timeline().map((step) => step.group)).toEqual([1, 1]);
  });

  /**
   * Two commands in one tick, which is the case reading the document cannot
   * answer.
   *
   * `_freeShapeName` counts the names in the document — and a second command
   * issued before the first has committed reads the *same* document, so both
   * shapes came out `shape-1`. Two shapes with one name is a step that animates
   * whichever the timeline finds first, and it shows up as "the wrong shape
   * moved" long after the click that caused it.
   *
   * Not awaited between the two on purpose: the panel happens to await between
   * clicks, which is why this never bit a reader, and nothing *makes* it.
   */
  it('gives two shapes named in one tick two different names', async () => {
    const boxes = (store.getNode(slide) as any).content as string[];
    // The track exists first, so what is being tested is the *naming* rather
    // than two commands both trying to create the track.
    await run('setBoxBuild', { nodeId: boxes[2], effect: 'fadeIn' });
    await Promise.all([
      run('setBoxBuild', { nodeId: boxes[0], effect: 'fadeIn' }),
      run('setBoxBuild', { nodeId: boxes[1], effect: 'fadeIn' })
    ]);

    const names = [boxes[0], boxes[1]].map(
      (sid) => (store.getNode(sid) as any).attributes.name as string
    );
    expect(new Set(names).size).toBe(2);
    // And each step points at the shape it was asked about, which is the thing
    // the collision actually broke.
    const steps = timeline();
    expect(steps.map((step) => step.targetSid).sort()).toEqual(
      [boxes[0], boxes[1], boxes[2]].sort()
    );
  });

  it('changes a step’s timing without touching the shape', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    const step = timeline()[0].sid;

    await run('setMotionStep', { stepId: step, duration: 900, delay: 250 });

    expect(timeline()[0]).toMatchObject({ duration: 900, delay: 250 });
    expect((store.getNode(title) as any).attributes.name).toBe('shape-1');
  });

  it('refuses an edit that changes nothing', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    const step = timeline()[0].sid;

    // A command that succeeds having changed nothing puts an entry in the
    // history that undoes to the same document.
    expect(can('setMotionStep', { stepId: step })).toBe(false);
    expect(can('setMotionStep', { stepId: step, duration: -5 })).toBe(false);
    expect(can('setMotionStep', { stepId: 'nothing', duration: 500 })).toBe(false);
  });

  it('moves a step, and refuses to move it off either end', async () => {
    const boxes = (store.getNode(slide) as any).content as string[];
    await run('setBoxBuild', { nodeId: boxes[0], effect: 'fadeIn' });
    await run('setBoxBuild', { nodeId: boxes[1], effect: 'growIn' });

    const [first, second] = timeline().map((step) => step.sid);
    expect(can('moveMotionStep', { stepId: first, by: -1 })).toBe(false);
    expect(can('moveMotionStep', { stepId: second, by: 1 })).toBe(false);

    await run('moveMotionStep', { stepId: second, by: -1 });
    expect(timeline().map((step) => step.sid)).toEqual([second, first]);
  });

  it('undoes a move as one thing', async () => {
    const boxes = (store.getNode(slide) as any).content as string[];
    await run('setBoxBuild', { nodeId: boxes[0], effect: 'fadeIn' });
    await run('setBoxBuild', { nodeId: boxes[1], effect: 'growIn' });
    const before = timeline().map((step) => step.sid);

    await run('moveMotionStep', { stepId: before[1], by: -1 });
    await (editor as any).undo();

    expect(timeline().map((step) => step.sid)).toEqual(before);
  });

  it('throws a step away without touching the shape it named', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    const step = timeline()[0].sid;

    await run('removeMotionStep', { stepId: step });

    expect(timeline()).toEqual([]);
    // The name is the shape's, not the step's: another step may hold it.
    expect((store.getNode(title) as any).attributes.name).toBe('shape-1');
  });

  /**
   * A step naming a shape that is gone is kept and *labelled* as such. Dropping
   * it would hide the fault: a reader whose presses are one out should be able
   * to see the leftover and remove it.
   */
  it('keeps a step whose shape has gone, and says so', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    await run('setNode', { nodeIds: [title] });
    await run('deleteBoxes');

    const steps = timeline();
    expect(steps).toHaveLength(1);
    expect(steps[0].targetSid).toBeUndefined();
    expect(steps[0].label).toBe('없는 상자');
  });

  it('takes a film out of the sequence again', async () => {
    await run('setBoxPlayback', { nodeId: film, startsWith: 'onClick' });
    expect(timeline()).toHaveLength(1);

    await run('setBoxPlayback', { nodeId: film, startsWith: 'none' });
    expect(timeline()).toEqual([]);
  });

  it('refuses playback for something that cannot play', async () => {
    expect(can('setBoxPlayback', { nodeId: title, startsWith: 'onClick' })).toBe(false);
  });

  /**
   * A preset is a whole motion in one command, which is the point of it.
   *
   * Five values written by one gesture, in one entry in the history: writing the
   * effect first and its timing after would show the reader the effect at its
   * default length in between, and cost them two undos to take back one click.
   */
  it('writes a whole preset in one command', async () => {
    const rise = presetById('rise')!;
    await run('addBoxBuild', { nodeId: title, ...presetAttrs(rise) });

    expect(timeline()[0]).toMatchObject({
      effect: 'fly',
      duration: 600,
      easing: 'easeOut',
      direction: 'down',
      amount: 0.2
    });
    // And the panel can say which one it is, without the document holding a name.
    expect(matchingPreset(timeline()[0])?.id).toBe('rise');
  });

  it('undoes a preset as one thing', async () => {
    await run('addBoxBuild', { nodeId: title, ...presetAttrs(presetById('pop')!) });
    await (editor as any).undo();

    expect(timeline()).toEqual([]);
  });

  it('retimes a step that already exists', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    const step = timeline()[0].sid;

    await run('setMotionStep', { stepId: step, ...presetAttrs(presetById('heartbeat')!) });

    expect(timeline()[0]).toMatchObject({ effect: 'pulse', repeat: 2, duration: 420 });
    expect(matchingPreset(timeline()[0])?.id).toBe('heartbeat');
  });

  /**
   * Applying a preset that does not repeat *stops* a step repeating, which is why
   * `presetAttrs` writes `repeat: 1` rather than leaving it out.
   */
  it('stops a step repeating when the new preset does not', async () => {
    await run('addBoxBuild', { nodeId: title, ...presetAttrs(presetById('heartbeat')!) });
    const step = timeline()[0].sid;
    expect(timeline()[0].repeat).toBe(2);

    await run('setMotionStep', { stepId: step, ...presetAttrs(presetById('appearSlowly')!) });
    expect(timeline()[0].repeat).toBe(1);
  });

  /**
   * An option the new effect cannot read is not written, which is what the
   * comment in `_stepChanges` always claimed and the code did not do.
   *
   * A flash has no direction, so a step that flashes carries no direction — a
   * document with a setting no panel shows and no frame reads is a document that
   * will be believed by somebody later.
   */
  it('does not write an option the effect cannot read', async () => {
    await run('setBoxBuild', { nodeId: title, effect: 'fadeIn' });
    const step = timeline()[0].sid;

    await run('setMotionStep', { stepId: step, effect: 'flash', direction: 'left', amount: 0.9 });

    const written = (store.getNode(step) as any).attributes;
    expect(written.effect).toBe('flash');
    expect(written.direction).toBeUndefined();
    expect(written.amount).toBeUndefined();
  });
});

/**
 * How long the deck spends animating, which is the number a reader checks
 * against how long they mean to talk for.
 */
describe('how long a slide takes to play itself', () => {
  const step = (
    group: number,
    startsWith: 'onClick' | 'withPrevious' | 'afterPrevious',
    duration: number,
    delay = 0
  ) =>
    ({
      sid: `s${group}-${duration}`,
      kind: 'build' as const,
      target: 'shape-1',
      label: '상자',
      effect: 'fadeIn' as const,
      duration,
      delay,
      startsWith,
      easing: 'ease',
      repeat: 1,
      /**
       * The text-animation four, which a step *always* carries: `slideTimeline` fills
       * them from the node and a bar cannot be drawn without them. These fixtures were
       * written before they existed and said so for the first time when the tests were
       * type-checked — a `box` unit and no echo is what a plain build is.
       */
      echo: 0,
      unit: 'box' as const,
      stagger: 0,
      units: 1,
      group
    });

  it('is nothing for a slide with no steps', () => {
    expect(timelineDuration([])).toBe(0);
  });

  it('takes the longest of the steps that run together', () => {
    expect(timelineDuration([step(1, 'onClick', 400), step(1, 'withPrevious', 900)])).toBe(900);
  });

  /** `afterPrevious` runs after the group so far, which is the whole difference. */
  it('adds the ones that run after the previous', () => {
    expect(timelineDuration([step(1, 'onClick', 400), step(1, 'afterPrevious', 300)])).toBe(700);
  });

  it('adds the presses together', () => {
    expect(timelineDuration([step(1, 'onClick', 400), step(2, 'onClick', 300, 200)])).toBe(900);
  });
});

/**
 * What the show asks of a timeline: how many presses, what each one runs, and
 * what is not on the slide yet.
 *
 * Over the whole list rather than over the builds alone — the two lived side by
 * side for one release and had to agree, and one of them would have stopped
 * agreeing the first time a kind was added.
 */
describe('what a press runs', () => {
  const step = (
    sid: string,
    group: number,
    kind: 'build' | 'play',
    target: string,
    effect?: BuildEffect
  ) =>
    ({
      sid,
      kind,
      target,
      label: target,
      effect,
      duration: 400,
      delay: 0,
      startsWith: 'onClick' as const,
      easing: 'ease',
      repeat: 1,
      /**
       * The text-animation four, which a step *always* carries: `slideTimeline` fills
       * them from the node and a bar cannot be drawn without them. These fixtures were
       * written before they existed and said so for the first time when the tests were
       * type-checked — a `box` unit and no echo is what a plain build is.
       */
      echo: 0,
      unit: 'box' as const,
      stagger: 0,
      units: 1,
      group
    });

  const steps = [
    step('s1', 1, 'build', 'shape-1', 'fadeIn'),
    step('s2', 2, 'play', 'shape-2'),
    step('s3', 3, 'build', 'shape-3', 'fadeOut')
  ];

  it('counts the presses a slide takes', () => {
    expect(pressCount([])).toBe(0);
    expect(pressCount(steps)).toBe(3);
  });

  it('says what a given press runs', () => {
    expect(stepsAtPress(steps, 2).map((entry) => entry.sid)).toEqual(['s2']);
    expect(stepsAtPress(steps, 9)).toEqual([]);
  });

  it('hides what has an entrance still to come, and nothing else', () => {
    // The film is not hidden: a film waiting to be started is still a film
    // sitting on the slide showing its poster. Nor is the exit, which is there
    // until it leaves.
    expect([...hiddenUntilPlayed(steps, 0)]).toEqual(['shape-1']);
    expect([...hiddenUntilPlayed(steps, 1)]).toEqual([]);
  });

  /**
   * And what a *trigger* can be told, which is the same arithmetic asked the
   * other way round: not "what is on the slide" but "when is this shape there to
   * be clicked".
   */
  it('says the press a trigger becomes clickable on, and the one it stops', () => {
    // shape-1 arrives on press 1 and leaves on press 3; shape-2 arrives on 2.
    const story = [
      step('s1', 1, 'build', 'shape-1', 'fadeIn'),
      step('s2', 2, 'build', 'shape-2', 'fadeIn'),
      step('s3', 3, 'build', 'shape-1', 'fadeOut')
    ];
    expect(triggerWindow(story, 'shape-1')).toEqual({ from: 1, until: 3 });
    expect(triggerWindow(story, 'shape-2')).toEqual({ from: 2 });

    // A shape nothing animates is there from the start, which is the case worth
    // saying nothing about.
    expect(triggerWindow(story, 'shape-9')).toEqual({ from: 0 });
  });

  it('says *never* for a shape that is itself waiting to be clicked', () => {
    const chained = [
      { ...step('s1', 0, 'build', 'shape-1', 'fadeIn'), on: 'shape-2' },
      { ...step('s2', 0, 'build', 'shape-2', 'fadeIn'), on: 'shape-1' }
    ];
    // Each waits for the other, so neither is ever on the slide from a press —
    // which is a deck a reader has built wrongly and the pane can now say so.
    expect(triggerWindow(chained, 'shape-1')).toEqual({});
  });

  /**
   * The correction: a shape is off the slide because its entrance has not run
   * **or** because its exit already has. Both of these were live faults in the
   * show, and the second one is the reason the special case had to go.
   */
  it('keeps a shape gone once its exit has played', () => {
    expect([...hiddenUntilPlayed(steps, 3)]).toEqual(['shape-3']);
    // …and further on, because a press it is not in cannot bring it back. This
    // is what the show did: the exit held its end state through its own
    // animation, and the next press does not run that animation.
    expect([...hiddenUntilPlayed(steps, 9)]).toEqual(['shape-3']);
  });

  it('has a shape on the slide when the only thing it does is leave', () => {
    // Every exit, not just `fadeOut` — which was excused by name, so a shape
    // whose one motion was 날아가기 was invisible from the moment the slide
    // arrived.
    const leaves = [step('s1', 1, 'build', 'shape-1', 'flyOut')];
    expect([...hiddenUntilPlayed(leaves, 0)]).toEqual([]);
    expect([...hiddenUntilPlayed(leaves, 1)]).toEqual(['shape-1']);
  });

  /** A shape's own steps are a story: appear, be emphasised, leave. */
  it("follows the last step of a shape's own that has played", () => {
    const story = [
      step('s1', 1, 'build', 'shape-1', 'fadeIn'),
      step('s2', 2, 'build', 'shape-1', 'pulse'),
      step('s3', 3, 'build', 'shape-1', 'fadeOut')
    ];
    expect([...hiddenUntilPlayed(story, 0)]).toEqual(['shape-1']);
    expect([...hiddenUntilPlayed(story, 1)]).toEqual([]);
    expect([...hiddenUntilPlayed(story, 2)]).toEqual([]);
    expect([...hiddenUntilPlayed(story, 3)]).toEqual(['shape-1']);
  });

  it('leaves a shape waiting for a click hidden however far the show goes', () => {
    const onDemand = [
      { ...step('s1', 0, 'build', 'shape-1', 'fadeIn'), on: 'shape-2' },
      step('s2', 1, 'build', 'shape-2', 'fadeIn')
    ];
    expect([...hiddenUntilPlayed(onDemand, 0)].sort()).toEqual(['shape-1', 'shape-2']);
    expect([...hiddenUntilPlayed(onDemand, 5)]).toEqual(['shape-1']);
  });
});

/**
 * Where each step sits in time, which is what a bar on an axis needs.
 *
 * The list said *order*; this says *when*, and they are not the same fact. The
 * three words are PowerPoint's and the arithmetic is what lets a bar be dragged:
 * a reader moving a bar is setting a delay, and only this says which number.
 */
describe('when each step happens', () => {
  const step = (
    sid: string,
    group: number,
    startsWith: 'onClick' | 'withPrevious' | 'afterPrevious',
    duration: number,
    delay = 0
  ) =>
    ({
      sid,
      kind: 'build' as const,
      target: sid,
      label: sid,
      effect: 'fadeIn',
      duration,
      delay,
      startsWith,
      easing: 'ease',
      repeat: 1,
      /**
       * The text-animation four, which a step *always* carries: `slideTimeline` fills
       * them from the node and a bar cannot be drawn without them. These fixtures were
       * written before they existed and said so for the first time when the tests were
       * type-checked — a `box` unit and no echo is what a plain build is.
       */
      echo: 0,
      unit: 'box' as const,
      stagger: 0,
      units: 1,
      group
    });

  it('starts a press at zero, whatever the wall clock says', () => {
    const timed = withTiming([step('a', 1, 'onClick', 400), step('b', 2, 'onClick', 400)]);
    expect(timed.map((entry) => entry.startAt)).toEqual([0, 0]);
  });

  it('runs a "with previous" from the same moment', () => {
    const timed = withTiming([step('a', 1, 'onClick', 400), step('b', 1, 'withPrevious', 300)]);
    expect(timed.map((entry) => entry.startAt)).toEqual([0, 0]);
    expect(timed.map((entry) => entry.endAt)).toEqual([400, 300]);
  });

  it('runs an "after previous" from where the last one ended', () => {
    const timed = withTiming([step('a', 1, 'onClick', 400), step('b', 1, 'afterPrevious', 300)]);
    expect(timed.map((entry) => entry.startAt)).toEqual([0, 400]);
    expect(timed[1].endAt).toBe(700);
  });

  it('adds a delay to whatever it was waiting for', () => {
    const timed = withTiming([
      step('a', 1, 'onClick', 400, 100),
      step('b', 1, 'afterPrevious', 300, 250)
    ]);
    expect(timed.map((entry) => entry.startAt)).toEqual([100, 750]);
  });

  it('says how long a press runs for, which is the width of its segment', () => {
    const timed = withTiming([
      step('a', 1, 'onClick', 400),
      step('b', 1, 'withPrevious', 900),
      step('c', 2, 'onClick', 200)
    ]);
    expect(pressDuration(timed, 1)).toBe(900);
    expect(pressDuration(timed, 2)).toBe(200);
  });
});

/**
 * Dragging a bar, which is the gesture a timeline is *for*.
 *
 * The moment is the reader's and the delay is what the document holds, so this
 * is the conversion between them — and it is never negative: a bar dragged
 * before the thing it follows means "as soon as it can", not "before it".
 */
describe('dragging a bar to a moment', () => {
  const timed = withTiming([
    {
      sid: 'a',
      kind: 'build',
      target: 'a',
      label: 'a',
      effect: 'fadeIn',
      duration: 400,
      delay: 0,
      startsWith: 'onClick',
      easing: 'ease',
      repeat: 1,
      echo: 0,
      unit: 'box' as const,
      stagger: 0,
      units: 1,
      group: 1
    },
    {
      sid: 'b',
      kind: 'build',
      target: 'b',
      label: 'b',
      effect: 'fadeIn',
      duration: 400,
      delay: 0,
      startsWith: 'afterPrevious',
      easing: 'ease',
      repeat: 1,
      echo: 0,
      unit: 'box' as const,
      stagger: 0,
      units: 1,
      group: 1
    }
  ]);

  it('gives the delay that puts a step at a moment', () => {
    // `b` follows `a`, which ends at 400 — so half a second in is a 100ms delay.
    expect(delayForStart(timed, 'b', 500)).toBe(100);
    expect(delayForStart(timed, 'a', 250)).toBe(250);
  });

  it('never asks for a moment before the thing it follows', () => {
    expect(delayForStart(timed, 'b', 120)).toBe(0);
    expect(delayForStart(timed, 'a', -80)).toBe(0);
  });

  it('gives nothing for a step that is not there', () => {
    expect(delayForStart(timed, 'nothing', 400)).toBe(0);
  });
});

/**
 * An effect's *options*, which used to be part of its name.
 *
 * `flyInLeft`, `flyInRight` and `flyInUp` were three effects — a list that grows
 * by multiplication, and a reader who wanted the shape to come from the other
 * side would have been changing which effect they chose rather than one of its
 * settings. So an effect is what happens and its options are which way and how
 * much, which is the shape PowerPoint stores too.
 */
describe('an effect and its options', () => {
  it('offers a direction only where a direction means something', () => {
    expect(effectDefinition('fly')?.takes).toEqual({ direction: true, amount: true });
    // A flash has no way to go and no amount worth naming.
    expect(effectDefinition('flash')?.takes).toEqual({});
    expect(effectDefinition('grow')?.takes).toEqual({ amount: true });
  });

  /**
   * In `translate`, not `transform`.
   *
   * A shape's own rotation *is* its `transform`, written by the renderer, and an
   * animation of the shorthand replaces it — measured, a rotated rectangle with
   * a fly-in animated as a pure translate and was left straight afterwards. The
   * individual properties compose with it instead.
   */
  it('comes *from* the direction for an entrance, and goes *to* it for an exit', () => {
    const inFrames = framesFor('fly', { direction: 'left', amount: 0.5 });
    const outFrames = framesFor('flyOut', { direction: 'left', amount: 0.5 });

    // An entrance starts off to the left and ends in place…
    expect(inFrames[0].translate).toContain('-');
    expect(inFrames[1].translate).toBe('0 0');
    // …and an exit starts in place and ends off to the left.
    expect(outFrames[0].translate).toBe('0 0');
    expect(outFrames[1].translate).toContain('-');
    // And neither touches the shorthand, which is the shape's own rotation.
    expect(inFrames.every((frame) => !('transform' in frame))).toBe(true);
  });

  it('turns the amount into the distance the effect measures', () => {
    const near = framesFor('fly', { direction: 'right', amount: 0 })[0].translate ?? '';
    const far = framesFor('fly', { direction: 'right', amount: 1 })[0].translate ?? '';

    const of = (value: string) => Number(/(-?\d+)%/.exec(value)?.[1] ?? 0);
    expect(of(far)).toBeGreaterThan(of(near));
  });

  it('reveals a wipe from the side it names, which is the sign everyone gets wrong', () => {
    // The inset names the side that is *hidden*, so revealing from the left
    // insets from the right.
    expect(framesFor('wipe', { direction: 'left' })[0].clipPath).toBe('inset(0 100% 0 0)');
    expect(framesFor('wipe', { direction: 'right' })[0].clipPath).toBe('inset(0 0 0 100%)');
  });

  /**
   * The cost of having put the direction in the name, paid once and in one
   * table: a deck written last week still means what it meant.
   */
  it('reads the names it used to write, with the option they carried', () => {
    const legacy = resolveEffect('flyInLeft');
    expect(legacy?.definition.id).toBe('fly');
    expect(legacy?.options.direction).toBe('left');

    // And it animates the same way the old name did.
    expect(framesFor('flyInLeft', {})[0].translate).toContain('-');
    expect(framesFor('fadeIn', {})).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('lets a step override the direction its old name carried', () => {
    const overridden = framesFor('flyInLeft', { direction: 'right' })[0].translate ?? '';
    expect(overridden).not.toContain('-');
  });

  it('gives nothing for a name from a tool this product does not know', () => {
    expect(framesFor('honeycomb', {})).toEqual([]);
    expect(resolveEffect('honeycomb')).toBeUndefined();
  });
});

/**
 * Repeating, and the one value that is not a count.
 *
 * `repeat` was declared in the schema beside the easing and read by *nothing*
 * for a day — the exact fault this repository keeps finding in its own schema,
 * made fresh. `0` means "until the slide moves on", because a count of zero is
 * not a thing anybody can mean by "how many times".
 */
describe('a step that repeats', () => {
  const step = (repeat: number, duration = 400) =>
    ({
      sid: 's',
      kind: 'build' as const,
      target: 'shape-1',
      label: '상자',
      effect: 'pulse',
      duration,
      delay: 0,
      startsWith: 'onClick' as const,
      easing: 'ease',
      repeat,
      echo: 0,
      unit: 'box' as const,
      stagger: 0,
      units: 1,
      group: 1
    });

  it('counts every pass in how long the slide takes', () => {
    expect(timelineDuration([step(1)])).toBe(400);
    expect(timelineDuration([step(3)])).toBe(1200);
  });

  /**
   * An endless step has no length to add: the length is however long the
   * presenter talks, and a total of `Infinity` is a number no reader can use.
   */
  it('counts one pass of an endless one, so the total stays a number', () => {
    expect(timelineDuration([step(0)])).toBe(400);
    expect(Number.isFinite(timelineDuration([step(0)]))).toBe(true);
  });

  it('starts what follows it after one pass, not after all of them', () => {
    const timed = withTiming([step(3), { ...step(1), sid: 'next', startsWith: 'afterPrevious' }]);
    // Three passes of 400ms, and then the next step.
    expect(timed[1].startAt).toBe(400 * 3);
  });
});

/**
 * Two motions at once on one shape.
 *
 * The thing a professional timeline is for, and until it was measured the second
 * motion silently won: two animations of one property are `replace` by default,
 * so a fly and a nudge on one shape at one moment produced only the nudge.
 * `composite: 'add'` fixes it — measured, translates add and scales multiply —
 * and *which* steps add is arithmetic about what overlaps what, which is what
 * this tests.
 */
describe('two motions at once on one shape', () => {
  const step = (
    over: Partial<TimelineStep> & { sid: string }
  ): TimelineStep => ({
    kind: 'build',
    target: 'shape-1',
    label: '제목',
    effect: 'fade',
    duration: 400,
    delay: 0,
    startsWith: 'withPrevious',
    easing: 'ease',
    repeat: 1,
    echo: 0,
    unit: 'box',
    stagger: 60,
    units: 1,
    group: 1,
    ...over
  });

  it('adds the second when they overlap and share a property', () => {
    // Two fades on one shape at one moment: both write `opacity`.
    const timed = withTiming([
      step({ sid: 'a', startsWith: 'onClick' }),
      step({ sid: 'b' })
    ]);

    expect(timed.map((entry) => entry.composite)).toEqual(['replace', 'add']);
    // And they are drawn in two lanes, because one lane would put the second bar
    // on top of the first.
    expect(timed.map((entry) => entry.lane)).toEqual([0, 1]);
  });

  /**
   * A fly and a grow together need no addition at all: one writes `translate` and
   * `opacity`, the other `scale`. `replace` is the cheaper claim and this checks
   * it is the one made.
   */
  it('does not add when the two write different properties', () => {
    const timed = withTiming([
      step({ sid: 'a', effect: 'fly', startsWith: 'onClick' }),
      step({ sid: 'b', effect: 'wipe' })
    ]);
    expect(timed.map((entry) => entry.composite)).toEqual(['replace', 'replace']);
    // Still two lanes: they overlap in *time*, which is what a lane is about.
    expect(timed.map((entry) => entry.lane)).toEqual([0, 1]);
  });

  it('does not add when they do not overlap in time', () => {
    const timed = withTiming([
      step({ sid: 'a', startsWith: 'onClick' }),
      step({ sid: 'b', startsWith: 'afterPrevious' })
    ]);
    expect(timed.map((entry) => entry.composite)).toEqual(['replace', 'replace']);
    // One after the other is one lane: nothing is hidden behind anything.
    expect(timed.map((entry) => entry.lane)).toEqual([0, 0]);
  });

  it('does not add across two shapes', () => {
    const timed = withTiming([
      step({ sid: 'a', startsWith: 'onClick' }),
      step({ sid: 'b', target: 'shape-2' })
    ]);
    expect(timed.map((entry) => entry.composite)).toEqual(['replace', 'replace']);
    expect(timed.map((entry) => entry.lane)).toEqual([0, 0]);
  });

  /**
   * Three at once is three lanes, and every one after the first adds.
   */
  it('stacks a third', () => {
    const timed = withTiming([
      step({ sid: 'a', startsWith: 'onClick' }),
      step({ sid: 'b' }),
      step({ sid: 'c' })
    ]);
    expect(timed.map((entry) => entry.lane)).toEqual([0, 1, 2]);
    expect(timed.map((entry) => entry.composite)).toEqual(['replace', 'add', 'add']);
  });

  /**
   * Rotation is the exception, and it is a browser fault rather than a rule: two
   * additive `rotate` animations in Chromium interpolate as 90·t·(1−t) — they end
   * at *zero*, so a shape turns and then untwists itself. Measured against a
   * single animation's 22.5°/45°/90°.
   *
   * So a turning step stays `replace` and *says* it clashed, because two bars
   * that quietly cancel each other is the worst version of this.
   */
  it('refuses to add two turns, and reports the clash', () => {
    const timed = withTiming([
      step({ sid: 'a', effect: 'spin', startsWith: 'onClick' }),
      step({ sid: 'b', effect: 'spin' })
    ]);

    expect(timed[1].composite).toBe('replace');
    expect(timed[1].clashes).toEqual(['rotate']);
    // The first one has nothing to clash with.
    expect(timed[0].clashes).toBeUndefined();
  });

  /**
   * And a step that shares *both* a turn and something addable still adds — the
   * clash is about one property, not about the whole motion.
   */
  it('still adds the properties it can', () => {
    // `spinIn` writes rotate, scale and opacity; `pulse` writes scale.
    const timed = withTiming([
      step({ sid: 'a', effect: 'spinIn', startsWith: 'onClick' }),
      step({ sid: 'b', effect: 'pulse' })
    ]);
    expect(timed[1].composite).toBe('add');
    expect(timed[1].clashes).toBeUndefined();
  });
});

describe('which properties an effect writes', () => {
  /**
   * Read off the frames rather than declared beside them: a declaration is a
   * second copy of the table, and an effect that grew a `filter` would animate
   * one while the declaration still said it did not.
   */
  it('reads them from the frames', () => {
    expect(propertiesOf('fade').sort()).toEqual(['opacity']);
    expect(propertiesOf('fly').sort()).toEqual(['opacity', 'translate']);
    expect(propertiesOf('wipe').sort()).toEqual(['clipPath']);
    expect(propertiesOf('spinIn').sort()).toEqual(['opacity', 'rotate', 'scale']);
    expect(propertiesOf('spin').sort()).toEqual(['rotate']);
    // `offset` is *when*, not *what*.
    expect(propertiesOf('pulse')).not.toContain('offset');
  });

  it('says nothing for an effect this product does not have', () => {
    expect(propertiesOf('nothing')).toEqual([]);
    expect(propertiesOf(undefined)).toEqual([]);
  });

  /** A legacy name resolves, so it reports the properties it always did. */
  it('reads a legacy name', () => {
    expect(propertiesOf('flyInLeft').sort()).toEqual(['opacity', 'translate']);
  });
});

/**
 * Magnifying the axis, and snapping a dragged bar.
 *
 * The two things that separate a timeline from a chart of a slide, and both are
 * arithmetic: a magnification is a divisor on the span, and snapping is "the
 * nearest of these moments, if one is near enough". Neither can be checked by
 * looking at the screen — a bar that snaps to the wrong edge looks like a bar
 * that snapped.
 */
describe('how much of the press the axis shows', () => {
  const timed = withTiming([
    {
      sid: 'a',
      kind: 'build',
      target: 'shape-1',
      label: '제목',
      effect: 'fade',
      duration: 400,
      delay: 0,
      startsWith: 'onClick',
      easing: 'ease',
      repeat: 1,
      echo: 0,
      unit: 'box',
      stagger: 60,
      units: 1,
      group: 1
    },
    {
      sid: 'b',
      kind: 'build',
      target: 'shape-2',
      label: '본문',
      effect: 'fade',
      duration: 600,
      delay: 0,
      startsWith: 'afterPrevious',
      easing: 'ease',
      repeat: 1,
      echo: 0,
      unit: 'box',
      stagger: 60,
      units: 1,
      group: 1
    }
  ]);

  it('fits the press with room after it', () => {
    // 400 + 600 = 1000, plus a second of headroom so a reader can always drag
    // something later than everything else.
    expect(axisSpan(timed, 1)).toBe(2000);
  });

  /**
   * And magnification is *not* in here, which the first version had wrong.
   *
   * It divided this number, so at 4× the axis covered 500ms while a 1200ms bar
   * was still 240% of it — the bar ran off the end of the ruler into a region
   * with no ticks, and the pane scrolled further than the clock went. Magnifying
   * spreads the same time over more pixels, which is the lane's width and not
   * this.
   */
  it('covers the same time however magnified the drawing is', () => {
    expect(axisSpan(timed, 1)).toBe(2000);
    expect(axisSpan(timed, 2)).toBe(2000);
  });

  it('never shows less than two seconds of an empty press', () => {
    expect(axisSpan([], 1)).toBe(2000);
  });
});

describe('what a dragged bar sticks to', () => {
  const step = (sid: string, delay: number, duration: number, group = 1): TimelineStep => ({
    sid,
    kind: 'build',
    target: sid,
    label: sid,
    effect: 'fade',
    duration,
    delay,
    startsWith: 'onClick',
    easing: 'ease',
    repeat: 1,
    echo: 0,
    unit: 'box',
    stagger: 60,
    units: 1,
    group
  });

  it('is zero, and the edges of the other bars', () => {
    const timed = withTiming([step('a', 0, 400), step('b', 700, 300)]);
    // Dragging `b`: zero, and `a`'s start and end.
    expect(snapPoints(timed, 1, 'b')).toEqual([0, 400]);
    // Dragging `a`: zero, and `b`'s.
    expect(snapPoints(timed, 1, 'a')).toEqual([0, 700, 1000]);
  });

  /** Its own edges are excluded, or a bar would stick to where it already is. */
  it('excludes the bar being dragged', () => {
    const timed = withTiming([step('a', 200, 400)]);
    expect(snapPoints(timed, 1, 'a')).toEqual([0]);
    expect(snapPoints(timed, 1)).toEqual([0, 200, 600]);
  });

  it('ignores the other presses, which never overlap this one', () => {
    const timed = withTiming([step('a', 0, 400), step('b', 0, 300, 2)]);
    expect(snapPoints(timed, 1, 'x')).toEqual([0, 400]);
    expect(snapPoints(timed, 2, 'x')).toEqual([0, 300]);
  });

  it('catches the nearest moment within reach, and says it caught', () => {
    expect(snapTo([0, 400, 1000], 390, 20)).toEqual({ at: 400, snapped: true });
    expect(snapTo([0, 400, 1000], 410, 20)).toEqual({ at: 400, snapped: true });
    // The *nearest*, not the first.
    expect(snapTo([400, 420], 415, 30)).toEqual({ at: 420, snapped: true });
  });

  /**
   * And says so when it did not, which is what lets a caller tell "no snap" from
   * "snapped to zero" — a caller that only read the number could not.
   */
  it('leaves a value alone when nothing is near', () => {
    expect(snapTo([0, 400], 700, 20)).toEqual({ at: 700, snapped: false });
    expect(snapTo([], 700, 20)).toEqual({ at: 700, snapped: false });
  });
});

/**
 * A trail's spacing.
 *
 * The one number in the afterimage, and it is derived rather than stored because
 * the spacing is about the motion's *speed*: eighty milliseconds behind a 200ms
 * dash is a separate shape, and behind a two-second drift it is invisible.
 */
describe('how far behind a trailing copy runs', () => {
  it('is an eighth of the duration', () => {
    expect(echoGap(800)).toBe(100);
    expect(echoGap(480)).toBe(60);
  });

  it('stays inside the range where a copy still reads as a copy', () => {
    // A dash: an eighth would be 25ms, which is a copy nobody can see.
    expect(echoGap(200)).toBe(30);
    // A slow drift: an eighth would be 750ms, which is a second shape.
    expect(echoGap(6000)).toBe(120);
  });
});

/**
 * And how many copies a step may hold.
 *
 * Six, not because seven would break but because seven copies of a moving shape
 * is a smear — and every one of them is an animation the browser has to run.
 */
describe('how many trailing copies a step holds', () => {
  const fake = (echo: unknown): DeckAccess => {
    const nodes: Record<string, unknown> = {
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: {
        sid: 'slide',
        stype: 'surface',
        attributes: { kind: 'slide', trackId: 't1' },
        content: ['box']
      },
      box: { sid: 'box', stype: 'rectangle', attributes: { name: 'shape-1' }, content: [] },
      res: { sid: 'res', stype: 'resources', content: ['track'] },
      track: { sid: 'track', stype: 'motionTrack', attributes: { id: 't1' }, content: ['step'] },
      step: {
        sid: 'step',
        stype: 'motionStep',
        attributes: { kind: 'build', effect: 'fade', target: 'shape-1', echo }
      }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never };
  };

  it('is none unless the document says otherwise', () => {
    expect(slideTimeline(fake(undefined), 'slide')[0].echo).toBe(0);
    expect(slideTimeline(fake(3), 'slide')[0].echo).toBe(3);
  });

  it('never more than six, however many a document holds', () => {
    expect(slideTimeline(fake(99), 'slide')[0].echo).toBe(6);
  });

  /**
   * And a trail does not change *when* anything happens: the copies are behind
   * the shape, not after it, so the bar's width and whatever follows the step are
   * untouched.
   */
  it('does not change the step’s length', () => {
    const plain = withTiming(slideTimeline(fake(0), 'slide'))[0];
    const trailing = withTiming(slideTimeline(fake(5), 'slide'))[0];
    expect(trailing.endAt).toBe(plain.endAt);
  });
});

/**
 * A colour, and the effects that are about one.
 *
 * The first value on a step that is not a number, a name or a duration, and it
 * exists because `filter` does: `drop-shadow` and `feFlood` both take a colour,
 * and `currentColor` is only the right answer for text.
 */
describe('an effect that takes a colour', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let box: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const doc = (): DeckAccess => ({
    rootId: (editor as any).getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: [{ stype: 'rectangle', attributes: { x: 0, y: 0, width: 900, height: 900 } }]
          },
          { stype: 'resources', attributes: {}, content: [] }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
    box = ((store.getNode(slide) as any).content as string[])[0];
  });

  it('writes a colour where the effect declares one', async () => {
    await run('addBoxBuild', { nodeId: box, effect: 'glow', color: '#ffcc00' });
    expect(slideTimeline(doc(), slide)[0].color).toBe('#ffcc00');

    // And the frames use it, rather than the shape's own colour.
    const frames = framesFor('glow', { amount: 0.5, color: '#ffcc00' });
    expect(String(frames[1].filter)).toContain('#ffcc00');
    expect(String(framesFor('glow', { amount: 0.5 })[1].filter)).toContain('currentColor');
  });

  /**
   * And refuses one on an effect that has nothing to do with colour — the same
   * rule the direction and the amount follow: an option nobody declared is a
   * value nothing will ever read.
   */
  it('refuses a colour on an effect that does not take one', async () => {
    await run('addBoxBuild', { nodeId: box, effect: 'fly', color: '#ffcc00' });
    expect(slideTimeline(doc(), slide)[0].color).toBeUndefined();
  });

  it('clears a colour back to the effect’s own default', async () => {
    await run('addBoxBuild', { nodeId: box, effect: 'glow', color: '#ffcc00' });
    const step = slideTimeline(doc(), slide)[0].sid;

    await run('setMotionStep', { stepId: step, color: null });
    expect(slideTimeline(doc(), slide)[0].color).toBeUndefined();
  });
});

/**
 * An effect whose look is an SVG filter.
 *
 * Measured: `filter: url(#f) blur(0px)` → `blur(10px)` is **discrete**, so a
 * `url()` and an animated CSS function cannot share the property. The animation
 * runs *inside* the filter instead — on `flood-opacity`, which is a presentation
 * attribute and therefore a CSS property the Web Animations API interpolates.
 */
describe('an SVG filter effect', () => {
  it('has no frames of its own, and frames for its primitive', () => {
    const bloom = effectDefinition('bloom')!;
    expect(bloom.svg).toBeTruthy();
    // Nothing on the shape: the shape only gets the `filter`.
    expect(bloom.frames({ amount: 0.5 })).toEqual([]);

    // `frames` is absent on a filter that animates itself with SMIL; a bloom's is
    // ordinary keyframes, which is what this test is about.
    const frames = bloom.svg!.frames!({ amount: 0.8 });
    expect(frames).toHaveLength(3);
    expect(frames[1].floodOpacity).toBeGreaterThan(0);
    // Out and back, like every emphasis: a bloom that stayed lit is a fill.
    expect(frames[0].floodOpacity).toBe(0);
    expect(frames[2].floodOpacity).toBe(0);
  });

  it('marks one primitive for the stage to animate', () => {
    // The timing as well: an SMIL filter writes its own `<animate>` elements from it,
    // and `markup` takes both.
    const markup = effectDefinition('bloom')!.svg!.markup(
      { amount: 0.5, color: '#ff0000' },
      { duration: 600, delay: 0, repeat: 1 }
    );
    expect(markup).toContain('%TARGET%');
    expect(markup).toContain('#ff0000');
    expect(markup.match(/%TARGET%/g)).toHaveLength(1);
  });

  /**
   * And it writes the shape's `filter` — the whole property, as a `url()` — so
   * two of them at one moment is the second one winning, which the timeline has
   * to know before it decides what adds to what.
   */
  it('is reported as writing the filter property', () => {
    expect(propertiesOf('bloom')).toEqual(['filter']);
  });
});

/**
 * The playhead, moved a frame at a time.
 *
 * Sixty frames a second, which is what a browser animates at and therefore the
 * smallest step that can *look* different. A deck has no frame rate of its own —
 * nothing is being rendered to a file — so the reader's screen is the only honest
 * answer.
 */
describe('stepping the playhead', () => {
  it('moves by one frame, rounded to a millisecond', () => {
    expect(FRAME_MS).toBeCloseTo(16.67, 1);
    expect(stepMoment(0, 1, 2000)).toBe(17);
    expect(stepMoment(500, -1, 2000)).toBe(483);
    // Three frames is three frames, not three roundings.
    expect(stepMoment(0, 3, 2000)).toBe(50);
  });

  /**
   * And never off the axis: a playhead past the end is a moment the timeline
   * cannot draw, and one before zero is a moment the press has not started.
   */
  it('stays on the axis', () => {
    expect(stepMoment(10, -5, 2000)).toBe(0);
    expect(stepMoment(1990, 5, 2000)).toBe(2000);
  });
});

/**
 * What a motion costs to draw.
 *
 * `motion-model.md` §7b sorts the properties into tiers and the panel said
 * nothing about them, so a reader could put a `filter` emphasis on twenty shapes
 * and find out what that costs *in front of an audience*.
 */
describe('how expensive a press is', () => {
  const step = (over: Partial<TimelineStep> & { sid: string }): TimelineStep => ({
    kind: 'build',
    target: over.sid,
    label: over.sid,
    effect: 'fade',
    duration: 400,
    delay: 0,
    startsWith: 'withPrevious',
    easing: 'ease',
    repeat: 1,
    echo: 0,
    unit: 'box',
    stagger: 60,
    units: 1,
    group: 1,
    ...over
  });

  it('knows which effects repaint and which do not', () => {
    // Composited: a slide can run dozens of these.
    expect(stepTier({ kind: 'build', effect: 'fade' })).toBe(1);
    expect(stepTier({ kind: 'build', effect: 'fly' })).toBe(1);
    expect(stepTier({ kind: 'build', effect: 'wipe' })).toBe(1);
    // A path is `offset-distance`, which is a transform however far it goes.
    expect(stepTier({ kind: 'path' })).toBe(1);

    // A repaint of the shape, every frame.
    expect(stepTier({ kind: 'build', effect: 'glow' })).toBe(2);
    expect(stepTier({ kind: 'build', effect: 'frost' })).toBe(2);
    // An SVG filter is a repaint by construction — that is what a filter is.
    expect(stepTier({ kind: 'build', effect: 'bloom' })).toBe(2);
    expect(stepTier({ kind: 'build', effect: 'melt' })).toBe(2);
    // Every SVG filter, including the ones added after this line was written: the
    // tier comes from *having* a filter rather than from a list of names.
    expect(stepTier({ kind: 'build', effect: 'shimmer' })).toBe(2);
    expect(stepTier({ kind: 'build', effect: 'thinOut' })).toBe(2);
  });

  /**
   * And the cliff: the *element* count, not the step count.
   *
   * A filter on a box is one repaint per frame; the same filter on its letters is
   * one per letter, from one step. Invisible in the panel, because the reader
   * chose 글자마다 for a fade and then changed the effect.
   */
  it('counts the elements a step repaints, not the steps', () => {
    expect(stepElements(withTiming([step({ sid: 'a' })])[0])).toBe(1);
    expect(stepElements(withTiming([step({ sid: 'a', unit: 'letter', units: 12 })])[0])).toBe(12);
    // A trail multiplies too: every copy is drawn with the same filter.
    expect(stepElements(withTiming([step({ sid: 'a', echo: 3 })])[0])).toBe(4);
    expect(
      stepElements(withTiming([step({ sid: 'a', unit: 'letter', units: 10, echo: 2 })])[0])
    ).toBe(30);
  });

  it('says nothing about a press of cheap motions', () => {
    const timed = withTiming([step({ sid: 'a' }), step({ sid: 'b', effect: 'fly' })]);
    expect(pressCost(timed, 1)).toMatchObject({ repaints: 0, verdict: 'cheap' });
    expect(costLabel(pressCost(timed, 1))).toBeUndefined();
  });

  /**
   * *Overlapping* motions, not all of them: three filters one after another is
   * three repaints in turn, which no machine minds, and three at once is three
   * times the work every frame.
   */
  it('counts what overlaps, rather than what exists', () => {
    const together = withTiming([
      step({ sid: 'a', effect: 'glow', startsWith: 'onClick' }),
      step({ sid: 'b', effect: 'glow' }),
      step({ sid: 'c', effect: 'glow' }),
      step({ sid: 'd', effect: 'glow' })
    ]);
    expect(pressCost(together, 1)).toMatchObject({ repaints: 4, verdict: 'busy' });

    const inTurn = withTiming([
      step({ sid: 'a', effect: 'glow', startsWith: 'onClick' }),
      step({ sid: 'b', effect: 'glow', startsWith: 'afterPrevious' }),
      step({ sid: 'c', effect: 'glow', startsWith: 'afterPrevious' }),
      step({ sid: 'd', effect: 'glow', startsWith: 'afterPrevious' })
    ]);
    expect(pressCost(inTurn, 1)).toMatchObject({ repaints: 1, verdict: 'cheap' });
  });

  it('calls a dozen at once what it is', () => {
    const heavy = withTiming([
      step({ sid: 'a', effect: 'glow', unit: 'letter', units: 14, startsWith: 'onClick' })
    ]);
    const cost = pressCost(heavy, 1);
    expect(cost).toMatchObject({ repaints: 14, verdict: 'heavy' });
    expect(costLabel(cost)).toContain('끊길 수 있습니다');
    // And it names the steps, so a panel can point at them.
    expect(cost.steps).toEqual(['a']);
  });
});

/**
 * A trigger: a step that waits for a *shape* rather than for a press.
 *
 * The third kind of start condition, and the one that is not about the sequence
 * at all. `startsWith` places a step among the presses and every press is
 * anonymous — a click anywhere advances. This says **that shape**, out of order,
 * as many times as it is clicked, or never.
 */
describe('a step that waits for a click on a shape', () => {
  const fake = (steps: Array<Record<string, unknown>>): DeckAccess => {
    const nodes: Record<string, unknown> = {
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: {
        sid: 'slide',
        stype: 'surface',
        attributes: { kind: 'slide', trackId: 't1' },
        content: ['button', 'panel']
      },
      button: { sid: 'button', stype: 'rectangle', attributes: { name: 'shape-1' }, content: [] },
      panel: { sid: 'panel', stype: 'rectangle', attributes: { name: 'shape-2' }, content: [] },
      res: { sid: 'res', stype: 'resources', content: ['track'] },
      track: {
        sid: 'track',
        stype: 'motionTrack',
        attributes: { id: 't1' },
        content: steps.map((_, index) => `s${index}`)
      }
    };
    steps.forEach((attributes, index) => {
      nodes[`s${index}`] = { sid: `s${index}`, stype: 'motionStep', attributes };
    });
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never };
  };

  const deck = () =>
    fake([
      { kind: 'build', effect: 'fade', target: 'shape-1' },
      { kind: 'build', effect: 'fly', target: 'shape-2', on: 'shape-1' }
    ]);

  it('is outside the press sequence', () => {
    const steps = slideTimeline(deck(), 'slide');
    expect(steps.map((step) => step.group)).toEqual([1, 0]);
    expect(steps[1].on).toBe('shape-1');

    // One press, not two: a trigger is not something the forward key consumes.
    expect(pressCount(steps)).toBe(1);
  });

  /**
   * And press 0 does not run it, which is the collision worth naming: 0 is also
   * the state a slide is in *before* the first press, so asking "what does press
   * 0 run" used to answer "every trigger on the slide" — and a shape waiting to
   * be clicked animated the moment the slide arrived. Measured, in the show.
   */
  it('is not what press zero runs', () => {
    const timed = withTiming(slideTimeline(deck(), 'slide'));
    expect(stepsAtPress(timed, 0)).toEqual([]);
    expect(stepsAtPress(timed, 1).map((step) => step.target)).toEqual(['shape-1']);
    // It is asked for by name instead, which is a different question.
    expect(stepsWaitingFor(timed, 'shape-1').map((step) => step.target)).toEqual(['shape-2']);
  });

  /** It keeps its shape hidden until it is clicked, however many presses go by. */
  it('keeps its shape hidden until the click', () => {
    const steps = slideTimeline(deck(), 'slide');
    expect([...hiddenUntilPlayed(steps, 0)].sort()).toEqual(['shape-1', 'shape-2']);
    // After the only press: the button has arrived, the panel is still waiting.
    expect([...hiddenUntilPlayed(steps, 1)]).toEqual(['shape-2']);
    // And after every press there could ever be, it is *still* waiting.
    expect([...hiddenUntilPlayed(steps, 99)]).toEqual(['shape-2']);
  });

  it('lists which shapes are buttons, and what each one runs', () => {
    const watched = triggersOn(slideTimeline(deck(), 'slide'));
    expect([...watched.keys()]).toEqual(['shape-1']);
    expect(watched.get('shape-1')?.map((step) => step.target)).toEqual(['shape-2']);
  });

  /**
   * A slide whose *last* step is a trigger still has its presses.
   *
   * `pressCount` was the last step's group, and they were the same thing until a
   * step could sit outside the sequence — so a slide ending in a trigger reported
   * no presses at all and the presenter's forward key left immediately.
   */
  it('does not swallow the slide’s presses by being last', () => {
    const steps = slideTimeline(
      fake([
        { kind: 'build', effect: 'fade', target: 'shape-1' },
        { kind: 'build', effect: 'fade', target: 'shape-2', startsWith: 'onClick' },
        { kind: 'build', effect: 'fly', target: 'shape-2', on: 'shape-1' }
      ]),
      'slide'
    );
    expect(pressCount(steps)).toBe(2);
  });
});

/**
 * Which part of a film plays.
 *
 * The pane said *when* a film starts, which is what an animation list says. Two
 * points on the film say which part of it plays, which is what a video editor's
 * timeline says — and the arithmetic worth testing is the awkward half: the
 * out-point that is not in the document at all until a reader sets one, and what
 * the *bar* is then as long as.
 */
describe('trimming a film', () => {
  it('reads two points, and treats an out-point that is not after the in-point as none', () => {
    expect(trimOf({ attributes: { trimStart: 1500, trimEnd: 4000 } })).toEqual({
      start: 1500,
      end: 4000
    });

    // 0 is the document's word for "to the end", because a file's own length is
    // not in the document and there is no honest number to put here.
    expect(trimOf({ attributes: { trimStart: 1500 } })).toEqual({ start: 1500, end: 0 });
    expect(trimOf(undefined)).toEqual({ start: 0, end: 0 });

    // A contradiction — an end at or before the start — is dropped rather than
    // kept as a negative length: the reading that keeps the film playable.
    expect(trimOf({ attributes: { trimStart: 4000, trimEnd: 1000 } })).toEqual({
      start: 4000,
      end: 0
    });
    // And nonsense is not a trim at all.
    expect(trimOf({ attributes: { trimStart: -5, trimEnd: 'soon' } })).toEqual({
      start: 0,
      end: 0
    });
  });

  it('knows the trimmed length only when there is an out-point', () => {
    expect(trimmedLength({ start: 1000, end: 4000 })).toBe(3000);
    // Not a guess: the answer is the file's length and nothing here has it.
    expect(trimmedLength({ start: 1000, end: 0 })).toBeUndefined();
    expect(isTrimmed({ start: 0, end: 0 })).toBe(false);
    expect(isTrimmed({ start: 200, end: 0 })).toBe(true);
  });

  it('clamps what a reader types, so an end before a start means to the end', () => {
    expect(trimChanges({ start: 0, end: 0 }, { start: 1200 })).toEqual({ start: 1200, end: 0 });
    expect(trimChanges({ start: 1200, end: 0 }, { end: 5000 })).toEqual({
      start: 1200,
      end: 5000
    });
    // Typing a start past the end says "from there to the end", which is the only
    // reading that is not a negative film.
    expect(trimChanges({ start: 1200, end: 5000 }, { start: 6000 })).toEqual({
      start: 6000,
      end: 0
    });
    expect(trimChanges({ start: 0, end: 0 }, { start: -400, end: -1 })).toEqual({
      start: 0,
      end: 0
    });
  });

  /**
   * Dragging the bar's ends, which is the gesture a video editor has and this
   * timeline did not: the trim was two typed fields.
   */
  it('trims the head by moving the delay with it, so the tail stays put', () => {
    // A film that starts a second into the press and plays 0–10s, dragged two
    // seconds in: it starts at three seconds and begins at its own two-second
    // mark, so the *end* of the bar has not moved (3 + 8 = 1 + 10).
    expect(headTrim({ start: 0, end: 10_000 }, 1000, 2000)).toEqual({
      trim: { start: 2000, end: 10_000 },
      delay: 3000
    });

    // Dragged back out again, which is the same gesture with a negative number.
    expect(headTrim({ start: 2000, end: 10_000 }, 3000, -1500)).toEqual({
      trim: { start: 500, end: 10_000 },
      delay: 1500
    });
  });

  it('clamps a head three ways, because one flick reaches all of them', () => {
    // Never before the film's first frame…
    expect(headTrim({ start: 400, end: 9000 }, 5000, -3000).trim.start).toBe(0);
    // …never before the press it plays in…
    expect(headTrim({ start: 8000, end: 20_000 }, 600, -4000).delay).toBe(0);
    // …and never past its own out-point.
    expect(headTrim({ start: 0, end: 4000 }, 0, 9999).trim.start).toBe(4000 - MIN_TRIM_MS);
  });

  it('has no out-point to clamp against until the tail is dragged', () => {
    // A film with no out-point can have its head dragged as far as it likes: the
    // thing it would run out of is a length nothing knows.
    expect(headTrim({ start: 0, end: 0 }, 2000, 60_000)).toEqual({
      trim: { start: 60_000, end: 0 },
      delay: 62_000
    });
  });

  /**
   * The tail is where a film *gets* an out-point: `0` means "to the end" only
   * because the file's length is not in the document, so the first drag of the
   * tail is the moment the deck learns a length — the one the reader dragged to.
   */
  it('gives a film its out-point from the length the tail was dragged to', () => {
    expect(tailTrim({ start: 0, end: 0 }, 6000)).toEqual({ start: 0, end: 6000 });
    // From wherever the head is, because a length is measured from the in-point.
    expect(tailTrim({ start: 2000, end: 9000 }, 3000)).toEqual({ start: 2000, end: 5000 });
    // A bar dragged to nothing is a film nobody can find again.
    expect(tailTrim({ start: 1000, end: 4000 }, 10)).toEqual({
      start: 1000,
      end: 1000 + MIN_TRIM_MS
    });
  });

  /**
   * And the bar: the point of putting the trim on the timeline at all.
   *
   * A film's step has no length of its own — its `duration` is a placeholder,
   * because the file's length is not in the document — so a trimmed film is the
   * one step whose bar is as long as something the step does not hold.
   */
  it('makes the play step’s bar as long as the trim', () => {
    const deck = (attributes: Record<string, unknown>): DeckAccess => {
      const nodes: Record<string, unknown> = {
        root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
        slide: {
          sid: 'slide',
          stype: 'surface',
          attributes: { kind: 'slide', trackId: 't1' },
          content: ['film']
        },
        film: {
          sid: 'film',
          stype: 'mediaVideo',
          attributes: { name: 'shape-1', src: 'a.mp4', ...attributes },
          content: []
        },
        res: { sid: 'res', stype: 'resources', content: ['track'] },
        track: {
          sid: 'track',
          stype: 'motionTrack',
          attributes: { id: 't1' },
          content: ['s0']
        },
        s0: {
          sid: 's0',
          stype: 'motionStep',
          attributes: { kind: 'play', target: 'shape-1', startsWith: 'onClick', duration: 400 }
        }
      };
      return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never };
    };

    // Untrimmed: the placeholder, which is all anybody has.
    const whole = slideTimeline(deck({}), 'slide');
    expect(whole[0].duration).toBe(400);
    expect(whole[0].trim).toEqual({ start: 0, end: 0 });

    // Trimmed: the bar is the piece that plays, and the placeholder is ignored.
    const cut = slideTimeline(deck({ trimStart: 2000, trimEnd: 9500 }), 'slide');
    expect(cut[0].duration).toBe(7500);
    expect(cut[0].trim).toEqual({ start: 2000, end: 9500 });

    // An in-point with no out-point cannot say how long the piece is, so the bar
    // stays the placeholder rather than becoming a guess.
    expect(slideTimeline(deck({ trimStart: 2000 }), 'slide')[0].duration).toBe(400);
  });
});

/**
 * What a step must **add** to rather than replace.
 *
 * The measurement behind it was a live fault: a shape with a 흐림 effect carries
 * `filter: blur(3px)` from `effectsCss`, and one glow step over it — `replace`,
 * because it is the first of its press — computed to the glow alone. The blur was
 * gone for the length of the motion, and gone *for good* after it, because the
 * stage cleared the property the renderer had written.
 *
 * `composite` belongs to an animation rather than to a property, so a step that
 * touches both kinds is two animations. This is the arithmetic that decides which
 * is which.
 */
describe('splitting a step by what it may replace', () => {
  it('sends the list-valued properties to the additive half and keeps the rest', () => {
    const { additive, plain } = splitAdditive([
      { filter: 'blur(10px)', opacity: 0 },
      { filter: 'blur(0px)', opacity: 1 }
    ]);
    expect(additive).toEqual([{ filter: 'blur(10px)' }, { filter: 'blur(0px)' }]);
    expect(plain).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('keeps every offset in both halves, because the two have to agree about when', () => {
    const { additive, plain } = splitAdditive([
      { filter: 'brightness(1)', scale: '1', offset: 0 },
      { filter: 'brightness(2)', scale: '1.1', offset: 0.5 },
      { filter: 'brightness(1)', scale: '1', offset: 1 }
    ]);
    expect(additive.map((frame) => frame.offset)).toEqual([0, 0.5, 1]);
    expect(plain.map((frame) => frame.offset)).toEqual([0, 0.5, 1]);
  });

  it('leaves a step that touches one kind as one animation', () => {
    // A fade: nothing to add to, so nothing is split off.
    const fade = splitAdditive([{ opacity: 0 }, { opacity: 1 }]);
    expect(fade.additive).toEqual([]);
    expect(fade.plain).toHaveLength(2);

    // A grey-out: all of it must add, so the plain half is empty and the stage
    // makes the one additive animation.
    const grey = splitAdditive([{ filter: 'grayscale(0)' }, { filter: 'grayscale(1)' }]);
    expect(grey.plain).toEqual([]);
    expect(grey.additive).toHaveLength(2);
  });

  /**
   * `border-radius` is in the additive list for a different reason from `filter`
   * — arithmetic rather than concatenation — and it is the reason the list is not
   * called "the list-valued ones".
   */
  it('adds a corner radius, so a shape keeps the corners the document gave it', () => {
    expect(MUST_ADD).toContain('borderRadius');
    const { additive } = splitAdditive([{ borderRadius: '24px' }, { borderRadius: '0px' }]);
    expect(additive).toHaveLength(2);
  });

  /**
   * A half of one frame is not an animation: frames with no offsets are spread
   * evenly, so one frame out of three would run from the shape's own value to
   * that frame's. The honest answer is the old behaviour.
   */
  it('refuses to split when a half would be a single frame', () => {
    const { additive, plain } = splitAdditive([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1 }]);
    expect(additive).toEqual([]);
    expect(plain).toHaveLength(2);
    expect(plain[0]).toHaveProperty('filter');
  });
});

/**
 * A track: the one property a keyframe cannot say anything useful about.
 *
 * `background-image` is discrete in Chromium — a gradient from 0deg to 180deg has
 * no midpoint — so a gradient that turns is not a keyframe at all. It is a
 * registered custom property the renderer writes into the value it builds.
 */
describe('a motion track', () => {
  /**
   * The fault this file's subject was rewritten for.
   *
   * The first version had one variable per property — `--sl-sweep`, "the
   * gradient's angle". Measured: a shape with **two** gradient fills and one
   * 그라디언트 돌기 step turned *both*, 0°→50° and 90°→140° from a single
   * animation. A shape's fills are a list, so a track's identity has to include
   * which item of it.
   */
  it('names the item, so one animation cannot reach two of them', () => {
    expect(trackName('fillAngle', 0)).toBe('--sl-f0-angle');
    expect(trackName('fillAngle', 1)).toBe('--sl-f1-angle');
    expect(trackName('shadowLift', 2)).toBe('--sl-s2-lift');
    // Two fills, two sweeps: different properties, so neither clashes with the
    // other and both may run in one press.
    expect(trackName('fillAngle', 0)).not.toBe(trackName('fillAngle', 1));
  });

  /**
   * A step outlives the fill it named the moment a reader deletes a layer, so an
   * index past the end animates the last item there is rather than nothing at
   * all — a reading a reader can see and correct.
   */
  it('clamps an index the shape no longer has', () => {
    expect(trackName('fillAngle', 99)).toBe(`--sl-f${TRACK_SLOTS - 1}-angle`);
    expect(trackName('fillAngle', -3)).toBe('--sl-f0-angle');
  });

  it('is registered from the table, for every slot', () => {
    const css = trackPropertyCss();
    for (const track of MOTION_TRACKS) {
      for (let index = 0; index < TRACK_SLOTS; index += 1) {
        expect(css).toContain(`@property ${trackName(track.id, index)}`);
      }
      expect(css).toContain(`syntax: '${track.syntax}'`);
      expect(css).toContain(`initial-value: ${track.neutral}`);
      /**
       * Inherited — which it was not until a fill became an element.
       *
       * A track is animated on the shape and read *inside* it now: a picture's
       * zoom is `scale` on an `<img>` in the fill layer. With `inherits: false`
       * that image's computed value is the initial one, so the variable animated
       * on the shape (measured at 1.32 mid-run) and the picture stayed at 1.
       *
       * The reason it was `false` — a track on a frame turning every gradient
       * inside it — is answered where it happens: a shape that draws layers
       * declares its own neutrals, which stops the inheritance at each shape.
       * See `fill-layers.ts`.
       */
      expect(css).toContain('inherits: true');
    }
  });

  it('is written with its neutral value as a fallback, which is not decoration', () => {
    // Ignored wherever the registration happened — a registered property always
    // has its initial value — and the whole of the correctness where it did not:
    // an unregistered `var()` is invalid at computed-value time and takes the
    // entire declaration with it, so a shape would lose its gradient.
    expect(trackVar('fillAngle', 1)).toBe('var(--sl-f1-angle, 0deg)');
    expect(trackVar('shadowLift', 0)).toBe('var(--sl-s0-lift, 1)');
  });

  /**
   * ── Asked of the whole table, so the next row is free ─────────────────────
   *
   * Three things every track has to satisfy, checked by looping the table rather
   * than by naming one. Written after adding `fillStop` and watching **688 tests
   * pass while nothing read it** — the track was declared, registered as a
   * `@property`, offered by the table, and no CSS in the product mentioned it. That
   * is this repository's signature fault, produced by the file whose own comment
   * warns about it.
   *
   * The value of the shape is what it costs to add the *next* track: nothing.
   */
  it('has a neutral its syntax can hold', () => {
    // `<percentage>` cannot hold `0`, and `<length>` cannot hold `0%` — a
    // registration whose initial value does not parse is silently dropped by the
    // browser, and the track then animates from whatever it felt like.
    const suffixFor: Record<MotionTrack['syntax'], RegExp> = {
      '<number>': /^-?\d+(\.\d+)?$/,
      '<angle>': /deg$/,
      '<length>': /px$/,
      '<percentage>': /%$/,
      // A colour track's neutral is a colour: `transparent` is the one value that
      // parses as `<color>` and adds nothing, which is what a neutral has to be.
      '<color>': /^(transparent|#|rgb|hsl)/
    };
    for (const track of MOTION_TRACKS) {
      expect(track.neutral, `${track.id} (${track.syntax})`).toMatch(suffixFor[track.syntax]);
    }
  });

  it('is in the cost table under the name a frame actually uses', () => {
    /**
     * The **variable**, not the property it lands in — and asking the wrong one is
     * how this test first failed. `fillAngle` lands in `background-image`, which the
     * spec's tier list does not name *because it cannot be animated at all*: the
     * track is what makes it animatable, so the track's own name is what a frame
     * says and the cost table keys on that.
     *
     * By construction (`motion-cost.ts` builds these rows from this table), so this
     * is a guard on the construction rather than a second opinion about the tier.
     */
    for (const track of MOTION_TRACKS) {
      const tier = PROPERTY_TIER[trackName(track.id, 0)] ?? 1;
      expect(tier, `${track.id} → ${trackName(track.id, 0)}`).toBe(track.tier);
    }
  });

  /**
   * **Something the product draws actually writes it.**
   *
   * The one that would have caught `fillStop` before its renderer existed. A track
   * nobody's CSS mentions is a variable a keyframe can animate to no effect at all:
   * correct, registered, offered in the panel, and invisible.
   *
   * Every part is exercised with a shape that has the thing the track `needs` — a
   * gradient, a picture, a shadow — and the union of everything the product writes
   * for it has to mention every track's name.
   */
  it('is written by something the product draws', () => {
    const gradient = {
      kind: 'linear' as const,
      angle: 90,
      stops: [
        { offset: 0, color: '#fff' },
        { offset: 1, color: '#000' }
      ]
    };
    const picture = { kind: 'image' as const, src: 'x.png', fit: 'cover' as const };
    const shadow = { kind: 'drop' as const, color: '#0003', x: 0, y: 8, blur: 16, spread: 0 };

    /**
     * Each kind of paint **first** in its own fixture, so the thing being asked
     * about is always slot 0.
     *
     * The first version put a gradient and a picture in one list and asked about
     * `--sl-f0-panx`: the picture was the second fill, so its variables were
     * numbered `f1` and the test failed for a reason that had nothing to do with
     * the renderer. One fixture per kind is the shape that cannot go wrong that way.
     */
    const solid = { kind: 'solid' as const, color: '#123456', opacity: 1 };

    const drawn = [
      backgroundCss([gradient]) ?? '',
      JSON.stringify(fillBoxCss([gradient])),
      JSON.stringify(fillLayers([gradient])),
      JSON.stringify(fillBoxCss([picture])),
      JSON.stringify(fillLayers([picture])),
      // A solid on its own — the box's `background` — and stacked, where it is a
      // layer element. The colour track has to be reachable from both.
      JSON.stringify(fillBoxCss([solid])),
      JSON.stringify(fillLayers([solid, solid])),
      JSON.stringify(effectsCss([shadow]))
    ].join(' ');

    for (const track of MOTION_TRACKS) {
      expect(drawn, `${track.id} — nothing the product draws mentions ${trackName(track.id, 0)}`)
        .toContain(trackName(track.id, 0));
    }
  });

  /**
   * ── And the same shape for the effects ────────────────────────────────────
   *
   * Every effect in the table, checked by looping it. The effects were tested one
   * at a time — eighteen `framesFor` calls, each about one of them — so adding one
   * bought no coverage at all, and three of the four things below are invariants
   * the file's own comments state repeatedly and nothing asked about.
   */
  it('animates something, and every custom property it names is a real track', () => {
    for (const effect of MOTION_EFFECTS) {
      const frames = framesFor(effect.id, { direction: 'left', amount: 0.5, partAt: 0 });
      /**
       * At least one keyframe, **or** an SVG filter.
       *
       * Two exceptions, both real. `bloom` has no CSS frames at all: its motion is
       * in the filter's own primitives (`feFlood`'s `flood-opacity`), which animate
       * like any other property but are not keyframes on the shape. And `recolor`
       * has exactly **one** — an animation with no start and no end takes the
       * underlying value for both, which is how it returns to a colour it does not
       * know. Measured; see the effect.
       *
       * So the rule is "animates something", which is what the test meant. Asking
       * for two reported `recolor` as broken and `bloom` as animating nothing.
       */
      expect(frames.length >= 1 || !!effect.svg, effect.id).toBe(true);

      for (const frame of frames) {
        for (const key of Object.keys(frame)) {
          if (!key.startsWith('--')) continue;
          /**
           * A variable no track owns animates nothing at all.
           *
           * Correct-looking, registered nowhere, and silent — a typo in a name this
           * file generates three lines from where it reads it. `trackOf` parses the
           * name back, which is the only thing that can tell the difference.
           */
          expect(trackOf(key), `${effect.id} names ${key}`).toBeDefined();
        }
      }
    }
  });

  it('writes only tracks of the part it says it is about', () => {
    /**
     * The failure this catches is the one their own guide calls the big cause of
     * "I applied it and nothing moved": an effect aimed at the wrong thing runs
     * correctly and invisibly. A fill effect writing a shadow's variable would be
     * offered for a shape with a gradient and animate a shadow it may not have.
     */
    for (const effect of MOTION_EFFECTS) {
      if (!effect.part) continue;
      for (const frame of framesFor(effect.id, { amount: 0.5, partAt: 0 })) {
        for (const key of Object.keys(frame)) {
          const track = key.startsWith('--') ? trackOf(key)?.track : undefined;
          if (!track) continue;
          expect(track.part, `${effect.id} (${effect.part}) writes ${key}`).toBe(effect.part);
        }
      }
    }
  });

  it('brings an emphasis back to where it started', () => {
    /**
     * Which is what makes it an emphasis rather than a change.
     *
     * Stated in this file's comments about four separate effects and asserted about
     * two of them. A shape left mid-emphasis is a shape the reader did not design,
     * and a motion that quietly redesigns one cannot be undone by removing it.
     */
    for (const effect of MOTION_EFFECTS.filter((entry) => entry.category === 'emphasis')) {
      const frames = framesFor(effect.id, { amount: 0.5, partAt: 0 });
      // An SVG effect's motion is in its filter, which returns by being removed.
      if (frames.length === 0) continue;

      /**
       * The one that is deliberately one way, and the claim checked the other way.
       *
       * `drift` says `oneWay` in the table — a drift that returned would be a shake.
       * Asserting that it really does not return is what stops the flag becoming a
       * note: the moment somebody makes it return, the exemption is a lie and this
       * says so, which is the rule the conformance harness applies to its own.
       */
      if (effect.oneWay) {
        const ends = { ...frames[frames.length - 1] } as Record<string, unknown>;
        const starts = { ...frames[0] } as Record<string, unknown>;
        delete ends.offset;
        delete starts.offset;
        expect(ends, `${effect.id} claims oneWay and comes back`).not.toEqual(starts);
        continue;
      }
      const first = { ...frames[0] } as Record<string, unknown>;
      const last = { ...frames[frames.length - 1] } as Record<string, unknown>;
      delete first.offset;
      delete last.offset;

      /**
       * An **angle** returns by turning a whole number of times, not by ending on
       * the same string.
       *
       * 360deg of `rotate` is where it started, and 360deg of `hue-rotate` is the
       * same colour — the file says so in its own comment. So every angle in a value
       * is reduced modulo 360 before the two frames are compared, which covers both
       * without this test knowing which effects are cyclic.
       *
       * Written this way after the first version compared strings and reported the
       * *fixed* `spin` as still broken.
       */
      const cyclic = (value: unknown) =>
        typeof value === 'string'
          ? value.replace(/(-?\d+(?:\.\d+)?)deg/g, (_, degrees) => `${Number(degrees) % 360}deg`)
          : value;

      for (const key of Object.keys(last)) last[key] = cyclic(last[key]);
      for (const key of Object.keys(first)) first[key] = cyclic(first[key]);

      expect(last, `${effect.id} does not return`).toEqual(first);
    }
  });

  it('reports every property it animates, so the cost note can count them', () => {
    // `propertiesOf` is what the pane reads; a frame key it does not report is a
    // repaint nobody is warned about.
    for (const effect of MOTION_EFFECTS) {
      const reported = new Set(propertiesOf(effect.id, { amount: 0.5, partAt: 0 }));
      for (const frame of framesFor(effect.id, { amount: 0.5, partAt: 0 })) {
        for (const key of Object.keys(frame)) {
          if (key === 'offset') continue;
          expect(reported.has(key), `${effect.id} does not report ${key}`).toBe(true);
        }
      }
    }
  });

  /**
   * Every track a fill's own CSS reads is a track the **shape declares**.
   *
   * Two jobs in one declaration, and the second is the one that is easy to miss.
   * The registrations inherit (they have to: a track is animated on the shape and
   * read on a layer inside it), so an inheriting variable reaches every descendant
   * — and a build on a *frame* would turn the gradients of every shape inside it.
   * The shape declaring its own neutral is what stops the bleed at each shape.
   *
   * So a track that a fill's CSS reads and the shape does not declare is a leak,
   * silently, in exactly the case nobody tests: a shape inside a frame. Written
   * after adding `fillStop`, whose renderer read it and whose entry in `TRACKS_OF`
   * did not exist — the drawing was right and the containment was gone.
   */
  it('is declared by the shape for every kind of fill that reads it', () => {
    const byKind: Record<string, unknown> = {
      solid: { kind: 'solid', color: '#123456', opacity: 1 },
      linear: {
        kind: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fff' },
          { offset: 1, color: '#000' }
        ]
      },
      radial: {
        kind: 'radial',
        stops: [
          { offset: 0, color: '#fff' },
          { offset: 1, color: '#000' }
        ]
      },
      image: { kind: 'image', src: 'x.png', fit: 'cover' }
    };

    for (const [kind, paint] of Object.entries(byKind)) {
      // Two of them, so the stack is layered — one opaque solid is still the box's
      // own `background` and reads no variables at all.
      const stack = [paint, paint] as never[];
      const drawn = [
        JSON.stringify(fillLayers(stack)),
        backgroundCss(stack) ?? ''
      ].join(' ');
      const declared = new Set(Object.keys(fillBoxCss(stack)));

      for (const track of MOTION_TRACKS.filter((entry) => entry.part === 'fill')) {
        const name = trackName(track.id, 0);
        if (!drawn.includes(name)) continue;
        expect(declared.has(name), `${kind} reads ${name} and the shape does not declare it`).toBe(
          true
        );
      }
    }
  });

  /** Read back from the name, so a cost table can ask about any key in a frame. */
  it('is recognised from the variable a frame names', () => {
    expect(trackOf('--sl-f1-angle')).toMatchObject({ index: 1 });
    expect(trackOf('--sl-f1-angle')?.track.id).toBe('fillAngle');
    expect(trackOf('--sl-s0-lift')?.track.part).toBe('shadow');
    expect(trackOf('filter')).toBeUndefined();
    expect(trackOf('--sl-nonsense')).toBeUndefined();
  });

  it('tiers itself, so the cost note reads one table rather than two', () => {
    const sweep = MOTION_TRACKS.find((track) => track.id === 'fillAngle')!;
    expect(sweep.tier).toBe(2);
    // Every slot, because a frame names exactly one of them.
    expect(PROPERTY_TIER[trackName('fillAngle', 0)]).toBe(2);
    expect(PROPERTY_TIER[trackName('fillAngle', 3)]).toBe(2);
    expect(stepTier({ kind: 'build', effect: 'sweep' } as never)).toBe(2);
    expect(stepTier({ kind: 'build', effect: 'deepen', partAt: 2 } as never)).toBe(2);
  });

  it('says what a shape needs for it to show, so a panel can say it too', () => {
    expect(MOTION_TRACKS.find((track) => track.id === 'fillAngle')?.needs).toBe('그라디언트');
    expect(tracksFor('shadow').map((track) => track.id)).toEqual(['shadowLift']);
  });
});

/** The three effects the two mechanisms above made possible. */
describe('the effects that were impossible', () => {
  it('turns the fill a step names, and nothing else', () => {
    // `amount: 0` is one turn now: `sweep` counts *turns* rather than degrees, so
    // every value of it comes back where it started. It used to run 90…360, which
    // left a gradient turned 225° at the default.
    const first = framesFor('sweep', { amount: 0, partAt: 0 });
    expect(first[0]['--sl-f0-angle']).toBe('0deg');
    expect(first[1]['--sl-f0-angle']).toBe('360deg');
    // Nothing about the element moves: that is the whole point of it.
    expect(Object.keys(first[1]).filter((key) => key !== 'offset')).toEqual(['--sl-f0-angle']);

    // The *second* fill, which the first version of this could not say at all.
    const second = framesFor('sweep', { amount: 0, partAt: 1 });
    expect(second[1]['--sl-f1-angle']).toBe('360deg');
    expect(second[1]['--sl-f0-angle']).toBeUndefined();
  });

  /**
   * The pan: the half of a Ken Burns that is possible. Measured, a
   * `background-position` animates even under `cover`, because a covered picture
   * overflows its box and so has somewhere to go.
   */
  it('drifts one picture across the shape, in the direction it is given', () => {
    const frames = framesFor('bgPan', { direction: 'left', amount: 1, partAt: 1 });
    // Zero, not the middle: an element's `translate` starts from where it is —
    // see `motion-tracks.ts`, which changed its neutral when the fills became
    // elements.
    expect(frames[0]['--sl-f1-panx']).toBe('0%');
    expect(frames[0]['--sl-f1-pany']).toBe('0%');
    // Leftwards, so the picture moves the negative way and not at all vertically.
    expect(Number(String(frames[1]['--sl-f1-panx']).replace('%', ''))).toBeLessThan(0);
    expect(frames[1]['--sl-f1-pany']).toBe('0%');
  });

  /**
   * And the shape's own shadow, one of several. Which is what a track is for and
   * `drop-shadow` is not: 들어올리기 *adds* a shadow, this scales the one the
   * reader designed.
   */
  it('grows the shadow a step names, out and back', () => {
    const frames = framesFor('deepen', { amount: 1, partAt: 1 });
    expect(frames[0]['--sl-s1-lift']).toBe('1');
    expect(Number(frames[1]['--sl-s1-lift'])).toBeGreaterThan(1);
    expect(frames[2]['--sl-s1-lift']).toBe('1');
  });

  /** Which list each of them belongs to, so a panel knows what to offer. */
  it('says which list it animates, and the rest say nothing', () => {
    expect(effectDefinition('sweep')?.part).toBe('fill');
    expect(effectDefinition('bgPan')?.part).toBe('fill');
    expect(effectDefinition('deepen')?.part).toBe('shadow');
    expect(effectDefinition('fade')?.part).toBeUndefined();
  });

  it('lifts with a drop-shadow, which follows the silhouette rather than the box', () => {
    const frames = framesFor('lift', { amount: 1 });
    expect(frames[1].filter).toContain('drop-shadow(');
    // Out and back: an emphasis returns, which is what makes it an emphasis.
    expect(frames[0].filter).toBe(frames[2].filter);
    expect(frames[0].translate).toBe('0 0');
    expect(frames[2].translate).toBe('0 0');
  });

  it('softens corners to nothing, so the shape ends as the document drew it', () => {
    const frames = framesFor('soften', { amount: 0 });
    expect(frames[0].borderRadius).toBe('12px');
    expect(frames[1].borderRadius).toBe('0px');
  });
});

/**
 * What the **cards on a slide** animate.
 *
 * A card's track belongs to the card, so it plays in every placement of it — which is the whole
 * feature, and also the reason it cannot be an ordinary press: a slide with three of one card would
 * cost three times the presses for one decision. So these steps arrive in the **arrival group**.
 *
 * Measured before any of it was written: given a `component` carrying a `trackId`, `trackFor`,
 * `namedBoxes` and `slideTimeline` already answered correctly, so what was missing was one schema
 * attribute and one reader — not new machinery.
 */
describe('what a card animates, wherever it is placed', () => {
  const access = (nodes: Record<string, Record<string, unknown>>): DeckAccess =>
    ({ rootId: 'root', getNode: (sid: string) => nodes[sid] as never }) as DeckAccess;

  const deck = (over: { second?: boolean } = {}) =>
    access({
      root: { sid: 'root', stype: 'document', content: ['slide', 'lib', 'res'] },
      slide: {
        sid: 'slide',
        stype: 'surface',
        attributes: { kind: 'slide' },
        content: over.second ? ['one', 'two'] : ['one']
      },
      one: {
        sid: 'one',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: [],
        parentId: 'slide'
      },
      two: {
        sid: 'two',
        stype: 'instance',
        attributes: { componentId: 'card' },
        content: [],
        parentId: 'slide'
      },

      lib: { sid: 'lib', stype: 'components', attributes: {}, content: ['card'] },
      card: {
        sid: 'card',
        stype: 'component',
        attributes: { id: 'card', trackId: 'card-track' },
        content: ['back', 'badge']
      },
      back: { sid: 'back', stype: 'rectangle', attributes: { partId: 'back', name: 'card-back' }, parentId: 'card' },
      badge: { sid: 'badge', stype: 'ellipse', attributes: { partId: 'badge', name: 'card-badge' }, parentId: 'card' },

      res: { sid: 'res', stype: 'resources', attributes: {}, content: ['track'] },
      track: {
        sid: 'track',
        stype: 'motionTrack',
        attributes: { id: 'card-track' },
        content: ['s1', 's2', 's3'],
        parentId: 'res'
      },
      s1: {
        sid: 's1',
        stype: 'motionStep',
        attributes: { kind: 'build', target: 'card-back', effect: 'fadeIn', duration: 300 },
        parentId: 'track'
      },
      s2: {
        sid: 's2',
        stype: 'motionStep',
        attributes: {
          kind: 'build',
          target: 'card-badge',
          effect: 'fadeIn',
          duration: 200,
          startsWith: 'afterPrevious'
        },
        parentId: 'track'
      },
      // A step waiting for a click, which a placement cannot answer: left out rather than half done.
      s3: {
        sid: 's3',
        stype: 'motionStep',
        attributes: { kind: 'build', target: 'card-badge', effect: 'fadeIn', on: 'card-back' },
        parentId: 'track'
      }
    });

  it('remaps every step onto what that placement draws', () => {
    const steps = cardSteps(deck(), 'slide');
    /*
     * A step names its target by name and `slideTimeline` resolved it to a sid **inside the
     * definition** — a node the slide does not have. What the slide has is the drawn part, so both the
     * sid and the name carry the placement.
     */
    expect(steps.map((step) => [step.target, step.targetSid])).toEqual([
      ['one~card-back', 'one~back'],
      ['one~card-badge', 'one~badge']
    ]);
  });

  it('costs the slide no presses at all', () => {
    const steps = cardSteps(deck({ second: true }), 'slide');
    // The arrival: `pressCount` takes the highest group, and a slide with three of one card must not
    // cost three times the presses for one decision made inside the card.
    expect(steps.every((step) => step.group === 0)).toBe(true);
    expect(pressCount(steps)).toBe(0);
    // And they are what press 0 runs, which is the moment the slide comes up.
    expect(stepsAtPress(withTiming(steps), 0)).toHaveLength(steps.length);
  });

  it('plays in each placement at the same moment, not one after another', () => {
    const timed = withTiming(cardSteps(deck({ second: true }), 'slide'));
    const startOf = (sid: string) => timed.find((step) => step.targetSid === sid)?.startAt;

    /*
     * `withTiming` chains within a group in list order, so the second card's `afterPrevious` would
     * have waited for the first card to finish — three cards fading in one after another instead of
     * together. The first step of each placement's block starts the chain again.
     */
    expect(startOf('one~back')).toBe(0);
    expect(startOf('two~back')).toBe(0);
    // Inside one placement the chain is kept: the badge still waits for its own card's back.
    expect(startOf('one~badge')).toBe(300);
    expect(startOf('two~badge')).toBe(300);
  });

  it('leaves a click-triggered step out, because a click lands on the placement', () => {
    // A card is one thing to select, so which drawn part was pressed is a question the product cannot
    // answer yet — and a trigger that never fires is worse than one that is not offered.
    expect(cardSteps(deck(), 'slide').some((step) => step.on)).toBe(false);
  });

  it('answers nothing for a card with no track of its own', () => {
    const plain = deck();
    (plain.getNode('card') as never as { attributes: Record<string, unknown> }).attributes = {
      id: 'card'
    };
    expect(cardSteps(plain, 'slide')).toEqual([]);
  });
});
