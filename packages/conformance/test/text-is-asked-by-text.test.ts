import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **엔진은 *글자를 담나* 를 이름으로 묻지 않는다.**
 *
 * ## 무엇이 있었나
 *
 * `stype === 'inline-text'` 가 엔진 층 **열여섯 자리**에 있었다 — `editor-view-dom` 열, `editor-core`
 * 하나, `model` 하나, `renderer-dom` 하나, `extensions` 셋.
 *
 * 원칙은 `extensions/range-delete.ts` 의 `isInline` 에 이미 적혀 있었다 — *"이름으로 짐작하는 것은
 * 제품이 다른 이름을 쓰는 순간까지만 통한다. 스키마가 바로 그것을 위해 `group` 을 선언한다."*
 * **한 파일이 그렇게 하고 열여섯이 안 했다.**
 *
 * ## 재보니 지금은 우연히 맞는 답이었다
 *
 * office 스키마의 `inline` 그룹에 **여덟**이 있고 그 중 **일곱이 원자**다 — 런타임으로 셌다:
 * `hardBreak` · `inline-image` · `emoji` · `bookmarkAnchor` · `fieldDateTime` · `fieldDocTitle` ·
 * `fieldAuthor`. 즉 `group === 'inline' && !atom` 이 정확히 `inline-text` 하나다. 그러므로 **스키마를
 * 바꿀 필요가 없었다** — 스키마는 이미 답할 수 있었고, 아무도 안 물었다.
 *
 * 그리고 그 열여섯은 **전부 인스턴스를 손에 쥐고 있었다**(`dataStore.getNode(id)` 를 부른 뒤였다).
 * 인스턴스가 있으면 `typeof node.text === 'string'` 이 더 짧고 더 옳다 — `@barocss/shared` 의
 * `holdsText`.
 *
 * ## 왜 세는가
 *
 * *"이름으로 묻지 마라"* 는 규칙이고, 규칙은 **세어야** 규칙이다. 새 이름 물음은 커밋 하나면
 * 들어오고, 들어와도 오늘은 통과한다 — 깨지는 것은 텍스트 런을 다른 이름으로 부르는 **다음 제품**
 * 에서다. 그때는 이 결정이 열여섯 자리에 흩어져 있다.
 *
 * `docs/specs/text-position.md` §어휘.
 */
const ROOT = join(__dirname, '..', '..', '..');

/** 이름을 **결정에** 쓰는 것만 센다 — 문자열이 데이터로 등장하는 것은 아니다. */
const DECIDES = /(?:===|!==)\s*'inline-text'|'inline-text'\s*(?:===|!==)/;

/**
 * 엔진 층 — 제품이 아니다.
 *
 * 제품과 스키마는 자기 노드를 이름으로 불러도 된다: `office-word` 가 `inline-text` 를 만드는 것은
 * 그 제품이 그 이름을 **정했기** 때문이다. 엔진은 정하지 않았으므로 물으면 안 된다.
 */
const ENGINE = [
  'editor-core',
  'editor-view-dom',
  'editor-view-react',
  'extensions',
  'model',
  'renderer-dom',
  'renderer-react'
];

describe('글자인가', () => {
  it('엔진은 이름이 아니라 text 로 묻는다', () => {
    const found: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;

        readFileSync(path, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            /* 프로세 안의 예시는 결정이 아니다. */
            const said = line.trim();
            if (said.startsWith('*') || said.startsWith('//') || said.startsWith('/*')) return;
            if (DECIDES.test(line)) found.push(`${path.slice(ROOT.length + 1)}:${i + 1}`);
          });
      }
    };

    for (const one of ENGINE) {
      const at = join(ROOT, 'packages', one, 'src');
      try {
        walk(at);
      } catch {
        /* 아직 없는 패키지는 셀 것이 없다. */
      }
    }

    expect(
      found,
      `엔진이 글자인지를 이름으로 묻습니다. \`holdsText(node)\` 로 물으세요 — 이유는 이 파일 위에 있습니다:\n${found.join('\n')}`
    ).toEqual([]);
  });
});
