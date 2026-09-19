import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **같은 것을 다시 그리는 것은 바뀐 것이 아니다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * 2026-09-06, Word 브라우저 검사 열여덟 개가 빨개졌다. 원인을 되돌려 가며 좁히니 픽스처였고,
 * 픽스처의 잘못이 아니라 **픽스처가 드러낸 제품 결함**이었다: 주석이 하나라도 있는 문서는
 * **키 하나에 렌더가 두 배** 였다(예산 3, 실제 6).
 *
 * 사슬은 이랬다.
 *
 * 1. 키 입력 → `editor:content.change` → 패널의 `revision` 증가 → React 재렌더
 * 2. 패널이 `threads` 를 **매번 새 배열**로 만든다
 * 3. `useEffect(…, [view, threads, selected])` 가 그래서 **키 입력마다** 다시 돈다
 * 4. 정리 함수가 `setDecorators(X, [])` → 렌더, 이어서 본문이 `setDecorators(X, [...])` → 렌더
 *
 * 그리고 이것이 왜 여태 안 보였나: **샘플에 주석이 없으면** 빈 것을 지우고 빈 것을 넣는 것이 둘 다
 * 무동작이다. *깨끗한 통과는 제품이 옳다는 뜻이 아니라 픽스처가 얇다는 뜻이다.*
 *
 * ## 그리고 같은 모양이 하나 더 있었다
 *
 * `find-panel.tsx` 가 `[view, matches, current]` 로 글자 하나 다르지 않게 같은 일을 한다. 지금
 * 아무 검사도 그것을 못 본다 — **찾기 패널을 열어 둔 채 타이핑하는 검사가 없기 때문이다.** 주석이
 * 안 보였던 이유와 같은 종류이고, 그래서 세 번째가 오기 전에 여기 적는다.
 *
 * ## 무엇을 세는가
 *
 * 두 가지다.
 *
 * - **뿌리**: `setDecorators` 가 *바뀌었는지* 를 실제로 판단해야 한다. `changed = true` 를 넣는
 *   자리마다 무조건 세우면 그 이름은 거짓말이고, 같은 목록을 다시 줘도 문서 전체가 다시 그려진다.
 * - **증상**: 정리 함수에서 데코레이터를 지우면서 의존 배열에 **매번 새로 만들어지는 배열**을 둔
 *   `useEffect`. 그 둘이 만나면 아무것도 안 바뀐 키 입력이 두 번의 그리기가 된다.
 */
const ROOT = join(__dirname, '..', '..', '..');

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

// CI runs on Node 20, which does not provide node:fs.globSync.
const sourceComponents = (): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.tsx')) files.push(path);
    }
  };
  for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
    const src = join('packages', entry.name, 'src');
    if (entry.isDirectory() && existsSync(join(ROOT, src))) walk(src);
  }
  return files;
};

describe('데코레이터를 다시 그리는 일', () => {
  it('`setDecorators` 가 바뀐 것이 있을 때만 그린다', () => {
    const source = read('packages/editor-view-dom/src/editor-view-dom.ts');
    const body = /setDecorators\(stype: string, decorators: Decorator\[\]\): void \{([\s\S]*?)\n  \}/.exec(
      source
    )?.[1];

    expect(body, '`setDecorators` 를 못 찾았습니다 — 이름이 바뀌었으면 이 검사도 옮기세요').toBeTruthy();

    /*
     * **묻고 나서 세우는가.**
     *
     * 첫 판은 *"`changed = true;` 가 조건 없이 적혀 있는가"* 를 물었고, 그것은 고친 뒤에도 참이다 —
     * 지금 코드는 `continue` 로 빠져나간 **뒤에** 세운다. 문장의 모양을 묻는 검사는 고침을 못
     * 알아본다. 물어야 할 것은 **넣기 전에 있던 것과 대보는가** 이다.
     */
    const adding = /for \(const decorator of decorators\) \{([\s\S]*?)\n    \}/.exec(body!)?.[1] ?? '';
    const asks = /decoratorManager\.get\(/.test(adding) && /\bcontinue;/.test(adding);

    expect(
      asks,
      '`setDecorators` 가 넣기 전에 이미 있던 것과 대보지 않습니다.\n' +
        '그러면 **같은 목록을 다시 줘도 문서 전체가 다시 그려집니다** — 주석 하나가 있는 문서가\n' +
        '키 하나에 여섯 번 그려진 원인이고(예산 셋), 그 doubling 은 IME·페이지네이션 검사 여덟 개를\n' +
        '흔들리는 것처럼 보이게 했습니다. `decoratorManager.get(sid)` 로 물어보고, 같으면 넘기세요.'
    ).toBe(true);
  });

  it('정리 함수가 지우는 효과는 매번 새로 만들어지는 배열에 매달리지 않는다', () => {
    const files = sourceComponents().filter((one) =>
      read(one).includes('setDecorators')
    );

    expect(files.length, 'setDecorators 를 쓰는 컴포넌트를 하나도 못 찾았습니다').toBeGreaterThan(0);

    const guilty: string[] = [];
    for (const path of files) {
      const source = read(path);
      /*
       * `return () => view.setDecorators(X, []);` 로 끝나고 `}, [ … ]` 가 뒤따르는 자리.
       * 그 의존 목록에 `useMemo` 로 만든 배열 이름이 있으면 — 그 배열은 문서가 바뀔 때마다
       * 새 정체성을 갖는다 — 이 효과는 키 입력마다 지우고 다시 그린다.
       */
      for (const hit of source.matchAll(
        /return \(\) => view\.setDecorators\([^)]*\);\s*\n\s*\}, \[([^\]]*)\]\);/g
      )) {
        const deps = hit[1].split(',').map((one) => one.trim());
        /*
         * `const matches: Match[] = useMemo(` — 이름과 `=` 사이에 **타입 주석**이 온다. 첫 판은
         * 이름 뒤에 공백 하나를 요구해서 `find-panel` 을 놓쳤다. 검사가 자기가 막을 것을 못 보는
         * 모양이고, 이 저장소가 오늘만 네 번째로 겪었다.
         */
        const rebuilt = deps.filter(
          (one) =>
            one && one !== 'view' && new RegExp(`const ${one}\\b[^=\\n]*=\\s*useMemo\\(`).test(source)
        );
        if (rebuilt.length > 0) {
          guilty.push(`${path} — 의존에 ${rebuilt.join(', ')} (useMemo 로 매번 새 배열)`);
        }
      }
    }

    expect(
      guilty,
      '데코레이터를 지우는 정리 함수가 매번 새로 만들어지는 배열에 매달려 있습니다.\n' +
        '문서가 바뀔 때마다 지우고 다시 그리므로, 아무것도 안 바뀐 키 입력이 **두 번의 그리기**가\n' +
        '됩니다. 고치는 법은 `comments-pane.tsx` 에 있습니다: 효과가 배열의 *정체성* 이 아니라\n' +
        '그리는 것의 *내용* 에 의존하게 하고, 지우는 일은 떠날 때로 옮기세요:\n' +
        `${guilty.map((one) => `  ${one}`).join('\n')}`
    ).toEqual([]);
  });
});
