import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS } from '@barocss/editor-core';
import { WORD_KEYBINDINGS } from '@barocss/office-word';
import { NOTE_KEYBINDINGS } from '@barocss/office-note';

/**
 * **제품은 엔진이 이미 묶은 키를 다시 적지 않는다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * `editor-core` 의 `DEFAULT_KEYBINDINGS` 가 **마흔**을 묶고 모든 제품이 그것을 받는다:
 * Enter·Backspace·화살표·⌘B/I/U·⌘⇧S·목록·들여쓰기·제목·인용·undo/redo·복사/잘라내기/붙여넣기·
 * 전체선택. 그런데 `WORD_KEYBINDINGS` 가 그 중 **열여덟을 다시 적고 있었다.**
 *
 * 그리고 다시 적힌 것이 **더 약했다:**
 *
 * | | 엔진 | Word |
 * |---|---|---|
 * | ⌘B·⌘I·⌘U·제목·목록·붙여넣기 | `editorFocus && editorEditable` | `editorFocus` |
 * | ⌘C·⌘X | `editorFocus && editorEditable && !selectionEmpty` | `editorFocus` |
 *
 * 레지스트리는 **출처로 충돌을 풀고 제품 바인딩이 이긴다.** 그러므로 다시 적는 순간 그 자리의
 * 규칙이 제품 것으로 갈리고, 여기서는 그것이 편집 가드를 떨어뜨리는 것이었다. 재봤다:
 * `executeCommand` 도 `canExecute` 도 편집 가능 여부를 안 묻는다 — 그 키들의 **유일한** 편집
 * 가드가 `when` 이다.
 *
 * **살아 있는 결함은 아니었다:** 어느 제품도 `editable: false` 를 쓰지 않는다. 읽기 전용을 처음
 * 내는 날의 결함이었고, 그날 이것이 없으면 아무도 못 찾는다.
 *
 * ## 왜 못 봤나 — `DEFAULT_KEYBINDINGS` 가 안 나가고 있었다
 *
 * 제품이 *엔진이 이미 무엇을 묶는지* 를 볼 방법이 없었다. 그래서 이 라운드에 그것부터 내보냈다.
 * **볼 수 없는 것과 다시 적는 것은 같은 결함의 앞뒤다.**
 *
 * ## 같은 키·같은 명령인데 재진술이 아닌 경우
 *
 * `when` 이 다르면 다른 규칙이다. Word 의 `Tab → indentText` 는 `inList && !inTable && !inEquation`
 * 이고 엔진은 `canIndentText` 다 — Word 의 `Tab` 갈래 다섯이 서로를 배제하도록 짜여 있고 그 첫
 * 칸이다. 그래서 이 검사는 **`when` 까지 같은 것만** 센다.
 */
type Binding = { key: string; command?: string; when?: string };

const sameRule = (a: Binding, b: Binding) =>
  a.key === b.key && a.command === b.command && (a.when ?? '') === (b.when ?? '');

const PRODUCTS: { name: string; bindings: readonly Binding[] }[] = [
  { name: 'office-word', bindings: WORD_KEYBINDINGS as readonly Binding[] },
  { name: 'office-note', bindings: NOTE_KEYBINDINGS as readonly Binding[] }
];

describe('제품 키맵', () => {
  it('엔진 기본을 볼 수 있다 — 안 보이면 다시 적게 된다', () => {
    expect(Array.isArray(DEFAULT_KEYBINDINGS)).toBe(true);
    expect((DEFAULT_KEYBINDINGS as readonly Binding[]).length).toBeGreaterThan(20);
  });

  it('엔진이 이미 묶은 것을 글자까지 다시 적지 않는다', () => {
    const core = DEFAULT_KEYBINDINGS as readonly Binding[];
    const found: string[] = [];

    for (const product of PRODUCTS) {
      for (const one of product.bindings) {
        if (core.some((c) => sameRule(c, one))) {
          found.push(`${product.name}: ${one.key} → ${one.command} [${one.when ?? '언제나'}]`);
        }
      }
    }

    expect(
      found,
      `엔진이 같은 규칙으로 이미 묶고 있습니다. 지우면 엔진 것이 그대로 답합니다 — 이유는 이 파일 위에 있습니다:\n${found.join('\n')}`
    ).toEqual([]);
  });

  /**
   * **엔진이 편집 가드를 건 자리에서 그것을 떨어뜨리지 않는다.**
   *
   * 제품이 조건을 **좁히는** 것은 정당하다 — Word 의 `Tab → indentText` 는 엔진의 `canIndentText`
   * 대신 `inList && !inTable && !inEquation` 으로 묻고, 그건 `Tab` 갈래 다섯을 가르는 규칙이다.
   * 여기서 세는 것은 그 중 **`editorEditable` 하나**다: 그것이 읽기 전용 문서를 편집 가능하게
   * 만드는 유일한 조건이기 때문이다. 재봤다 — `executeCommand` 도 `canExecute` 도 편집 가능
   * 여부를 안 묻는다.
   *
   * **`editorEditable` 을 전부에 요구하지 않는 이유:** 재보니 Word 54개 중 **0개**, note 2개 중
   * **0개**가 그것을 건다(엔진은 40 중 23). 그런데 일괄로 거는 것이 답이 아니다 — `copy` 와
   * `selectAll` 은 읽기 전용에서 **되어야** 한다. 어느 명령이 읽기 전용에서 살아야 하는가는 제품의
   * 결정이고, 그 결정은 읽기 전용을 처음 낼 때 내린다. `BACKLOG.md` 에 열어 뒀다.
   */
  it('엔진이 건 편집 가드를 떨어뜨리지 않는다', () => {
    const core = DEFAULT_KEYBINDINGS as readonly Binding[];
    const gates = (when?: string) => (when ?? '').includes('editorEditable');
    const found: string[] = [];

    for (const product of PRODUCTS) {
      for (const one of product.bindings) {
        const twin = core.find((c) => c.key === one.key && c.command === one.command);
        if (!twin || !gates(twin.when)) continue;
        if (!gates(one.when)) {
          found.push(
            `${product.name}: ${one.key} → ${one.command} 가 엔진의 \`editorEditable\` 을 떨어뜨립니다`
          );
        }
      }
    }

    expect(found, found.join('\n')).toEqual([]);
  });
});
