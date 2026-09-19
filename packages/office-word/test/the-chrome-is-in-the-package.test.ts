import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **이 패키지가 그리는 클래스를 앱의 스타일시트만 꾸미고 있지 않은가.**
 *
 * ## 왜 이 검사가 있나
 *
 * 셸을 제품으로 옮기는 일은 **코드가 먼저 가고 생김새가 남는다.** 그 사이의 상태가 조용하다는
 * 것이 이 저장소가 이 회차까지 네 번 값을 치른 사실이다:
 *
 * | | |
 * |---|---|
 * | `tsc` | 초록 |
 * | 단위 검사 | 초록 |
 * | **`apps/word` 의 브라우저 회차** | **초록** — 그 앱은 자기 `style.css` 를 갖고 있다 |
 * | 다른 호스트가 `@barocss/office-word/ui` 를 그릴 때 | **규칙이 하나도 없다** |
 *
 * 실제로 그랬던 것들: 수식 31개(`office-text` 가 그리는데 규칙은 `apps/word` 에만) ·
 * `highlight-decorators.ts`(템플릿은 패키지로 갔는데 `.w-find-hit`·`.w-comment-hit` 규칙은 앱에) ·
 * `renderers/page.ts` 의 `` `w-${placementKind}-source` ``(글자로 안 잡혀 *앱의 것* 으로 세어졌다).
 * 셋 다 사람이 손으로 세다가 찾았다.
 *
 * `office-site/test/page-css-covers-what-a-page-draws.test.ts` 가 사이트 쪽에서 같은 질문을 한다 —
 * *그려지는데 아무도 안 꾸미는 것*. 이 파일은 워드 쪽의 같은 질문이고, 답은 `ui.css` 다.
 *
 * ## 무엇을 결함으로 세나 — **혼자 선 클래스만**
 *
 * `.w-cell[data-cell-selected]` 처럼 상태가 붙은 선택자는 결함이 아니다. 편집기만 만드는 상태이고,
 * 그 규칙이 없는 호스트는 **틀린 게 아니라 그 상태가 없다.** 결함은 선택자 전체가 클래스 하나인
 * 규칙이다 — 그 모양일 때만 클래스가 *생김새를 지고 있고*, 그것을 잃으면 생김새를 잃는다.
 * (사이트 쪽 검사가 같은 기준을 같은 이유로 쓴다.)
 */
