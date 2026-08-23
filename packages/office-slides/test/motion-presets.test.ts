import { describe, it, expect } from 'vitest';
import {
  MOTION_COMBOS,
  MOTION_PRESETS,
  comboAttrs,
  comboById,
  matchingPreset,
  presetAttrs,
  presetById,
  presetCategory,
  presetsIn
} from '../src/motion-presets';
import {
  KNOWN_EFFECT_IDS,
  easingCss,
  effectDefinition,
  framesFor,
  propertiesOf,
  smilTiming
} from '../src/motion-effects';

/**
 * The named motions.
 *
 * What is worth testing about a table of numbers is not the numbers — a reader
 * changing 600 to 620 is allowed to — but the three things a preset promises:
 * that it names an effect this product has, that applying it writes exactly the
 * values the effect can read, and that the panel can tell afterwards which one it
 * was.
 */
describe('the preset table', () => {
  it('names effects this product has', () => {
    for (const preset of MOTION_PRESETS) {
      expect(KNOWN_EFFECT_IDS, preset.id).toContain(preset.effect);
    }
  });

  it('names an easing that resolves to something other than the fallback', () => {
    for (const preset of MOTION_PRESETS) {
      // `easingCss` answers `ease` for anything it cannot read, so a preset whose
      // curve came back as `ease` without asking for it is a typo.
      if (preset.easing === 'ease') continue;
      expect(easingCss(preset.easing), preset.id).not.toBe('ease');
    }
  });

  it('has no two presets with the same id or the same label', () => {
    expect(new Set(MOTION_PRESETS.map((preset) => preset.id)).size).toBe(MOTION_PRESETS.length);
    expect(new Set(MOTION_PRESETS.map((preset) => preset.label)).size).toBe(MOTION_PRESETS.length);
  });

  /**
   * Every one of them produces frames, which is the check that a preset is not a
   * name for nothing: an effect id with a typo resolves to no definition and
   * `framesFor` answers an empty list, which on a slide is a shape that never
   * animates and never says why.
   */
  /**
   * Every preset animates *something*, by one of the three mechanisms this model
   * has — and which one it is, is said by the effect's own shape rather than by a
   * flag that could disagree with it.
   *
   * 1. **Frames on the shape.** Every CSS effect.
   * 2. **Frames on a filter primitive.** An SVG filter whose animating value is a
   *    presentation attribute — `flood-opacity` — and therefore a CSS property the
   *    Web Animations API can drive.
   * 3. **The filter animating itself**, with SMIL, because what it animates
   *    (`feDisplacementMap`'s scale, `feOffset`'s dx) is an XML attribute and no
   *    CSS property will ever reach it.
   */
  const TIMING = { duration: 800, delay: 0, repeat: 1 };

  it('animates something, by one of the three mechanisms', () => {
    for (const preset of MOTION_PRESETS) {
      const definition = effectDefinition(preset.effect)!;
      const options = { direction: preset.direction, amount: preset.amount, color: preset.color };

      if (!definition.svg) {
        expect(framesFor(preset.effect, options).length, preset.id).toBeGreaterThan(1);
        continue;
      }
      if (definition.svg.frames) {
        expect(definition.svg.frames(options).length, preset.id).toBeGreaterThan(1);
        continue;
      }
      // SMIL: the markup carries the animation, with a `begin` and a `dur`.
      const markup = definition.svg.markup(options, TIMING);
      expect(markup, preset.id).toContain('<animate');
      expect(markup, preset.id).toContain('dur="800ms"');
    }
  });

  /**
   * And an SVG effect marks the primitive its frames animate — when it has
   * frames.
   *
   * `%TARGET%` is how the stage finds it; markup without it is a filter whose
   * animation would run on nothing, which draws as a shape that never changes. A
   * SMIL filter marks nothing, because its animation is already inside it.
   */
  it('marks the primitive an SVG effect animates', () => {
    for (const preset of MOTION_PRESETS) {
      const svg = effectDefinition(preset.effect)?.svg;
      if (!svg) continue;
      const markup = svg.markup({ amount: preset.amount, color: preset.color }, TIMING);

      if (!svg.frames) {
        expect(markup, preset.id).not.toContain('%TARGET%');
        continue;
      }
      expect(markup, preset.id).toContain('%TARGET%');
      // One primitive, or the stage would animate whichever came first.
      expect(markup.match(/%TARGET%/g), preset.id).toHaveLength(1);
    }
  });

  /**
   * The two `attributeName`s the SMIL seam gained after it existed, which is the
   * test of whether it *was* a seam: a filter whose animation is inside it, with
   * the static attribute equal to the animation's first value.
   *
   * That last part is the one worth checking rather than reading. A morphology
   * whose `radius` starts at 0 while its animation starts at 4 shows one frame of
   * the untouched shape before the clock starts — invisible on a laptop and
   * obvious on a projector.
   */
  it('starts a SMIL filter where its own animation starts', () => {
    const cases: Array<[string, RegExp]> = [
      // An entrance eats the glyph first and gives it back.
      ['thickenIn', /radius="([\d.]+)"[\s\S]*values="\1;0"/],
      // An exit starts untouched and eats it away, and `fill="freeze"` keeps it.
      ['thinOut', /radius="0"[\s\S]*values="0;[\d.]+"/],
      // A shimmer's noise returns to where it began, or the loop jumps.
      ['shimmer', /baseFrequency="([\d.]+)"[\s\S]*values="\1;[\d.]+;\1"/]
    ];

    for (const [id, shape] of cases) {
      const svg = effectDefinition(id)?.svg;
      expect(svg, id).toBeTruthy();
      const markup = svg!.markup({ amount: 0.5 }, TIMING);
      expect(markup, id).toMatch(shape);
      // Its animation is inside it, so there is nothing for the stage to find.
      expect(markup, id).not.toContain('%TARGET%');
      expect(markup, id).toContain('fill="freeze"');
    }
  });

  /**
   * SMIL's own vocabulary for "until the slide moves on", which is the document's
   * `repeat: 0` — the same value the Web Animations API spells `Infinity`.
   */
  it('says indefinite for a filter that repeats until the slide moves on', () => {
    expect(smilTiming({ duration: 500, delay: 120, repeat: 0 })).toBe(
      'begin="120ms" dur="500ms" repeatCount="indefinite" fill="freeze"'
    );
    expect(smilTiming({ duration: 500, delay: 0, repeat: 3 })).toContain('repeatCount="3"');
  });

  it('groups by its effect s category rather than one of its own', () => {
    expect(presetCategory(presetById('rise')!)).toBe('entrance');
    expect(presetCategory(presetById('heartbeat')!)).toBe('emphasis');
    expect(presetCategory(presetById('fadeAway')!)).toBe('exit');

    // Every preset lands in exactly one of the three groups the panel draws.
    const grouped = [...presetsIn('entrance'), ...presetsIn('emphasis'), ...presetsIn('exit')];
    expect(grouped.length).toBe(MOTION_PRESETS.length);
  });
});

