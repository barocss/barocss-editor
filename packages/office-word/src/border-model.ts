/**
 * **테두리 대화상자가 아는 것** — 그리기도 리액트도 없는 순수한 부분.
 *
 * `word.md` 가 갚아야 할 것 다섯 묶음 중 첫째로 적어 둔 것이 이것이다: **`borderTop*` … `borderLeft*`,
 * 색·모양·두께·간격 열여섯 개.** 스키마는 `boxBorderAttrs()` 로 처음부터 갖고 있었고 `paragraphCss` 가
 * 처음부터 그렸다. 없던 것은 **독자가 그것을 정할 곳**이다.
 *
 * 계산이 여기 있는 이유는 이 저장소가 여러 번 확인한 것이다 — 대화상자 안에 든 산수는 브라우저를 켜야
 * 볼 수 있고, 밖에 나온 산수는 밀리초로 잰다.
 *
 * ## 이 파일이 세우는 하나
 *
 * **미리 설정은 네 변의 합이 아니다.** 문단에는 다섯째 테두리가 있다 — 같은 상자를 요구하는 두 문단이
 * 맞닿는 곳에 그려지는 `borderBetween` 이고, `sharedBorders` 가 그것을 결정한다. Word 의 「상자」는
 * *네 변을 켜고 사이 선을 끈다*. 「상자」가 사이 선을 그냥 두면, 「모두」를 눌렀다가 「상자」로 바꾼
 * 독자에게는 **지울 수 없는 선**이 남는다. 네 변을 독립된 넷으로 다루면 정확히 그 결함이 나온다.
 */

/** Word 가 저장하는 테두리 모양. `paragraphCss` 의 `BORDER_STYLE` 이 읽는 낱말 그대로. */
export type BorderStyle = 'none' | 'single' | 'thick' | 'double' | 'dashed' | 'dotted' | 'wave';

/** 문단이 가진 다섯 테두리. 앞의 넷은 상자의 변이고 마지막은 이웃과 맞닿는 자리다. */
export type BorderEdge = 'top' | 'bottom' | 'left' | 'right' | 'between';

export const BORDER_EDGES: readonly BorderEdge[] = ['top', 'bottom', 'left', 'right', 'between'];

/** 속성 이름의 앞머리 — `top` 은 `borderTop`, `between` 은 `borderBetween`. */
export const prefixOf = (edge: BorderEdge): string =>
  `border${edge.charAt(0).toUpperCase()}${edge.slice(1)}`;

/**
 * 두께의 사다리 — **8분의 1 포인트 단위**, Word 가 저장하는 그대로.
 *
 * 자유 입력이 아니라 사다리인 것은 Word 가 그렇기 때문만이 아니다. `borderCss` 가 `width / 8` 로
 * 나누므로 3 은 0.375pt 가 되고, 그것은 어느 화면에서도 ½pt 와 구분되지 않는다. 독자가 고를 수 있는
 * 값은 **눈으로 다른 값**이어야 한다.
 */
export const BORDER_WIDTHS: readonly { eighths: number; label: string }[] = [
  { eighths: 2, label: '¼pt' },
  { eighths: 4, label: '½pt' },
  { eighths: 6, label: '¾pt' },
  { eighths: 8, label: '1pt' },
  { eighths: 12, label: '1½pt' },
  { eighths: 18, label: '2¼pt' },
  { eighths: 24, label: '3pt' },
  { eighths: 36, label: '4½pt' },
  { eighths: 48, label: '6pt' }
];

/**
 * 고를 수 있는 모양과 그 이름.
 *
 * `wave` 와 `thick` 은 `BORDER_STYLE` 이 둘 다 `solid` 로 그린다 — 물결과 굵은 선을 CSS 로 그리는 일이
 * 아직 없기 때문이다. 그래서 **여기 없다.** 고르면 실선이 나오는 항목은 독자에게 거짓말이고, 그 둘은
 * 파일에서 들어올 수는 있어야 하므로 `BorderStyle` 에는 남는다.
 */
export const BORDER_STYLES: readonly { style: BorderStyle; label: string }[] = [
  { style: 'single', label: '실선' },
  { style: 'double', label: '이중선' },
  { style: 'dashed', label: '파선' },
  { style: 'dotted', label: '점선' }
];

