import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **패키지 그래프는 DAG 다.**
 *
 * ## 왜 검사인가
 *
 * `ROADMAP.md` 의 Phase 1 이 문자 그대로 이것이다 — *every package builds against only the packages
 * below it and the dependency graph is a DAG*. 오래 걸릴 일로 적혀 있었고, 재보니 셋 중 **둘이
 * 유령**이었다: `datastore → model` 과 `editor-core → extensions` 가 `package.json` 에 적혀 있고
 * import 는 **하나도 없었다**. 세 번째는 한쪽이 타입 자리에서만 쓰이고 있었다.
 *
 * 유령 의존은 저절로 다시 생긴다 — 무언가를 쓰려다 만 커밋 하나면 된다. 그리고 다시 생기면 층을 물을 수
 * 없게 된다: 순환이 있으면 `datastore` 의 깊이가 100을 넘는다.
 *
 * ## 무엇을 보나
 *
 * `dependencies` 만 본다. `devDependencies` 는 검사가 반대쪽을 보기 위한 것이고 — `office-controls` 가
 * 네 제품을 그렇게 갖고 있다 — 실행 그래프가 아니다. 타입만 쓰는 의존도 여기로 내린다: `model` 이
 * `Editor` 를 타입 자리에서만 쓰는 것이 그렇고, 그것이 마지막 순환을 푼 방법이다.
 */
const packagesAt = join(__dirname, '..', '..');

const graph = (): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const name of readdirSync(packagesAt)) {
    const path = join(packagesAt, name, 'package.json');
    if (!existsSync(path)) continue;
    const held = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string> };
    out.set(
      name,
      Object.keys(held.dependencies ?? {})
        .filter((one) => one.startsWith('@barocss/'))
        .map((one) => one.replace('@barocss/', ''))
        .sort()
    );
  }
  return out;
};

describe('패키지 그래프', () => {
  it('has no cycle — every package depends only on packages below it', () => {
    const pk = graph();
    const found: string[] = [];

    const walk = (at: string, path: string[]) => {
      for (const next of pk.get(at) ?? []) {
        if (path.includes(next)) {
          found.push([...path.slice(path.indexOf(next)), next].join(' → '));
          continue;
        }
        if (path.length < 12) walk(next, [...path, next]);
      }
    };
    for (const name of pk.keys()) walk(name, [name]);

    expect([...new Set(found)], [...new Set(found)].join('\n')).toEqual([]);
  });

  it('declares nothing it does not import — a phantom is a cycle waiting to happen', () => {
    /**
     * Two of the three cycles were exactly this: a name in `dependencies` that no file imports.
     * `datastore` declared `model` and `editor-core` declared `extensions`, and between them they
     * made the graph unaskable — while the code underneath was already a DAG.
     *
     * The sweep reads sources rather than a build, because a phantom builds fine. That is the whole
     * of why it is invisible.
     */
    const pk = graph();
    const phantom: string[] = [];

    for (const [name, deps] of pk) {
      /**
       * **`test/` 도 읽습니다 — 안 읽고 한 번 지웠다가 검사 80개를 잃었습니다.**
       *
       * `src` 만 보고 유령 열넷을 걷었더니 **다섯이 유령이 아니었다**: 검사가 쓰고 있었다. 실패가 아니라
       * *수집 실패* 로 나왔고, `Tests N failed` 가 아니라 `Test Files 4 failed` 라 요약의 검사 줄만 보면
       * **개수가 조용히 줄어들 뿐**이다 — 475 → 458, 619 → 558.
       *
       * 다섯은 `devDependencies` 로 되살렸다. 그게 맞는 자리다: 검사가 쓰는 것은 실행 그래프가 아니다.
       */
      let text = '';
      const read = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          const path = join(dir, entry.name);
          if (entry.isDirectory()) read(path);
          else if (/\.tsx?$/.test(entry.name)) text += readFileSync(path, 'utf8');
        }
      };
      read(join(packagesAt, name, 'src'));
      read(join(packagesAt, name, 'test'));
      if (!text) continue;

      for (const dep of deps) {
        if (!text.includes(`@barocss/${dep}`)) phantom.push(`${name} → ${dep}`);
      }
    }

    expect(phantom, phantom.join('\n')).toEqual([]);
  });
});

