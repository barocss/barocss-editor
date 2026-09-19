import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * **다크가 정말 *그려지는가*** — `not.toEqual` 이 아니라 값으로. 덱의 몫.
 *
 * ## 왜 이 파일이 따로 있나
 *
 * 옆의 `slide-theme.spec.ts` 가 단정하는 것은 둘뿐이다:
 *
 * ```
 * expect(dark.words).toEqual(light.words);        // 슬라이드 위의 글자는 안 움직였다
 * expect(dark.chrome).not.toEqual(light.chrome);  // 크롬은 움직였다
 * ```
 *
 * **무엇으로 움직였는지는 안 묻는다.** 팔레트가 두 벌 다 틀려도 — 라이트가 초록이고 다크가
 * 자홍이어도 — 통과한다. `not.toEqual` 은 *달라졌다* 는 주장이지 *맞다* 는 주장이 아니다.
 * `apps/site/tests/site-theme-values.spec.ts` 가 사이트 빌더에 대해 그 자리에 값을 놓았고, 이
 * 파일이 그 모양을 덱으로 옮긴 것이다 — 바뀌는 것은 아래 두 표뿐이다.
 *
 * ## 덱에서 그 두 표가 어떻게 달라지나 — **화살표가 반대다**
 *
 * 사이트는 `--ou-*` 위에 `--st-*` 여섯을 **얹는다**(별칭이 아래를 읽는다). 덱은 반대로 자기
 * `--sl-*` 여섯을 먼저 정하고 `--ou-*` 를 **거기에 매핑한다**(`apps/slide/src/style.css:159`).
 * 그래서 여기서 재는 것은 *제품이 라이브러리를 가져가는 방향* 이고, 그 방향에서만 나는 결함이
 * 실제로 났다 — 그 파일 `:136` 이 길게 적어 두었다: 매핑이 `:root` 에만 있던 동안 다크 시스템에서
 * `office-ui` 의 `:root:not([data-theme='light'])` **(0,2,0)** 이 앱의 `:root` **(0,1,0)** 을 이겨서
 * **덱이 팔레트 두 벌로 동시에 돌았다** — `#1b1f27` 패널 옆에 `#171717` 패널, `#2b313c` 선 옆에
 * `#404040` 선. 그것을 본 검사는 하나도 없었다. `shared-controls.spec.ts` 는 `--ou-line` 이 덱의
 * `#d8dce4` 라고 단정하며 통과했다 — 기본 색 구성표가 라이트라서.
 *
 * 그러니 이 파일의 세 번째 검사(`여섯 매핑은 …`)가 이 제품에서 가장 중요한 줄이다.
 *
 * ## 네 상태, 그리고 왜 넷인가
 *
 * 테마에는 둘이 아니라 셋이 있다 — 시스템을 따르는 기본값은 `data-theme` 를 **안 찍고**,
 * 명시적 선택은 찍는다. 그 둘의 곱이 넷이고, 그 넷이 `dark-is-actually-read` 가 계산하는 표와
 * 같은 넷이다:
 *
 * | | `prefers-color-scheme` | `data-theme` |
 * |---|---|---|
 * | 시스템 라이트 | light | 없음 |
 * | 시스템 다크 | dark | 없음 |
 * | 명시적 다크 | light | `dark` |
 * | 명시적 라이트 | dark | `light` |
 *
 * **명시적 둘이 반대 시스템 위에 앉는 것이 요점이다.** 같은 시스템 위에서 찍으면 미디어 블록이
 * 이미 답을 내고 있어서 `[data-theme]` 블록이 죽어 있어도 통과한다. 덱에서 이것은 가정이 아니라
 * 이미 일어난 일이다: `style.css:91` 이 적은 그대로, `[data-theme='dark']` 블록이 없던 동안
 * **라이트 기계에서 다크를 명시하면 덱의 스위치가 죽었다.**
 *
 * ## `data-theme` 는 이 검사가 찍는다
 *
 * `apps/slide/src` 에 `documentElement` 를 만지는 코드는 **없다** — 이 제품에도 아직 테마 스위치가
 * 없고, 있는 것은 그 스위치가 붙을 자리인 네 갈래 매핑뿐이다. 여기서 `addInitScript` 로 첫 페인트
 * 전에 찍는 자리가 그 스위치의 자리다.
 *
 * ## 안 도는 채로 커밋된다
 *
 * 포트가 하나뿐이라 이 회차의 에이전트는 playwright 를 못 돈다. 이 파일이 처음 도는 것은
 * 조율자의 손에서다. **처음 빨간 줄이 나오면 그것이 발견이지 이 파일의 오타가 아니라는 것을**
 * 아래 값들이 어디서 왔는지로 확인할 수 있게 적어 두었다: `--sl-*` 열둘은
 * `apps/slide/src/style.css:76-133` 에서, `--ou-*` 중 매핑되지 않은 셋은
 * `packages/office-ui/src/tokens.css` 에서 그대로 옮겼고, 대비 여섯 쌍은 넣기 전에 네 상태 모두에서
 * 4.5 를 넘는 것을 리터럴로 계산해 확인했다.
 */