describe('워드의 크롬은 워드 패키지에 있다', () => {
  const repo = join(__dirname, '..', '..', '..');
  const APP_SHEET = join(repo, 'apps', 'word', 'src', 'style.css');
  const UI_CSS = join(__dirname, '..', 'src', 'ui.css');
  const TEXT_CSS = join(repo, 'packages', 'office-text', 'src', 'text.css');

  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

  /** 선택자 전체가 클래스 하나인 규칙의 그 클래스들. */
  const bare = (css: string): Set<string> =>
    new Set(
      [...strip(css).matchAll(/([^{};]+)\{/g)]
        .flatMap((one) => one[1].split(','))
        .map((one) => one.replace(/\s+/g, ' ').trim())
        .filter((one) => /^\.[-\w]+$/.test(one))
        .map((one) => one.slice(1))
    );

  /**
   * 이 패키지가 요소에 **글자로** 얹는 클래스 전부.
   *
   * 템플릿 리터럴의 **앞부분** 도 센다: `` className: `w-${placementKind}-source` `` 는 이름을
   * 알 수 없지만 `` `w-frame ${extra}` `` 는 `w-frame` 을 안다. `docs/specs/shared-layer.md` 가
   * 적어 둔 오검출이 이 한 줄의 반대편이다 — 그때는 이것을 안 세서 클래스 16개가 죽었다고
   * 보고됐다. 여기서는 못 세는 쪽이 안전한 방향이다: 못 센 이름은 결함으로 안 걸릴 뿐이다.
   */
  const drawn = (): Map<string, Set<string>> => {
    const found = new Map<string, Set<string>>();
    const src = join(__dirname, '..', 'src');
    const add = (value: string, where: string) => {
      for (const one of value.split(/\s+/)) {
        if (!one) continue;
        if (!found.has(one)) found.set(one, new Set());
        found.get(one)!.add(where);
      }
    };
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        const text = readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        const where = path.replace(`${repo}/`, '');
        for (const one of text.matchAll(/className:\s*['"]([^'"$]+)['"]/g)) add(one[1], where);
        for (const one of text.matchAll(/className=["']([^"'$]+)["']/g)) add(one[1], where);
        for (const one of text.matchAll(/className:\s*`([^`$]*)/g)) add(one[1], where);
      }
    };
    walk(src);
    return found;
  };

  /**
   * **면제 목록이 아니라 다른 파일의 결정을 읽는다.**
   *
   * `.w-table`·`.w-cell`·`.w-cell-clip` 은 `office-text` 로 내려갔다가 그 시간 안에 되돌아왔다:
   * `bTable` 은 office 스키마의 것이라 **발행된 사이트 페이지도 표를 갖는데** `text.css` 는
   * 편집기만 싣는다. 한 번의 변경이 파일 둘이고 둘째(`office-site/src/page-css.ts`)가 다른 주인의
   * 것이라 되돌렸다. 그 근거와 세 이름이 `office-text/src/text.css` 에 적혀 있다.
   *
   * 그래서 그 셋을 여기 **다시 적지 않고 거기서 읽는다.** 이름을 옮겨 적으면 그것은 내가 만든
   * 면제이고, *느슨함이 결함* 의 모양이다 — 그 파일이 결정을 바꾸면 이 검사가 따라 바뀌어야 하는데
   * 사본은 안 따라간다. 읽어서 아무것도 못 찾으면 목록이 비고 검사는 **빨개진다**: 닫히는 쪽으로
   * 실패한다.
   */
  const recordedAsHeldBack = (): string[] => {
    const text = readFileSync(TEXT_CSS, 'utf8');
    return [...text.matchAll(/\.(w-[\w-]+)\s+—\s+drawn by/g)].map((one) => one[1]);
  };

  it('이 패키지가 그리는 클래스를 앱의 스타일시트가 혼자 꾸미지 않는다', () => {
    const held = new Set(recordedAsHeldBack());
    const app = bare(readFileSync(APP_SHEET, 'utf8'));
    const ui = bare(readFileSync(UI_CSS, 'utf8'));
    const text = bare(readFileSync(TEXT_CSS, 'utf8'));
    const writes = drawn();

    const stranded = [...writes.keys()]
      .filter((cls) => app.has(cls) && !ui.has(cls) && !text.has(cls) && !held.has(cls))
      .map((cls) => `${cls} — ${[...writes.get(cls)!].sort().join(', ')}`)
      .sort();

    expect(
      stranded,
      [
        '이 패키지가 그리는데 규칙이 `apps/word/src/style.css` 에만 있습니다.',
        '`apps/word` 밖에서 `@barocss/office-word/ui` 를 그리면 그 요소는 규칙이 하나도 없이',
        '나옵니다 — 에러는 어디에도 안 납니다. 규칙을 `packages/office-word/src/ui.css` 로:',
        ...stranded
      ].join('\n')
    ).toEqual([]);

    // 되돌린 셋을 실제로 읽었는가. 못 읽으면 위가 면제 없이 돌아 빨개지므로 이 줄은 *왜* 빨간지를
    // 말해 주는 것이지 통과를 만들어 주는 것이 아니다.
    expect(held.size, `office-text/src/text.css 가 기록한 보류 목록: ${[...held].join(', ')}`).toBe(3);
  });

  /**
   * **값 없는 `var(--ou-…)` 는 잘못된 회색이 아니라 선언 없음이다.**
   *
   * computed-value time 에 무효라 **선언 전체를 가져간다.** 그래서 `tokens.css` 없이 이 부품을
   * 얹은 호스트는 테두리가 회색으로 어긋나는 게 아니라 **테두리가 없다** — 조용하고 전면적이다.
   * `docs/specs/architecture.md` 가 *다른 CMS 에 마운트할 수 있다* 의 실제 내용이 이것이라고 적어
   * 두었고, `office-slides`·`office-site` 가 371곳에 폴백을 달아 그것을 갚았다.
   */
  it('office-ui 의 토큰을 폴백 없이 읽지 않는다', () => {
    const css = strip(readFileSync(UI_CSS, 'utf8'));
    const naked = [...css.matchAll(/var\(\s*(--ou-[\w-]+)\s*\)/g)].map((one) => one[1]);
    expect(
      [...new Set(naked)].sort(),
      '폴백을 다세요 — `var(--ou-line, #d4d4d4)`. 값이 없으면 그 선언이 통째로 사라집니다'
    ).toEqual([]);

    // 아무것도 안 읽어서 초록인 것과 구별한다.
    const withFallback = [...css.matchAll(/var\(\s*--ou-[\w-]+\s*,/g)].length;
    expect(withFallback, '이 파일은 스위트의 토큰을 실제로 읽는다').toBeGreaterThan(20);
  });
});
