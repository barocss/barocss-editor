import { describe, expect, it } from 'vitest';
import {
  LINE_RULES,
  LINE_UNIT,
  NO_SPACING,
  linesOf,
  spacingOf,
  spacingPatch,
  spacingProperties,
  withRule,
  type SpacingState
} from '../src/spacing-model';

/**
 * **문단 간격**, 브라우저 없이.
 *
 * 잡으려는 결함은 조용한 것들이다 — 규칙만 바뀌고 숫자가 남아 문단이 열두 배가 되는 것, 혼합인
 * 값을 0 으로 써서 고른 문단 절반의 간격이 사라지는 것.
 */

describe('지금 무엇이 정해져 있는가', () => {
  it('빈 선택은 아무것도 아니다', () => {
    expect(spacingOf([])).toEqual(NO_SPACING);
  });

  it('문단 하나를 읽는다', () => {
    const state = spacingOf([
      { spacingBefore: 120, spacingAfter: 240, spacingLine: 360, spacingLineRule: 'auto' }
    ]);
    expect(state).toEqual({
      before: 120,
      after: 240,
      rule: 'auto',
      line: 360,
      contextual: null
    });
  });

  it('서로 다르게 답하면 혼합이다', () => {
    expect(spacingOf([{ spacingBefore: 120 }, { spacingBefore: 240 }]).before).toBe(null);
  });

  it('한쪽에만 있는 값도 혼합이다 — 없는 것과 다른 것은 둘 다 모름이다', () => {
    expect(spacingOf([{ spacingBefore: 120 }, {}]).before).toBe(null);
  });
});

describe('규칙을 바꾼다', () => {
  const oneAndHalf: SpacingState = { ...NO_SPACING, rule: 'auto', line: 360 };

  /**
   * **12pt 글에서는 두 단위의 숫자가 우연히 같다** — 한 줄이 240트윕이고 `auto` 의 한 줄도 240이라.
   * 그 우연 때문에 짐작으로 쓴 판도 여기서는 통과한다. 아래 24pt 검사가 그것을 가른다.
   */
  it('12pt 글에서는 숫자가 그대로다', () => {
    expect(withRule(oneAndHalf, 'atLeast').line).toBe(360);
  });

  it('24pt 글에서 1.5줄은 720트윕이지 360이 아니다', () => {
    expect(withRule(oneAndHalf, 'atLeast', 480).line).toBe(720);
  });

  it('되돌리면 원래 값이다', () => {
    const absolute = withRule(oneAndHalf, 'atLeast', 480);
    expect(withRule(absolute, 'auto', 480).line).toBe(360);
  });

  it('같은 규칙으로 바꾸는 것은 아무것도 안 한다', () => {
    expect(withRule(oneAndHalf, 'auto', 480)).toEqual(oneAndHalf);
  });

  it('정해진 값이 없으면 규칙만 바뀐다', () => {
    const state = withRule(NO_SPACING, 'atLeast');
    expect(state.rule).toBe('atLeast');
    expect(state.line).toBe(null);
  });

  it('규칙이 무엇이든 몇 줄인지 하나로 답한다', () => {
    expect(linesOf(oneAndHalf)).toBe(1.5);
    expect(linesOf(withRule(oneAndHalf, 'atLeast', 480), 480)).toBe(1.5);
    expect(linesOf(NO_SPACING)).toBe(null);
  });
});

describe('문단에 쓰는 것', () => {
  it('정한 것을 쓴다', () => {
    const patch = spacingPatch({
      before: 120,
      after: 240,
      rule: 'auto',
      line: 360,
      contextual: true
    });
    expect(patch).toEqual({
      spacingBefore: 120,
      spacingAfter: 240,
      spacingLineRule: 'auto',
      spacingLine: 360,
      contextualSpacing: true
    });
  });

  /**
   * **혼합은 쓰지 않는다.** 테두리와 다르고, 다른 것이 맞다 — 거기서 혼합인 *변*은 켜거나 끄는
   * 둘 중 하나여야 했지만, 여기서 혼합인 *숫자*는 독자가 건드리지 않은 값이다. 0 으로 쓰면 고른
   * 문단 중 절반의 간격이 조용히 사라진다.
   */
  it('혼합인 값은 아예 넣지 않는다', () => {
    expect(spacingPatch(NO_SPACING)).toEqual({});
  });

  it('0 은 혼합이 아니다 — 간격 없음은 독자가 정할 수 있는 값이다', () => {
    expect(spacingPatch({ ...NO_SPACING, before: 0 })).toEqual({ spacingBefore: 0 });
  });

  /**
   * **규칙과 값은 함께.** 하나만 쓰면 남은 하나가 옛 단위로 읽힌다 — `auto` 의 360(1.5줄)이
   * `atLeast` 의 360(18pt)이 되는 것이 그것이고, 24pt 글에서는 문단이 절반이 된다.
   */
  it('규칙만 있고 값이 없으면 둘 다 안 쓴다', () => {
    expect(spacingPatch({ ...NO_SPACING, rule: 'auto' })).toEqual({});
    expect(spacingPatch({ ...NO_SPACING, line: 360 })).toEqual({});
  });

  it('쓴 것을 되읽으면 같은 상태가 나온다', () => {
    const wanted: SpacingState = {
      before: 120,
      after: 240,
      rule: 'atLeast',
      line: 400,
      contextual: false
    };
    expect(spacingOf([spacingPatch(wanted) as Record<string, unknown>])).toEqual(wanted);
  });
});

describe('고를 수 있는 값', () => {
  /**
   * `paragraphCss` 가 `atLeast` 와 `exact` 를 한 줄로 그린다 — `twipToCss(line)` 하나다. 고르면
   * 「최소」가 나오는 「고정」은 이름이 거짓인 항목이고, 테두리에서 `thick` 과 `wave` 를 뺀 것과
   * 같은 판단이다.
   */
  it('그리는 쪽이 구분하지 못하는 규칙은 고를 수 없다', () => {
    expect(LINE_RULES.map((one) => one.rule)).not.toContain('exact');
  });

  it('한 줄은 240이다 — 그리는 쪽이 그렇게 나눈다', () => {
    expect(LINE_UNIT).toBe(240);
  });

  it('검사가 받을 이름은 다섯이다', () => {
    expect(spacingProperties().sort()).toEqual([
      'contextualSpacing',
      'spacingAfter',
      'spacingBefore',
      'spacingLine',
      'spacingLineRule'
    ]);
  });
});