/**
 * 지금 무엇이 켜져 있는가.
 *
 * `null` 은 **혼합**이다 — 고른 문단들이 서로 다르게 답한다는 뜻. `office-ui` 의 `select.tsx` 와
 * `property-sheet.tsx` 가 이미 그 약속으로 그린다(`value === null` 이면 혼합으로 표시).
 */
export interface BorderState {
  edges: Record<BorderEdge, boolean | null>;
  style: BorderStyle | null;
  /** 8분의 1 포인트. */
  width: number | null;
  /** `#` 없는 여섯 자리 16진수 — Word 가 저장하는 모양. */
  color: string | null;
  /** 테두리와 글 사이, 포인트. */
  space: number | null;
}

/** 아무 테두리도 없는 문단의 상태. 빈 선택에도 이것을 답한다. */
export const NO_BORDERS: BorderState = {
  edges: { top: false, bottom: false, left: false, right: false, between: false },
  style: null,
  width: null,
  color: null,
  space: null
};

type Attrs = Readonly<Record<string, unknown>>;

/** 값 하나 — 모두 같으면 그 값, 다르면 `null`(혼합), 아무것도 없으면 `undefined`. */
function agreed<T>(values: readonly (T | undefined)[]): T | null | undefined {
  const some = values.filter((one): one is T => one !== undefined);
  if (some.length === 0) return undefined;
  const first = some[0];
  return some.every((one) => one === first) && some.length === values.length ? first : null;
}

/** 한 변이 그려지는가 — 모양이 있고 그 모양이 `none` 이 아니어야. */
const drawn = (attrs: Attrs, edge: BorderEdge): boolean => {
  const style = attrs[`${prefixOf(edge)}Style`];
  return typeof style === 'string' && style !== 'none';
};

/**
 * 고른 문단들이 지금 말하는 테두리.
 *
 * 모양·두께·색·간격은 **그려지는 변에서만** 읽는다. 꺼진 변에 남아 있는 두께는 독자가 정한 것이
 * 아니라 지우다 남은 것이고, 그것을 혼합으로 세면 대화상자가 열리자마자 *혼합* 이라고 답한다.
 */
export function bordersOf(blocks: readonly Attrs[]): BorderState {
  if (blocks.length === 0) return NO_BORDERS;

  const edges = {} as Record<BorderEdge, boolean | null>;
  for (const edge of BORDER_EDGES) {
    const each = blocks.map((attrs) => drawn(attrs, edge));
    edges[edge] = each.every((one) => one) ? true : each.every((one) => !one) ? false : null;
  }

  /** 그려지는 변들이 말하는 값 하나. */
  const from = <T>(suffix: string): T | null => {
    const values: (T | undefined)[] = [];
    for (const attrs of blocks) {
      for (const edge of BORDER_EDGES) {
        if (!drawn(attrs, edge)) continue;
        values.push(attrs[`${prefixOf(edge)}${suffix}`] as T | undefined);
      }
    }
    return agreed(values) ?? null;
  };

  return {
    edges,
    style: from<BorderStyle>('Style'),
    width: from<number>('Width'),
    color: from<string>('Color'),
    space: from<number>('Space')
  };
}

/**
 * Word 의 미리 설정.
 *
 * **「그림자」와 「3차원」은 없다.** Word 97 이 그리던 것이고, 이 스키마에는 그림자를 적을 자리가
 * 없으며 그리는 쪽도 없다. 눌렀을 때 평범한 상자가 나오는 「그림자」는 이름이 거짓인 단추다 —
 * 없는 것을 없다고 두는 편이 낫다. 돌아올 조건은 하나: 상자 그림자가 스키마와 `paragraphCss` 에
 * 생기는 날.
 */
export type BorderPreset = 'none' | 'box' | 'all';

/**
 * 미리 설정을 지금 상태에 적용한다 — 모양·두께·색·간격은 **그대로 두고** 변만 바꾼다.
 *
 * 독자가 이중선 3pt 를 고르고 「상자」를 누르면 이중선 3pt 상자가 나와야 한다. 미리 설정이 값까지
 * 되돌리면 그 두 번의 선택 중 먼저 한 것이 조용히 사라진다.
 */
