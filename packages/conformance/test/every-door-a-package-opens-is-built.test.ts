import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **패키지가 여는 문은 발행돼도 닿는다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * `package.json` 의 `exports` 가 문을 둘 이상 연다 — `.` 은 모델, `./ui` 는 React 부품
 * (`docs/specs/architecture.md`). 그런데 그 문들이 **워크스페이스 안에서는 `src/*.ts` 를 직접**
 * 가리키므로, 빌드가 `index.ts` 하나만 내도 **여기서는 아무 일도 안 일어난다.**
 *
 * 깨지는 것은 **발행된 뒤** 다: `publishConfig.exports` 가 `./dist/ui.js` 를 가리키는데 그 파일이
 * 없으면, `@barocss/office-site/ui` 를 import 한 사람은 *아무 데도 안 닿는 문* 을 연다.
 *
 * ## 무엇이 있었나 — 이 검사를 쓴 그 날
 *
 * 셸 이주가 `office-site`·`office-slides`·`office-word` 에 `./ui` 를 열었고, 재보니:
 *
 * | | |
 * |---|---|
 * | `publishConfig.exports` 에 `./ui` | **셋 다 없음** |
 * | `vite.config.ts` 가 빌드하는 진입점 | **넷 다 `index.ts` 하나** |
 *
 * `office-note` 는 `./view` 를 **1년 가까이** 열어 두고 있었고 그것도 안 빌드되고 있었다.
 * 워크스페이스에서만 쓰였으므로 아무도 몰랐다 — **`office-note` 가 독립 패키지라는 주장이
 * 발행 시점에는 거짓이었다.**
 *
 * 셸 이주를 병렬로 돌린 에이전트가 이것을 보고했다. 사람이 놓친 이유는 명확하다: **이 저장소의
 * 어느 검사도 발행된 모양을 묻지 않았다.**
 */
const ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');

type Json = Record<string, unknown>;

const packages = (): { name: string; json: Json; vite: string | null }[] =>
  readdirSync(PACKAGES)
    .filter((name) => existsSync(join(PACKAGES, name, 'package.json')))
    .map((name) => ({
      name,
      json: JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as Json,
      vite: existsSync(join(PACKAGES, name, 'vite.config.ts'))
        ? readFileSync(join(PACKAGES, name, 'vite.config.ts'), 'utf8')
        : null
    }));

/** `.` 과 `*.css` 말고 열린 문 — 코드가 나가는 문만 센다. */
const codeDoors = (json: Json): string[] =>
  Object.keys((json.exports ?? {}) as Json).filter((one) => one !== '.' && !one.endsWith('.css'));

describe('패키지가 여는 문', () => {
  it('발행 설정에도 있다', () => {
    const found: string[] = [];
    for (const { name, json } of packages()) {
      const publish = ((json.publishConfig ?? {}) as Json).exports as Json | undefined;
      if (!publish) continue;
      for (const door of codeDoors(json)) {
        if (!(door in publish)) found.push(`${name}: ${door}`);
      }
    }
    expect(
      found,
      `\`exports\` 는 여는데 \`publishConfig.exports\` 에 없습니다 — 발행되면 그 문이 사라집니다:\n${found.join('\n')}`
    ).toEqual([]);
  });

  it('빌드가 실제로 그 파일을 낸다', () => {
    const found: string[] = [];
    for (const { name, json, vite } of packages()) {
      const doors = codeDoors(json);
      if (doors.length === 0 || !vite) continue;
      for (const door of doors) {
        /* `./ui` → 빌드 진입점 키가 `ui` 여야 한다. */
        const key = door.replace(/^\.\//, '');
        if (!new RegExp(`\\b${key}\\s*:`).test(vite)) {
          found.push(`${name}: ${door} — vite.config.ts 의 lib.entry 에 \`${key}\` 가 없습니다`);
        }
      }
    }
    expect(
      found,
      `문은 열려 있는데 빌드가 그 파일을 안 냅니다. 워크스페이스에서는 \`src/*.ts\` 를 직접 가리키므로 보이지 않고, **발행된 뒤에만** 깨집니다:\n${found.join('\n')}`
    ).toEqual([]);
  });
});
