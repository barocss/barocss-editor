import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * **다크가 정말 *그려지는가*** — `not.toEqual` 이 아니라 값으로. Word 의 몫.
 *
 * ## 왜 이 파일이 따로 있나
 *
 * 옆의 `word-theme.spec.ts` 가 단정하는 것은 둘뿐이다:
 *
 * ```
 * expect(dark.words).toEqual(light.words);        // 종이 위의 글자는 안 움직였다
 * expect(dark.chrome).not.toEqual(light.chrome);  // 크롬은 움직였다
 * ```
 *
 * **무엇으로 움직였는지는 안 묻는다.** 팔레트가 두 벌 다 틀려도 — 라이트가 초록이고 다크가
 * 자홍이어도 — 통과한다. `not.toEqual` 은 *달라졌다* 는 주장이지 *맞다* 는 주장이 아니다.
 * `apps/site/tests/site-theme-values.spec.ts` 가 사이트 빌더에 대해 그 자리에 값을 놓았고, 이
 * 파일이 그 모양을 Word 로 옮긴 것이다 — 바뀌는 것은 아래 두 표뿐이다.
 *
 * ## Word 에서 그 두 표가 어떻게 달라지나
 *
 * **별칭 표가 없다.** 사이트는 `--ou-*` 위에 `--st-*` 여섯을 얹고 덱은 `--ou-*` 를 `--sl-*` 로
 * 매핑하는데, Word 는 **아무것도 다시 이름 붙이지 않는다** — `apps/word/src/style.css` 가
 * `@barocss/office-ui/tokens.css` 를 들여오고 그걸로 끝이다(그 자리에 그렇게 적혀 있다:
 * *Imported and not remapped*). 그래서 이 파일이 재는 것은 `office-ui` 가 **배달한 팔레트 그
 * 자체** 이고, 이 저장소에서 그 팔레트를 손대지 않은 채로 브라우저에서 확인하는 유일한 자리다.
 *
 * 대신 Word 만의 표가 하나 생긴다: **종이를 리터럴로 쓴다.** `--ou-board`/`--ou-board-written`
 * 이라는 이름이 있는데도 `packages/office-word/src/ui.css` 는 `.w-sheet { background: #fff }` 과
 * `.w-document { color: #1a1a1a }` 라고 쓴다. 값은 우연히 같다. 아래 §PAINTED 의 `restates` 가
 * 그 우연을 검사로 바꾼다 — 둘 중 하나가 움직이는 날 빨개진다.
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
 * 이미 답을 내고 있어서 `[data-theme]` 블록이 죽어 있어도 통과한다.
 *
 * ## `data-theme` 는 이 검사가 찍는다
 *
 * `apps/word/src` 에 `documentElement` 를 만지는 코드는 **없다** — 이 제품에도 아직 테마 스위치가
 * 없고, 있는 것은 그 스위치가 붙을 자리인 토큰뿐이다. `apps/word/src/style.css` 의 다크 미디어
 * 블록이 `:not([data-theme='light'])` 방패를 갖고 있는 것도 그래서 **잠복** 이라고 그 자리에
 * 적혀 있다. 여기서 `addInitScript` 로 첫 페인트 전에 찍는 자리가 그 스위치의 자리다.
 *
 * ## 안 도는 채로 커밋된다
 *
 * 포트가 하나뿐이라 이 회차의 에이전트는 playwright 를 못 돈다. 이 파일이 처음 도는 것은
 * 조율자의 손에서다. **처음 빨간 줄이 나오면 그것이 발견이지 이 파일의 오타가 아니라는 것을**
 * 아래 값들이 어디서 왔는지로 확인할 수 있게 적어 두었다: 표의 모든 색은
 * `packages/office-ui/src/tokens.css` 에서 그대로 옮긴 것이고, 대비 일곱 쌍은 넣기 전에 네 상태
 * 모두에서 4.5 를 넘는 것을 리터럴로 계산해 확인했다. 그중 셋(`--ou-muted` 5.33 · 4.89, 다크
 * 패널 위 7.11)은 `tokens.css` 자신이 주석에 적어 둔 숫자와 자리까지 같다.
 */

/* ── 팔레트, 그것을 소유한 한 파일이 적은 그대로 ──────────────────────────── */

