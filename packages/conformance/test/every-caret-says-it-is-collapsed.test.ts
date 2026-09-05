import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **캐럿을 만드는 리터럴은 자기가 캐럿이라고 말해야 한다.**
 *
 * ## 무엇이 있었나
 *
 * `ModelSelection.collapsed` 는 **선택적 필드**다. 그래서 *캐럿* 이라는 하나의 사실을 저장소가 두
 * 가지 방법으로 물었다:
 *
 * | 묻는 쪽 | 어떻게 | 깃발 없는 캐럿에 |
 * |---|---|---|
 * | `editor-core` — `_updateBuiltinContext`, `deleteSelection` | **필드**를 읽는다 | 범위라고 답한다 |
 * | `office-editor-ui/slash-menu.tsx` | 필드가 없으면 **두 끝을 비교** | 캐럿이라고 답한다 |
 *
 * 그래서 사이트에서 `/` 를 치면 슬래시 메뉴와 버블 툴바가 **같이** 떴다 —
 * `strict mode violation: '[data-floating-surface]' resolved to 2 elements`. `site.spec.ts:8298`
 * 이 27회 중 4회 실패했고, 부하에 따라 오갔다.
 *
 * ## 왜 검사가 먼저인가
 *
 * 같은 결함이 **한 라운드에 두 자리에서** 나왔다. 두 갈래가 서로 모르고 같은 필드를 짚었다 —
 * `8298` 의 15% 를 좇던 갈래와 입력 층을 재던 갈래. 그때 저장소 어디에도 그 모양을 세는 것이
 * 없었으므로 *두 자리를 고쳤다* 와 *다 고쳤다* 를 가릴 방법이 없었다.
 *
 * 세어 보니 **제품 코드 13, 검사 픽스처 44** 였다. 두 자리가 아니었다.
 *
 * ## 무엇을 세나
 *
 * `type: 'range'` 리터럴 중, **글자로 보아 이미 캐럿인 것** — 두 끝의 노드 식이 같고 두 오프셋의
 * 식도 같은 것 — 에서 `collapsed: true` 가 없는 것.
 *
 * `collapsed` 를 **아예 안 적은 것**과 `collapsed: false` 라고 적은 것을 **같이** 센다. 두 끝이
 * 같은 자리인데 `false` 라고 적은 것은 빠뜨린 것이 아니라 모순이고, 모순을 그대로 두는 것이 이
 * 저장소가 세 번 겪은 모양이다.
 *
 * ## 무엇을 못 세나 — 그리고 그것이 진짜 원인이었다
 *
 * **인자로 접히는 것.** `selectRange(nodeId, 3, 3)` 의 리터럴은 `startOffset: start,
 * endOffset: end` 라 글자로는 범위이고 실행하면 캐럿이다. 그리고 **필드를 골라 옮겨 담는 것**:
 *
 * ```ts
 * const rangeForReplace = {
 *   type: 'range',
 *   startNodeId: modelRange.startNodeId, startOffset: modelRange.startOffset,
 *   endNodeId:   modelRange.endNodeId,   endOffset:   modelRange.endOffset
 * };                       // ← 다섯 번째 필드가 여기서 사라진다
 * ```
 *
 * 이것이 `8298` 의 15% 였고 **이 검사는 그것을 못 본다** — 두 끝의 식이 다르기 때문이다. 그래서
 * 고침은 두 층이다: 글자로 캐럿인 것은 글자로 말하게 하고(이 검사), 실행해 봐야 아는 것은 **담기는
 * 문에서 계산한다**(`editor-core/src/collapsed.ts`). 검사 하나로 다 잡히는 척하지 않는다.
 */

/* `__dirname` 이 `packages/conformance/test` 이므로 세 번 올라가야 저장소 뿌리다. */
const ROOT = join(__dirname, '..', '..', '..');

/**
 * 주석은 통째로 지우고, **문자열 안의 중괄호만** 지운다.
 *
 * 길이를 보존하는 것이 요점이다 — 뒤에서 이 문자열의 색인으로 원본의 줄 번호를 세기 때문이다.
 * 문자열을 통째로 지우면 `type: 'range'` 자신이 사라지므로 중괄호만 없앤다. 템플릿 리터럴의
 * `${ }` 가 균형을 깨는 유일한 경우이고, 그것도 이 하나로 막힌다.
 */
