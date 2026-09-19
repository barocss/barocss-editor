import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * **다크가 정말 *그려지는가*** — `not.toEqual` 이 아니라 값으로.
 *
 * ## 왜 이 파일이 따로 있나
 *
 * `packages/conformance/test/dark-is-actually-read.test.ts` 가 앱 다섯의 스타일 그래프를 `@import`
 * 를 따라 펼쳐 읽고, 네 상태에서 팔레트를 **계산한다**. 그것이 잡는 것은 우리가 파일에 적은
 * 산수다 — 명시도, 캐스케이드 순서, 방패 없는 미디어 블록, 다크만 말하고 라이트는 안 말하는
 * 팔레트. 위반 161 → 0.
 *
 * 그 검사가 답할 수 없는 것이 하나 있다: **브라우저가 실제로 그렇게 칠하는가.** 그리고 그것을
 * 묻던 브라우저 검사 셋(`word-theme` · `slide-theme` · `site-theme`)이 단정하던 것은 이것뿐이었다:
 *
 * ```
 * expect(dark.words).toEqual(light.words);        // 문서는 안 움직였다
 * expect(dark.chrome).not.toEqual(light.chrome);  // 크롬은 움직였다
 * ```
 *
 * **무엇으로 움직였는지는 안 묻는다.** 팔레트가 두 벌 다 틀려도 — 라이트가 초록이고 다크가
 * 자홍이어도 — 저 둘은 통과한다. `not.toEqual` 은 *달라졌다* 는 주장이지 *맞다* 는 주장이 아니다.
 *
 * 이 파일은 그 자리에 값을 놓는다. 아래 표의 색 하나하나가
 * `packages/office-ui/src/tokens.css` 와 `packages/office-site/src/ui.css` 가 적은 리터럴이고,
 * 검사가 묻는 것은 **그 이름이 그 값을 갖는가** 와 **그 값이 그 픽셀에 도착하는가** 둘이다.
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
 * 명시적 둘이 반대 시스템 위에 앉는 것이 요점이다. 같은 시스템 위에서 찍으면 미디어 블록이
 * 이미 답을 내고 있어서 `[data-theme]` 블록이 죽어 있어도 통과한다.
 *
 * ## `data-theme` 는 이 검사가 찍는다
 *
 * `apps/site/src` 에 `documentElement` 를 만지는 코드는 **없다** — 이 제품에는 아직 테마 스위치가
 * 없고, 있는 것은 그 스위치가 붙을 자리인 토큰뿐이다. 그래서 여기서는 `addInitScript` 로 첫
 * 페인트 전에 찍는다. 나중에 스위치가 생기면 이 검사가 찍는 자리가 그 스위치가 찍는 자리다.
 *
 * ## 안 도는 채로 커밋된다
 *
 * 포트가 하나뿐이라 이 회차의 에이전트는 playwright 를 못 돈다. 이 파일이 처음 도는 것은
 * 조율자의 손에서다. **처음 빨간 줄이 나오면 그것이 발견이지 이 파일의 오타가 아니라는 것을**
 * 아래 값들이 어디서 왔는지로 확인할 수 있게 적어 두었다: 표의 모든 색은 두 CSS 파일에서
 * 그대로 옮긴 것이고, 대비 숫자 일곱은 `tokens.css` 자신이 주석에 적은 숫자(5.33 · 4.89 · 7.11)와
 * 자리까지 같은 것을 확인하고 넣었다.
 */

/* ── 팔레트, 그것을 소유한 두 파일이 적은 그대로 ───────────────────────────── */

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
    '--ou-studio': '#e8e9ea',
    '--ou-board-ink': '#5b6371',
    /**
     * **테마를 따르지 않는 둘** — 그리고 그 사실이 여기서 처음 검사된다.
     *
     * `tokens.css` 가 이유를 적어 두었다: *종이는 테마를 따르지 않는다.* 그래서 `--ou-board` 는
     * 다크에서도 흰색이고 `--ou-board-written` 도 안 움직인다. 두 값이 라이트와 다크에 **같게**
     * 적혀 있는 것이 그 주장이고, `not.toEqual` 로는 절대 할 수 없는 주장이다 — 오히려 그 단정
     * 아래에서는 종이가 따라 움직여도 통과한다.
     */
    '--ou-board': '#ffffff',
    '--ou-board-written': '#1a1a1a',
    '--ou-accent-ink': '#ffffff'
  },
  dark: {
    '--ou-panel': '#171717',
    '--ou-ground': '#0a0a0a',
    '--ou-line': '#404040',
    '--ou-ink': '#fafafa',
    '--ou-muted': '#a3a3a3',
    '--ou-faint': '#737373',
    '--ou-accent': '#3b82f6',
    '--ou-studio': '#1c1c1e',
    '--ou-board-ink': '#8b9096',
    '--ou-board': '#ffffff',
    '--ou-board-written': '#1a1a1a',
    /**
     * **다크에서 뒤집힌다.** 예전에는 다크 블록이 이 이름을 다시 말하지 않아 네 상태 모두
     * 흰색이었고, 밝아진 악센트(`#3b82f6`) 위에서 3.68:1 이었다. 규칙은 하나다 —
     * **악센트의 잉크는 악센트가 떠 있는 바닥의 색.**
     */
    '--ou-accent-ink': '#171717'
  }
} as const;

