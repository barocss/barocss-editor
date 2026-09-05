import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS, type Keybinding } from '@barocss/editor-core';
import { WORD_KEYS } from '@barocss/office-word';
import { SLIDES_KEYS } from '@barocss/office-slides';
import { SITE_KEYS } from '@barocss/office-site';
import { taughtKeys, type KeyModel } from '../src/keys';

/**
 * **메뉴가 가르치는 단축키는 편집기가 *실제로 묶은 것* 에서 나온다.**
 *
 * ## 규칙 5, 그리고 그것을 반만 읽었을 때 무슨 일이 나나
 *
 * *"인쇄되는 것은 도는 것에서 나온다"* — 제품이 키 목록을 손으로 두 벌 적지 않는다는 뜻이다.
 * 그런데 **도는 것**이 무엇인지가 반만 적혀 있었다: 제품의 목록만 세고 **엔진의 마흔을 안 셌다.**
 *
 * 그 동안 Word 에서 안 들킨 이유는 `WORD_KEYBINDINGS` 가 엔진 것을 **다시 적고 있었기** 때문이다.
 * 재진술 열여섯을 걷어내자(규칙 1) **메뉴에서 ⌘Z 가 사라졌다.** 즉 **규칙 1을 어겨야 규칙 5가
 * 성립하는** 상태였고, 그건 둘 중 하나가 틀렸다는 뜻이다. 틀린 것은 *도는 것* 의 정의였다.
 *
 * `apps/word/tests/menubar.spec.ts:34` 가 그것을 잡았고 **4분 걸렸다.** 이 파일은 밀리초에 답한다 —
 * *"유닛 테스트를 최대한 활용하는 건 어때?"* 에 대한 답이 이것이다.
 *
 * ## 왜 넷 다 세나
 *
 * 지금 이 검사를 통과하는 것은 Word 뿐이다. slides·site 는 인쇄 목록에 엔진 것이 없고, 그래서
 * 그 제품들의 메뉴는 ⌘Z·⌘B 를 **가르치지 못한다** — 읽는 사람에게는 *없는 기능* 과 구별되지
 * 않는다. 그 둘은 키 이주(`docs/specs/keybindings.md`)와 같이 고쳐진다.
 */
const PRINTED: { product: string; keys: readonly KeyModel[] }[] = [
  { product: 'office-word', keys: WORD_KEYS as readonly KeyModel[] },
  { product: 'office-slides', keys: SLIDES_KEYS as readonly KeyModel[] },
  { product: 'office-site', keys: SITE_KEYS as readonly KeyModel[] }
];

/**
 * **읽는 사람이 메뉴에서 찾을 만한 것** 만 센다.
 *
 * 엔진은 `Enter`·`Backspace`·화살표도 묶는데, 그것을 메뉴에 인쇄하는 편집기는 없다 — 누를 줄
 * 아는 키다. 세는 것은 **화음**(수식어가 붙은 것)이고, 그게 *가르치지 않으면 못 찾는 것* 의 경계다.
 */
const isChord = (key: string) => /(?:Mod|Ctrl|Alt|Shift|Meta)\+/.test(key);

describe('메뉴가 가르치는 것', () => {
  it.each(PRINTED)('$product 의 인쇄 목록이 엔진이 묶은 화음을 담는다', ({ product, keys }) => {
    const bound = (DEFAULT_KEYBINDINGS as readonly Keybinding[]).filter((one) => isChord(one.key));
    const printed = new Set(taughtKeys(keys).map((one) => one.command).filter(Boolean));
    const missing = [
      ...new Set(bound.map((one) => one.command).filter((one) => !printed.has(one)))
    ];

    expect(
      missing,
      `${product}: 엔진이 묶었는데 인쇄 목록에 없습니다 — 메뉴가 이 단축키를 못 가르칩니다:\n${missing.join(' · ')}`
    ).toEqual([]);
  });
});