/**
 * `--ou-*` — `packages/office-ui/src/tokens.css`.
 *
 * 라이트는 맨 `:root` 블록, 다크는 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`
 * 와 `[data-theme='dark']` 두 블록이고 그 둘은 값이 같아야 한다(그것이 `dark-is-actually-read` 의
 * 정리다). 여기서는 **그린 것** 을 묻는 것이므로 한 벌만 적는다.
 *
 * `--ou-accent-soft` · `--ou-warn-soft` 는 `color-mix()` 라 없다. 계산된 값이 브라우저마다
 * `color(srgb …)` 로 나오기도 하고 `oklab(…)` 로 나오기도 해서, 그것을 리터럴로 적으면 이
 * 검사는 팔레트가 아니라 크로미움 버전을 붙잡게 된다.
 *
 * `--ou-studio` · `--ou-board-ink` 도 없다 — 그 둘은 *문서를 들여다보는 방* 의 색이고 Word 에는
 * 그 방이 없다(스튜디오를 가진 것은 사이트 빌더와 덱이다). 선언은 되어 있으니 넣으면 통과하지만,
 * 그러면 이 파일은 Word 에 대해 아무 말도 안 하는 줄을 두 개 갖게 된다.
 */
const OU = {
  light: {
    '--ou-panel': '#ffffff',
    '--ou-ground': '#f5f5f5',
    '--ou-line': '#d4d4d4',
    '--ou-ink': '#171717',
    '--ou-muted': '#6b6b6b',
    '--ou-faint': '#a3a3a3',
    '--ou-accent': '#2563eb',
    /**
     * **악센트 위의 잉크는 테마를 따른다** — 그리고 그 사실이 여기서 처음 브라우저에 물어진다.
     *
     * 오래 흰색 하나였다. `tokens.css` 가 이 이름을 `:root` 에만 적고 다크 블록 어느 쪽에도 안
     * 적어서, 네 상태 모두 흰색이었다: 라이트 5.17, 다크 **3.68**. 다크 블록이 악센트만 밝히고
     * (`#2563eb`→`#3b82f6`) 그 위의 잉크는 그대로 뒀기 때문이다. 이제 다크에서 `#171717` 이다.
     */
    '--ou-accent-ink': '#ffffff',
    /**
     * **테마를 따르지 않는 둘** — 그리고 Word 는 이 둘을 *읽지 않는다*.
     *
     * `tokens.css` 가 이유를 적어 두었다: *종이는 테마를 따르지 않는다.* 그래서 `--ou-board` 는
     * 다크에서도 흰색이고 `--ou-board-written` 도 안 움직인다. 두 값이 라이트와 다크에 **같게**
     * 적혀 있는 것이 그 주장이고, `not.toEqual` 로는 절대 할 수 없는 주장이다 — 오히려 그 단정
     * 아래에서는 종이가 따라 움직여도 통과한다.
     *
     * Word 의 `.w-sheet` 와 `.w-document` 는 이 이름들을 부르지 않고 같은 값을 손으로 쓴다.
     * 아래 §PAINTED 참고.
     */
    '--ou-board': '#ffffff',
    '--ou-board-written': '#1a1a1a'
  },
  dark: {
    '--ou-panel': '#171717',
    '--ou-ground': '#0a0a0a',
    '--ou-line': '#404040',
    '--ou-ink': '#fafafa',
    '--ou-muted': '#a3a3a3',
    '--ou-faint': '#737373',
    '--ou-accent': '#3b82f6',
    '--ou-accent-ink': '#171717',
    '--ou-board': '#ffffff',
    '--ou-board-written': '#1a1a1a'
  }
} as const;

const TOKENS = {
  light: { ...OU.light } as Record<string, string>,
  dark: { ...OU.dark } as Record<string, string>
};

const TOKEN_NAMES = Object.keys(TOKENS.light);

