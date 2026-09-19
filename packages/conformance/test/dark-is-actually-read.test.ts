import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';

/**
 * **다크가 정말 읽히는가** — 브라우저가 아니라 우리 소스가 답하는 부분.
 *
 * ## 왜 이 파일이 있나
 *
 * playwright 검사 1,092개 중 다크 컨텍스트를 여는 것은 **셋** 이고(`word-theme` ·
 * `slide-theme` · `site-theme`), 그 셋이 단정하는 것은 이것뿐이다:
 *
 * ```
 * expect(dark.words).toEqual(light.words);        // 문서는 안 움직였다
 * expect(dark.chrome).not.toEqual(light.chrome);  // 크롬은 움직였다
 * ```
 *
 * **무엇으로 움직였는지는 안 묻는다.** 그래서 팔레트가 두 벌 다 틀려도 통과한다 — 실제로
 * 그 결함이 있는 채로 통과하고 있었다. `not.toEqual` 은 *달라졌다* 는 주장이지 *맞다* 는
 * 주장이 아니다.
 *
 * ## 왜 단위인가
 *
 * `docs/specs/testing.md` 의 기준: **답을 우리 코드가 정하면 단위, 브라우저가 정하면 e2e.**
 * CSS 명시도와 캐스케이드 순서는 우리가 파일에 적은 것이다. `:root:not([data-theme='light'])`
 * 가 `(0,2,0)` 이고 `[data-theme='dark']` 가 `(0,1,0)` 이라는 사실은 브라우저에 물을 필요가
 * 없다 — 그 산수는 여기서 하고, 브라우저는 *그린 것* 만 답하면 된다.
 *
 * 그래서 이 파일은 앱 다섯의 스타일시트를 `@import` 를 따라 펼쳐 읽고, **네 가지 상태에서
 * 팔레트를 실제로 계산한다**:
 *
 * | | `prefers-color-scheme` | `data-theme` |
 * |---|---|---|
 * | 시스템 라이트 | light | 없음 |
 * | 시스템 다크 | dark | 없음 |
 * | 명시적 다크 | light | `dark` |
 * | 명시적 라이트 | dark | `light` |
 *
 * 그리고 정리는 둘이다: **명시적 다크는 시스템 다크와 같은 팔레트를 내야 하고, 명시적 라이트는
 * 시스템 라이트와 같은 팔레트를 내야 한다.** 그 둘이 어긋나면 테마 스위치가 죽은 것이다.
 *
 * 나머지 검사는 그 정리가 깨지는 *기계* 를 이름으로 붙잡는다 — 방패 없는 미디어 블록, 다크만
 * 말하고 라이트는 안 말하는 팔레트, 표시 없는 기본 상태에 값이 없는 토큰.
 */

const repo = join(__dirname, '..', '..', '..');

/**
 * 앱 다섯의 진입 스타일시트. 이 다섯이 이 저장소의 **호스트** 다 — 각각이 자기 그래프를
 * 하나씩 갖고, 팔레트가 어긋날 수 있는 자리도 그래프마다 다르다.
 */
const HOSTS = ['word', 'slide', 'note', 'site', 'gallery'].map((app) => ({
  app,
  entry: join(repo, 'apps', app, 'src', 'style.css'),
}));

// ── CSS 를 읽는 만큼만 ────────────────────────────────────────────────────
//
// postcss 를 끌어오지 않는다. 이 검사가 답해야 하는 것은 *선택자와 커스텀 프로퍼티* 뿐이고,
// 그것은 200줄로 읽힌다. 파서를 의존성으로 들이면 이 검사가 그 파서의 버전에 매이고,
// 실패했을 때 무엇이 틀렸는지 읽는 사람이 두 곳을 봐야 한다.

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * `@import` 한 줄을 파일 경로로 — 워크스페이스 패키지는 `exports` 로 묻는다.
 *
 * `@barocss/office-ui/tokens.css` 가 `src/tokens.css` 인 것은 그 패키지의 `package.json` 이
 * 정하는 일이지 이 검사가 정할 일이 아니다. `tailwindcss` 처럼 워크스페이스 밖인 것은 `null`.
 */
