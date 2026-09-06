import { describe, expect, it } from 'vitest';
import {
  PAPERS,
  TWIPS_PER_INCH,
  isUsable,
  orientationOf,
  pageSetupOf,
  pageSetupPatch,
  pageSetupProperties,
  paperOf,
  roomFor,
  withOrientation,
  withPaper,
  type PageSetup
} from '../src/page-setup-model';

/**
 * **페이지 설정**, 브라우저 없이.
 *
 * 잡으려는 결함은 둘이다 — *가로*라고 적혀 있으면서 세로인 페이지, 그리고 글을 놓을 자리가
 * 남지 않는 여백.
 */

const letter: PageSetup = {
  width: 12240,
  height: 15840,
  marginTop: 1440,
  marginBottom: 1440,
  marginLeft: 1440,
  marginRight: 1440,
  gutter: 0,
  gutterAtTop: false,
  columns: 1,
  columnSpacing: 720,
  columnSeparator: false
};

describe('지금 무엇이 정해져 있는가', () => {
  it('구역 하나를 읽는다', () => {
    const state = pageSetupOf([
      { pageWidth: 11906, pageHeight: 16838, marginLeft: 1440, columnCount: 2 }
    ]);
    expect(state.width).toBe(11906);
    expect(state.columns).toBe(2);
    expect(state.marginRight).toBe(null);
  });

  it('서로 다르게 답하면 혼합이다', () => {
    expect(pageSetupOf([{ pageWidth: 11906 }, { pageWidth: 12240 }]).width).toBe(null);
  });

  it('빈 선택은 모두 혼합이다', () => {
    expect(Object.values(pageSetupOf([]))).toEqual(Array(11).fill(null));
  });
});

describe('방향', () => {
  /**
   * **적힌 것이 아니라 두 변에서 읽는다.** `layout.ts` 는 `orientation` 을 보지 않고 폭과 높이만
   * 본다. 저장된 이름이 화면과 어긋나 있으면 어긋난 쪽이 틀린 것이고, 대화상자는 화면과 같은
   * 말을 해야 한다.
   */
  it('폭이 높이보다 크면 가로다 — 무엇이라고 적혀 있든', () => {
    expect(orientationOf(letter)).toBe('portrait');
    expect(orientationOf({ ...letter, width: 15840, height: 12240 })).toBe('landscape');
  });

  it('바꾸면 두 수가 맞바뀐다', () => {
    const wide = withOrientation(letter, 'landscape');
    expect(wide.width).toBe(15840);
    expect(wide.height).toBe(12240);
  });

  it('이미 그 방향이면 아무것도 안 한다 — 두 번 눌러도 돌아오지 않는다', () => {
    const wide = withOrientation(letter, 'landscape');
    expect(withOrientation(wide, 'landscape')).toEqual(wide);
  });

  it('크기를 모르면 방향도 모른다', () => {
    expect(orientationOf({ ...letter, width: null })).toBe(null);
  });
});