function mask(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i += 1; break; }
        if (src[i] === '{' || src[i] === '}') out[i] = ' ';
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** 객체 리터럴 몸통의 **맨 위 층** 필드만. 중첩과 스프레드는 그대로 둔다. */
function fieldsOf(body: string): Map<string, string> {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '{' || c === '[' || c === '(') depth += 1;
    if (c === '}' || c === ']' || c === ')') depth -= 1;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);

  const found = new Map<string, string>();
  for (const raw of parts) {
    const one = raw.trim();
    if (!one || one.startsWith('...')) continue;
    const colon = one.indexOf(':');
    /* 축약 표기(`startNodeId,`)는 이름이 곧 식이다. */
    if (colon < 0) { found.set(one, one); continue; }
    found.set(one.slice(0, colon).trim().replace(/^['"]|['"]$/g, ''), one.slice(colon + 1).trim());
  }
  return found;
}

/** `at` 을 감싸는 가장 안쪽 `{ … }`. 균형으로 찾는다. */
function literalAround(masked: string, at: number): { open: number; close: number } | null {
  let balance = 0;
  let open = -1;
  for (let i = at; i >= 0; i -= 1) {
    const c = masked[i];
    if (c === '}') balance += 1;
    else if (c === '{') {
      if (balance === 0) { open = i; break; }
      balance -= 1;
    }
  }
  if (open < 0) return null;

  balance = 0;
  for (let i = open; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '{') balance += 1;
    else if (c === '}') {
      balance -= 1;
      if (balance === 0) return { open, close: i };
    }
  }
  return null;
}

const IS_TEST = /\/(test|tests)\/|\.(test|spec)\.tsx?$/;

interface Hit { where: string; test: boolean }

function sweep(): Hit[] {
  const hits: Hit[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;

      const src = readFileSync(path, 'utf8');
      const masked = mask(src);

      for (const hit of masked.matchAll(/type\s*:\s*['"]range['"]/g)) {
        const bounds = literalAround(masked, hit.index ?? 0);
        if (!bounds) continue;

        const fields = fieldsOf(masked.slice(bounds.open + 1, bounds.close));
        if (!fields.has('startNodeId') || !fields.has('endNodeId')) continue;
        if (!fields.has('startOffset') || !fields.has('endOffset')) continue;

        /* 두 끝이 **글자로** 같은 자리인가. 다르면 실행해 봐야 알고, 그건 이 검사의 것이 아니다. */
        if (fields.get('startNodeId') !== fields.get('endNodeId')) continue;
        if (fields.get('startOffset') !== fields.get('endOffset')) continue;

        if (fields.get('collapsed') === 'true') continue;

        const rel = path.slice(ROOT.length + 1);
        const line = src.slice(0, bounds.open).split('\n').length;
        hits.push({ where: `${rel}:${line}`, test: IS_TEST.test(rel) });
      }
    }
  };

  for (const at of ['packages', 'apps']) {
    const dir = join(ROOT, at);
    if (statSync(dir).isDirectory()) walk(dir);
  }

  return hits;
}

describe('캐럿 리터럴', () => {
  it('제품 코드에서는 자기가 접혔다고 말한다', () => {
    const found = sweep().filter((one) => !one.test).map((one) => one.where).sort();

    /**
     * **2026-09-05: 13 에서 6 으로.** 걷어낸 일곱은 `editor-core` 다섯(`selection-manager` 의
     * `moveTo`·`collapseToStart`·`collapseToEnd`·`selectWord`·`adjustForNodeSplit`)과
     * `editor-view-dom` 둘(`input-handler` 의 burst 대비 캐럿)이다.
     *
     * 남은 여섯은 **이 회차가 쓸 수 있는 파일 밖**이다. 여기 이름으로 적어 두는 것이 그것들을
     * 붙잡는 유일한 방법이다 — 이름 없이 숫자만 줄이면 다음 사람이 무엇이 남았는지 다시 센다.
     *
     * | 어디 | 무엇 | 위험 |
     * |---|---|---|
     * | `datastore/range-operations` ×2 | `replaceText`·`duplicateText` 가 세우는 삽입 자리 | 낮다 — `DataStore.range.insertText` 는 두 끝만 읽는다 |
     * | `editor-view-react/input-handler` ×3 | DOM 뷰에서 이번에 고친 것과 **같은 자리** | **높다** — 노트·워드가 그 경로다 |
     * | `model/operations/insertText` | 연산이 세우는 삽입 자리 | 낮다 — 위와 같은 이유 |
     *
     * React 쪽 셋이 값이다. `docs/specs/selection.md` 가 그 이유를 적어 두었다: 뷰 층이 두 벌이라
     * **선택 고치기는 두 번씩 필요하다**, 그리고 그것 자체가 결함이다.
     */
    expect(found, `깃발 없는 캐럿 리터럴:\n${found.join('\n')}`).toEqual([
      'packages/datastore/src/operations/range-operations.ts:422',
      'packages/datastore/src/operations/range-operations.ts:505',
      'packages/editor-view-react/src/input-handler.ts:597',
      'packages/editor-view-react/src/input-handler.ts:650',
      'packages/editor-view-react/src/input-handler.ts:841',
      'packages/model/src/operations/insertText.ts:74'
    ]);
  });

  it('검사 픽스처도 센다 — 픽스처가 가르치는 모양이 제품이 쓰는 모양이 된다', () => {
    /**
     * **왜 검사 파일을 빼지 않았나.**
     *
     * 빼면 이 검사에 슬랙이 생긴다. 그리고 슬랙이 아니라도 이유가 하나 더 있다: 이 결함이
     * **처음 들어온 길**이 픽스처다. 캐럿을 네 필드로 적는 픽스처를 마흔넷 읽고 나면 제품 코드도
     * 네 필드로 적게 된다 — 실제로 `input-handler` 의 그 자리가 그렇게 적혀 있었다.
     *
     * **줄이 아니라 파일로 센다.** 마흔넷을 줄 번호로 적으면 그 파일 위쪽을 한 줄만 고쳐도 이
     * 검사가 빨개진다 — 그건 결함을 알리는 것이 아니라 소음이다. 파일과 개수는 그 파일에서
     * *무엇을 고쳐야 하는가* 를 그대로 말한다.
     *
     * 지금 마흔넷이고, **줄지 않은 채로 이 회차를 지난다.** 다섯은 `editor-view-dom` 것이라 이
     * 회차의 소유 안이지만, 픽스처를 고치는 것은 그 픽스처가 무엇을 재고 있는지 한 번씩 읽어야
     * 하는 일이고 이 회차는 제품 코드와 아홉 자리의 단위 검사에 썼다. 숫자를 여기 적어 두는 것이
     * 그 결정을 다음 사람에게 넘기는 방법이다.
     */
    const perFile = new Map<string, number>();
    for (const one of sweep()) {
      if (!one.test) continue;
      const file = one.where.slice(0, one.where.lastIndexOf(':'));
      perFile.set(file, (perFile.get(file) ?? 0) + 1);
    }

    const counted = [...perFile.entries()].map(([file, n]) => `${file} ${n}`).sort();
    const total = [...perFile.values()].reduce((a, b) => a + b, 0);

    expect(total, `검사 픽스처의 깃발 없는 캐럿:\n${counted.join('\n')}`).toBe(40);
    expect(counted).toEqual([
      'packages/datastore/test/data-store-replace-text-range.test.ts 3',
      'packages/editor-core/test/editor.test.ts 2',
      'packages/editor-core/test/selection-manager.test.ts 1',
      'packages/editor-core/test/undo-redo-history.test.ts 9',
      'packages/editor-view-dom/test/core/editor-view-dom.test.ts 5',
      'packages/editor-view-react/test/EditorView.test.tsx 4',
      'packages/editor-view-react/test/input-handler-ims.test.ts 2',
      'packages/editor-view-react/test/selection-handler.test.ts 3',
      'packages/extensions/test/emoji-extension.test.ts 2',
      'packages/extensions/test/slash-menu.test.ts 1',
      'packages/model/test/operations/insertImage.exec.test.ts 3',
      'packages/office-word/test/canvas-insert-commands.test.ts 3',
      'packages/office-word/test/frame-commands.test.ts 1',
      'packages/office-word/test/word-commands.test.ts 1'
    ]);
  });
});