/* ── 팔레트, 그것을 소유한 두 파일이 적은 그대로 ───────────────────────────── */

/**
 * `--sl-*` — `apps/slide/src/style.css`.
 *
 * 라이트는 맨 `:root` 블록(`:76`), 다크는 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`
 * (`:102`)과 `[data-theme='dark']`(`:117`) 두 블록, 그리고 `[data-theme='light']`(`:126`)이 라이트를
 * 다시 말한다. 세 블록이 값이 같아야 한다는 것이 `dark-is-actually-read` 의 정리이고, 여기서는
 * **그린 것** 을 묻는 것이므로 한 벌씩만 적는다.
 */
const SL = {
  light: {
    '--sl-ground': '#eef0f4',
    '--sl-panel': '#ffffff',
    '--sl-line': '#d8dce4',
    '--sl-ink': '#1e2430',
    '--sl-muted': '#6b7480',
    '--sl-accent': '#2563eb'
  },
  dark: {
    '--sl-ground': '#14171d',
    '--sl-panel': '#1b1f27',
    '--sl-line': '#2b313c',
    '--sl-ink': '#e6e9ef',
    '--sl-muted': '#98a1b0',
    '--sl-accent': '#6f9bff'
  }
} as const;

/**
 * `--ou-*` — 여섯은 위의 것을 받아 적은 것이고, 셋은 `packages/office-ui/src/tokens.css` 의 기본값이다.
 *
 * 값은 `--sl-*` 의 것과 같아야 한다 — 매핑이니까. 그런데 **같다고 적는 대신 옮겨 적는다**:
 * `SL.dark['--sl-panel']` 을 참조하면 두 파일이 어긋난 날 이 검사가 같이 어긋나 조용해진다.
 * (같은 이유로 셋째 검사가 *같음* 자체를 따로 묻는다 — 그건 브라우저에서 읽은 값끼리 비교한다.)
 *
 * **`--ou-faint` 는 없다.** 덱은 그것을 `color-mix(in srgb, var(--sl-muted) 65%, var(--sl-panel))`
 * 로 만든다(`style.css:174`, *숫자 옆의 단위는 라벨보다 조용하다*). 계산된 값이 브라우저마다
 * `color(srgb …)` 로 나오기도 하고 `oklab(…)` 로 나오기도 해서, 리터럴로 적으면 이 검사는 팔레트가
 * 아니라 크로미움 버전을 붙잡게 된다. `--ou-accent-soft` · `--ou-warn-soft` 도 같은 이유로 없다.
 *
 * **`--ou-studio` · `--ou-board-ink` 도 없다** — 덱은 자기 무대를 `--sl-ground` 로 칠하고 슬라이드의
 * 이름표를 필름스트립에 두므로, 그 둘은 이 제품에서 아무 픽셀도 아니다. 선언은 되어 있으니 넣으면
 * 통과하지만, 그러면 이 파일은 덱에 대해 아무 말도 안 하는 줄을 두 개 갖게 된다.
 */