describe('용지', () => {
  it('이름으로 고르면 그 크기가 된다', () => {
    expect(withPaper(letter, 'a4').width).toBe(11906);
  });

  /** 가로로 쓰던 사람이 A4 를 고르면 **가로 A4** 를 받아야 한다. */
  it('고를 때 지금 방향을 지킨다', () => {
    const wide = withOrientation(letter, 'landscape');
    const a4 = withPaper(wide, 'a4');
    expect(orientationOf(a4)).toBe('landscape');
    expect(a4.width).toBe(16838);
  });

  it('지금 크기가 어느 용지인지 되읽는다 — 방향과 무관하게', () => {
    expect(paperOf(letter)).toBe('letter');
    expect(paperOf(withOrientation(letter, 'landscape'))).toBe('letter');
  });

  it('어느 용지도 아니면 사용자 지정이다', () => {
    expect(paperOf({ ...letter, width: 10000 })).toBeUndefined();
  });

  it('용지 목록에 같은 크기가 둘 있지 않다 — 되읽기가 흔들린다', () => {
    const keys = PAPERS.map((one) => `${one.width}x${one.height}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('글을 놓을 자리', () => {
  it('여백을 뺀 만큼이 남는다', () => {
    const room = roomFor(letter);
    expect(room).toEqual({ across: 12240 - 2880, down: 15840 - 2880 });
  });

  it('제본용 여백은 옆에서 빠진다 — 위에 붙이라고 하지 않았으면', () => {
    expect(roomFor({ ...letter, gutter: 720 })?.across).toBe(12240 - 2880 - 720);
    expect(roomFor({ ...letter, gutter: 720 })?.down).toBe(15840 - 2880);
  });

  it('위에 붙이라고 하면 위에서 빠진다', () => {
    const setup = { ...letter, gutter: 720, gutterAtTop: true };
    expect(roomFor(setup)?.across).toBe(12240 - 2880);
    expect(roomFor(setup)?.down).toBe(15840 - 2880 - 720);
  });

  /**
   * `layout.ts` 가 `Math.max(1, height - marginTop - marginBottom)` 으로 방어한다. **그리는 쪽이
   * 이미 방어하고 있다는 것은 정할 때 막아야 한다는 뜻이다** — 한 줄에 한 글자씩 수천 페이지가
   * 나오는 문서는 사라진 문서보다 나쁘다.
   */
  it('여백이 종이보다 넓으면 쓸 수 없다고 한다', () => {
    expect(isUsable(letter)).toBe(true);
    // 12240 − 11000 − 1440 = −200. 첫 판은 9000 으로 썼고 1800트윕이 남아 있었다 —
    // *넘친다고 생각한 값*과 *넘치는 값*은 다르고, 검사는 뒤엣것이어야 한다.
    expect(isUsable({ ...letter, marginLeft: 11000 })).toBe(false);
    expect(isUsable({ ...letter, marginTop: 9000, marginBottom: 9000 })).toBe(false);
    // 딱 맞아떨어지는 것도 자리가 없는 것이다 — 0폭에는 글자가 안 들어간다.
    expect(isUsable({ ...letter, marginLeft: 10800 })).toBe(false);
  });

  it('크기를 모르면 쓸 수 있다고 하지 않는다', () => {
    expect(isUsable({ ...letter, width: null })).toBe(false);
  });
});

describe('구역에 쓰는 것', () => {
  it('정한 것을 쓴다', () => {
    const patch = pageSetupPatch(letter);
    expect(patch.pageWidth).toBe(12240);
    expect(patch.marginGutter).toBe(0);
    expect(patch.columnCount).toBe(1);
  });

  /** 셋을 따로 두면 *가로*라고 적혀 있으면서 세로인 페이지가 생긴다. */
  it('방향은 폭과 높이에서 계산해서 쓴다', () => {
    expect(pageSetupPatch(letter).orientation).toBe('portrait');
    expect(pageSetupPatch(withOrientation(letter, 'landscape')).orientation).toBe('landscape');
  });

  it('혼합인 값은 아예 넣지 않는다', () => {
    const patch = pageSetupPatch({ ...letter, marginLeft: null });
    expect('marginLeft' in patch).toBe(false);
    expect(patch.marginRight).toBe(1440);
  });

  it('크기를 모르면 방향도 안 쓴다', () => {
    expect('orientation' in pageSetupPatch({ ...letter, width: null })).toBe(false);
  });

  it('쓴 것을 되읽으면 같은 상태가 나온다', () => {
    expect(pageSetupOf([pageSetupPatch(letter) as Record<string, unknown>])).toEqual(letter);
  });

  it('1인치는 1440트윕이다 — 스키마의 기본 여백이 그 값이다', () => {
    expect(TWIPS_PER_INCH).toBe(1440);
    expect(letter.marginTop).toBe(TWIPS_PER_INCH);
  });

  it('검사가 받을 이름은 열둘이다', () => {
    expect(pageSetupProperties().sort()).toEqual([
      'columnCount',
      'columnSeparator',
      'columnSpacing',
      'gutterAtTop',
      'marginBottom',
      'marginGutter',
      'marginLeft',
      'marginRight',
      'marginTop',
      'orientation',
      'pageHeight',
      'pageWidth'
    ]);
  });
});
