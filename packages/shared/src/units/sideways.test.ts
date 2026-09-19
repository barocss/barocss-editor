import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sideways } from './units';

/**
 * **종이를 눕히는 한 줄이 하나인지.**
 *
 * 문서는 종이를 세운 상태의 두 변으로 저장하고 눕히라는 지시를 따로 적는다. 그리는 쪽은 그때마다
 * 두 변을 맞바꾸고, 그 두 줄이 네 곳에 손으로 복사돼 있었다 — `layout.ts`, `flowCss`, `pageCss`,
 * `canvas-insert.ts`.
 *
 * 넷은 서로 어긋나 있지 않았다. 어긋난 것은 **다섯 번째로 온 사람**이다: 페이지 설정 대화상자가
 * 저장값 자체를 맞바꾸도록 만들어졌고, 그리는 쪽이 한 번 더 뒤집어 가로를 골라도 종이가 세로였다.
 * *규약이 네 번 적혀 있고 한 번도 이름을 갖지 않으면 그렇게 된다.*
 *
 * 그래서 이 파일은 둘을 묻는다: 함수가 맞게 도는가, 그리고 **여섯 번째 사본이 생기지 않았는가.**
 */

describe('종이를 눕힌다', () => {
  const letter = { width: 12240, height: 15840 };

  it('세우면 그대로다', () => {
    expect(sideways(false, letter)).toEqual(letter);
  });

  it('눕히면 맞바뀐다', () => {
    expect(sideways(true, letter)).toEqual({ width: 15840, height: 12240 });
  });

  it('두 번 눕혀도 눕은 채다 — 상태가 아니라 계산이므로', () => {
    expect(sideways(true, sideways(true, letter))).toEqual(letter);
    expect(sideways(true, letter)).toEqual(sideways(true, letter));
  });

  it('세운 값을 바꾸지 않는다', () => {
    const upright = { ...letter };
    sideways(true, upright);
    expect(upright).toEqual(letter);
  });
});

/**
 * **여섯 번째 사본을 찾는다.**
 *
 * 손으로 쓴 `landscape ? height : width` 를 훑는다. 이 규약을 다시 손으로 적는 사람에게, 그것이
 * 이미 이름을 갖고 있다고 말해 주는 것이 이 검사의 전부다.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * **주석은 코드가 아니다.**
 *
 * 첫 판은 주석까지 훑었고, 그래서 *이 규약이 무엇이었는지* 를 설명하는 문단 하나 때문에
 * `page-setup-model.ts` 가 빨개졌다. 검사가 옳으려면 그 문단은 남아 있어야 한다 — **문서를
 * 지우게 만드는 검사는 잘못된 검사다.**
 */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sources = (): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const at = join(dir, entry);
      if (statSync(at).isDirectory()) walk(at);
      else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
        out.push({ path: at.slice(ROOT.length + 1), text: withoutComments(readFileSync(at, 'utf8')) });
      }
    }
  };
  walk(join(ROOT, 'packages'));
  return out;
};

describe('규약은 한 곳에만 있다', () => {
  it('소스를 실제로 읽었다 — 아무것도 안 보고 통과하지 않게', () => {
    expect(sources().length).toBeGreaterThan(100);
  });

  it('손으로 맞바꾸는 곳이 없다', () => {
    /**
     * `landscape ? … : …` 꼴에서 두 갈래가 폭과 높이를 말하면 그것이 이 규약의 사본이다.
     *
     * **첫 판은 아무것도 못 잡았다.** 삼항의 갈래를 `[\w.?]*` 로만 봤고, 실제 사본은
     * `landscape ? number(page?.pageHeight, 15840) : …` 였다 — 괄호를 못 넘었다. 되돌려 심어
     * 보고서야 알았고, **잡는지 확인하지 않은 검사는 없는 것과 같다.**
     */
    const flagged = (text: string): boolean => {
      for (const hit of text.matchAll(/landscape\s*\?/gi)) {
        const after = text.slice(hit.index + hit[0].length, hit.index + 200);
        if (/height/i.test(after) && /width/i.test(after)) return true;
      }
      return false;
    };
    /**
     * **원본은 사본이 아니다.**
     *
     * `units.ts` 안에 그 삼항이 한 번 있다 — `sideways` 자신이다. 검사가 그것까지 잡으면 규약을
     * 이름으로 만든 파일이 규약을 어긴 파일이 된다. 한 줄이고, 이 줄이 그 한 줄을 가리킨다.
     */
    const SOURCE = 'packages/shared/src/units/units.ts';

    const found = sources()
      .filter((one) => one.path !== SOURCE && flagged(one.text))
      .map((one) => one.path);

    expect(
      found,
      `종이를 눕히는 두 줄이 다시 손으로 적혀 있습니다. \`@barocss/shared\` 의 \`sideways\` 를\n` +
        `쓰세요 — 이 규약이 네 곳에 복사돼 있던 동안 다섯 번째로 온 대화상자가 그것을 반대로\n` +
        `알았고, 가로를 골라도 종이가 세로였습니다:\n` +
        found.map((one) => `  ${one}`).join('\n')
    ).toEqual([]);
  });
});