function resolveImport(spec: string, from: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const path = resolvePath(dirname(from), spec);
    return existsSync(path) ? path : null;
  }
  const at = /^(@[^/]+\/[^/]+)\/(.+)$/.exec(spec);
  if (!at) return null;
  const [, name, sub] = at;
  const pkgDir = join(repo, 'packages', name.split('/')[1]);
  const manifest = join(pkgDir, 'package.json');
  if (!existsSync(manifest)) return null;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  const door = pkg.exports?.[`./${sub}`];
  if (typeof door === 'string') {
    const path = join(pkgDir, door);
    if (existsSync(path)) return path;
  }
  const guess = join(pkgDir, 'src', sub);
  return existsSync(guess) ? guess : null;
}

type Segment = { file: string; text: string };

/**
 * 그래프를 **순서대로** 펼친다.
 *
 * `@import` 는 시트의 그 자리에 끼워지고, CSS 는 순서로 동점을 가린다. 그러니 앱의 규칙이
 * 패키지의 규칙보다 뒤인지 앞인지는 이 함수가 정확해야 답할 수 있다 — 파일 목록을 따로
 * 만들면 그 순서가 사라진다.
 */
function flatten(file: string, seen = new Set<string>()): Segment[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const raw = stripComments(readFileSync(file, 'utf8'));
  const out: Segment[] = [];
  const re = /@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?[^;]*;/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push({ file, text: raw.slice(last, m.index) });
    last = m.index + m[0].length;
    const target = resolveImport(m[1], file);
    if (target) out.push(...flatten(target, seen));
  }
  out.push({ file, text: raw.slice(last) });
  return out;
}

type Rule = {
  file: string;
  media: string | null;
  selectors: string[];
  decls: Array<{ prop: string; value: string }>;
  order: number;
};

const splitTop = (list: string) => {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
};

function readDecls(body: string) {
  const decls: Array<{ prop: string; value: string }> = [];
  let depth = 0;
  let buf = '';
  const push = () => {
    const text = buf.trim();
    buf = '';
    if (!text.startsWith('--')) return;
    const colon = text.indexOf(':');
    if (colon < 0) return;
    decls.push({
      prop: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
    });
  };
  for (const ch of body) {
    if (ch === '{') {
      depth++;
      buf = '';
      continue;
    }
    if (ch === '}') {
      depth--;
      buf = '';
      continue;
    }
    if (depth > 0) continue;
    if (ch === ';') {
      push();
      continue;
    }
    buf += ch;
  }
  push();
  return decls;
}

function parseInto(css: string, file: string, media: string | null, sink: { rules: Rule[] }) {
  let i = 0;
  let prelude = '';
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      const body = css.slice(i + 1, j);
      const head = prelude.trim();
      prelude = '';
      i = j + 1;
      if (/^@media\b/.test(head)) {
        const cond = head.replace(/^@media\s*/, '').trim();
        parseInto(body, file, media ? `${media} and ${cond}` : cond, sink);
      } else if (/^@(supports|layer|scope|container)\b/.test(head)) {
        parseInto(body, file, media, sink);
      } else if (head.startsWith('@')) {
        // keyframes, font-face: no palette lives here.
      } else if (head) {
        sink.rules.push({
          file: relative(repo, file),
          media,
          selectors: splitTop(head),
          decls: readDecls(body),
          order: sink.rules.length,
        });
      }
      continue;
    }
    if (ch === ';') {
      prelude = '';
      i++;
      continue;
    }
    prelude += ch;
    i++;
  }
}

function rulesOf(entry: string): Rule[] {
  const sink = { rules: [] as Rule[] };
  for (const seg of flatten(entry)) parseInto(seg.text, seg.file, null, sink);
  return sink.rules;
}

// ── 뿌리에서의 명시도와 매칭 ───────────────────────────────────────────────

type Ctx = { systemDark: boolean; theme: 'dark' | 'light' | null };

