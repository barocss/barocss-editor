import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * **앱은 자기가 쓰는 패키지의 *스타일 문* 도 가져간다.**
 *
 * ## 무엇이 이 검사를 부르나
 *
 * 이 저장소에는 문을 세는 검사가 둘 있다. `every-app-scans-the-chrome-it-draws` 는 Tailwind
 * `@source` 를, `every-door-a-package-opens-is-built` 는 빌드가 문을 내는지 센다. **앱이 그 문을
 * 실제로 `import` 하는지는 아무도 안 셌다.**
 *
 * 그 구멍이 이미 두 번 값을 받았다:
 *
 * 1. `apps/site` 가 `office-ui` 의 컴포넌트를 쓰면서 `tokens.css` 를 안 가져갔다. `var(--ou-…)`
 *    가 전부 아무 값도 아니게 되어, 공유 컨트롤로 만든 툴바와 속성 패널이 **테두리도 패널
 *    바탕도 없이** 그렸다 — 그것이 대체한 손으로 쓴 크롬보다 못하게. tsc 초록, 단위 초록.
 * 2. `.sr-only` 를 `office-ui` 로 옮길 때 `./ui.css` 라는 **두 번째 문** 을 열지 않고
 *    `tokens.css` 안에 넣은 이유가 바로 이 구멍이었다 — 두 번째 문은 잊을 것이 하나 더 늘어난
 *    것이고, 잊었는지 아무도 안 세니까. `tokens.css` 머리말이 그 판단을 길게 적어 뒀다.
 *
 * 두 번째가 이 검사의 요점이다. **문이 잊힐 수 있다는 사실이 설계를 왜곡했다.** 세는 것이
 * 생기면 문은 필요한 만큼 열 수 있다.
 *
 * ## 왜 여기에 사나
 *
 * 규칙은 저장소 전체의 것이고, 그러면 `packages/conformance/test/` 가 맞다. 이번 회차에 그
 * 디렉터리에 새로 열 수 있는 파일이 하나였고 그것은 다크의 것이라 여기 적는다 — 잊힌 문이
 * **이 패키지의 문** 이었고, 이 패키지의 검사가 이미 저장소를 밖에서 읽는다(`tokens.test.ts`).
 * conformance 의 주인이 파일을 열면 그쪽으로 옮기면 된다. 사는 곳이 바뀌어도 묻는 것은 같다.
 */

const repo = join(__dirname, '..', '..', '..');

/** 어떤 패키지가 여는 스타일 문 — `package.json` 이 정하지 이 검사가 정하지 않는다. */
function cssDoors(pkgName: string): Array<{ spec: string; path: string }> {
  const dir = join(repo, 'packages', pkgName.replace(/^@barocss\//, ''));
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return [];
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { exports?: Record<string, unknown> };
  return Object.entries(pkg.exports ?? {})
    .filter(([door]) => door.endsWith('.css'))
    .map(([door, target]) => ({
      spec: `${pkgName}/${door.replace(/^\.\//, '')}`,
      path: typeof target === 'string' ? join(dir, target) : '',
    }));
}

const IMPORT = /@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?[^;]*;/g;

/** `@import` 를 따라 들어가며 이 호스트가 실제로 싣는 스펙 전부. */
function importedBy(entry: string, seen = new Set<string>()): Set<string> {
  const specs = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, spec] of text.matchAll(IMPORT)) {
      specs.add(spec);
      const next = spec.startsWith('.')
        ? resolve(dirname(file), spec)
        : (() => {
            const at = /^(@[^/]+\/[^/]+)\/(.+)$/.exec(spec);
            if (!at) return '';
            const door = cssDoors(at[1]).find((d) => d.spec === spec);
            return door?.path ?? '';
          })();
      if (next) walk(next);
    }
  };
  walk(entry);
  return specs;
}

