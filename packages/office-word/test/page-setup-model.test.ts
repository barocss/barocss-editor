import { describe, expect, it } from 'vitest';
import {
  PAPERS,
  TWIPS_PER_INCH,
  isUsable,
  orientationOf,
  pageSetupOf,
  pageSetupPatch,
  pageSetupProperties,
  drawnSize,
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
  orientation: 'portrait',
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
  });

  /**
   * **적히지 않은 값은 혼합이 아니라 스키마의 것이다.**
   *
   * 첫 판은 원시 속성만 읽었고, 그래서 시작 문서(여백 넷만 적는다)에서 폭을 *혼합*으로 답했다.
   * 방향은 두 변의 관계인데 두 변을 모르니 가로로 바꿔도 아무 일이 없었다 — 브라우저의
   * `changes()` 가 *"종이의 모양이 바뀌지 않았습니다"* 로 잡았다.
   */
  it('적히지 않은 값은 스키마가 말하는 값이다', () => {
    const state = pageSetupOf([{ marginLeft: 1440 }]);
    expect(state.width).toBe(12240);
    expect(state.height).toBe(15840);
    expect(state.marginRight).toBe(1440);
    expect(state.columns).toBe(1);
  });

  it('아무것도 안 적은 구역에서도 방향을 안다 — 이것이 없으면 가로 단추가 죽는다', () => {
    expect(orientationOf(pageSetupOf([{}]))).toBe('portrait');
  });

  it('하나는 적고 하나는 안 적었는데 값이 같으면 혼합이 아니다', () => {
    expect(pageSetupOf([{ pageWidth: 12240 }, {}]).width).toBe(12240);
  });

  it('서로 다르게 답하면 혼합이다', () => {
    expect(pageSetupOf([{ pageWidth: 11906 }, { pageWidth: 12240 }]).width).toBe(null);
  });

  it('빈 선택은 모두 혼합이다', () => {
    expect(Object.values(pageSetupOf([]))).toEqual(Array(12).fill(null));
  });
});

describe('방향', () => {
  /**
   * **저장값은 세운 상태의 두 변이고, `orientation` 이 눕히라는 지시다.**
   *
   * 첫 판은 반대로 알았다 — `layout.ts` 를 105줄부터 읽어 96줄의 `landscape` 를 놓쳤고, 방향을
   * 바꿀 때 두 수를 맞바꿨다. 그리는 쪽이 한 번 더 뒤집어 세로가 나왔고, 브라우저의 `changes()`
   * 가 *"종이의 모양이 바뀌지 않았습니다"* 로 잡았다.
   */
  it('바꾸면 이름만 바뀌고 두 변은 그대로다', () => {
    const wide = withOrientation(letter, 'landscape');
    expect(wide.orientation).toBe('landscape');
    expect(wide.width).toBe(12240);
    expect(wide.height).toBe(15840);
  });

  it('눕은 뒤의 두 변은 맞바뀐 것이다 — 독자가 보는 종이', () => {
    expect(drawnSize(letter)).toEqual({ width: 12240, height: 15840 });
    expect(drawnSize(withOrientation(letter, 'landscape'))).toEqual({
      width: 15840,
      height: 12240
    });
  });

  it('두 번 눌러도 돌아오지 않는다', () => {
    const wide = withOrientation(withOrientation(letter, 'landscape'), 'landscape');
    expect(drawnSize(wide)).toEqual({ width: 15840, height: 12240 });
  });

  it('크기를 모르면 눕은 크기도 모른다', () => {
    expect(drawnSize({ ...letter, width: null })).toBe(null);
  });

  /**
   * **그리는 쪽과 같은 두 줄인지 세운다.** 넷이 이 규약을 쓴다 — `layout.ts:96`, `css.ts:381`,
   * `css.ts:421`, `canvas-insert.ts:141`. 이 검사는 그 넷 중 하나가 되어 본다: 규약이 바뀌면
   * 여기가 먼저 빨개져야, 대화상자가 두 번 뒤집는 판으로 돌아가지 않는다.
   */
  it('그리는 쪽의 규약과 같다', () => {
    const like = (format: { pageWidth: number; pageHeight: number; orientation?: string }) => {
      const landscape = format.orientation === 'landscape';
      return {
        width: landscape ? format.pageHeight : format.pageWidth,
        height: landscape ? format.pageWidth : format.pageHeight
      };
    };
    for (const facing of ['portrait', 'landscape'] as const) {
      const setup = withOrientation(letter, facing);
      expect(drawnSize(setup)).toEqual(
        like({ pageWidth: 12240, pageHeight: 15840, orientation: facing })
      );
    }
  });
});

describe('용지', () => {
  it('이름으로 고르면 그 크기가 된다', () => {
    expect(withPaper(letter, 'a4').width).toBe(11906);
  });

  /** 가로로 쓰던 사람이 A4 를 고르면 **가로 A4** 를 받는다 — 방향은 건드리지 않으므로. */
  it('고를 때 방향은 그대로다', () => {
    const a4 = withPaper(withOrientation(letter, 'landscape'), 'a4');
    expect(orientationOf(a4)).toBe('landscape');
    expect(drawnSize(a4)).toEqual({ width: 16838, height: 11906 });
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

  /** 셋을 **적힌 그대로** 쓴다 — 여기서 한 번 더 계산하면 그리는 쪽과 합쳐 두 번 뒤집힌다. */
  it('방향과 두 변을 그대로 쓴다', () => {
    const wide = pageSetupPatch(withOrientation(letter, 'landscape'));
    expect(wide.orientation).toBe('landscape');
    expect(wide.pageWidth).toBe(12240);
    expect(wide.pageHeight).toBe(15840);
  });

  it('혼합인 값은 아예 넣지 않는다', () => {
    const patch = pageSetupPatch({ ...letter, marginLeft: null });
    expect('marginLeft' in patch).toBe(false);
    expect(patch.marginRight).toBe(1440);
  });

  it('방향이 혼합이면 안 쓴다', () => {
    expect('orientation' in pageSetupPatch({ ...letter, orientation: null })).toBe(false);
  });

  /** 가로 A4 의 좌우 여백은 11906 이 아니라 **16838** 안에 들어가야 한다. */
  it('자리는 눕은 뒤의 두 변으로 잰다', () => {
    const wide = withOrientation(letter, 'landscape');
    expect(roomFor(wide)?.across).toBe(15840 - 2880);
    expect(isUsable({ ...wide, marginLeft: 11000 })).toBe(true);
    expect(isUsable({ ...letter, marginLeft: 11000 })).toBe(false);
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
