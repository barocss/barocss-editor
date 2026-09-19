import { describe, expect, it } from 'vitest';
import {
  BORDER_STYLES,
  BORDER_WIDTHS,
  applyPreset,
  borderPatch,
  bordersOf,
  presetOf,
  prefixOf,
  NO_BORDERS,
  type BorderState
} from '../src/border-model';

/**
 * **테두리 대화상자가 아는 것**, 브라우저 없이.
 *
 * 여기서 잡으려는 결함은 하나같이 눈으로는 늦게 보이는 것들이다 — 지울 수 없는 사이 선, 열자마자
 * *혼합* 이라고 답하는 상자, 다음 사람이 얻는 고르지 않은 6pt.
 */

const box = (extra: Record<string, unknown> = {}) => ({
  borderTopStyle: 'single',
  borderTopWidth: 8,
  borderTopColor: '000000',
  borderBottomStyle: 'single',
  borderBottomWidth: 8,
  borderBottomColor: '000000',
  borderLeftStyle: 'single',
  borderLeftWidth: 8,
  borderLeftColor: '000000',
  borderRightStyle: 'single',
  borderRightWidth: 8,
  borderRightColor: '000000',
  ...extra
});

describe('속성 이름', () => {
  it('네 변과 사이 선의 앞머리를 스키마와 같게 만든다', () => {
    expect(prefixOf('top')).toBe('borderTop');
    expect(prefixOf('between')).toBe('borderBetween');
  });
});

describe('지금 무엇이 켜져 있는가', () => {
  it('빈 선택은 테두리 없음이다', () => {
    expect(bordersOf([])).toEqual(NO_BORDERS);
  });

  it('상자 하나를 읽는다', () => {
    const state = bordersOf([box()]);
    expect(state.edges).toEqual({
      top: true,
      bottom: true,
      left: true,
      right: true,
      between: false
    });
    expect(state.style).toBe('single');
    expect(state.width).toBe(8);
    expect(state.color).toBe('000000');
  });

  it("모양이 `none` 이면 그려지지 않는 것으로 읽는다", () => {
    expect(bordersOf([{ borderTopStyle: 'none', borderTopWidth: 8 }]).edges.top).toBe(false);
  });

  it('서로 다르게 답하는 문단들은 그 변이 혼합이다', () => {
    const state = bordersOf([box(), {}]);
    expect(state.edges.top).toBe(null);
    expect(state.edges.between).toBe(false);
  });

  /**
   * **꺼진 변에 남은 값은 독자가 정한 것이 아니다.**
   *
   * 이것이 빠지면 상자 하나를 고르고 대화상자를 여는 것만으로 두께가 *혼합* 이라고 나온다 — 지우다
   * 남은 `borderBottomWidth` 하나 때문에.
   */
  it('꺼진 변에 남은 두께는 값으로 세지 않는다', () => {
    const state = bordersOf([
      { borderTopStyle: 'single', borderTopWidth: 8, borderBottomWidth: 48 }
    ]);
    expect(state.width).toBe(8);
  });

  it('그려지는 변들의 두께가 다르면 혼합이다', () => {
    const state = bordersOf([box({ borderTopWidth: 24 })]);
    expect(state.width).toBe(null);
  });

  it('아무 변도 안 그려지면 값은 없음이다', () => {
    expect(bordersOf([{}]).width).toBe(null);
  });
});

describe('미리 설정', () => {
  const custom: BorderState = {
    ...NO_BORDERS,
    style: 'double',
    width: 24,
    color: '2C5282'
  };

  it('「상자」는 네 변을 켠다', () => {
    expect(applyPreset(custom, 'box').edges).toEqual({
      top: true,
      bottom: true,
      left: true,
      right: true,
      between: false
    });
  });

  /**
   * **이 파일이 있는 이유.** 네 변을 독립된 넷으로 다루면 「모두」 뒤의 「상자」가 사이 선을 남기고,
   * 독자에게는 지울 수 없는 선이 된다.
   */
  it('「모두」 다음에 「상자」를 누르면 사이 선이 꺼진다', () => {
    const all = applyPreset(custom, 'all');
    expect(all.edges.between).toBe(true);
    expect(applyPreset(all, 'box').edges.between).toBe(false);
  });

  it('「없음」은 다섯을 모두 끈다', () => {
    const cleared = applyPreset(applyPreset(custom, 'all'), 'none');
    expect(Object.values(cleared.edges)).toEqual([false, false, false, false, false]);
  });

  it('미리 설정은 모양과 두께와 색을 건드리지 않는다', () => {
    const applied = applyPreset(custom, 'box');
    expect(applied.style).toBe('double');
    expect(applied.width).toBe(24);
    expect(applied.color).toBe('2C5282');
  });

  it('지금 상태가 어느 미리 설정인지 되읽는다', () => {
    expect(presetOf(NO_BORDERS)).toBe('none');
    expect(presetOf(applyPreset(NO_BORDERS, 'box'))).toBe('box');
    expect(presetOf(applyPreset(NO_BORDERS, 'all'))).toBe('all');
  });

  it('변 하나만 켠 것은 어느 미리 설정도 아니다', () => {
    const one = { ...NO_BORDERS, edges: { ...NO_BORDERS.edges, top: true } };
    expect(presetOf(one)).toBeUndefined();
  });

  it('혼합인 변이 있으면 어느 미리 설정도 아니다', () => {
    const some = { ...NO_BORDERS, edges: { ...NO_BORDERS.edges, top: null } };
    expect(presetOf(some)).toBeUndefined();
  });
});