const stylesheetsOf = (app: string) => {
  const src = join(repo, 'apps', app, 'src');
  if (!existsSync(src) || !statSync(src).isDirectory()) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.css')) out.push(path);
    }
  };
  walk(src);
  return out;
};

const hosts = readdirSync(join(repo, 'apps'))
  .filter((app) => existsSync(join(repo, 'apps', app, 'package.json')))
  .map((app) => {
    const pkg = JSON.parse(readFileSync(join(repo, 'apps', app, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@barocss/'));
    const sheets = stylesheetsOf(app);
    const loaded = new Set<string>();
    const seen = new Set<string>();
    for (const sheet of sheets) for (const spec of importedBy(sheet, seen)) loaded.add(spec);
    return {
      app,
      sheets: sheets.map((s) => relative(repo, s)),
      /** 이 앱이 의존한다고 **선언한** 패키지가 여는 스타일 문 전부. */
      owed: deps.flatMap((d) => cssDoors(d).map((door) => door.spec)),
      loaded,
    };
  });

describe('앱은 자기가 쓰는 패키지의 스타일 문을 가져간다', () => {
  /**
   * **아무 데도 안 보고 초록인 검사가 이 검사의 유일한 실패 방식이다.**
   *
   * 문이 없다고 답하는 것과 문을 안 찾아봤다고 답하는 것은 같은 초록으로 보인다. 그래서
   * 세어 둔다: 스타일 문을 여는 패키지가 **여섯**이고, 그중 `office-ui` 의 것은 스위트의 앱
   * 다섯이 다 갚아야 한다.
   *
   * **다섯이었다가 여섯이 됐다.** 이 머리말이 예언한 그대로다 — *"이름으로 적은 목록은 아직
   * 열리지 않은 문을 모른다."* 2026-09-06 에 Word 의 크롬 CSS 599줄이 앱에서 패키지로 내려가며
   * `office-word` 가 넷 중 마지막으로 `./ui.css` 를 열었고, 이 줄이 그날 빨개졌다. 목록을 손으로
   * 고치는 것이 이 검사의 값이다: 문이 하나 열릴 때마다 사람이 한 번 그것을 본다.
   */
  it('문을 여는 패키지와 그 빚을 진 호스트를 실제로 셌다', () => {
    const doorOpeners = readdirSync(join(repo, 'packages')).filter(
      (name) => cssDoors(`@barocss/${name}`).length > 0,
    );
    expect(doorOpeners.sort()).toEqual([
      'office-note',
      'office-site',
      'office-slides',
      'office-text',
      'office-ui',
      'office-word',
      'office-workspace',
      'query-editor',
    ]);

    const owingTokens = hosts
      .filter((h) => h.owed.includes('@barocss/office-ui/tokens.css'))
      .map((h) => h.app)
      .sort();
    expect(owingTokens).toEqual(['gallery', 'note', 'office', 'site', 'slide', 'word']);
  });

  /**
   * 그리고 그 빚을 갚았는가. **`@barocss/office-ui/tokens.css` 를 `import` 하지 않는 호스트를
   * 세는 검사가 없다** 는 백로그 항목이 이 줄이다 — 토큰만이 아니라 문 전부로 적었다. 다음에
   * 잊힐 문은 아직 열리지 않은 문이고, 이름으로 적은 목록은 그 문을 모른다.
   */
  it('의존한다고 적은 패키지의 스타일 문을 하나도 빠뜨리지 않는다', () => {
    const unpaid: string[] = [];
    for (const host of hosts) {
      // 스타일시트가 없는 앱은 그릴 것이 없다 — 크롬을 안 그리는 하네스가 이 저장소에 넷 있다.
      if (host.sheets.length === 0) continue;
      for (const door of host.owed) {
        if (!host.loaded.has(door)) unpaid.push(`apps/${host.app}: ${door}`);
      }
    }
    expect([...new Set(unpaid)].sort()).toEqual([]);
  });
});
