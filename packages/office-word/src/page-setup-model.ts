/**
 * **페이지 설정 대화상자가 아는 것** — 그리기도 리액트도 없는 순수한 부분.
 *
 * `word.md` 의 다섯 묶음 중 셋째: 용지 크기, 여백, 제본용 여백, 단과 그 간격과 구분선.
 *
 * ## 문단이 아니라 구역에 쓴다
 *
 * 앞의 두 대화상자는 커서가 든 **블록**에 썼다. 이것은 `surface` 에 쓴다 — Word 에서 페이지 설정은
 * *구역*의 것이고, 한 문서가 여러 구역을 가지면 각각 다른 용지에 인쇄된다. 그래서
 * `selected-blocks.ts` 가 아니라 위로 걸어 구역을 찾는다.
 *
 * ## 이 파일이 세우는 하나
 *
 * **방향은 저장되는 값이 아니라 두 변의 관계다.**
 *
 * 스키마에 `orientation` 이 있고 `pageWidth`·`pageHeight` 도 있다. 셋을 따로 쓰면 *가로*라고 적혀
 * 있으면서 세로인 페이지를 만들 수 있고, 그때 무엇이 이기는지는 읽는 쪽마다 다르다. 재보니
 * `layout.ts` 는 `orientation` 을 보지 않는다 — **폭과 높이만 본다.** 그러니 방향을 바꾸는 것은
 * 두 수를 맞바꾸는 일이고, `orientation` 은 그 결과를 적어 두는 이름일 뿐이다.
 */

/** 트윕. 1인치 = 1440. */
export const TWIPS_PER_INCH = 1440;

export type Orientation = 'portrait' | 'landscape';

/**
 * 독자가 이름으로 아는 용지 — 세로일 때의 폭과 높이.
 *
 * 밀리미터가 아니라 트윕으로 적는 것은 문서가 트윕으로 저장하기 때문이다. A4 의 210×297mm 는
 * 11906×16838 트윕이고, 그 반올림이 여기 한 번만 있어야 한다.
 */
export const PAPERS: readonly { id: string; label: string; width: number; height: number }[] = [
  { id: 'a4', label: 'A4', width: 11906, height: 16838 },
  { id: 'letter', label: 'Letter', width: 12240, height: 15840 },
  { id: 'legal', label: 'Legal', width: 12240, height: 20160 },
  { id: 'b5', label: 'B5', width: 9979, height: 14175 },
  { id: 'a3', label: 'A3', width: 16838, height: 23811 }
];

export interface PageSetup {
  /** 트윕. `null` 은 혼합 — 고른 구역들이 서로 다르게 답한다. */
  width: number | null;
  height: number | null;
  marginTop: number | null;
  marginBottom: number | null;
  marginLeft: number | null;
  marginRight: number | null;
  /** 제본용 여백과 그것이 위에 붙는지. */
  gutter: number | null;
  gutterAtTop: boolean | null;
  columns: number | null;
  columnSpacing: number | null;
  columnSeparator: boolean | null;
}

type Attrs = Readonly<Record<string, unknown>>;

function agreed<T>(values: readonly (T | undefined)[]): T | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((one) => one === first) && first !== undefined ? first : null;
}

/** 고른 구역들이 지금 말하는 페이지. */
export function pageSetupOf(surfaces: readonly Attrs[]): PageSetup {
  const read = <T>(name: string): T | null =>
    agreed(surfaces.map((attrs) => attrs[name] as T | undefined));

  return {
    width: read<number>('pageWidth'),
    height: read<number>('pageHeight'),
    marginTop: read<number>('marginTop'),
    marginBottom: read<number>('marginBottom'),
    marginLeft: read<number>('marginLeft'),
    marginRight: read<number>('marginRight'),
    gutter: read<number>('marginGutter'),
    gutterAtTop: read<boolean>('gutterAtTop'),
    columns: read<number>('columnCount'),
    columnSpacing: read<number>('columnSpacing'),
    columnSeparator: read<boolean>('columnSeparator')
  };
}

/**
 * 지금 방향 — **적힌 것이 아니라 두 변에서 읽는다.**
 *
 * `layout.ts` 가 폭과 높이만 보므로, 화면이 가로면 가로다. 저장된 `orientation` 이 그것과 어긋나
 * 있으면 어긋난 쪽이 틀린 것이고, 대화상자는 **화면과 같은 말을 해야 한다.**
 */