const OU = {
  light: {
    '--ou-panel': '#ffffff',
    '--ou-ground': '#f5f5f5',
    '--ou-line': '#d4d4d4',
    '--ou-ink': '#171717',
    '--ou-muted': '#6b6b6b',
    '--ou-accent': '#2563eb',
    /**
     * **매핑되지 않은 셋** — 그리고 그 셋이 이 파일에서 가장 조용한 결함을 지킨다.
     *
     * 덱은 악센트를 `--sl-accent` 로 바꿔 놓고(다크에서 `#3b82f6`, 이 파일보다 밝은 파랑) *그 위에
     * 무엇을 쓰는가* 는 매핑하지 않는다 — 그럴 이유가 없다, 그런 토큰이 있는 줄 모르니까. 잉크가
     * 네 상태 모두 흰색이던 동안 다크의 눌린 토글과 기본 단추는 **`#ffffff` on `#3b82f6` = 2.69:1**
     * 이었다. `tokens.css` 가 다크에서 잉크를 `#171717` 로 뒤집으면서 그 자리가 6.67:1 이 된다 —
     * 덱은 한 글자도 바꾸지 않고. 그것이 매핑되지 않은 토큰이 하는 일이고, 이 줄이 그것을 지킨다.
     *
     * `--ou-board` · `--ou-board-written` 은 **테마를 따르지 않는다.** `tokens.css` 가 이유를 적어
     * 두었다: *종이는 테마를 따르지 않는다.* 두 값이 라이트와 다크에 **같게** 적혀 있는 것이 그
     * 주장이고, `not.toEqual` 로는 절대 할 수 없는 주장이다 — 오히려 그 단정 아래에서는 종이가
     * 따라 움직여도 통과한다.
     */
    '--ou-accent-ink': '#ffffff',
    '--ou-board': '#ffffff',
    '--ou-board-written': '#1a1a1a'
  },
  dark: {
    '--ou-panel': '#171717',
    '--ou-ground': '#0a0a0a',
    '--ou-line': '#404040',
    '--ou-ink': '#fafafa',
    '--ou-muted': '#a3a3a3',
    '--ou-accent': '#3b82f6',
    '--ou-accent-ink': '#171717',
    '--ou-board': '#ffffff',
    '--ou-board-written': '#1a1a1a'
  }
} as const;

const TOKENS = {
  light: { ...SL.light, ...OU.light } as Record<string, string>,
  dark: { ...SL.dark, ...OU.dark } as Record<string, string>
};

const TOKEN_NAMES = Object.keys(TOKENS.light);



/**
 * **어느 요소의 어느 속성** — 이름이 값을 갖는 것과 그 값이 픽셀에 도착하는 것은 다른 질문이다.
 *
 * 토큰이 옳은 채로 화면이 틀리는 길은 둘이다: 그 이름을 아무도 읽지 않거나(선택자 오타, 규칙이
 * 다른 규칙에 짐), `var()` 가 값 없는 이름을 가리켜 **선언 전체가 무효**가 되거나. 두 번째는
 * 조용하다.
 *
 * 열한 자리는 선언이 있는 자리에서 골랐고, **세 층에서** 가져왔다 — 그리고 세 층인 것이 요점이다:
 *
 * 1. **앱** — `apps/slide/src/style.css` 가 `--sl-*` 를 직접 읽는 자리(창, 상단 띠, 개수).
 * 2. **제품 셸** — `packages/office-slides/src/ui.css` 가 `var(--ou-…, 폴백)` 으로 읽는 자리
 *    (필름스트립, 슬라이드 위의 글자). 여기가 매핑이 끊기면 조용히 **폴백** 으로 그려지는 자리다:
 *    `var(--ou-panel, #ffffff)` 는 매핑이 죽어도 흰색을 낸다 — 라이트에서는 정답과 구별되지 않고
 *    다크에서만 틀린다. 그 파일이 그렇게 쓰인 이유는 덱 없이도 그려져야 하기 때문이고, 그 대가가
 *    이 침묵이다.
 * 3. **공유 부품** — `office-ui` 의 `Toolbar` 자신. `.sl-toolbar` 의 배경과 아래 실선은
 *    `bg-[color:var(--ou-panel)]` · `border-[color:var(--ou-line)]` 이라는 **Tailwind 임의값**이고
 *    (`packages/office-ui/src/toolbar.tsx:77-78`), Tailwind v4 는 그것을 `@layer utilities` 안에
 *    넣는다. `dark-is-actually-read` 의 파서는 `@layer` 를 그냥 통과시키므로 — 그 파일이 사이트
 *    스펙 주석에서 스스로 그렇게 적었다 — **레이어가 걸린 자리를 실제로 확인하는 것은 브라우저
 *    검사뿐이다.** 그리고 2와 3이 나란히 있는 것이 위에서 말한 *팔레트 두 벌* 을 잡는 모양이다:
 *    같은 두 토큰을 서로 다른 두 파일이 읽는다.
 */