/**
 * **어느 요소의 어느 속성** — 이름이 값을 갖는 것과 그 값이 픽셀에 도착하는 것은 다른 질문이다.
 *
 * 토큰이 옳은 채로 화면이 틀리는 길은 둘이다: 그 이름을 아무도 읽지 않거나(선택자 오타, 규칙이
 * 다른 규칙에 짐), `var()` 가 값 없는 이름을 가리켜 **선언 전체가 무효**가 되거나. 두 번째는
 * 조용하다 — `apps/word/src/style.css` 가 `tokens.css` 를 들여오는 이유가 정확히 그것이라고
 * 그 자리에 적혀 있다: *a `var()` with no value ... takes the whole declaration with it. A panel
 * with no borders rather than a panel with grey ones.*
 *
 * 열한 자리는 선언이 있는 자리에서 골랐고, **세 층에서** 가져왔다 — 그리고 세 층인 것이 요점이다:
 *
 * 1. **앱** — `apps/word/src/style.css` 가 남긴 것: 창과 크롬 띠. `var(--ou-…)` 를 폴백 없이 읽는다.
 * 2. **제품 셸** — `packages/office-word/src/ui.css`. 자·개요 칸·종이가 거기 있고, 전부
 *    `var(--ou-…, 리터럴)` 로 쓰여 있다. 그것이 이 층의 조용한 자리다: 토큰이 사라져도 **라이트
 *    값** 이 나오므로 라이트에서는 정답과 구별되지 않고 다크에서만 틀린다. 그 파일이 그렇게
 *    쓰인 이유는 Word 앱 없이도 그려져야 하기 때문이고, 그 대가가 이 침묵이다.
 * 3. **공유 부품** — `office-ui` 의 `Toolbar` 자신. `.w-toolbar` 의 배경과 아래 실선은
 *    `bg-[color:var(--ou-panel)]` · `border-[color:var(--ou-line)]` 이라는 **Tailwind 임의값**이고
 *    (`packages/office-ui/src/toolbar.tsx:77-78`), Tailwind v4 는 그것을 `@layer utilities` 안에
 *    넣는다. `dark-is-actually-read` 의 파서는 `@layer` 를 그냥 통과시키므로 — 그 파일이 사이트
 *    스펙 주석에서 스스로 그렇게 적었다 — **레이어가 걸린 자리를 실제로 확인하는 것은 브라우저
 *    검사뿐이다.**
 */