export function orientationOf(setup: PageSetup): Orientation | null {
  if (setup.width === null || setup.height === null) return null;
  return setup.width > setup.height ? 'landscape' : 'portrait';
}

/** 방향을 바꾼다 — 두 수를 맞바꾸는 것으로. 이미 그 방향이면 아무것도 안 한다. */
export function withOrientation(setup: PageSetup, want: Orientation): PageSetup {
  if (setup.width === null || setup.height === null) return setup;
  if (orientationOf(setup) === want) return setup;
  return { ...setup, width: setup.height, height: setup.width };
}

/** 이름 있는 용지를 고른다 — 지금 방향을 지키면서. */
export function withPaper(setup: PageSetup, paperId: string): PageSetup {
  const paper = PAPERS.find((one) => one.id === paperId);
  if (!paper) return setup;
  const upright = { ...setup, width: paper.width, height: paper.height };
  const want = orientationOf(setup);
  return want ? withOrientation(upright, want) : upright;
}

/** 지금 크기가 어느 용지인가 — 방향과 무관하게. 어느 것도 아니면 사용자 지정. */
export function paperOf(setup: PageSetup): string | undefined {
  const { width, height } = setup;
  if (width === null || height === null) return undefined;
  const [short, long] = width < height ? [width, height] : [height, width];
  return PAPERS.find((one) => one.width === short && one.height === long)?.id;
}

/**
 * 이 설정이 글을 놓을 자리를 남기는가.
 *
 * 여백의 합이 종이보다 넓으면 `layout.ts` 의 `contentHeight` 가 `Math.max(1, …)` 로 1px 을
 * 답한다 — 문서가 사라지지는 않지만 한 줄에 한 글자씩 수천 페이지가 된다. **그리는 쪽이 이미
 * 방어하고 있다는 것은 정할 때 막아야 한다는 뜻이다.**
 */
export function roomFor(setup: PageSetup): { across: number; down: number } | null {
  const { width, height, marginLeft, marginRight, marginTop, marginBottom, gutter, gutterAtTop } =
    setup;
  if (width === null || height === null) return null;

  const bind = gutter ?? 0;
  const across = width - (marginLeft ?? 0) - (marginRight ?? 0) - (gutterAtTop === true ? 0 : bind);
  const down = height - (marginTop ?? 0) - (marginBottom ?? 0) - (gutterAtTop === true ? bind : 0);
  return { across, down };
}

/** 남는 자리가 있는가 — 대화상자가 확인을 막는 조건. */
export function isUsable(setup: PageSetup): boolean {
  const room = roomFor(setup);
  return room !== null && room.across > 0 && room.down > 0;
}

/**
 * 구역에 쓸 속성.
 *
 * 혼합(`null`)은 쓰지 않는다 — 문단 간격과 같은 이유다. 그리고 **`orientation` 은 폭과 높이에서
 * 계산해서 쓴다**: 셋을 따로 두면 *가로*라고 적혀 있으면서 세로인 페이지가 생긴다.
 */
export function pageSetupPatch(setup: PageSetup): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const put = (name: string, value: number | boolean | null) => {
    if (value !== null) patch[name] = value;
  };

  put('pageWidth', setup.width);
  put('pageHeight', setup.height);
  put('marginTop', setup.marginTop);
  put('marginBottom', setup.marginBottom);
  put('marginLeft', setup.marginLeft);
  put('marginRight', setup.marginRight);
  put('marginGutter', setup.gutter);
  put('gutterAtTop', setup.gutterAtTop);
  put('columnCount', setup.columns);
  put('columnSpacing', setup.columnSpacing);
  put('columnSeparator', setup.columnSeparator);

  const facing = orientationOf(setup);
  if (facing) patch.orientation = facing;

  return patch;
}

/** 대화상자가 실제로 쓰는 속성 — 검사가 묻는 것. `pageSetupPatch` 에게 물어서 안다. */
export function pageSetupProperties(): string[] {
  return Object.keys(
    pageSetupPatch({
      width: TWIPS_PER_INCH,
      height: TWIPS_PER_INCH * 2,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      gutter: 0,
      gutterAtTop: false,
      columns: 1,
      columnSpacing: 0,
      columnSeparator: false
    })
  );
}