const SYSTEM_LIGHT: Ctx = { systemDark: false, theme: null };
const SYSTEM_DARK: Ctx = { systemDark: true, theme: null };
const EXPLICIT_DARK: Ctx = { systemDark: false, theme: 'dark' };
const EXPLICIT_LIGHT: Ctx = { systemDark: true, theme: 'light' };

const SIMPLE =
  /::[-\w]+|:[-\w]+\([^()]*\)|:[-\w]+|\[[^\]]+\]|\.[-\w]+|#[-\w]+|[-\w]+|\*/g;

/** `(a, b, c)` — id, class 급, 타입. `:not()` 은 자기는 0이고 인자를 센다. */
function specificity(sel: string): [number, number, number] {
  const total: [number, number, number] = [0, 0, 0];
  const add = (s: [number, number, number]) => {
    total[0] += s[0];
    total[1] += s[1];
    total[2] += s[2];
  };
  for (const part of sel.match(SIMPLE) ?? []) {
    if (part.startsWith('#')) add([1, 0, 0]);
    else if (part.startsWith('.') || part.startsWith('[')) add([0, 1, 0]);
    else if (part.startsWith('::')) add([0, 0, 1]);
    else if (part.startsWith(':')) {
      const fn = /^:([-\w]+)\((.*)\)$/.exec(part);
      if (fn && ['not', 'is', 'has'].includes(fn[1])) {
        const inner = splitTop(fn[2]).map(specificity);
        add(inner.reduce((a, b) => (cmp(a, b) >= 0 ? a : b), [0, 0, 0] as [number, number, number]));
      } else if (fn && fn[1] === 'where') {
        // contributes nothing, by definition
      } else add([0, 1, 0]);
    } else if (part !== '*') add([0, 0, 1]);
  }
  return total;
}

const cmp = (a: [number, number, number], b: [number, number, number]) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const HAS_COMBINATOR = /[\s>+~]/;

/** `<html data-theme=…>` 하나를 상대로만 묻는다 — 팔레트가 사는 곳이 거기다. */
function matchesRoot(sel: string, ctx: Ctx): boolean {
  const one = sel.trim();
  if (!one || HAS_COMBINATOR.test(one)) return false;
  const parts = one.match(SIMPLE) ?? [];
  if (parts.join('') !== one) return false;
  return parts.every((part) => matchPart(part, ctx));
}

function matchPart(part: string, ctx: Ctx): boolean {
  if (part === ':root' || part === 'html' || part === '*') return true;
  const fn = /^:([-\w]+)\((.*)\)$/.exec(part);
  if (fn) {
    const args = splitTop(fn[2]);
    if (fn[1] === 'not') return args.every((a) => !matchesRoot(a, ctx));
    if (fn[1] === 'is' || fn[1] === 'where') return args.some((a) => matchesRoot(a, ctx));
    return false;
  }
  const attr = /^\[\s*([-\w]+)\s*(?:([~|^$*]?=)\s*["']?([^"'\]]*)["']?\s*)?\]$/.exec(part);
  if (attr) {
    const [, name, op, want] = attr;
    const have = name === 'data-theme' ? ctx.theme : null;
    if (!op) return have !== null;
    return op === '=' ? have === want : false;
  }
  return false;
}

const mediaApplies = (media: string | null, ctx: Ctx): boolean | null => {
  if (!media) return true;
  const flat = media.replace(/\s+/g, '');
  const dark = flat.includes('prefers-color-scheme:dark');
  const light = flat.includes('prefers-color-scheme:light');
  if (!dark && !light) return null; // 팔레트 질문이 아니다 — 세지 않는다
  const rest = flat.replace(/\(prefers-color-scheme:(dark|light)\)/g, '').replace(/^and|and$/g, '');
  if (rest.replace(/[()and]/g, '')) return null; // 폭까지 걸린 블록은 이 질문 밖이다
  return dark ? ctx.systemDark : !ctx.systemDark;
};

type Won = { value: string; rule: Rule; selector: string };

