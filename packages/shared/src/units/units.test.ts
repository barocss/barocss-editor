import { describe, it, expect } from 'vitest';
import { PX_PER_TWIP, pxToTwip, twipToPt, twipToPx } from './units';

/**
 * **단위 변환은 한 벌이어야 한다** — 그리고 두 벌이었을 때 실제로 갈라졌다.
 *
 * `office-slides` 는 `twip * (96/1440)`, `office-text` 는 `(twip/1440) * 96` 이었다. 수학으로는
 * 같고 **부동소수로는 다르다.** 이 파일의 첫 검사가 그 사실을 세워 둔다 — 다음 사람이 *어차피
 * 같은 값 아닌가* 라고 물을 때 답이 여기 있게.
 */
describe('twip → px', () => {
  it('정의된 값이다 — 1 twip = 1/1440 inch, 1 inch = 96 CSS px', () => {
    expect(PX_PER_TWIP).toBe(96 / 1440);
    expect(twipToPx(1440)).toBe(96);
    expect(twipToPx(0)).toBe(0);
  });

  it('되돌아온다', () => {
    for (const px of [0, 1, 96, 0.5, 1234.5]) {
      expect(pxToTwip(twipToPx(px * 15))).toBeCloseTo(px * 15, 9);
    }
  });

  /**
   * **계산 순서가 답을 바꾼다.** 이것이 두 벌이 갈라진 자리이고, 여기 적어 두지 않으면 다음 사람이
   * 두 번째 판을 만들면서 *어차피 같다* 고 생각한다.
   */
  it('나누기 순서를 바꾸면 다른 값이 나온다 — 두 벌이 갈라진 자리', () => {
    const other = (twip: number) => (twip / 1440) * 96;
    let apart = 0;
    for (let twip = -100000; twip <= 100000; twip += 1) {
      if (twipToPx(twip) !== other(twip)) apart += 1;
    }
    expect(apart, '두 계산이 같아졌다면 이 검사의 이유가 사라진 것이니 프로세를 고쳐라').toBeGreaterThan(0);

    /* 그리고 CSS 문자열로 나가면 그대로 보인다. */
    expect(`${twipToPx(9)}px`).not.toBe(`${other(9)}px`);
    expect(`${twipToPx(9)}px`).toBe('0.6px');
    expect(`${other(9)}px`).toBe('0.6000000000000001px');
  });
});

describe('twip → pt', () => {
  it('1 twip = 1/20 pt', () => {
    expect(twipToPt(20)).toBe(1);
    expect(twipToPt(1440)).toBe(72);
  });
});
