/**
 * **문단 간격 대화상자가 아는 것** — 그리기도 리액트도 없는 순수한 부분.
 *
 * `word.md` 의 다섯 묶음 중 가장 작은 것: `spacingBefore`·`spacingAfter`·`spacingLine`·
 * `spacingLineRule`, 그리고 `contextualSpacing`. 다섯 다 `paragraphCss` 와 `spacing.ts` 가
 * 처음부터 그렸고 정할 곳이 없었다.
 *
 * ## 이 파일이 세우는 하나
 *
 * **줄 간격의 숫자는 규칙에 따라 단위가 다르다.** `paragraphCss` 가 이렇게 읽는다:
 *
 * ```ts
 * out.lineHeight = rule === 'auto' ? String(line / 240) : twipToCss(line);
 * ```
 *
 * `auto` 면 **240분의 1줄**(240 = 한 줄), 그 밖에는 **트윕**이다. 규칙만 바꾸고 숫자를 그대로 두면
 * 같은 360이 *1.5줄* 에서 *18pt* 로 뜻이 바뀐다. 12pt 글에서는 우연히 같은 값이지만 24pt 글에서는
 * 문단이 절반이 된다 — 그래서 이 파일은 **한 줄이 몇 트윕인지 물어서** 옮긴다. 짐작하지 않는다.
 */

/** Word 의 세 규칙. 파일에서 셋 다 들어올 수 있다. */
export type LineRule = 'auto' | 'atLeast' | 'exact';

/** `auto` 규칙의 단위 — 한 줄이 240. */
export const LINE_UNIT = 240;

/** 1pt = 20트윕. */
export const TWIPS_PER_POINT = 20;

/**
 * 고를 수 있는 규칙과 그 이름.
 *
 * **`exact` 는 없다.** `paragraphCss` 가 `atLeast` 와 `exact` 를 한 줄로 그린다 —
 * `twipToCss(line)` 하나이고, 그 결과인 CSS `line-height` 는 큰 글자가 들어오면 줄상자가
 * 커지므로 뜻이 **최소**다. 고르면 「최소」가 나오는 「고정」은 이름이 거짓인 항목이고,
 * 테두리에서 `thick` 과 `wave` 를 뺀 것과 같은 판단이다.
 *
 * 돌아올 조건은 하나: 줄상자를 자르는 그리기가 생기는 날. 그때까지 `exact` 는 파일에서
 * 들어올 수는 있으므로 `LineRule` 에는 남는다.
 */
export const LINE_RULES: readonly { rule: LineRule; label: string }[] = [
  { rule: 'auto', label: '배수' },
  { rule: 'atLeast', label: '최소' }
];

/** 독자가 이름으로 아는 줄 간격 — 배수 규칙일 때. */
export const LINE_PRESETS: readonly { label: string; lines: number }[] = [
  { label: '1줄', lines: 1 },
  { label: '1.15줄', lines: 1.15 },
  { label: '1.5줄', lines: 1.5 },
  { label: '2줄', lines: 2 }
];

/**
 * 지금 무엇이 정해져 있는가. `null` 은 **혼합** — 고른 문단들이 서로 다르게 답한다는 뜻.
 */
export interface SpacingState {
  /** 문단 앞, 트윕. */
  before: number | null;
  /** 문단 뒤, 트윕. */
  after: number | null;
  rule: LineRule | null;
  /** `rule` 이 `auto` 면 240분의 1줄, 아니면 트윕. */
  line: number | null;
  /** 같은 스타일의 문단끼리는 간격을 두지 않는다. */
  contextual: boolean | null;
}

export const NO_SPACING: SpacingState = {
  before: null,
  after: null,
  rule: null,
  line: null,
  contextual: null
};

type Attrs = Readonly<Record<string, unknown>>;