/** 네 상태 중 하나에서 뿌리가 실제로 갖는 커스텀 프로퍼티 — 캐스케이드를 그대로 돌린다. */
function cascade(rules: Rule[], ctx: Ctx): Map<string, Won> {
  const won = new Map<string, Won & { spec: [number, number, number] }>();
  for (const rule of rules) {
    if (mediaApplies(rule.media, ctx) !== true) continue;
    let best: { sel: string; spec: [number, number, number] } | null = null;
    for (const sel of rule.selectors) {
      if (!matchesRoot(sel, ctx)) continue;
      const s = specificity(sel);
      if (!best || cmp(s, best.spec) > 0) best = { sel, spec: s };
    }
    if (!best) continue;
    for (const decl of rule.decls) {
      const prev = won.get(decl.prop);
      if (prev && cmp(best.spec, prev.spec) < 0) continue;
      won.set(decl.prop, { value: decl.value, rule, selector: best.sel, spec: best.spec });
    }
  }
  return won;
}

const VAR = /var\(\s*(--[-\w]+)\s*(?:,([^()]*))?\)/;

/** `var()` 를 **선언된 자리에서** 푼다 — 별칭이 스냅샷인 것과 같은 이유로. */
function substitute(won: Map<string, Won>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [prop, { value }] of won) {
    let text = value;
    for (let pass = 0; pass < 16 && VAR.test(text); pass++) {
      text = text.replace(VAR, (_all, name: string, fallback?: string) => {
        const target = won.get(name);
        if (target) return target.value;
        return (fallback ?? '').trim();
      });
    }
    out.set(prop, text.replace(/\s+/g, ' ').trim());
  }
  return out;
}

const palettes = HOSTS.filter((h) => existsSync(h.entry)).map((h) => {
  const rules = rulesOf(h.entry);
  return {
    app: h.app,
    rules,
    systemLight: substitute(cascade(rules, SYSTEM_LIGHT)),
    systemDark: substitute(cascade(rules, SYSTEM_DARK)),
    explicitDark: substitute(cascade(rules, EXPLICIT_DARK)),
    explicitLight: substitute(cascade(rules, EXPLICIT_LIGHT)),
    rawExplicitDark: cascade(rules, EXPLICIT_DARK),
  };
});

/**
 * 이 선택자는 **`data-theme` 가 찍혀야만** 맞는가.
 *
 * 문자열로 `[data-theme='light']` 를 찾으면 안 된다 — `:root:not([data-theme='light'])` 안에도 그
 * 글자가 있고, 그것은 라이트를 *말하는* 것이 아니라 라이트를 *사양하는* 것이다. 정확히 반대다.
 * 그래서 문자열이 아니라 매칭으로 묻는다: 그 테마에서는 맞고, 표시 없는 상태에서는 안 맞는가.
 */
const demandsTheme = (sel: string, which: 'dark' | 'light') =>
  matchesRoot(sel, { systemDark: false, theme: which }) &&
  !matchesRoot(sel, { systemDark: false, theme: null });

/** 팔레트 질문에 참여하는 규칙만 — 폭 미디어나 `[data-density]` 는 이 파일의 일이 아니다. */
const themeRules = (rules: Rule[]) =>
  rules.filter((r) => r.decls.length > 0 && mediaApplies(r.media, SYSTEM_LIGHT) !== null);