describe('what applying a preset writes', () => {
  it('writes the options the effect takes, and nothing else', () => {
    // A fade turns nothing and swells by nothing: a direction or an amount on it
    // is a value no frame will ever read.
    expect(presetAttrs(presetById('appearSlowly')!)).toEqual({
      effect: 'fade',
      duration: 1200,
      easing: 'easeInOut',
      repeat: 1,
      unit: 'box',
      stagger: 60
    });

    expect(presetAttrs(presetById('rise')!)).toEqual({
      effect: 'fly',
      duration: 600,
      easing: 'easeOut',
      direction: 'down',
      amount: 0.2,
      repeat: 1,
      unit: 'box',
      stagger: 60
    });

    // And a text preset is the same bundle with a different unit, which is the
    // whole argument for the unit being an option rather than a kind of step.
    expect(presetAttrs(presetById('letterByLetter')!)).toMatchObject({
      effect: 'fly',
      unit: 'letter',
      stagger: 45
    });
  });

  /**
   * The reason `repeat` is written even when it is one.
   *
   * A step already beating twice, given a preset that does not repeat, has to
   * stop — and a value left out of a patch is a value left alone.
   */
  it('says once rather than leaving a repeat behind', () => {
    expect(presetAttrs(presetById('appearSlowly')!).repeat).toBe(1);
    expect(presetAttrs(presetById('heartbeat')!).repeat).toBe(2);
  });

  it('only ever names options the effect declares', () => {
    for (const preset of MOTION_PRESETS) {
      const takes = effectDefinition(preset.effect)!.takes;
      const attrs = presetAttrs(preset);
      expect('direction' in attrs, preset.id).toBe(!!takes.direction);
      expect('amount' in attrs, preset.id).toBe(!!takes.amount);
    }
  });

  /**
   * 제자리에서 한 바퀴 is exactly one turn — and now trivially.
   *
   * The number used to be 0.334, because `spin` ran from 180° to 720° and a whole
   * turn was a third of that range. `spin` counts *turns* now, so one turn is the
   * bottom of the range and this preset's amount is 0. The old fraction was a
   * symptom of a range that could stop a shape anywhere, which is what left the
   * default `spin` turned 90° with nothing objecting.
   */
  it('turns exactly once', () => {
    const preset = presetById('turnOnce')!;
    const frames = framesFor(preset.effect, { amount: preset.amount });
    expect(frames[frames.length - 1].rotate).toBe('360deg');
  });
});

