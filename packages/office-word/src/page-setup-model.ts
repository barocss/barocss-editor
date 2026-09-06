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
 * **`pageWidth`·`pageHeight` 는 세운 상태의 두 변이고, `orientation` 이 눕히라는 지시다.**
 *
 * 그리는 쪽 넷이 모두 그렇게 읽는다 — `layout.ts:96`, `css.ts:381`(인쇄용 페이지 상자),
 * `css.ts:421`(`pageCss`), `canvas-insert.ts:141`. 넷 다 같은 두 줄이다:
 *
 * ```ts
 * const landscape = format.orientation === 'landscape';
 * const width = landscape ? rawHeight : rawWidth;
 * ```
 *
 * **첫 판은 반대로 알았다.** `layout.ts` 를 105줄부터 읽어 96줄의 `landscape` 를 놓쳤고, *방향은
 * 두 변의 관계이고 `orientation` 은 적어 두는 이름일 뿐*이라고 이 자리에 적었다. 그래서 가로를
 * 고르면 저장값을 맞바꾸고 이름도 적었고 — 그리는 쪽이 **한 번 더** 뒤집어 세로가 나왔다.
 * 브라우저의 `changes()` 가 *"종이의 모양이 바뀌지 않았습니다"* 로 잡았다.
 *
 * 그러니 방향을 바꾸는 것은 `orientation` 한 글자를 쓰는 일이고, 두 변은 건드리지 않는다.
 * 대신 **자리를 잴 때는 눕은 뒤의 두 변**으로 재야 한다 — 독자가 보는 것이 그것이므로.
 */

import { pageSetupAttrs } from '@barocss/office-text';

/**
 * 1인치 = 1440트윕.
 *
 * **`ruler.ts` 것을 쓴다.** 여기 자기 판을 선언했다가 배럴에서 이름이 겹쳤고, 그것이 이 저장소가
 * 반복해서 찾는 결함의 예고편이다 — `twipToPx` 가 두 패키지에 있었고 두 판이 다른 답을 냈다.
 * 같은 상수가 둘이면 언젠가 하나만 고쳐진다.
 */
export { TWIPS_PER_INCH } from './ruler';
import { TWIPS_PER_INCH } from './ruler';

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
  /** **세운 상태의** 폭, 트윕. `null` 은 혼합 — 고른 구역들이 서로 다르게 답한다. */
  width: number | null;
  /** 세운 상태의 높이. */
  height: number | null;
  orientation: Orientation | null;
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

/**
 * **적히지 않은 값은 스키마의 기본값이다** — 그리고 그 기본값은 **스키마에게 물어서** 안다.
 *
 * 시작 문서의 구역은 여백 넷만 적는다. 폭도 높이도 없다 — 스키마가 `pageWidth: num(12240)` 이라고
 * 선언했으므로 적을 필요가 없기 때문이다. 첫 판은 원시 속성만 읽어서 폭을 *혼합*으로 답했고,
 * 그러자 방향을 바꿔도 아무 일이 없었다(방향은 두 변의 관계인데 두 변을 몰랐으므로). 브라우저
 * 검사의 `changes()` 가 *"종이의 모양이 바뀌지 않았습니다 — 0.77 그대로입니다"* 로 잡았다.
 *
 * `layout.ts` 도 같은 답을 한다 — `num(format.marginTop, 1440)`. 다른 것은 저기는 숫자를 손으로
 * 적었고 여기는 **선언에서 읽는다**는 점이고, 그래서 스키마의 기본값이 바뀌는 날 저쪽만 낡는다.
 * 이 파일은 안 낡는다.
 */
const PAGE_DEFAULTS: Readonly<Record<string, unknown>> = Object.fromEntries(
  Object.entries(pageSetupAttrs())
    .map(([name, shape]) => [name, (shape as { default?: unknown }).default])
    .filter(([, value]) => value !== undefined)
);

function agreed<T>(values: readonly (T | undefined)[]): T | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((one) => one === first) && first !== undefined ? first : null;
}