const PAINTED = [
  /* 창 자체 — `apps/word/src/style.css` 의 `body`. */
  { at: 'body', prop: 'backgroundColor', token: '--ou-ground', says: '창 바닥' },
  /* 크롬 띠 — 같은 파일의 `.w-shell > .w-chrome`. `word-theme.spec.ts` 가 `not.toEqual` 로만 보던 면. */
  { at: '.w-chrome', prop: 'backgroundColor', token: '--ou-ground', says: '크롬 띠' },
  { at: '.w-chrome', prop: 'borderBottomColor', token: '--ou-line', says: '크롬 아래 실선' },
  /* 공유 부품이 스스로 그리는 두 면 — `office-ui/src/toolbar.tsx:77·78`. 위 문단 참고. */
  { at: '.w-toolbar', prop: 'backgroundColor', token: '--ou-panel', says: '리본' },
  { at: '.w-toolbar', prop: 'borderBottomColor', token: '--ou-line', says: '리본 아래 실선' },
  /* 개요 칸 — `packages/office-word/src/ui.css` 의 `.w-outline`. 기본으로 열려 있다(`app.tsx:72`). */
  { at: '.w-outline', prop: 'backgroundColor', token: '--ou-panel', says: '개요 칸' },
  { at: '.w-outline', prop: 'borderRightColor', token: '--ou-line', says: '개요 칸의 모서리' },
  { at: '.w-outline-title', prop: 'color', token: '--ou-muted', says: '개요 칸의 머리말' },
  /* 자 — 같은 파일의 `.w-ruler`. 페이지 위에 그려지지만 색은 창의 것이다. */
  { at: '.w-ruler', prop: 'color', token: '--ou-muted', says: '자의 숫자' },
  /*
   * 그리고 종이 — 네 상태에서 **안 움직여야** 하는 둘.
   *
   * `restates` 가 붙은 줄은 그 선언이 토큰을 **부르지 않는다**는 뜻이다: Word 는 같은 값을 손으로
   * 쓴다. 그래서 이 두 줄은 "토큰이 픽셀에 도착했는가" 가 아니라 **"베껴 쓴 값이 아직 원본과
   * 같은가"** 를 묻는다 — `--ou-board-written` 이 `#1a1a1a` 를 떠나는 날, 사이트의 보드는 따라
   * 가고 Word 의 종이는 안 따라간다. 그 하루를 이 두 줄이 잡는다.
   */
  {
    at: '.w-sheet',
    prop: 'backgroundColor',
    token: '--ou-board',
    restates: '#fff',
    says: '종이 (office-word/ui.css 가 리터럴로 씀)'
  },
  {
    at: '.w-document',
    prop: 'color',
    token: '--ou-board-written',
    restates: '#1a1a1a',
    says: '종이 위의 글자 (office-word/ui.css 가 리터럴로 씀)'
  }
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
 * 일곱 쌍뿐이고, 일곱 다 **양쪽 테마에서 4.5 를 넘는 것을 리터럴로 계산해 확인한 뒤** 넣었다.
 * 그중 셋은 `tokens.css` 가 자기 주석에 적어 둔 숫자와 자리까지 같다 — 흰 바탕 위 `--ou-muted`
 * 5.33, `--ou-ground` 위 4.89, 다크 패널 위 7.11. 같은 산수를 두 사람이 따로 해서 같은 답이
 * 나온 것이므로, 이 함수가 틀렸을 가능성은 그만큼 줄어든다.
 *
 * `--ou-accent-ink` on `--ou-accent` 가 여기 있는 것이 이번 회차에 달라진 점이다. 사이트 스펙은
 * 그 쌍을 **일부러 뺐다** — 다크가 3.68 이었고, 넣으면 그 파일이 처음 도는 순간 빨개지니까.
 * 다크의 잉크가 `#171717` 이 된 지금 라이트 5.17 · 다크 4.87 이고, 그러니 검사에 들어간다.
 *
 * **일부러 뺀 하나**, 결함 보고감이다. 여기 넣으면 이 파일이 처음 도는 순간 빨개지는데, 그러면
 * 읽는 사람이 *스펙이 틀렸나* 를 먼저 의심한다. 그래서 숫자로 적어 백로그에 넘긴다:
 *
 * - `--ou-faint` on `--ou-panel` — 라이트 **2.52**, 다크 **3.78**. 눈금자의 잔금 같은 *선* 에
 *   쓰이는 동안은 4.5 의 질문 밖이지만, `packages/office-word/src/ui.css` 의 `.w-outline-empty` 는
 *   그것으로 **글자**(*제목이 없습니다.*)를 그린다. 토큰이 아니라 그 한 줄이 틀린 쪽일 수 있다.
 */
const LEGIBLE: { ink: string; ground: string }[] = [
  { ink: '--ou-ink', ground: '--ou-panel' },
  { ink: '--ou-ink', ground: '--ou-ground' },
  { ink: '--ou-muted', ground: '--ou-panel' },
  { ink: '--ou-muted', ground: '--ou-ground' },
  { ink: '--ou-accent', ground: '--ou-panel' },
  { ink: '--ou-accent-ink', ground: '--ou-accent' },
  { ink: '--ou-board-written', ground: '--ou-board' }
];

/* ── 페이지를 여는 법 ─────────────────────────────────────────────────────── */

type Seen = {
  /** 뿌리에 찍힌 것 — 앱이 지우지 않았는지 확인하려고 되읽는다. */
  stamped: string | null;
  /** 이름 → 계산된 커스텀 프로퍼티. `var()` 는 이미 치환된 뒤다. */
  tokens: Record<string, string>;
  /** `'body backgroundColor'` → `'rgb(245, 245, 245)'`. */
  painted: Record<string, string>;
};

const key = (one: { at: string; prop: string }) => `${one.at} ${one.prop}`;

/**
 * 문서가 페이지가 될 때까지 기다린다.
 *
 * `word-theme.spec.ts` 는 `.w-toolbar` 와 1,200ms 로 열고, 이 파일은 `.w-sheet` 까지 기다린다 —
 * 종이 두 줄이 PAINTED 에 있으니 종이가 아직 없는 화면을 재면 그 둘이 `'그려지지 않았다'` 가
 * 되고, 그건 팔레트에 대한 발견이 아니라 이 파일의 조급함이다. 조판은 자기 출력을 재고 다시
 * 도므로 넉넉히 기다린다.
 */
async function open(page: Page) {
  await page.goto('/?sample');
  await page.waitForSelector('.w-toolbar');
  await page.waitForSelector('.w-sheet', { state: 'attached' });
  await page.waitForSelector('.w-outline');
  await page.waitForTimeout(2000);
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
 * `.w-outline` 인 것에 이유가 있다: `apps/gallery/src/gallery.tsx:65` 가 정확히 이 모양의 스위치를
 * `.ga-shell` 에 붙이고, 개요 칸은 이 제품에서 그 자리에 해당하는 큰 면이다. 그리고 그 두
 * 선언(`background: var(--ou-panel)` · `border-right: … var(--ou-line)`)이 **사용 지점에서** 토큰을
 * 읽으므로, 찍은 테마가 안 닿으면 픽셀에서 바로 보인다.
 */
async function island(page: Page, theme: 'light' | 'dark', names: string[]) {
  return page.evaluate(
    ({ theme, names }) => {
      const pane = document.querySelector('.w-outline') as HTMLElement | null;
      if (!pane) return null;
      pane.setAttribute('data-theme', theme);
      const style = getComputedStyle(pane);
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
      pane.removeAttribute('data-theme');
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

test.describe('Word 의 팔레트는 네 상태에서 값으로 옳다', () => {
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
        viewport: { width: 1400, height: 900 }
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
   * 없어야 한다 — 선택자가 낡으면 그 사실이 여기서 나온다. Word 에서 특히 값싼 검사가 아니다:
   * 개요 칸은 접힐 수 있고(`.w-outline-closed` 로 바뀐다), 리본의 이름은 `office-word` 의
   * 것이며, `.w-sheet` 는 조판이 끝나야 생긴다.
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
   * **이름이 값을 갖는가** — 네 상태 각각에서, 열 개.
   *
   * `dark-is-actually-read` 가 소스에서 계산한 것과 같은 답이 브라우저에서도 나오는가를 묻는다.
   * 두 검사가 어긋나면 어긋난 쪽이 발견이다: 소스 검사가 못 보는 것이 실제로 있다 —
   * `@layer`(Tailwind v4 가 `@import "tailwindcss"` 로 들여온다)는 명시도보다 먼저 걸리는데,
   * 그 파서는 `@layer` 를 그냥 통과시킨다.
   *
   * 그리고 Word 에서는 이 표가 **한 번 더** 다른 것을 묻는다: 아무것도 매핑하지 않았으니 여기
   * 나오는 값은 `office-ui` 가 배달한 값 그대로여야 한다. 제품 하나가 팔레트를 덮어 쓰는 사고가
   * 나면 다른 두 앱에서는 그것이 *그 제품의 팔레트* 와 구별되지 않지만, 여기서는 구별된다.
   */
  test('열 토큰이 네 상태에서 각각 자기 값을 갖는다', () => {
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

  /**
   * **그리고 그 값이 픽셀에 도착하는가.**
   *
   * 토큰이 옳고 화면이 틀린 경우가 이 저장소에 이미 있다: 사이트 빌더의 `--st-*` 여섯이 `:root`
   * 에서만 옳고 79개 선언이 그 스냅샷을 들고 있었다. 이름만 묻는 검사는 그때 초록이었다.
   *
   * Word 의 마지막 두 줄은 방향이 반대다 — 선언이 토큰을 부르지 않고 값을 베껴 썼으므로, 여기서
   * 묻는 것은 **베낀 값이 아직 원본과 같은가** 이다.
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
   * 위 두 검사가 각각을 값으로 붙잡으므로 이건 논리적으로 새롭지 않다. 그래도 따로 두는 이유는
   * **실패했을 때 읽는 문장이 다르기** 때문이다: 위가 빨개지면 *팔레트가 틀렸다* 이고, 여기가
   * 빨개지면 *스위치가 죽었다* 이다. 그리고 팔레트를 통째로 바꾸는 날 위의 표는 손봐야 하지만
   * 이 검사는 그대로 옳다.
   */
  test('명시적 테마는 같은 이름의 시스템 테마와 픽셀까지 같다', () => {
    expect(seen.explicitDark.painted).toEqual(seen.systemDark.painted);
    expect(seen.explicitDark.tokens).toEqual(seen.systemDark.tokens);
    expect(seen.explicitLight.painted).toEqual(seen.systemLight.painted);
    expect(seen.explicitLight.tokens).toEqual(seen.systemLight.tokens);
  });

  /**
   * 그리고 두 팔레트가 정말 두 벌이다 — 위가 다 통과하면 자동이지만, 적어 두면 읽힌다.
   * `word-theme.spec.ts` 가 하던 단정이 이 한 줄이고, 이 파일의 나머지가 그 한 줄이 못 하던 것이다.
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
   * Word 는 매핑이 없으니 여기서 재는 것은 `tokens.css` 의 두 `[data-theme]` 블록 그 자체다 —
   * 이 저장소에서 그 블록들을 **매핑을 거치지 않고** 브라우저에 물어보는 유일한 자리.
   */
  test('다크 문서 안에 라이트 섬을 만들면 열이 다 라이트로 돌아온다', () => {
    expect(lightIsland, '.w-outline 을 못 찾았다').not.toBeNull();
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

  test('라이트 문서 안에 다크 섬을 만들면 열이 다 다크로 간다', () => {
    expect(darkIsland, '.w-outline 을 못 찾았다').not.toBeNull();
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
   */
  test('일곱 쌍의 잉크가 네 상태 모두에서 자기 바닥 위에 4.5:1 이상이다', () => {
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
