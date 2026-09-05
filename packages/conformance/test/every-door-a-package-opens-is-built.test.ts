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

/** `.` 말고 열린 문 전부 — 코드든 스타일이든 발행되면 닿아야 한다. */
const doors = (json: Json): string[] =>
  Object.keys((json.exports ?? {}) as Json).filter((one) => one !== '.');

/** 코드 문 — `vite.config.ts` 의 `lib.entry` 에 있어야 한다. */
const codeDoors = (json: Json): string[] => doors(json).filter((one) => !one.endsWith('.css'));

/** 스타일 문 — 코드 문과 **같은 목록**에 있어야 한다. 아래 §3. */
const cssDoors = (json: Json): string[] => doors(json).filter((one) => one.endsWith('.css'));

/**
 * `lib.entry` 의 **객체 안쪽만** — 파일 전체가 아니라.
 *
 * 첫 판은 `vite.config.ts` 전체에 정규식을 걸었고, 그것을 **자기가 쓴 주석이 통과시켰다**:
 * 진입점을 지우고 검사를 돌렸는데 초록이었다. 위쪽 주석에 `` `"./text.css": "./dist/text.css"` ``
 * 라는 문장이 있었기 때문이다 — `text.css` 뒤에 콜론이 오는 문자열은 설명문에도 있다.
 *
 * *가드가 자기가 막을 것을 못 본다* 의 이 파일 안에서만 세 번째이고, 이번엔 **가드를 고치는
 * 중에** 나왔다. 그래서 세는 곳을 좁힌다: 진입점 목록은 `entry: { … }` 한 덩어리이고 값은 전부
 * 따옴표 안의 경로라 중괄호가 없으므로, 첫 `}` 까지가 정확히 그 목록이다.
 */
const entryBlock = (vite: string): string => /entry:\s*\{([^}]*)\}/.exec(vite)?.[1] ?? '';

/**
 * `./ui` → `ui:`, `./ui.css` → `'ui.css':` — `lib.entry` 의 키로 쓰였는가.
 *
 * 키에 `.` 이 들어가면 따옴표가 붙으므로(`'text.css': …`) 정규식이 그것까지 세야 한다. 점은
 * 이스케이프한다 — 안 하면 `text.css` 가 `textXcss` 에도 맞는다.
 */
const isEntryKey = (vite: string, key: string): boolean =>
  new RegExp(`['"\`]?\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]?\\s*:`).test(
    entryBlock(vite)
  );

describe('패키지가 여는 문', () => {
  it('발행 설정에도 있다', () => {
    const found: string[] = [];
    for (const { name, json } of packages()) {
      const publish = ((json.publishConfig ?? {}) as Json).exports as Json | undefined;
      if (!publish) continue;
      for (const door of doors(json)) {
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
        if (!isEntryKey(vite, key)) {
          found.push(`${name}: ${door} — vite.config.ts 의 lib.entry 에 \`${key}\` 가 없습니다`);
        }
      }
    }
    expect(
      found,
      `문은 열려 있는데 빌드가 그 파일을 안 냅니다. 워크스페이스에서는 \`src/*.ts\` 를 직접 가리키므로 보이지 않고, **발행된 뒤에만** 깨집니다:\n${found.join('\n')}`
    ).toEqual([]);
  });
  /**
   * **스타일 문도 닿아야 한다** — 그리고 이 검사의 첫 판은 그것을 **안 셌다.**
   *
   * `publishConfig.exports` 가 `"./ui.css": "./dist/ui.css"` 를 적는데 빌드는 `.ts` 진입점만
   * 낸다. 그래서 발행된 패키지에는 **그 CSS 파일이 없다** — 코드 문에 대해 §2가 말한 것과
   * 정확히 같은 결함이고, 첫 판이 `!one.endsWith('.css')` 로 **스스로 그것을 빼고 있었다.**
   *
   * `office-note` 의 `./note.css` 가 오래 그 상태였다. 셸 CSS 이주를 병렬로 돌린 에이전트가
   * 보고했다 — *가드가 자기가 막을 것을 못 본다* 의 또 한 번이고, 이번에는 **내가 쓴 가드** 였다.
   *
   * ## 답: 스타일 문도 `lib.entry` 다
   *
   * `vite` 는 `.ts` 진입점이 `import` 하지 않는 `.css` 를 복사하지 않는다. 그런데 **복사할 필요가
   * 없었다** — `lib.entry` 의 키가 곧 나오는 파일 이름이므로 `'text.css': 'src/text.css'` 한 줄이면
   * `dist/text.css` 가 그대로 나오고, CSS 만 든 진입점은 빈 JS 청크도 안 남긴다. 라이브러리 빌드의
   * 기본값 `cssCodeSplit: false` 만 켜 주면 된다(그 상태에서는 CSS 진입점이 거부된다).
   *
   * 그래서 코드 문과 스타일 문이 **한 목록**에 있고, §2 와 이 검사는 같은 질문을 같은 자리에 한다.
   *
   * ## 왜 `dist` 를 안 보는가 — 이 검사의 첫 판이 물은 곳
   *
   * 첫 판은 `packages/<이름>/dist/<문>` 이 디스크에 있는지 봤다. 그러면 **빌드를 돌린 사람에게만
   * 초록이다**: `dist/` 는 `.gitignore` 에 있고, CI 는 `pnpm test` 만 돌리며 그 앞에 빌드 단계가
   * 없다(`.github/workflows/ci.yml`). 즉 그 모양으로 `it` 을 만들면 **CI 에서 영원히 빨갛거나**,
   * 누군가 마침 빌드해 둔 덕에 초록인 — 둘 중 하나다. 둘 다 검사가 아니다.
   *
   * §2 가 코드 문에 대해 `dist/ui.js` 를 안 보고 `lib.entry` 를 보는 이유가 정확히 이것이고,
   * 스타일 문도 같은 기준으로 센다. *빌드가 실제로 그 파일을 내는가* 는 빌드를 돌려 확인했다 —
   * 여섯 문(`office-note/note.css`, `office-site/ui.css`, `office-slides/slides.css` 와 `ui.css`,
   * `office-text/text.css`, `office-ui/tokens.css`) 전부 `dist` 에 나온다.
   */
  it('스타일 문도 lib.entry 에 있다', () => {
    const found: string[] = [];
    for (const { name, json, vite } of packages()) {
      const doors = cssDoors(json);
      if (doors.length === 0) continue;
      if (!vite) {
        found.push(`${name}: ${doors.join(', ')} — vite.config.ts 가 없습니다. 빌드가 아무것도 안 냅니다`);
        continue;
      }
      for (const door of doors) {
        const key = door.replace(/^\.\//, '');
        if (!isEntryKey(vite, key)) {
          found.push(`${name}: ${door} — vite.config.ts 의 lib.entry 에 \`${key}\` 가 없습니다`);
        }
      }
    }
    expect(
      found,
      `스타일 문이 열려 있는데 빌드가 그 파일을 안 냅니다. \`vite\` 는 \`.ts\` 진입점이 \`import\` 하지 않는 \`.css\` 를 복사하지 않으므로, \`lib.entry\` 에 \`'<이름>.css': 'src/<이름>.css'\` 로 적고 \`cssCodeSplit: true\` 를 켜세요:\n${found.join('\n')}`
    ).toEqual([]);
  });
});