/** 모두 같으면 그 값, 다르면 `null`. 없는 것과 다른 것은 여기서 같게 다룬다 — 둘 다 *모름*이다. */
function agreed<T>(values: readonly (T | undefined)[]): T | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((one) => one === first) && first !== undefined ? first : null;
}

/** 고른 문단들이 지금 말하는 간격. */
export function spacingOf(blocks: readonly Attrs[]): SpacingState {
  if (blocks.length === 0) return NO_SPACING;
  const read = <T>(name: string): T | null =>
    agreed(blocks.map((attrs) => attrs[name] as T | undefined));

  return {
    before: read<number>('spacingBefore'),
    after: read<number>('spacingAfter'),
    rule: read<LineRule>('spacingLineRule'),
    line: read<number>('spacingLine'),
    contextual: read<boolean>('contextualSpacing')
  };
}

/**
 * 규칙을 바꾼다 — **숫자를 같은 뜻으로 옮기면서.**
 *
 * `lineTwips` 는 이 문단의 한 줄이 몇 트윕인가다. 12pt 글이면 240이고, 그때는 두 단위의 숫자가
 * 우연히 같아진다 — 그 우연 때문에 첫 판을 짐작으로 써도 통과할 뻔했다. 24pt 글에서는 1.5줄이
 * 720트윕이지 360이 아니다.
 *
 * 부르는 쪽이 실제 값을 줄 수 있으면 주고, 모르면 Word 의 기본인 12pt 를 쓴다 — **기본값이 여기
 * 하나 적혀 있는 것과, 계산 안에 숨어 있는 것은 다르다.**
 */
export function withRule(
  state: SpacingState,
  rule: LineRule,
  lineTwips: number = LINE_UNIT
): SpacingState {
  if (state.line === null || state.rule === rule) return { ...state, rule };

  const lines = state.rule === 'auto' ? state.line / LINE_UNIT : state.line / lineTwips;
  return {
    ...state,
    rule,
    line: Math.round(rule === 'auto' ? lines * LINE_UNIT : lines * lineTwips)
  };
}

/** 지금 줄 간격이 몇 줄인가 — 규칙이 무엇이든 하나의 답으로. 정해진 것이 없으면 `null`. */
export function linesOf(state: SpacingState, lineTwips: number = LINE_UNIT): number | null {
  if (state.line === null) return null;
  return state.rule === 'auto' ? state.line / LINE_UNIT : state.line / lineTwips;
}

/**
 * 문단에 쓸 속성.
 *
 * **혼합(`null`)은 쓰지 않는다.** 테두리와 다른 점이고, 다른 것이 맞다: 거기서 혼합인 *변*은
 * 켜거나 끄는 둘 중 하나여야 했지만, 여기서 혼합인 *숫자*는 독자가 건드리지 않은 값이다. 그것을
 * 0 으로 쓰면 고른 문단 중 절반의 간격이 조용히 사라진다.
 *
 * 그래서 `undefined` 인 키는 아예 넣지 않고, 명시적으로 지운 것만 `null` 로 넣는다.
 */
export function spacingPatch(state: SpacingState): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const put = (name: string, value: number | boolean | null) => {
    if (value !== null) patch[name] = value;
  };

  put('spacingBefore', state.before);
  put('spacingAfter', state.after);
  put('contextualSpacing', state.contextual);

  /**
   * 규칙과 값은 **함께** 쓴다. 하나만 쓰면 남은 하나가 옛 단위로 읽혀 문단이 열두 배가 된다 —
   * 이 파일 머리말의 그 하나.
   */
  if (state.rule !== null && state.line !== null) {
    patch.spacingLineRule = state.rule;
    patch.spacingLine = state.line;
  }

  return patch;
}

/** 대화상자가 실제로 쓰는 속성 — 검사가 묻는 것. `spacingPatch` 에게 물어서 안다. */
export function spacingProperties(): string[] {
  return Object.keys(
    spacingPatch({ before: 0, after: 0, rule: 'auto', line: LINE_UNIT, contextual: false })
  );
}