describe('which preset a step is', () => {
  it('recognises a step written by a preset', () => {
    for (const preset of MOTION_PRESETS) {
      expect(matchingPreset(presetAttrs(preset) as never)?.id, preset.id).toBe(preset.id);
    }
  });

  /**
   * And says nothing for a step a reader has nudged, which is the whole reason
   * the preset is not stored: 620ms 부드럽게 올라오기 is not that preset any
   * more, and a name that stayed put would tell the reader it was.
   */
  it('says nothing for a step whose values were changed', () => {
    const rise = presetAttrs(presetById('rise')!) as Record<string, unknown>;
    expect(matchingPreset({ ...rise, duration: 620 } as never)).toBeUndefined();
    expect(matchingPreset({ ...rise, direction: 'left' } as never)).toBeUndefined();
    expect(matchingPreset({ ...rise, easing: 'linear' } as never)).toBeUndefined();
    expect(matchingPreset({ ...rise, repeat: 3 } as never)).toBeUndefined();
  });

  /**
   * A step animating letters, given a preset that animates the box, has to stop —
   * which is why `unit` is written even when it is `box`.
   */
  it('says the box rather than leaving a letter animation behind', () => {
    const letters = presetAttrs(presetById('letterByLetter')!) as Record<string, unknown>;
    expect(matchingPreset(letters as never)?.id).toBe('letterByLetter');
    expect(presetAttrs(presetById('rise')!).unit).toBe('box');
    // A box animation is the same preset whatever stagger it is carrying: the
    // value is not read where there is one piece.
    expect(matchingPreset({ ...(presetAttrs(presetById('rise')!) as object), stagger: 200 } as never)?.id).toBe(
      'rise'
    );
  });

  /** A step that says nothing about repeating repeats once, and still matches. */
  it('reads a missing repeat as once', () => {
    const rise = presetAttrs(presetById('rise')!) as Record<string, unknown>;
    delete rise.repeat;
    expect(matchingPreset(rise as never)?.id).toBe('rise');
  });

  it('ignores an option the effect does not take, however the step got one', () => {
    // A step that was a fly and is now a fade may still carry the direction the
    // fly needed. Nothing reads it, so it cannot be what makes the fade not a
    // preset.
    const slow = presetAttrs(presetById('appearSlowly')!) as Record<string, unknown>;
    expect(matchingPreset({ ...slow, direction: 'up' } as never)?.id).toBe('appearSlowly');
  });

  it('says nothing at all for a step with no effect', () => {
    expect(matchingPreset(undefined)).toBeUndefined();
    expect(matchingPreset({})).toBeUndefined();
  });
});

/**
 * Combinations: two motions at once, under one name.
 *
 * The presets this model could not hold until the timeline learned to composite —
 * before it, the second motion on a shape silently lost. What is worth testing is
 * that a combination is *nothing new*: each part is an ordinary preset, and what
 * it writes is what picking each of them by hand would write.
 */
describe('a combination of motions', () => {
  it('is made of presets this product has', () => {
    expect(MOTION_COMBOS.length).toBeGreaterThanOrEqual(4);
    for (const combo of MOTION_COMBOS) {
      expect(combo.parts.length, combo.id).toBeGreaterThan(1);
      for (const part of combo.parts) {
        expect(presetById(part), `${combo.id}/${part}`).toBeTruthy();
      }
    }
    expect(comboById('riseAndGrow')?.parts).toEqual(['rise', 'pop']);
    expect(comboById('nothing')).toBeUndefined();
  });

  /**
   * And never two turning effects in one combination.
   *
   * Two additive `rotate` animations end at *zero* in Chromium (measured), so a
   * shape would turn and untwist itself. The timeline reports that clash when a
   * reader builds one by hand; a shipped preset must not contain one.
   */
  it('never pairs two effects that both turn', () => {
    for (const combo of MOTION_COMBOS) {
      const turning = combo.parts.filter((part) =>
        propertiesOf(presetById(part)!.effect).includes('rotate')
      );
      expect(turning.length, combo.id).toBeLessThan(2);
    }
  });

  it('writes each part as its own bundle, the rest running with the first', () => {
    const written = comboAttrs(comboById('riseAndGrow')!);
    expect(written).toHaveLength(2);
    // The first is exactly the preset it names.
    expect(written[0]).toEqual(presetAttrs(presetById('rise')!));
    // And the second is that preset, at the same moment.
    expect(written[1]).toMatchObject({
      ...presetAttrs(presetById('pop')!),
      startsWith: 'withPrevious',
      delay: 0
    });
  });
});