const PAINTED = [
  /* 창 자체 — `apps/slide/src/style.css:185·186`. */
  { at: 'body', prop: 'backgroundColor', token: '--sl-ground', says: '창 바닥' },
  { at: 'body', prop: 'color', token: '--sl-ink', says: '창의 글자' },
  /* 상단 띠 — `style.css:213·214`. */
  { at: '.sl-topbar', prop: 'backgroundColor', token: '--sl-panel', says: '상단 띠' },
  { at: '.sl-topbar', prop: 'borderBottomColor', token: '--sl-line', says: '상단 띠 아래 실선' },
  /* 슬라이드 개수 — `style.css:226`. 앱이 `--sl-*` 를 글자에 쓰는 유일한 자리. */
  { at: '.sl-count', prop: 'color', token: '--sl-muted', says: '슬라이드 개수' },
  /* 공유 부품이 스스로 그리는 두 면 — `office-ui/src/toolbar.tsx:77·78`. */
  { at: '.sl-toolbar', prop: 'backgroundColor', token: '--ou-panel', says: '리본' },
  { at: '.sl-toolbar', prop: 'borderBottomColor', token: '--ou-line', says: '리본 아래 실선' },
  /* 필름스트립 — `office-slides/src/ui.css:88·89·138`. 제품 셸이 매핑을 읽는 자리. */
  { at: '.sl-filmstrip', prop: 'backgroundColor', token: '--ou-panel', says: '필름스트립' },
  { at: '.sl-sidebar', prop: 'borderRightColor', token: '--ou-line', says: '통합 탐색 패널의 모서리' },
  { at: '.sl-filmstrip-number', prop: 'color', token: '--ou-muted', says: '필름스트립의 번호' },
  /*
   * 그리고 슬라이드 위의 글자 — `office-slides/src/ui.css:80`. 네 상태에서 **안 움직여야** 하는 것.
   *
   * 이 한 줄이 `slide-theme.spec.ts` 를 처음 돌렸을 때 빨갛던 그 자리다: 흰 슬라이드 위의 23개
   * 런이 테마를 따라 움직였고, 다크에서 흰 것 위의 흰 글자였다. 그때 붙인 것이 이 선언이고,
   * 이 줄은 그것이 **어느 값으로** 고정됐는지를 묻는다.
   */
  { at: '.sl-slide', prop: 'color', token: '--ou-board-written', says: '슬라이드 위의 글자' }
] as const;

/* ── 색 산수 — 브라우저가 아니라 여기서 ──────────────────────────────────── */