describe('문단에 쓰는 것', () => {
  it('켠 변에 넷을 다 쓴다', () => {
    const patch = borderPatch({
      ...NO_BORDERS,
      edges: { ...NO_BORDERS.edges, top: true },
      style: 'double',
      width: 24,
      color: '2C5282',
      space: 6
    });
    expect(patch.borderTopStyle).toBe('double');
    expect(patch.borderTopWidth).toBe(24);
    expect(patch.borderTopColor).toBe('2C5282');
    expect(patch.borderTopSpace).toBe(6);
  });

  /**
   * **모양만 지우고 두께를 남기면** 파일에 `borderTopWidth: 48` 이 홀로 남고, 다음에 그 변을 켜는
   * 독자가 고르지 않은 6pt 를 얻는다.
   */
  it('끈 변에서는 넷을 다 지운다', () => {
    const patch = borderPatch(NO_BORDERS);
    for (const suffix of ['Style', 'Width', 'Color', 'Space']) {
      expect(patch[`borderTop${suffix}`]).toBe(null);
      expect(patch[`borderBetween${suffix}`]).toBe(null);
    }
  });

  it('지우는 값은 `none` 이 아니라 `null` 이다 — 말하지 않음과 없다고 말함은 다르다', () => {
    expect(borderPatch(NO_BORDERS).borderTopStyle).not.toBe('none');
    expect(borderPatch(NO_BORDERS).borderTopStyle).toBe(null);
  });

  it('혼합인 변은 꺼진 것으로 쓴다 — 세 값을 보여 주고 두 값을 쓴다', () => {
    const patch = borderPatch({ ...NO_BORDERS, edges: { ...NO_BORDERS.edges, top: null } });
    expect(patch.borderTopStyle).toBe(null);
  });

  it('고른 것이 없으면 실선 1pt 검정으로 쓴다', () => {
    const patch = borderPatch({ ...NO_BORDERS, edges: { ...NO_BORDERS.edges, top: true } });
    expect(patch.borderTopStyle).toBe('single');
    expect(patch.borderTopWidth).toBe(8);
    expect(patch.borderTopColor).toBe('000000');
  });

  it('간격은 정하지 않을 수 있다 — 0 과 말하지 않음은 다르다', () => {
    const patch = borderPatch({ ...NO_BORDERS, edges: { ...NO_BORDERS.edges, top: true } });
    expect(patch.borderTopSpace).toBe(null);
  });

  it('쓴 것을 되읽으면 같은 상태가 나온다', () => {
    const wanted: BorderState = {
      edges: { top: true, bottom: true, left: true, right: true, between: false },
      style: 'dashed',
      width: 12,
      color: 'FF0000',
      space: 4
    };
    const read = bordersOf([borderPatch(wanted) as Record<string, unknown>]);
    expect(read).toEqual(wanted);
  });
});

describe('고를 수 있는 값', () => {
  /**
   * `borderCss` 가 `width / 8` 로 나눈다. 사다리의 두 칸이 같은 화면 두께가 되면 그 둘 중 하나는
   * 고를 이유가 없는 항목이다.
   */
  it('두께 사다리의 값이 모두 눈으로 다르다', () => {
    const points = BORDER_WIDTHS.map((one) => one.eighths / 8);
    expect(new Set(points).size).toBe(points.length);
    expect([...points]).toEqual([...points].sort((a, b) => a - b));
  });

  /**
   * `BORDER_STYLE` 이 `thick` 과 `wave` 를 `solid` 로 그린다. 고르면 실선이 나오는 항목은 이름이
   * 거짓인 단추다.
   */
  it('고를 수 있는 모양은 서로 다르게 그려지는 것뿐이다', () => {
    expect(BORDER_STYLES.map((one) => one.style)).not.toContain('thick');
    expect(BORDER_STYLES.map((one) => one.style)).not.toContain('wave');
  });
});
