import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **선택은 한 번만 선언된다.**
 *
 * ## 무엇이 있었나
 *
 * `ModelSelection` 이 다섯 번, 두 패키지, 세 이름으로 적혀 있었다:
 *
 * | 어디 | 이름 | 무엇이 달랐나 |
 * |---|---|---|
 * | `editor-core/types.ts:53` | `ModelSelection` | 진짜 — `range \| node \| cell \| table`, `nodeIds?` |
 * | `editor-core/types.ts:166` | `NoSelection` · `Selection` | **아무도 안 썼다** |
 * | `editor-view-react/types.ts` | `ModelSelection` | `none \| range \| node`, **`cell`·`table` 없음**, `nodeId` 단수 |
 * | `editor-view-react/selection-handler.ts` | `ModelSelection` | 위와 글자까지 같음 |
 * | `editor-view-react/input-handler.ts` | `ModelSelectionRange` | `range` 만, `direction` 없음 |
 *
 * 대가는 *React 경로로는 셀을 고를 수 없다* 였다. 모델은 `cell` 과 `table` 을 오래 전부터 갖고 있다.
 *
 * ## 그리고 사본은 어긋남을 못 잡은 것이 아니라 **강제했다**
 *
 * `editor-view-react/test/selection-handler.test.ts` 에 이런 주석이 있었다: *"the four range fields
 * were here as well … **The compiler said so** the first time it was allowed to read this file."*
 * 그 컴파일러가 읽던 것이 좁은 사본이었다. 모델의 노드 선택은 두 끝을 채워서 주는데, 검사를 고치던
 * 사람이 그걸 적었고 사본이 *그런 필드는 없다* 고 해서 지웠다.
 *
 * ## 걷고 나서 타입 검사가 두 결함을 바로 찾았다
 *
 * - `'none'` 은 `SelectionType` 이 아니다 — `convertDOMSelectionToModel` 이 `ModelSelection` 을
 *   돌려준다고 적고 `{ type: 'none' }` 을 돌려주고 있었다.
 * - `ModelSelection` 에 `nodeId` 가 없다 — `convertNodeSelectionToDOM` 이 그것을 읽고 있었고,
 *   **아무 생산자도 세우지 않는 필드다.** 두 뷰 층에 같은 결함이 있었다.
 *
 * ## `Selection` 이라는 이름은 쓰지 않는다
 *
 * DOM lib 이 이미 갖고 있다. `editor-core` 가 `Selection = ModelSelection | NoSelection` 을
 * 내보내지만, DOM 선택도 다루는 층에서 그 이름을 들이면 `convertDOMSelectionToModel(selection:
 * Selection)` 이 어느 쪽인지 모호해진다 — 실제로 해보니 다섯 자리에서 *ModelSelection 에
 * anchorNode 가 없다* 고 했다. 그게 그 타입이 선언된 채 아무도 안 쓴 이유일 것이다.
 */

/* `__dirname` 이 `packages/conformance/test` 이므로 세 번 올라가야 저장소 뿌리다. */
const ROOT = join(__dirname, '..', '..', '..');

/**
 * **이름과 의미를 겹쳐 묻는다.**
 *
 * 이름만으로 세면 열아홉이 나왔다 — `SelectionSummary`(선택이 무엇을 담았나), `SelectionState`(DOM
 * 스냅샷), `MoveSelectionOptions`, `CellSelectionHandle` … 다 다른 것이고 다 정당하다.
 *
 * 의미만으로 세면(`startNodeId` 와 `endNodeId` 를 함께 가진 선언) 열셋이 나왔다 —
 * `DeleteRangePayload`, `ApplyMarkOperationPayload` … **연산의 payload 는 범위를 *받는다*.** 범위를
 * 받는 것과 범위 *인* 것은 다르다.
 *
 * 그래서 둘을 겹친다: **이름에 `Selection` 이 들고, 몸통에 `startNodeId:` 와 `endNodeId:` 가
 * 필드로 있는 선언.** 그러면 남는 것이 개념 자신이다.
 */
const HEAD = /(?:export\s+)?(?:type|interface)\s+(\w*Selection\w*)\s*(=|\{|<)/g;

/**
 * 선언의 몸통을 정확히 자른다.
 *
 * `interface X {` 는 첫 `\n}` 까지, `type X = …` 는 **그 줄까지**다. 처음엔 둘 다 1200자를 잘라
 * 봤고, 그러면 한 줄짜리 `SelectionType` 이 바로 아래 `ModelSelection` 의 필드를 자기 것으로 갖는다.
 */
function bodyOf(text: string, at: number, kind: string): string {
  const held = text.slice(at);
  if (kind === '{') {
    const ends = held.indexOf('\n}');
    return ends > 0 ? held.slice(0, ends) : held.slice(0, 1200);
  }
  const line = held.indexOf('\n');
  /* `type X = {` 도 있다 — 그 줄에 `{` 가 있으면 블록으로 읽는다. */
  const first = held.slice(0, line > 0 ? line : 200);
  if (!first.includes('{')) return first;
  const ends = held.indexOf('\n}');
  return ends > 0 ? held.slice(0, ends) : held.slice(0, 1200);
}

describe('선택 타입', () => {
  it('한 번만 선언된다 — 사본은 어긋나고, 어긋남을 강제한다', () => {
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

        const text = readFileSync(path, 'utf8');
        for (const hit of text.matchAll(HEAD)) {
          const held = bodyOf(text, hit.index ?? 0, hit[2]);

          if (!/\bstartNodeId\s*:/.test(held) || !/\bendNodeId\s*:/.test(held)) continue;
          /* 좁히기와 유니온은 사본이 아니다 — 개념을 다시 적는 것이 아니라 가리키는 것이다. */
          if (/=\s*ModelSelection\b/.test(held)) continue;

          const line = text.slice(0, hit.index).split('\n').length;
          found.push(`${path.slice(ROOT.length + 1)}:${line} ${hit[1]}`);
        }
      }
    };

    for (const at of ['packages', 'apps']) {
      const dir = join(ROOT, at);
      if (statSync(dir).isDirectory()) walk(dir);
    }

    /**
     * **`editor-core` 의 셋만 남는다.** `ModelSelection` 이 개념이고, `NoSelection` 은 *골라진 것이
     * 없음* 이고, `SelectionType` 은 종류의 목록이다. 셋이 한 파일에 있고 그것이 이 개념의 집이다.
     */
    /**
     * **`shared` 로 내려갔다** (2026-09-05). 이유는 `shared/src/selection.ts` 에 있다: 두 뷰 층의
     * DOM↔모델 변환을 그 둘 **아래**에 두려면 그것이 다루는 타입도 아래여야 하고, 그 변환이 쓰는
     * 런 색인은 이미 `shared` 에 있다. `editor-core` 는 그대로 다시 내보내므로 이 타입을 참조하는
     * 118개 파일이 한 줄도 안 바뀌었다.
     */
    expect(found.sort(), `문서의 범위를 적은 선언:\n${found.sort().join('\n')}`).toEqual([
      'packages/shared/src/selection.ts:42 ModelSelection'
    ]);
  });
});