const rgbOf = (hex: string) => {
  const h = hex.replace('#', '');
  return `rgb(${[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
};

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string) => {
  const h = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`색이 아니다: '${hex}'`);
  const [r, g, b] = [0, 2, 4].map((i) => linear(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (ink: string, ground: string) => {
  const a = luminance(ink);
  const b = luminance(ground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * **읽히는가** — 두 팔레트가 서로 다르기만 한 것이 아니라 각각 안에서 읽히는가.
 *
 * 여섯 쌍뿐이고, 여섯 다 **양쪽 테마에서 4.5 를 넘는 것을 리터럴로 계산해 확인한 뒤** 넣었다.
 * 덱의 팔레트는 `office-ui` 의 기본값보다 대비가 얕다 — `--sl-muted` 는 자기 패널 위에서 4.74 로,
 * `--ou-muted` 의 5.33 보다 낮다. 그러니 여기 있는 여섯은 여유가 큰 쌍이 아니라 겨우 넘는 쌍을
 * 포함하고, 팔레트를 한 걸음만 밝히면 빨개진다. 그게 이 검사가 원하는 민감도다.
 *
 * **일부러 뺀 하나**, 결함 보고감이다. 여기 넣으면 이 파일이 처음 도는 순간 빨개지는데, 그러면
 * 읽는 사람이 *스펙이 틀렸나* 를 먼저 의심한다. 그래서 숫자로 적어 백로그에 넘긴다:
 *
 * - `--sl-muted` on `--sl-ground` — 라이트 **4.15**, 다크 6.89. 라이트만 미달이고, 고칠 곳은
 *   `apps/slide/src/style.css:80` 의 `#6b7480` 한 줄이다. 지금 그 조합으로 그려지는 면을
 *   찾지는 못했다(개수와 번호는 둘 다 패널 위에 있다) — 그래서 *지금 안 읽히는 글자* 가 아니라
 *   *다음에 무대 위에 라벨을 놓는 사람이 밟을 자리* 로 적어 둔다.
 */
const LEGIBLE: { ink: string; ground: string }[] = [
  { ink: '--sl-ink', ground: '--sl-panel' },
  { ink: '--sl-ink', ground: '--sl-ground' },
  { ink: '--sl-muted', ground: '--sl-panel' },
  { ink: '--sl-accent', ground: '--sl-panel' },
  { ink: '--ou-accent-ink', ground: '--ou-accent' },
  { ink: '--ou-board-written', ground: '--ou-board' }
];

/* ── 페이지를 여는 법 ─────────────────────────────────────────────────────── */

type Seen = {
  /** 뿌리에 찍힌 것 — 앱이 지우지 않았는지 확인하려고 되읽는다. */
  stamped: string | null;
  /** 이름 → 계산된 커스텀 프로퍼티. `var()` 는 이미 치환된 뒤다. */
  tokens: Record<string, string>;
  /** `'body backgroundColor'` → `'rgb(238, 240, 244)'`. */
  painted: Record<string, string>;
};

const key = (one: { at: string; prop: string }) => `${one.at} ${one.prop}`;

/**
 * 걸음과 기다림은 `slide-theme.spec.ts` 의 것을 그대로 쓴다. 두 파일이 같은 화면을 서로 다르게
 * 열면 한쪽이 조용히 다른 화면을 재게 된다. 더한 것은 리본과 필름스트립을 기다리는 두 줄뿐이다 —
 * 둘 다 PAINTED 에 있으니, 없는 채로 재면 `'그려지지 않았다'` 가 나오고 그건 팔레트에 대한
 * 발견이 아니라 이 파일의 조급함이다.
 */
async function open(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.sl-slide');
  await page.waitForSelector('.sl-toolbar');
  await page.waitForSelector('.sl-filmstrip-number');
  await page.waitForTimeout(1500);
}

async function read(page: Page, names: string[], painted: readonly { at: string; prop: string }[]) {
  return page.evaluate(
    ({ names, painted }) => {
      const root = document.documentElement;
      const rootStyle = getComputedStyle(root);
      const tokens: Record<string, string> = {};
      for (const name of names) tokens[name] = rootStyle.getPropertyValue(name).trim().toLowerCase();
      const drawn: Record<string, string> = {};
      for (const one of painted) {
        const el = document.querySelector(one.at) as HTMLElement | null;
        drawn[`${one.at} ${one.prop}`] = el
          ? (getComputedStyle(el) as unknown as Record<string, string>)[one.prop]
          : '그려지지 않았다';
      }
      return { stamped: root.getAttribute('data-theme'), tokens, painted: drawn };
    },
    { names, painted: painted.map((one) => ({ at: one.at, prop: one.prop })) }
  );
}

/**
 * 서브트리 하나에 테마를 찍고 **그 요소에서** 되읽는다.
 *
 * 테마 경계는 현재 통합 탐색 패널인 `.sl-sidebar`다. `apps/slide/src/style.css:153` 이 매핑을 네 갈래로 쓴 이유를
 * *네 갈래인 이유* 라는 제목으로 적어 두었고, 그 문단이 말하는 상황이 정확히 이것이다: 서브트리에
 * `data-theme` 를 찍으면 `tokens.css` 의 `[data-theme='dark']` 가 그 요소에 `--ou-*` 를 **직접**
 * 선언하는데, 앱의 매핑이 그 요소에 없으면 그 서브트리만 패키지 팔레트로 칠해진다 — 뿌리에서 고친
 * *팔레트 두 벌* 이 한 층 아래에서 그대로 반복된다. 그 주장을 브라우저에 물어보는 검사는
 * 지금까지 하나도 없었다. 그리고 탐색 패널의 두 선언이 **사용 지점에서** 토큰을 읽으므로,
 * 찍은 테마가 안 닿으면 픽셀에서 바로 보인다.
 */
async function island(page: Page, theme: 'light' | 'dark', names: string[]) {
  return page.evaluate(
    ({ theme, names }) => {
      const strip = document.querySelector('.sl-sidebar') as HTMLElement | null;
      if (!strip) return null;
      strip.setAttribute('data-theme', theme);
      const style = getComputedStyle(strip);
      const tokens: Record<string, string> = {};
      for (const name of names) tokens[name] = style.getPropertyValue(name).trim().toLowerCase();
      const seen = {
        tokens,
        painted: { background: style.backgroundColor, border: style.borderRightColor },
        /* 그리고 뿌리는 안 움직였는가 — 섬이지 문서 전체가 아니다. */
        rootPanel: getComputedStyle(document.documentElement)
          .getPropertyValue('--ou-panel')
          .trim()
          .toLowerCase()
      };
      strip.removeAttribute('data-theme');
      return seen;
    },
    { theme, names }
  );
}

/* ── 네 상태를 한 번 읽고, 나머지는 다 단정이다 ──────────────────────────── */

const seen: Record<string, Seen> = {};
let lightIsland: Awaited<ReturnType<typeof island>> = null;
let darkIsland: Awaited<ReturnType<typeof island>> = null;

test.describe.configure({ mode: 'serial' });

test.describe('덱의 팔레트는 네 상태에서 값으로 옳다', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    /* 네 번 열고 두 번 더 재는 훅이다. 30초는 이 훅의 것이 아니다. */
    test.setTimeout(240_000);

    const states = [
      { name: 'systemLight', scheme: 'light' as const, theme: null },
      { name: 'systemDark', scheme: 'dark' as const, theme: null },
      { name: 'explicitDark', scheme: 'light' as const, theme: 'dark' as const },
      { name: 'explicitLight', scheme: 'dark' as const, theme: 'light' as const }
    ];

    for (const state of states) {
      const ctx = await browser.newContext({
        colorScheme: state.scheme,
        viewport: { width: 1500, height: 950 }
      });
      const page = await ctx.newPage();
      if (state.theme) {
        /*
         * 첫 페인트 **전에** 찍는다. 로드 후에 찍어도 커스텀 프로퍼티는 다시 계산되지만, 그러면
         * 이 검사는 *앱이 그 표시를 지우지 않는가* 를 못 묻는다. 그 질문이 여기 있는 이유는
         * 이 제품에 아직 스위치가 없어서다 — 생기는 날 이 자리가 그 스위치의 자리다.
         *
         * `document_start` 에 `documentElement` 가 있다는 보장이 없어서 두 번 시도한다.
         */
        await page.addInitScript((theme) => {
          const stamp = () => document.documentElement?.setAttribute('data-theme', theme);
          stamp();
          document.addEventListener('DOMContentLoaded', stamp);
        }, state.theme);
      }
      await open(page);
      seen[state.name] = await read(page, TOKEN_NAMES, PAINTED);

      /* 섬은 반대 방향으로만 의미가 있다 — 다크 문서 안의 라이트, 라이트 문서 안의 다크. */
      if (state.name === 'systemDark') lightIsland = await island(page, 'light', TOKEN_NAMES);
      if (state.name === 'systemLight') darkIsland = await island(page, 'dark', TOKEN_NAMES);

      await ctx.close();
    }
  });

  /**
   * 먼저 **읽긴 읽었는가.** 아래 단정이 전부 `'그려지지 않았다'` 를 서로 비교하며 초록일 수는
   * 없어야 한다 — 선택자가 낡으면 그 사실이 여기서 나온다. 덱에서 값싼 검사가 아니다: 리본과
   * 필름스트립은 **발표 중에 사라지고**(`ui.css:432`), 상단 띠도 그렇다(`style.css:253`).
   * 발표 상태로 열린 화면을 재면 열한 자리 중 다섯이 없다.
   */
  test('네 상태를 다 열었고, 열한 자리가 다 그려져 있다', () => {
    expect(Object.keys(seen).sort()).toEqual([
      'explicitDark',
      'explicitLight',
      'systemDark',
      'systemLight'
    ]);
    for (const [name, state] of Object.entries(seen)) {
      for (const one of PAINTED) {
        expect(state.painted[key(one)], `${name}: ${one.says} (${one.at})`).not.toBe(
          '그려지지 않았다'
        );
      }
      for (const token of TOKEN_NAMES) {
        expect(state.tokens[token], `${name}: ${token}`).toBeTruthy();
      }
    }
    /* 그리고 표시는 우리가 찍은 대로 남아 있다 — 앱이 지우지 않았다. */
    expect(seen.systemLight.stamped).toBeNull();
    expect(seen.systemDark.stamped).toBeNull();
    expect(seen.explicitDark.stamped).toBe('dark');
    expect(seen.explicitLight.stamped).toBe('light');
  });

  /**
   * **이름이 값을 갖는가** — 네 상태 각각에서, 열다섯 개.
   *
   * `dark-is-actually-read` 가 소스에서 계산한 것과 같은 답이 브라우저에서도 나오는가를 묻는다.
   * 두 검사가 어긋나면 어긋난 쪽이 발견이다: 소스 검사가 못 보는 것이 실제로 있다 —
   * `@layer`(Tailwind v4 가 `@import "tailwindcss"` 로 들여온다)는 명시도보다 먼저 걸리는데,
   * 그 파서는 `@layer` 를 그냥 통과시킨다.
   */
  test('열다섯 토큰이 네 상태에서 각각 자기 값을 갖는다', () => {
    const wanted = {
      systemLight: TOKENS.light,
      explicitLight: TOKENS.light,
      systemDark: TOKENS.dark,
      explicitDark: TOKENS.dark
    };
    const wrong: string[] = [];
    for (const [name, table] of Object.entries(wanted)) {
      for (const [token, hex] of Object.entries(table)) {
        const got = seen[name].tokens[token];
        if (got !== hex.toLowerCase()) wrong.push(`${name}: ${token} — 원한 '${hex}', 받은 '${got}'`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('공유 도구 색상은 슬라이드 캔버스 팔레트와 독립적이다', () => {
    for (const state of Object.values(seen)) {
      expect(state.tokens['--ou-ground']).not.toBe(state.tokens['--sl-ground']);
      expect(state.tokens['--ou-line']).not.toBe(state.tokens['--sl-line']);
    }
  });

  /**
   * **그리고 그 값이 픽셀에 도착하는가.**
   *
   * 토큰이 옳고 화면이 틀린 경우가 이 저장소에 이미 있다: 사이트 빌더의 `--st-*` 여섯이 `:root`
   * 에서만 옳고 79개 선언이 그 스냅샷을 들고 있었다. 이름만 묻는 검사는 그때 초록이었다.
   *
   * 덱에서는 여기에 폴백이 하나 더 있다: `office-slides/ui.css` 는 전부 `var(--ou-…, 리터럴)` 로
   * 쓰여 있어서, 매핑이 끊겨도 **라이트 값** 이 나온다. 위의 셋째 검사와 이 검사가 함께 있어야
   * 그 침묵이 깨진다 — 하나는 이름이 끊긴 것을, 하나는 면이 폴백으로 칠해진 것을 본다.
   */
  test('열한 면이 자기가 부르는 토큰의 색으로 칠해진다', () => {
    const wanted = {
      systemLight: 'light',
      explicitLight: 'light',
      systemDark: 'dark',
      explicitDark: 'dark'
    } as const;
    const wrong: string[] = [];
    for (const [name, which] of Object.entries(wanted)) {
      for (const one of PAINTED) {
        const hex = TOKENS[which][one.token];
        const got = seen[name].painted[key(one)];
        if (got !== rgbOf(hex))
          wrong.push(`${name}: ${one.says} — ${one.token} 은 ${rgbOf(hex)}, 받은 '${got}'`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * **스위치가 양쪽으로 돈다** — 명시적 다크는 시스템 다크와, 명시적 라이트는 시스템 라이트와
   * 같은 화면이어야 한다.
   *
   * 덱에서 이것은 가정이 아니다. `style.css:91` 이 적어 둔 그대로, `[data-theme='dark']` 블록이
   * 없던 동안 **라이트 기계에서 다크를 명시하면 `--sl-*` 는 라이트로 남고** 매핑의
   * `:root:not([data-theme='light'])` **(0,2,0)** 이 `tokens.css` 의 `[data-theme='dark']`
   * **(0,1,0)** 을 이겨서 그 라이트 값을 `--ou-*` 에 밀어 넣었다 — 스위치가 죽는다. 그 화면을
   * 실제로 열어 재는 것은 이 검사가 처음이다.
   */
  test('명시적 테마는 같은 이름의 시스템 테마와 픽셀까지 같다', () => {
    expect(seen.explicitDark.painted).toEqual(seen.systemDark.painted);
    expect(seen.explicitDark.tokens).toEqual(seen.systemDark.tokens);
    expect(seen.explicitLight.painted).toEqual(seen.systemLight.painted);
    expect(seen.explicitLight.tokens).toEqual(seen.systemLight.tokens);
  });

  /**
   * 그리고 두 팔레트가 정말 두 벌이다 — 위가 다 통과하면 자동이지만, 적어 두면 읽힌다.
   * `slide-theme.spec.ts` 가 하던 단정이 이 한 줄이고, 이 파일의 나머지가 그 한 줄이 못 하던 것이다.
   */
  test('라이트와 다크는 같은 화면이 아니다', () => {
    expect(seen.systemDark.painted).not.toEqual(seen.systemLight.painted);
  });

  /**
   * **다크 문서 안의 라이트 섬, 그리고 그 거울상.**
   *
   * 이 저장소가 이 결함을 두 번 겪었다. 한 번은 `office-ui/tokens.css` 에 `[data-theme='light']`
   * 규칙이 **한 줄도 없어서** — `:not([data-theme='light'])` 방패는 뿌리에서 다크를 *사양* 하는
   * 것이지 라이트로 *가는* 것이 아니다. 한 번은 `office-site/ui.css` 가 다크 짝만 갖고 있어서,
   * `--ou-*` 는 라이트로 돌아오고 별칭 여섯은 다크에 남았다.
   *
   * 두 결함 다 브라우저 검사 셋을 통과했다. 그 셋이 뿌리만 봤기 때문이다.
   *
   * 덱에는 이 자리가 이미 예약되어 있다: 발표자 화면과 *다른 테마의 미리보기* 를 위해
   * `style.css:114` 가 두 `[data-theme]` 블록을 뿌리 아닌 곳에도 걸어 두었고, 매핑도 같은 이유로
   * 네 갈래다. 그 네 갈래가 실제로 작동하는지를 묻는 것이 이 두 검사다.
   */
  test('다크 문서 안에 라이트 섬을 만들면 열다섯이 다 라이트로 돌아온다', () => {
    expect(lightIsland, '.sl-sidebar 를 못 찾았다').not.toBeNull();
    const got = lightIsland!;
    const wrong: string[] = [];
    for (const [token, hex] of Object.entries(TOKENS.light)) {
      if (got.tokens[token] !== hex.toLowerCase())
        wrong.push(`${token} — 원한 '${hex}', 받은 '${got.tokens[token]}'`);
    }
    expect(wrong).toEqual([]);
    expect(got.painted.background).toBe(rgbOf(OU.light['--ou-panel']));
    expect(got.painted.border).toBe(rgbOf(OU.light['--ou-line']));
    /* 섬이지 문서가 아니다 — 뿌리는 다크 그대로다. */
    expect(got.rootPanel).toBe(OU.dark['--ou-panel']);
  });

  test('라이트 문서 안에 다크 섬을 만들면 열다섯이 다 다크로 간다', () => {
    expect(darkIsland, '.sl-sidebar 를 못 찾았다').not.toBeNull();
    const got = darkIsland!;
    const wrong: string[] = [];
    for (const [token, hex] of Object.entries(TOKENS.dark)) {
      if (got.tokens[token] !== hex.toLowerCase())
        wrong.push(`${token} — 원한 '${hex}', 받은 '${got.tokens[token]}'`);
    }
    expect(wrong).toEqual([]);
    expect(got.painted.background).toBe(rgbOf(OU.dark['--ou-panel']));
    expect(got.painted.border).toBe(rgbOf(OU.dark['--ou-line']));
    expect(got.rootPanel).toBe(OU.light['--ou-panel']);
  });

  /**
   * **읽히는가** — 값이 표와 같다는 것과 그 값들이 서로 읽힌다는 것은 다른 주장이다.
   *
   * 브라우저에서 읽은 토큰으로 계산한다. 표의 리터럴로 계산하면 이 검사는 산술 단위 검사이지
   * 브라우저 검사가 아니다 — 그건 `packages/conformance` 의 일이다.
   *
   * 다섯째 쌍(`--ou-accent-ink` on `--ou-accent`)이 이 파일에서 가장 값싼 줄이면서 가장 많이 잡는
   * 줄이다: 덱은 악센트를 자기 것으로 바꾸고 잉크는 라이브러리 것을 쓰므로, **두 파일이 따로
   * 움직여도 이 한 줄이 그 곱을 본다.**
   */
  test('여섯 쌍의 잉크가 네 상태 모두에서 자기 바닥 위에 4.5:1 이상이다', () => {
    const thin: string[] = [];
    for (const [name, state] of Object.entries(seen)) {
      for (const pair of LEGIBLE) {
        const ratio = contrast(state.tokens[pair.ink], state.tokens[pair.ground]);
        if (ratio < 4.5)
          thin.push(`${name}: ${pair.ink} on ${pair.ground} — ${ratio.toFixed(2)}:1`);
      }
    }
    expect(thin).toEqual([]);
  });
});