/**
 * `--st-*` — `packages/office-site/src/ui.css` 의 여섯.
 *
 * 이 여섯이 이 파일이 존재하는 직접적인 이유다. `:root` 에서 `var(--ou-…, 폴백)` 으로 선언되고,
 * `[data-theme='dark']` 와 `[data-theme='light']` 에서 각각 다시 찍힌다 — **별칭은 스냅샷이므로**
 * 다시 찍지 않으면 서브트리에서 안 따라온다. 라이트 짝은 하루 동안 없었고, 그동안 다크 문서
 * 안의 라이트 섬은 `office-ui` 의 **라이트 컨트롤이 `office-site` 의 다크 스튜디오 바닥 위에**
 * 앉았다. 그것을 잡는 것이 아래 §섬 검사다.
 *
 * 값은 `--ou-*` 의 것과 같아야 한다 — 별칭이니까. 그런데 **같다고 적는 대신 옮겨 적는다**:
 * `OU.dark['--ou-studio']` 를 참조하면 두 파일이 어긋난 날 이 검사가 같이 어긋나 조용해진다.
 */
const ST = {
  light: {
    '--st-ground': '#e8e9ea',
    '--st-line': '#d4d4d4',
    '--st-ink': '#171717',
    '--st-faint': '#6b6b6b',
    '--st-accent': '#2563eb',
    '--st-panel': '#ffffff'
  },
  dark: {
    '--st-ground': '#1c1c1e',
    '--st-line': '#404040',
    '--st-ink': '#fafafa',
    '--st-faint': '#a3a3a3',
    '--st-accent': '#3b82f6',
    '--st-panel': '#171717'
  }
} as const;

const TOKENS = {
  light: { ...OU.light, ...ST.light } as Record<string, string>,
  dark: { ...OU.dark, ...ST.dark } as Record<string, string>
};

const TOKEN_NAMES = Object.keys(TOKENS.light);

/**
 * **어느 요소의 어느 속성** — 이름이 값을 갖는 것과 그 값이 픽셀에 도착하는 것은 다른 질문이다.
 *
 * 토큰이 옳은 채로 화면이 틀리는 길은 둘이다: 그 이름을 아무도 읽지 않거나(선택자 오타, 규칙이
 * 다른 규칙에 짐), `var()` 가 값 없는 이름을 가리켜 **선언 전체가 무효**가 되거나. 두 번째는
 * 조용하다 — `.st-rail-icon` 이 정확히 그렇게 색을 잃고 모든 삽입 행의 아이콘을 행의 잉크로
 * 그렸고, 그것을 알아챈 것은 사람의 눈이었다.
 *
 * 그래서 여기 아홉은 **선언이 있는 자리** 에서 골랐다 — `apps/site/src/style.css` 의 `--st-*` 27개
 * 선언과 `packages/office-site/src/ui.css` 의 `.st-rail` · `.st-frame-body` 에서.
 */