/** 고른 구역들이 지금 말하는 페이지 — 적힌 것이 없으면 스키마가 말하는 것. */
export function pageSetupOf(surfaces: readonly Attrs[]): PageSetup {
  const read = <T>(name: string): T | null =>
    agreed(surfaces.map((attrs) => (attrs[name] ?? PAGE_DEFAULTS[name]) as T | undefined));

  return {
    width: read<number>('pageWidth'),
    height: read<number>('pageHeight'),
    orientation: read<Orientation>('orientation'),
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

/** 지금 방향 — 적힌 것 그대로. 스키마의 기본값이 `portrait` 이므로 보통 그것이 온다. */
export const orientationOf = (setup: PageSetup): Orientation | null => setup.orientation;

/** 방향을 바꾼다 — **한 글자를 쓴다.** 두 변은 세운 상태 그대로 둔다. */
export const withOrientation = (setup: PageSetup, want: Orientation): PageSetup => ({
  ...setup,
  orientation: want
});

/** 이름 있는 용지를 고른다 — 두 변은 세운 상태이므로 방향과 상관이 없다. */
export function withPaper(setup: PageSetup, paperId: string): PageSetup {
  const paper = PAPERS.find((one) => one.id === paperId);
  return paper ? { ...setup, width: paper.width, height: paper.height } : setup;
}

/** 지금 크기가 어느 용지인가. 어느 것도 아니면 사용자 지정. */
export function paperOf(setup: PageSetup): string | undefined {
  const { width, height } = setup;
  if (width === null || height === null) return undefined;
  return PAPERS.find((one) => one.width === width && one.height === height)?.id;
}

/**
 * **눕은 뒤의 두 변** — 독자가 실제로 보는 종이.
 *
 * 그리는 쪽 넷이 하는 그 두 줄이고, 여기서도 해야 하는 이유는 자리를 재는 데 쓰이기 때문이다:
 * 가로 A4 의 좌우 여백은 11906 이 아니라 16838 안에 들어가야 한다.
 */
export function drawnSize(setup: PageSetup): { width: number; height: number } | null {
  if (setup.width === null || setup.height === null) return null;
  return setup.orientation === 'landscape'
    ? { width: setup.height, height: setup.width }
    : { width: setup.width, height: setup.height };
}

/**
 * 이 설정이 글을 놓을 자리를 남기는가.
 *
 * 여백의 합이 종이보다 넓으면 `layout.ts` 의 `contentHeight` 가 `Math.max(1, …)` 로 1px 을
 * 답한다 — 문서가 사라지지는 않지만 한 줄에 한 글자씩 수천 페이지가 된다. **그리는 쪽이 이미
 * 방어하고 있다는 것은 정할 때 막아야 한다는 뜻이다.**
 */
export function roomFor(setup: PageSetup): { across: number; down: number } | null {
  const paper = drawnSize(setup);
  if (!paper) return null;
  const { marginLeft, marginRight, marginTop, marginBottom, gutter, gutterAtTop } = setup;

  const bind = gutter ?? 0;
  const across =
    paper.width - (marginLeft ?? 0) - (marginRight ?? 0) - (gutterAtTop === true ? 0 : bind);
  const down =
    paper.height - (marginTop ?? 0) - (marginBottom ?? 0) - (gutterAtTop === true ? bind : 0);
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
 * 혼합(`null`)은 쓰지 않는다 — 문단 간격과 같은 이유다. 셋(`pageWidth`·`pageHeight`·
 * `orientation`)은 **적힌 그대로** 쓴다: 그리는 쪽이 눕히는 일을 맡고 있으므로, 여기서 한 번 더
 * 계산하면 두 번 뒤집힌다. 그것이 첫 판의 결함이었다.
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
  if (setup.orientation !== null) patch.orientation = setup.orientation;

  return patch;
}

/** 대화상자가 실제로 쓰는 속성 — 검사가 묻는 것. `pageSetupPatch` 에게 물어서 안다. */
export function pageSetupProperties(): string[] {
  return Object.keys(
    pageSetupPatch({
      width: TWIPS_PER_INCH,
      height: TWIPS_PER_INCH * 2,
      orientation: 'portrait',
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
