import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **제품은 제품에 의존하지 않는다.**
 *
 * 기능이 같은 것과 **의존하는 것은 다르다.** 두 제품이 표를 그린다면 표는 아래층의 것이고, 한쪽이
 * 다른 쪽에서 가져오는 것이 아니다.
 *
 * ## 왜 규칙인가 — 재서 나온 이유 셋
 *
 * 1. **다섯째 제품이 사슬 어디에 끼는지가 매번 질문이 된다.** `office-site` 가 `office-note` 를
 *    의존하면 새 제품은 *나는 site 위인가 아래인가* 를 물어야 하고, 그 답은 임의적이다.
 * 2. **빌린 쪽이 빌려준 쪽의 결정에 묶인다.** `office-word` 가 `frameCss` 를 바꾸면 사이트
 *    빌더가 따라 바뀐다 — 사이트가 워드의 판단에 묶일 이유가 없다.
 * 3. **아래로 안 내려간 것은 셋째 제품에서 다시 발명된다.** `installCellSelection` 379줄이
 *    `office-word` 안에 갇혀 **표를 가진 넷 중 둘만 닿았다.**
 *
 * ## 무엇이 있었나 — 이 검사를 쓴 그 날
 *
 * 변이 **셋이었고 각각 심볼 하나** 였다:
 *
 * | 변 | 무엇 | 내려간 곳 |
 * |---|---|---|
 * | `office-slides` → `office-word` | `createWordTables` | `office-text` |
 * | `office-site` → `office-word` | `frameCss` | `office-canvas` |
 * | `office-site` → `office-note` | `NOTE_CONTENT` | `office-text` |
 *
 * 그래서 깊이가 **5·6·6·7** 로 흩어져 있었다. 걷어내니 word·slides·site 가 5로 나란해졌다.
 * `office-note` 만 6인데, 그것은 **자기 셸을 패키지로 옮긴 대가** 다(`office-editor-ui` 의존).
 * 나머지 셋도 셸을 옮기면 6이 된다 — **목표 상태는 부품 0–5, 제품 6, 넷이 형제.**
 *
 * ## `package.json` 과 import 둘 다 본다
 *
 * 선언만 보면 유령 의존(적혀 있고 안 쓰는 것)을 놓치고, import 만 보면 타입 자리에서만 쓰는 것을
 * 놓친다. `dependency-graph.test.ts` 가 그 둘의 차이로 유령을 잡는다 — 여기서는 **둘 중 하나라도
 * 있으면 변** 이다.
 *
 * `docs/specs/architecture.md`.
 */
const ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');

/** 제품 — 사람이 쓰는 문서를 만드는 것. 부품(`office-text` 류)은 여기 없다. */
const PRODUCTS = ['office-word', 'office-slides', 'office-site', 'office-note'];

const declared = (pkg: string): string[] => {
  const path = join(PACKAGES, pkg, 'package.json');
  if (!existsSync(path)) return [];
  const held = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string> };
  return Object.keys(held.dependencies ?? {}).map((one) => one.replace('@barocss/', ''));
};

const imported = (pkg: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  const src = join(PACKAGES, pkg, 'src');
  if (!existsSync(src)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const text = readFileSync(path, 'utf8');
      for (const other of PRODUCTS) {
        if (other === pkg) continue;
        if (!new RegExp(`from '@barocss/${other}'`).test(text)) continue;
        const at = path.slice(join(PACKAGES, pkg, 'src').length + 1);
        out.set(other, [...(out.get(other) ?? []), at]);
      }
    }
  };
  walk(src);
  return out;
};

describe('제품끼리', () => {
  it('넷 다 있다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    expect(PRODUCTS.filter((one) => existsSync(join(PACKAGES, one)))).toEqual(PRODUCTS);
  });

  it('서로 의존하지 않는다', () => {
    const found: string[] = [];

    for (const product of PRODUCTS) {
      for (const other of declared(product)) {
        if (PRODUCTS.includes(other)) found.push(`${product} → ${other} (package.json)`);
      }
      for (const [other, files] of imported(product)) {
        found.push(`${product} → ${other} (${files.join(' · ')})`);
      }
    }

    expect(
      found,
      `제품이 제품을 의존합니다. 둘이 같은 것을 원하면 **부품으로 내려갑니다** — ` +
        `\`office-text\`(글의 낱말) · \`office-canvas\`(그림의 낱말) · \`office-controls\`(제품 UI 모델):\n${found.join('\n')}`
    ).toEqual([]);
  });
});