const PAINTED = [
  /* 창 자체 — `apps/site/src/style.css:87`. `--st-*` 를 읽는 첫 두 선언이다. */
  { at: 'body', prop: 'backgroundColor', token: '--st-ground', says: '창 바닥' },
  { at: 'body', prop: 'color', token: '--st-ink', says: '창의 글자' },
  /* 크롬 두 줄 — `style.css:103·104`. */
  { at: '.st-chrome', prop: 'backgroundColor', token: '--st-panel', says: '크롬' },
  { at: '.st-chrome', prop: 'borderBottomColor', token: '--st-line', says: '크롬 아래 실선' },
  /* 스튜디오 바닥 — `style.css:185`. 이 제품이 스스로 정하는 유일한 면. */
  { at: '.st-canvas', prop: 'backgroundColor', token: '--st-ground', says: '스튜디오 바닥' },
  /* 레일 — `office-site/ui.css:1194·1195`. 여기는 `--ou-*` 를 쓰는 자리에서 곧장 읽는다. */
  { at: '.st-rail', prop: 'backgroundColor', token: '--ou-panel', says: '레일' },
  { at: '.st-rail', prop: 'borderRightColor', token: '--ou-line', says: '레일의 모서리' },
  /* 그리고 보드 — `office-site/ui.css:247·248`. 네 상태에서 **안 움직여야** 하는 둘. */
  { at: '.st-frame-body', prop: 'backgroundColor', token: '--ou-board', says: '보드' },
  { at: '.st-frame-body', prop: 'color', token: '--ou-board-written', says: '보드 위의 글자' }
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
 * 아홉 쌍이고, 아홉 다 **양쪽 테마에서 4.5 를 넘는 것을 리터럴로 계산해 확인한 뒤** 넣었다.
 * 나온 값은 `tokens.css` 가 자기 주석에 적어 둔 숫자와 자리까지 같다 — 흰 바탕 위 `--ou-muted`
 * 5.33, `--ou-ground` 위 4.89, 다크 패널 위 7.11. 같은 산수를 두 사람이 따로 해서 같은 답이
 * 나온 것이므로, 이 함수가 틀렸을 가능성은 그만큼 줄어든다.
 *
 * **일부러 뺀 둘**, 둘 다 4.5 미만이고 둘 다 결함 보고감이다. 여기 넣으면 이 파일이 처음 도는
 * 순간 빨개지는데, 그러면 읽는 사람이 *스펙이 틀렸나* 를 먼저 의심한다. 그래서 숫자로 적어
 * **그 둘은 2026-09-06 에 고쳐졌고 이제 아래 목록에 있다.** 남겨 두는 이유는 숫자다:
 *
 * - `--ou-accent-ink` on `--ou-accent` — 다크 3.68 → **4.87**. 악센트를 어둡게 하는 쪽은
 *   불가능했다(같은 색이 다크 패널 위 *글자* 로도 그려지고 거기서는 이미 4.87), 그래서 잉크를
 *   뒤집었다. **덤이 더 컸다**: 덱은 `--ou-accent` 를 `#6f9bff` 로 매핑하고 잉크는 매핑하지
 *   않아 **2.69:1** 이었고, 이 한 줄로 덱이 한 글자도 안 바뀌고 **6.67** 이 됐다.
 * - `--ou-board-ink` on `--ou-studio` — 라이트 3.98 → **4.98** (`#6b7280` → `#5b6371`,
 *   gray-500↔600 의 반 걸음, `--ou-muted` 가 받은 것과 같은 수리). 다크는 5.29 그대로.
 */
const LEGIBLE: { ink: string; ground: string }[] = [
  { ink: '--ou-ink', ground: '--ou-panel' },
  { ink: '--ou-muted', ground: '--ou-ground' },
  { ink: '--ou-muted', ground: '--ou-panel' },
  { ink: '--ou-board-written', ground: '--ou-board' },
  { ink: '--st-ink', ground: '--st-ground' },
  { ink: '--st-ink', ground: '--st-panel' },
  { ink: '--st-faint', ground: '--st-panel' },
  { ink: '--ou-accent-ink', ground: '--ou-accent' },
  { ink: '--ou-board-ink', ground: '--ou-studio' }
];

/* ── 페이지를 여는 법 ─────────────────────────────────────────────────────── */

type Seen = {
  /** 뿌리에 찍힌 것 — 앱이 지우지 않았는지 확인하려고 되읽는다. */
  stamped: string | null;
  /** 이름 → 계산된 커스텀 프로퍼티. `var()` 는 이미 치환된 뒤다. */
  tokens: Record<string, string>;
  /** `'body backgroundColor'` → `'rgb(232, 233, 234)'`. */
  painted: Record<string, string>;
};

const key = (one: { at: string; prop: string }) => `${one.at} ${one.prop}`;

/**
 * 편집기까지 걸어 들어간다 — 관리가 밖이고 편집이 안이므로.
 *
 * 걸음과 기다림은 `site-theme.spec.ts` 의 것을 그대로 쓴다. 두 파일이 같은 화면을 서로 다르게
 * 열면 한쪽이 조용히 다른 화면을 재게 된다.
 */
async function walkIn(page: Page) {
  await page.goto('/');
  await page.waitForSelector('[data-admin-page]');
  await page.locator('[data-admin-open]').first().click();
  await page.waitForSelector('.st-frame-body');
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
 * `.st-rail` 인 것에 이유가 있다: `apps/gallery/src/gallery.tsx:65` 가 정확히 이 모양의 스위치를
 * `.ga-shell` 에 붙이고, 레일은 이 제품에서 그 자리에 해당하는 유일한 큰 면이다. 그리고 레일의
 * 두 선언(`background: var(--ou-panel)` · `border-right: … var(--ou-line)`)이 **사용 지점에서**
 * 토큰을 읽으므로, 찍은 테마가 안 닿으면 픽셀에서 바로 보인다.
 */
async function island(page: Page, theme: 'light' | 'dark', names: string[]) {
  return page.evaluate(
    ({ theme, names }) => {
      const rail = document.querySelector('.st-rail') as HTMLElement | null;
      if (!rail) return null;
      rail.setAttribute('data-theme', theme);
      const style = getComputedStyle(rail);
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
      rail.removeAttribute('data-theme');
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

test.describe('사이트 빌더의 팔레트는 네 상태에서 값으로 옳다', () => {
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
      await walkIn(page);
      seen[state.name] = await read(page, TOKEN_NAMES, PAINTED);

      /* 섬은 반대 방향으로만 의미가 있다 — 다크 문서 안의 라이트, 라이트 문서 안의 다크. */
      if (state.name === 'systemDark') lightIsland = await island(page, 'light', TOKEN_NAMES);
      if (state.name === 'systemLight') darkIsland = await island(page, 'dark', TOKEN_NAMES);

      await ctx.close();
    }
  });

  /**
   * 먼저 **읽긴 읽었는가.** 아래 단정이 전부 `'그려지지 않았다'` 를 서로 비교하며 초록일 수는
   * 없어야 한다 — 선택자가 낡으면 그 사실이 여기서 나온다.
   */
  test('네 상태를 다 열었고, 아홉 자리가 다 그려져 있다', () => {
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
   * **이름이 값을 갖는가** — 네 상태 각각에서, 열여덟 개.
   *
   * `dark-is-actually-read` 가 소스에서 계산한 것과 같은 답이 브라우저에서도 나오는가를 묻는다.
   * 두 검사가 어긋나면 어긋난 쪽이 발견이다: 소스 검사가 못 보는 것이 실제로 있다 —
   * `@layer`(Tailwind v4 가 `@import "tailwindcss"` 로 들여온다)는 명시도보다 먼저 걸리는데,
   * 그 파서는 `@layer` 를 그냥 통과시킨다.
   */
  test('열여덟 토큰이 네 상태에서 각각 자기 값을 갖는다', () => {
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
   * 토큰이 옳고 화면이 틀린 경우가 이 저장소에 이미 있다: `--st-*` 여섯이 `:root` 에서만 옳고
   * 79개 선언이 그 스냅샷을 들고 있었다. 이름만 묻는 검사는 그때 초록이었다.
   */
  test('아홉 면이 자기가 부르는 토큰의 색으로 칠해진다', () => {
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

  /** 그리고 두 팔레트가 정말 두 벌이다 — 위가 다 통과하면 자동이지만, 적어 두면 읽힌다. */
  test('라이트와 다크는 같은 화면이 아니다', () => {
    expect(seen.systemDark.painted).not.toEqual(seen.systemLight.painted);
  });

  /**
   * **다크 문서 안의 라이트 섬, 그리고 그 거울상.**
   *
   * 이 저장소가 이 결함을 두 번 겪었다. 한 번은 `office-ui/tokens.css` 에 `[data-theme='light']`
   * 규칙이 **한 줄도 없어서** — `:not([data-theme='light'])` 방패는 뿌리에서 다크를 *사양* 하는
   * 것이지 라이트로 *가는* 것이 아니다. 한 번은 `office-site/ui.css` 가 다크 짝만 갖고 있어서,
   * `--ou-*` 는 라이트로 돌아오고 `--st-*` 여섯은 다크에 남았다 — 라이트 컨트롤이 다크 스튜디오
   * 바닥 위에 앉는 화면이고, **팔레트가 두 벌 다 옳은 채로** 그렇게 된다.
   *
   * 두 결함 다 브라우저 검사 셋을 통과했다. 그 셋이 뿌리만 봤기 때문이다.
   */
  test('다크 문서 안에 라이트 섬을 만들면 열여덟이 다 라이트로 돌아온다', () => {
    expect(lightIsland, '.st-rail 을 못 찾았다').not.toBeNull();
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

  test('라이트 문서 안에 다크 섬을 만들면 열여덟이 다 다크로 간다', () => {
    expect(darkIsland, '.st-rail 을 못 찾았다').not.toBeNull();
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
  test('아홉 쌍의 잉크가 네 상태 모두에서 자기 바닥 위에 4.5:1 이상이다', () => {
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