export function applyPreset(state: BorderState, preset: BorderPreset): BorderState {
  const on = preset !== 'none';
  return {
    ...state,
    edges: {
      top: on,
      bottom: on,
      left: on,
      right: on,
      /** 「상자」는 사이 선을 **끈다** — 이 파일 머리말의 그 하나. */
      between: preset === 'all'
    }
  };
}

/** 지금 상태가 어느 미리 설정과 같은가. 어느 것도 아니면 사용자 지정이다. */
export function presetOf(state: BorderState): BorderPreset | undefined {
  const { top, bottom, left, right, between } = state.edges;
  const box = top === true && bottom === true && left === true && right === true;
  /**
   * **`!top` 이 아니라 `top === false`.**
   *
   * `null` 은 혼합이고 `!null` 은 참이다. 앞의 판이 그렇게 쓰여 있었고, 그래서 서로 다른 문단을 함께
   * 고른 독자에게 대화상자가 「없음」을 켜고 열렸다 — *테두리가 없다* 고 말한 셈인데 그중 몇에는
   * 있었다. 검사가 먼저 잡았다.
   */
  const empty = BORDER_EDGES.every((edge) => state.edges[edge] === false);
  if (empty) return 'none';
  if (box && between === true) return 'all';
  if (box && between === false) return 'box';
  return undefined;
}

/**
 * 문단에 쓸 속성 — 켜진 변에는 넷을 다 쓰고, **꺼진 변에서는 넷을 다 지운다.**
 *
 * 지우는 쪽이 `'none'` 이 아니라 `null` 인 것은 두 가지 이유다. 스키마의 테두리 속성에는 기본값이
 * 없으므로 `null` 이 *말하지 않음*이고, `'none'` 은 *없다고 말함*이다 — 둘은 문단 서식이 스타일에서
 * 상속될 때 다르다. 그리고 모양만 지우고 두께를 남기면 파일에 `borderTopWidth: 48` 이 홀로 남아,
 * 다음에 그 변을 켜는 독자가 고르지 않은 6pt 를 얻는다.
 *
 * `null` 을 값으로 쓰는 것은 `list-commands.ts` 가 `numId: null` 로 목록을 빼는 것과 같은 약속이다.
 */
export function borderPatch(state: BorderState): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const edge of BORDER_EDGES) {
    const prefix = prefixOf(edge);
    if (state.edges[edge] !== true) {
      /**
       * 혼합(`null`)도 여기로 온다. 혼합인 채로 확인을 누르는 것은 *이 변은 꺼진 것으로 하자* 는
       * 뜻이고, 대화상자는 세 값(켬·끔·혼합)을 보여 주되 **두 값만 쓴다.**
       */
      patch[`${prefix}Style`] = null;
      patch[`${prefix}Width`] = null;
      patch[`${prefix}Color`] = null;
      patch[`${prefix}Space`] = null;
      continue;
    }
    patch[`${prefix}Style`] = state.style ?? 'single';
    patch[`${prefix}Width`] = state.width ?? 8;
    patch[`${prefix}Color`] = state.color ?? '000000';
    /** 간격은 정하지 않을 수 있다 — 0 과 *말하지 않음*은 다르고, 후자가 기본이다. */
    patch[`${prefix}Space`] = state.space ?? null;
  }

  return patch;
}

/**
 * **이 대화상자가 실제로 쓰는 속성 이름** — `every-property-can-be-edited` 가 묻는 것.
 *
 * 손으로 적은 열여섯 줄이 아니라 `borderPatch` **에게 물어서** 안다. 그것이 검사가 요구하는
 * 모양이다 — *"패널이 그려지는 바로 그 자료에서 읽고, 손으로 나열하지 않는다: 목록은 이 하네스가
 * 대신한 그 손으로 관리하던 백로그이고, 패널과 단지 일치하는 목록은 가서 확인해야 할 주장이 하나
 * 더 느는 것이다."*
 *
 * 그래서 대화상자가 어느 이름을 그만 쓰면 이 목록이 저절로 줄고, 검사가 그날 그것을 말한다.
 */
export function borderProperties(): string[] {
  const all: BorderState = {
    ...NO_BORDERS,
    edges: { top: true, bottom: true, left: true, right: true, between: true }
  };
  return Object.keys(borderPatch(all));
}