/**
 * **모든 검사 파일이 수집되는가.**
 *
 * ## 이 검사가 있는 이유
 *
 * `--reporter=line` 의 요약은 `Tests 475 passed` 다. 파일이 **수집조차 안 되면** 그 줄은 실패를 말하지
 * 않는다 — 그냥 숫자가 줄어든다. `Test Files 4 failed` 는 한 줄 위에 있고, 나는 그 줄을 안 읽었다.
 *
 * 이번 회차에 두 번 그렇게 속았다. 한 번은 Word 브라우저 스위트를 세 번 *통과* 라고 보고했고(그 위에
 * `10 failed` 가 있었다), 한 번은 유령 의존을 지우면서 검사 **여든 개**를 잃었다(475 → 458, 619 → 558,
 * 실패 0). 두 번 다 요약의 마지막 줄을 읽은 결과다.
 *
 * 그래서 숫자가 아니라 **파일이 열리는가**를 묻는다. 검사가 있는데 못 읽는 상태가 되지 않게.
 */
describe('검사 파일', () => {
  it('all collect — a file that cannot be loaded is not a passing file', async () => {
    const { readdirSync, existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..', '..');

    /**
     * 각 패키지의 `test/` 안 `*.test.ts` 를 세고, 그 파일들이 import 하는 `@barocss/*` 가 그 패키지의
     * `dependencies` 나 `devDependencies` 에 있는지 본다. 없으면 그 파일은 열리지 않는다 — vitest 가
     * 조용히 세지 않을 파일이다.
     */
    const missing: string[] = [];
    for (const name of readdirSync(root)) {
      const dir = join(root, name, 'test');
      const manifest = join(root, name, 'package.json');
      if (!existsSync(dir) || !existsSync(manifest)) continue;

      const held = JSON.parse(readFileSync(manifest, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const known = new Set([
        ...Object.keys(held.dependencies ?? {}),
        ...Object.keys(held.devDependencies ?? {})
      ]);

      const walk = (at: string) => {
        for (const entry of readdirSync(at, { withFileTypes: true })) {
          if (entry.name === 'node_modules') continue;
          const path = join(at, entry.name);
          if (entry.isDirectory()) {
            walk(path);
            continue;
          }
          if (!/\.tsx?$/.test(entry.name)) continue;
          const text = readFileSync(path, 'utf8');
          for (const hit of text.matchAll(/from\s+'(@barocss\/[a-z-]+)'/g)) {
            if (!known.has(hit[1]) && hit[1] !== `@barocss/${name}`) {
              missing.push(`${name}/test/${entry.name} → ${hit[1]}`);
            }
          }
        }
      };
      walk(dir);
    }

    expect([...new Set(missing)], [...new Set(missing)].join('\n')).toEqual([]);
  });

  /**
   * **디스크에 있는데 실행기가 열지 않는 검사 파일** — 위의 검사가 못 묻는 질문.
   *
   * 위의 것은 각 패키지의 `test/` 안을 훑으며 *이 파일이 import 하는 것이 선언돼 있나* 를 묻는다. 두
   * 가지를 못 본다: `test/` 가 아닌 곳(`tests/`, `src/`)에 있는 파일, 그리고 **vitest 의 `include`
   * 가 그 파일을 아예 안 집는 경우.**
   *
   * 재고 나온 것: `packages/dsl` 에 `test/` 와 `tests/` 가 **둘 다** 있었고 설정은 `tests/**` 만
   * 열었다. `test/` 의 두 파일은 이름까지 같은 사본이었고 한 번도 실행되지 않았다 — 유일한 it 이
   * 하나도 없어서 잃은 것은 없었지만, 잃었는지 아닌지를 아무도 모르고 있었다는 것이 결함이다.
   *
   * 이건 이 저장소가 이미 한 번 크게 물린 모양이다. 유령 의존을 걷다가 검사 여든 개를 **실패가 아니라
   * 수의 감소로** 잃었고(`Test Files 4 failed` 위에 `Tests 458 passed`, 실패 개수 0), 그래서 위의
   * 검사가 생겼다. 이건 그 짝이다 — 열리지 않는 것과 **집히지 않는 것**.
   */
  it('are all inside what the runner is told to open', async () => {
    const { readdirSync, existsSync, readFileSync } = await import('node:fs');
    const { join, relative, sep } = await import('node:path');
    const root = join(__dirname, '..', '..');

    /** 아주 작은 glob → 정규식. `**`, `*`, 그리고 `{a,b}` 만 안다 — 설정에 쓰이는 것이 그뿐이다. */
    const asRegExp = (glob: string): RegExp => {
      let out = '';
      for (let i = 0; i < glob.length; i += 1) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') {
          // `**/` 는 아무 깊이(없는 것 포함)
          if (glob[i + 2] === '/') {
            out += '(?:[^/]+/)*';
            i += 2;
          } else {
            out += '.*';
            i += 1;
          }
        } else if (c === '*') out += '[^/]*';
        else if (c === '{') {
          const close = glob.indexOf('}', i);
          out += `(?:${glob.slice(i + 1, close).split(',').join('|')})`;
          i = close;
        } else if (c === '?') out += '[^/]';
        else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      }
      return new RegExp(`^${out}$`);
    };

    const unopened: string[] = [];

    for (const name of readdirSync(root)) {
      const at = join(root, name);
      if (!existsSync(join(at, 'package.json'))) continue;

      /* vitest 는 `vitest.config.*` 를 먼저 본다. 없으면 `vite.config.*` 의 `test` 블록. */
      const config = ['vitest.config.ts', 'vitest.config.mts', 'vite.config.ts', 'vite.config.mts']
        .map((one) => join(at, one))
        .find((one) => existsSync(one));
      if (!config) continue;

      const text = readFileSync(config, 'utf8');

      /*
       * **`include` 는 파일에 여러 개 있다.** `devtool` 의 첫 번째는 `coverage` 의 `['src/**\/*']`
       * 이고, 그것을 test 의 것으로 읽으면 실제로 실행되는 파일을 *열리지 않는다* 고 신고한다 —
       * 처음 쓴 대로 돌렸을 때 실제로 그랬다.
       *
       * 가려내는 방법은 내용이다: 검사 파일을 집는 include 는 `*.test.*` 나 `*.spec.*` 를 이름에
       * 갖는다. 커버리지의 것은 갖지 않는다. 설정 파서를 쓰지 않는 이유는 이 검사가 설정을
       * *실행하지 않고* 읽어야 하기 때문이다.
       */
      const spoken = [...text.matchAll(/include:\s*\[([^\]]*)\]/g)]
        .map((hit) => [...hit[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((one) => one[1] ?? one[2]))
        .find((list) => list.some((one) => /\.(test|spec)\.|\{test,spec\}|\{spec,test\}/.test(one)));

      /* 검사용 `include` 가 없으면 기본값이 전부를 집는다 — 빠질 파일이 없다. */
      if (!spoken) continue;

      const globs = spoken.map(asRegExp);

      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          const path = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(path);
            continue;
          }
          if (!/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
          const held = relative(at, path).split(sep).join('/');
          if (!globs.some((one) => one.test(held))) unopened.push(`${name}/${held}`);
        }
      };
      walk(at);
    }

    expect(
      unopened,
      `실행기가 열지 않는 검사 파일:\n${unopened.join('\n')}`
    ).toEqual([]);
  });
});
