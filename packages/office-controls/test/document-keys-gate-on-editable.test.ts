import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS } from '@barocss/editor-core';
import { WORD_KEYBINDINGS } from '@barocss/office-word';
import { NOTE_KEYBINDINGS } from '@barocss/office-note';

/**
 * **문서를 바꾸는 키는 `editorEditable` 을 건다. 읽는 키는 안 건다.**
 *
 * `docs/specs/keybindings.md` 의 규칙 3이고, 이 파일이 그것을 센다.
 *
 * ## 왜 `when` 이 유일한 가드인가
 *
 * 재봤다: `executeCommand` 도 `canExecute` 도 편집 가능 여부를 안 묻는다. 편집기의 `editable`
 * 은 `_context.editorEditable` 로만 나가고(`editor.ts:906`), 그것을 읽는 것은 `when` 뿐이다.
 * 그러므로 **읽기 전용 문서에서 키가 무엇을 할 수 있는지는 이 문자열들이 전부 결정한다.**
 *
 * 살아 있는 결함은 아니다 — 이 저장소의 어느 제품도 `editable: false` 를 쓰지 않는다. 읽기
 * 전용을 처음 내는 날의 결함이고, 그날 이것이 없으면 아무도 못 찾는다.
 *
 * ## 왜 일괄로 요구하지 않는가
 *
 * `copy` 와 `selectAll` 과 화살표 이동은 읽기 전용에서 **되어야** 한다. 그래서 이 검사는
 * *전부 걸어라* 가 아니라 **전부 분류되어 있어라** 이다: 걸었거나, 아래 목록에 *왜 안 거는지*
 * 와 함께 적혀 있거나. 분류되지 않은 새 바인딩은 빨갛다.
 *
 * 목록이 썩지 않게 반대쪽도 센다 — 목록에 있는데 키맵에 없는 항목도 빨갛다. 그러지 않으면
 * 면제 목록이 조용히 자라는 쪽으로만 움직인다.
 */
type Binding = { key: string; command?: string; when?: string };

const gates = (when?: string) => (when ?? '').includes('editorEditable');
const nameOf = (one: Binding) => `${one.key} → ${one.command}`;

/**
 * **읽는 키** — 읽기 전용 문서에서 살아야 하는 것, 그리고 왜인지.
 *
 * 이유는 장식이 아니다. 셋 중 둘은 *열린 결함* 이라 여기 있고, 그 사실이 이 목록 말고는 어디에도
 * 안 적혀 있다.
 */
const READS: Record<string, Record<string, string>> = {
  'office-word': {
    'Escape → leaveDrawing':
      '캐럿만 옮긴다 — `_leave` 가 `updateSelection` 하나다. 도형을 고른 사람은 읽기 전용에서도 거기서 나올 수 있어야 한다.',
    /*
     * 이 둘은 제품이 적은 것이 아니라 `TABLE_CELL_KEYBINDINGS` 를 펼친 것이다(word·note 둘 다).
     * 그리고 **읽는 키가 아니다**: `nextCell` 은 마지막 칸에서 `insertRowBelow` 를 부른다
     * (`packages/extensions/src/table.ts:291`). 읽기 전용 문서에서 Tab 이 행을 만든다.
     *
     * 여기 면제로 적혀 있는 이유는 하나뿐이다 — **고칠 자리가 `packages/extensions` 이고 그것은
     * 이 회차의 소유가 아니다.** 그쪽에서 `editorEditable` 을 걸면 이 두 줄은 지워져야 하고,
     * 위의 반대쪽 검사가 지우라고 말해 준다.
     */
    'Tab → nextCell': '공용 `TableExtension` 의 것 — 열린 결함이다. 마지막 칸에서 행을 만든다.',
    'Shift+Tab → previousCell': '공용 `TableExtension` 의 것 — 같은 줄에서 온다.'
  },
  'office-note': {
    'Tab → nextCell': '공용 `TableExtension` 의 것. note 가 자기 이름으로 적은 키는 하나도 없다.',
    'Shift+Tab → previousCell': '공용 `TableExtension` 의 것.'
  }
};

const PRODUCTS: { name: string; bindings: readonly Binding[] }[] = [
  { name: 'office-word', bindings: WORD_KEYBINDINGS as readonly Binding[] },
  { name: 'office-note', bindings: NOTE_KEYBINDINGS as readonly Binding[] }
];

describe('읽기 전용 문서에서 키가 하는 일', () => {
  it('제품의 모든 바인딩이 둘 중 하나다 — 편집 가드를 걸었거나, 왜 안 거는지 적혀 있거나', () => {
    const found: string[] = [];

    for (const product of PRODUCTS) {
      for (const one of product.bindings) {
        if (gates(one.when)) continue;
        if (READS[product.name]?.[nameOf(one)]) continue;
        found.push(
          `${product.name}: ${nameOf(one)} [${one.when ?? '언제나'}] — 문서를 바꾸면 \`editorEditable\` 을 걸고, 읽는 키면 이 파일의 READS 에 왜인지 적으십시오`
        );
      }
    }

    expect(found, found.join('\n')).toEqual([]);
  });

  it('면제 목록이 키맵보다 오래 살지 않는다', () => {
    const stale: string[] = [];

    for (const product of PRODUCTS) {
      const bound = new Set(product.bindings.map(nameOf));
      for (const listed of Object.keys(READS[product.name] ?? {})) {
        if (!bound.has(listed)) {
          stale.push(`${product.name}: '${listed}' 는 READS 에 있는데 키맵에 없습니다 — 지우십시오`);
        }
      }
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  /**
   * **`docs/specs/keybindings.md` 의 숫자가 코드와 같은가.**
   *
   * 규칙 3 아래에 *"엔진 40 중 23이 건다"* 가 적혀 있다. 그 줄을 코드와 대조하는 것이 없으면
   * `docs/ROADMAP.md` 가 *"키맵이 Word 에만 있다(71개)"* 로 오래 앉아 있던 것과 같은 자리가
   * 하나 더 생긴다 — `docs/specs/agents.md` 가 그 이야기다.
   *
   * 엔진 층은 이 회차의 소유가 아니므로 **여기서는 세기만 한다.** 숫자가 달라지면 이 검사가
   * 멈춰 세우고, 문서를 고칠지 엔진을 고칠지는 그때 정한다.
   */
  it('엔진 마흔 중 스물셋이 건다 — 명세에 적힌 그대로', () => {
    const core = DEFAULT_KEYBINDINGS as readonly Binding[];
    expect(core.length).toBe(40);
    expect(core.filter((one) => gates(one.when)).length).toBe(23);
  });

  /**
   * 제품 쪽 숫자도 같은 이유로 못 박는다. **46 · 0 이 아니라 46 · 0 인 이유**가 서로 다르다:
   * Word 는 마흔아홉 중 셋을 뺀 전부를 걸었고, note 는 **자기 이름으로 적은 키가 없다** — 둘 다
   * `TABLE_CELL_KEYBINDINGS` 를 펼친 것이라 note 가 걸 것이 애초에 없다.
   */
  it('Word 는 마흔아홉 중 마흔여섯를 걸고, note 는 걸 것이 없다', () => {
    const word = WORD_KEYBINDINGS as readonly Binding[];
    expect(word.length).toBe(49);
    expect(word.filter((one) => gates(one.when)).length).toBe(46);

    const note = NOTE_KEYBINDINGS as readonly Binding[];
    expect(note.length).toBe(2);
    expect(note.every((one) => !gates(one.when))).toBe(true);
  });
});
