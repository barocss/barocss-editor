import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **앱은 자기가 그리는 셸의 클래스를 훑는다.**
 *
 * ## 이 검사가 찾는 결함 — 그리고 왜 이것만 조용한가
 *
 * Tailwind 는 **소스를 훑어서** 쓰인 유틸리티만 규칙으로 낸다. 앱의 `style.css` 가
 * `@source "…/packages/<제품>/src"` 를 안 적으면, 그 패키지의 부품들은 **클래스 속성은 그대로
 * 붙은 채 뒤에 규칙이 하나도 없다.**
 *
 * | | |
 * |---|---|
 * | `tsc` | 초록 |
 * | 단위 검사 | 초록 |
 * | 브라우저 | **여기서만 보인다** |
 *
 * 이 저장소가 이번 회차에 다섯 번 만난 *가드가 자기가 막을 것을 못 본다* 의 새 종류이고, 유일하게
 * **빌드 시점** 의 것이다.
 *
 * ## 무엇이 있었나
 *
 * 셸 이주가 `apps/word`·`apps/slide`·`apps/site` 의 조각들을 제품 패키지로 옮겼다. 이주를 병렬로
 * 돌린 에이전트가 `apps/word` 에서 이것을 **스스로 알아채고 고쳤다** — `apps/note/src/style.css`
 * 에 그 짝이 이미 있었기 때문이다(`office-ui` 와 `office-note` 둘 다 훑는다).
 *
 * 나머지 둘은 안 되어 있었고, 브라우저 회차는 **여전히 초록이었다**: 앱이 자기 `style.css` 를
 * 그대로 갖고 있으므로 앱 자신은 멀쩡하다. 깨지는 것은 **독립된 호스트가 그 패키지를 그릴 때** 다 —
 * 그리고 그건 *패키지가 독립인가* 라는 질문 자체다.
 */
const ROOT = join(__dirname, '..', '..', '..');

/** 앱과 그 앱의 제품 패키지. 앱이 자기 제품의 셸을 그린다. */
const PAIRS: [string, string][] = [
  ['word', 'office-word'],
  ['slide', 'office-slides'],
  ['site', 'office-site'],
  ['note', 'office-note']
];

const hasChrome = (pkg: string): boolean => {
  const src = join(ROOT, 'packages', pkg, 'src');
  if (!existsSync(src)) return false;
  const walk = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? false : walk(path);
      if (!entry.name.endsWith('.tsx')) return false;
      /* Tailwind 유틸리티를 실제로 쓰는가 — `className` 하나로는 모자라다. */
      return /className=["'`][^"'`]*\b(flex|grid|gap-|px-|py-|text-|bg-|rounded|border|w-|h-|items-|justify-)/.test(
        readFileSync(path, 'utf8')
      );
    });
  return walk(src);
};

describe('앱의 스타일시트', () => {
  it('넷 다 있다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    const missing = PAIRS.filter(([app]) => !existsSync(join(ROOT, 'apps', app, 'src', 'style.css')));
    expect(missing.map(([app]) => app)).toEqual([]);
  });

  it('자기 제품 패키지의 셸을 훑는다', () => {
    const found: string[] = [];

    for (const [app, pkg] of PAIRS) {
      if (!hasChrome(pkg)) continue;
      const css = readFileSync(join(ROOT, 'apps', app, 'src', 'style.css'), 'utf8');
      if (!new RegExp(`@source\\s+["'][^"']*packages/${pkg}/src`).test(css)) {
        found.push(`apps/${app}/src/style.css → @source ".../packages/${pkg}/src"`);
      }
    }

    expect(
      found,
      `앱이 자기 제품의 셸을 안 훑습니다 — 그 부품들은 **클래스만 붙고 규칙이 없습니다.** ` +
        `tsc 도 단위 검사도 못 봅니다:\n${found.join('\n')}`
    ).toEqual([]);
  });
});