describe('다크가 정말 읽히는가', () => {
  it('앱 다섯의 스타일 그래프를 다 펼쳐 읽었다', () => {
    expect(palettes.map((p) => p.app)).toEqual(['word', 'slide', 'note', 'site', 'gallery']);
    for (const p of palettes) {
      expect(p.systemLight.get('--ou-panel'), `${p.app}: --ou-panel`).toBeTruthy();
      expect(p.systemLight.get('--ou-ink'), `${p.app}: --ou-ink`).toBeTruthy();
    }
  });

  /**
   * **표시 없는 기본 상태가 진짜 기본이다.**
   *
   * 어떤 토큰이 미디어 블록이나 `[data-theme]` 블록 안에서**만** 선언되면, `data-theme` 도
   * 없고 시스템도 라이트인 — 이 저장소의 앱이 대부분의 시간을 보내는 — 상태에서 그 이름은
   * 값이 없다. `var(--x)` 는 조용히 빈 문자열이 되고, 배경 하나가 사라진다.
   */
  it("색 토큰은 표시 없는 기본 상태에서도 값을 갖는다", () => {
    const missing: string[] = [];
    for (const p of palettes) {
      const named = new Set<string>();
      for (const rule of themeRules(p.rules)) {
        const reachable = [SYSTEM_LIGHT, SYSTEM_DARK, EXPLICIT_DARK, EXPLICIT_LIGHT].some(
          (ctx) => mediaApplies(rule.media, ctx) === true && rule.selectors.some((s) => matchesRoot(s, ctx)),
        );
        if (!reachable) continue;
        for (const d of rule.decls) named.add(d.prop);
      }
      for (const prop of [...named].sort()) {
        if (!p.systemLight.has(prop)) missing.push(`${p.app}: ${prop}`);
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * **명시적 `[data-theme='dark']` 가 `:root:not([data-theme='light'])` 에 명시도로 지지 않는다.**
   *
   * `:root:not([data-theme='light'])` 는 `(0,2,0)` 이고 `[data-theme='dark']` 는 `(0,1,0)` 이다.
   * 그래서 미디어 블록 **밖** 에 그 선택자를 쓰면 — 다크를 이기려고 올린 명시도가 —
   * `<html data-theme="dark">` 에도 맞으면서 패키지의 다크 팔레트를 덮는다. 라이트 기계에서
   * 다크를 명시하면 **라이트 값이 이긴다.**
   *
   * 이겨도 된다. 이긴 쪽이 다크 값을 내면. 그래서 명시도 사실과 **값** 을 같이 묻는다.
   */
  it("명시적 [data-theme='dark'] 가 :root:not([data-theme='light']) 에 명시도로 지지 않는다", () => {
    const beaten: string[] = [];
    for (const p of palettes) {
      const darkSaid = new Set<string>();
      for (const rule of p.rules) {
        if (!rule.selectors.some((s) => demandsTheme(s, 'dark'))) continue;
        for (const d of rule.decls) darkSaid.add(d.prop);
      }
      for (const prop of [...darkSaid].sort()) {
        const won = p.rawExplicitDark.get(prop);
        if (!won) continue;
        const outSpecified = /:not\(\s*\[data-theme=['"]?light['"]?\]\s*\)/.test(won.selector);
        if (!outSpecified) continue;
        const here = p.explicitDark.get(prop);
        const there = p.systemDark.get(prop);
        if (here !== there) {
          beaten.push(
            `${p.app}: ${prop} — '${won.selector}' (${won.rule.file}) 가 이겨서 명시적 다크는 ` +
              `'${here}', 시스템 다크는 '${there}'`,
          );
        }
      }
    }
    expect(beaten).toEqual([]);
  });

  /**
   * **`prefers-color-scheme: dark` 미디어 블록은 `:not([data-theme='light'])` 방패를 갖는다.**
   *
   * 방패가 없으면 다크 기계에서 `data-theme="light"` 를 찍어도 그 블록이 그대로 맞는다 —
   * 그 앱의 *밝게* 가 아무 일도 안 한다. 거울상의 반쪽이고, 다른 반쪽은 위 검사가 잡는다.
   */
  it("prefers-color-scheme: dark 블록은 :not([data-theme='light']) 방패를 갖는다", () => {
    const bare: string[] = [];
    for (const p of palettes) {
      for (const rule of p.rules) {
        if (mediaApplies(rule.media, SYSTEM_DARK) !== true || !rule.media) continue;
        for (const sel of rule.selectors) {
          if (/:not\(\s*\[data-theme=['"]?light['"]?\]\s*\)/.test(sel)) continue;
          bare.push(`${rule.file}: @media ${rule.media} { ${sel} }`);
        }
      }
    }
    expect([...new Set(bare)]).toEqual([]);
  });

  /**
   * 그리고 정리 그 자체 — **명시적 다크는 시스템 다크와 같은 팔레트여야 한다.**
   *
   * 위의 두 검사는 이것이 깨지는 두 가지 *기계* 를 이름으로 잡고, 이 검사는 결과를 잡는다.
   * 새로운 기계가 생겨도 이건 그대로 빨개진다.
   */
  it('명시적 다크는 시스템 다크와 같은 팔레트를 낸다', () => {
    const drift: string[] = [];
    for (const p of palettes) {
      for (const [prop, value] of p.systemDark) {
        const explicit = p.explicitDark.get(prop);
        if (explicit !== value) drift.push(`${p.app}: ${prop} — 시스템 '${value}' vs 명시 '${explicit}'`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('명시적 라이트는 시스템 라이트와 같은 팔레트를 낸다', () => {
    const drift: string[] = [];
    for (const p of palettes) {
      for (const [prop, value] of p.systemLight) {
        const explicit = p.explicitLight.get(prop);
        if (explicit !== value) drift.push(`${p.app}: ${prop} — 시스템 '${value}' vs 명시 '${explicit}'`);
      }
    }
    expect(drift).toEqual([]);
  });

  /**
   * **팔레트가 라이트와 다크를 둘 다 가지면 둘을 같은 방식으로 말해야 한다.**
   *
   * 미디어 블록만 있고 `[data-theme='dark']` 블록이 없으면, 그 팔레트는 *시스템이 다크일 때*
   * 만 다크다 — 제품의 스위치는 그 이름들에 닿지 못한다. 위의 값 검사가 뿌리에서 그것을
   * 잡지만, 이 검사는 **이름 단위로** 무엇이 빠졌는지 말한다.
   */
  it('다크 미디어 블록이 말하는 이름은 [data-theme=\'dark\'] 도 말한다', () => {
    const unsaid: string[] = [];
    for (const p of palettes) {
      const inMedia = new Map<string, string>();
      const inAttr = new Set<string>();
      for (const rule of p.rules) {
        const rootish = rule.selectors.some((s) => /:root|^html\b|\[data-theme/.test(s));
        if (!rootish) continue;
        if (rule.media && mediaApplies(rule.media, SYSTEM_DARK) === true) {
          for (const d of rule.decls) inMedia.set(d.prop, rule.file);
        }
        if (!rule.media && rule.selectors.some((s) => demandsTheme(s, 'dark'))) {
          for (const d of rule.decls) inAttr.add(d.prop);
        }
      }
      for (const [prop, file] of [...inMedia].sort()) {
        if (!inAttr.has(prop)) unsaid.push(`${p.app}: ${prop} (${file})`);
      }
    }
    expect([...new Set(unsaid)]).toEqual([]);
  });

  /**
   * **`[data-theme='light']` 도 있어야 한다 — 뿌리가 아닌 곳에서.**
   *
   * `:not([data-theme='light'])` 가드는 *뿌리* 만 지킨다. 다크 문서 안의 한 조각을 라이트로
   * 되돌리려면 그 조각에 `[data-theme='light']` 를 찍는 수밖에 없고, 그 이름을 아무도
   * 선언하지 않으면 그 스위치는 아무 일도 안 한다. `apps/gallery/src/gallery.tsx:65` 가 정확히
   * 그 스위치를 `.ga-shell` 에 붙인다.
   *
   * 그래서 규칙은 대칭이다: **`[data-theme='dark']` 가 말하는 이름은 `[data-theme='light']` 도
   * 말한다.**
   */
  it("[data-theme='dark'] 가 말하는 이름은 [data-theme='light'] 도 말한다", () => {
    const unsaid: string[] = [];
    for (const p of palettes) {
      const dark = new Map<string, string>();
      const light = new Set<string>();
      for (const rule of p.rules) {
        if (rule.media) continue;
        const said = (which: 'dark' | 'light') =>
          rule.selectors.some((s) => demandsTheme(s, which));
        if (said('dark')) for (const d of rule.decls) dark.set(d.prop, rule.file);
        if (said('light')) for (const d of rule.decls) light.add(d.prop);
      }
      for (const [prop, file] of [...dark].sort()) {
        if (!light.has(prop)) unsaid.push(`${p.app}: ${prop} (${file})`);
      }
    }
    expect([...new Set(unsaid)]).toEqual([]);
  });
});
